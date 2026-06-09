// app.js — kopplar ihop textarean med PlantUML och AI via Electron IPC.
// Förhandsgranskning, konvertering och AI-anrop sker via window.aiuda.*
// (contextBridge → IPC → main-processen) — ingen separat server behövs.

// Interna typnycklar (speglar konvertera.js KÄNDA_TYPER) — används i typ-dialogen.
const DIAGRAM_TYPER = [
    "usecase", "sekvens", "komponent", "aktivitet", "klass",
    "tillstånd", "er", "deployment", "objekt", "timing",
    "mindmap", "wbs", "network", "gantt",
];
// Läsbara etiketter för visning i felmeddelanden
const STÖDDA_DIAGRAMTYPER = ["usecase (use case)", "sekvens", "komponent", "aktivitet", "klass", "tillstånd", "er", "deployment", "objekt", "timing", "mindmap", "wbs", "network (nwdiag)", "gantt"];
const FÖRDRÖJNING_MS = 400; // debounce — rendera inte vid varje tangenttryck
const LAGRINGSNYCKEL = "puml-editor:senaste-kod";

const kodEl = document.getElementById("kod");
const highlightEl = document.querySelector("#highlight code");
const bildEl = document.getElementById("bild");
const statusEl = document.getElementById("status");
const filInputEl = document.getElementById("fil-input");


const förhandsvisningEl = document.querySelector(".förhandsvisning");
const zoomaUtKnapp = document.getElementById("zooma-ut-knapp");
const zoomaInKnapp = document.getElementById("zooma-in-knapp");
const zoomNivåKnapp = document.getElementById("zoom-nivå-knapp");

const STARTKOD = `@startuml
Alice -> Bob: Hej, hur är läget?
Bob --> Alice: Bra! Och du?
@enduml`;

// Den senast lyckat renderade SVG-koden — används av export-knapparna.
let senasteSvg = null;
let senasteFilnamn = "diagram";

// ----------------------------------------------------------------------
// PlantUML-kodning (hex, ingen komprimering behövs)
// ----------------------------------------------------------------------


// ----------------------------------------------------------------------
// Syntax-highlighting — enkel regexbaserad tokenisering.
// Overlay-tekniken kräver att highlight-<pre> och textarean har EXAKT
// samma textinnehåll (inkl. radbrytning i slutet) så att scrollningen
// och radbrytningarna matchar perfekt.
// ----------------------------------------------------------------------

const PLANTUML_NYCKELORD = [
    "actor", "participant", "boundary", "control", "entity", "database",
    "collections", "queue", "class", "interface", "enum", "abstract",
    "package", "namespace", "node", "folder", "frame", "cloud", "rectangle",
    "component", "usecase", "agent", "artifact", "card", "file", "storage",
    "object", "annotation", "circle", "state", "partition",
    "if", "else", "elseif", "endif", "while", "endwhile", "repeat",
    "fork", "again", "end", "split", "loop", "alt", "opt", "par", "break",
    "critical", "group", "note", "legend", "endlegend", "title", "header",
    "footer", "caption", "newpage", "skinparam", "autonumber", "scale",
    "left", "right", "top", "bottom", "over", "of", "as", "extends",
    "implements", "return", "activate", "deactivate", "destroy", "create",
    "box", "endbox", "ref", "is", "then", "detach", "start", "stop"
];
const NYCKELORD_MÄNGD = new Set(PLANTUML_NYCKELORD.map(ord => ord.toLowerCase()));

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Tokeniserar EN rad till highlightad HTML. Vi jobbar radvis så att
// kommentarer/strängar inte läcker över radbrytningar på ett sätt som
// förstör synkningen.
function highlightaRad(rad) {
    // Hel-radskommentarer (' ...) eller direktiv (@start.../@end...)
    const kommentarMatch = rad.match(/^(\s*)('.*)$/);
    if (kommentarMatch) {
        return escapeHtml(kommentarMatch[1]) +
            `<span class="syn-kommentar">${escapeHtml(kommentarMatch[2])}</span>`;
    }

    const direktivMatch = rad.match(/^(\s*)(@(?:start|end)\w+.*)$/i);
    if (direktivMatch) {
        return escapeHtml(direktivMatch[1]) +
            `<span class="syn-direktiv">${escapeHtml(direktivMatch[2])}</span>`;
    }

    // Tokenisera resten: strängar, stereotyper, pilar, nyckelord
    const tokenRegex = /("(?:[^"\\]|\\.)*")|(<<[^>]*>>)|(<-+>?|-+>|\.+>|--+\*|--+o|\*--+|o--+|--+\|>|\|>--+|--+\\|\/--+)|(\b[A-Za-zÅÄÖåäö_]\w*\b)/gu;

    let resultat = "";
    let senastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(rad)) !== null) {
        resultat += escapeHtml(rad.slice(senastIndex, match.index));
        const [hela, sträng, stereotyp, pil, ord] = match;

        if (sträng) {
            resultat += `<span class="syn-sträng">${escapeHtml(sträng)}</span>`;
        } else if (stereotyp) {
            resultat += `<span class="syn-stereotyp">${escapeHtml(stereotyp)}</span>`;
        } else if (pil) {
            resultat += `<span class="syn-pil">${escapeHtml(pil)}</span>`;
        } else if (ord && NYCKELORD_MÄNGD.has(ord.toLowerCase())) {
            resultat += `<span class="syn-nyckelord">${escapeHtml(ord)}</span>`;
        } else {
            resultat += escapeHtml(ord || hela);
        }

        senastIndex = match.index + hela.length;
    }
    resultat += escapeHtml(rad.slice(senastIndex));
    return resultat;
}

function uppdateraHighlight() {
    const rader = kodEl.value.split("\n");
    highlightEl.innerHTML = rader.map(highlightaRad).join("\n");
}

function synkaScroll() {
    const pre = highlightEl.parentElement;
    pre.scrollTop = kodEl.scrollTop;
    pre.scrollLeft = kodEl.scrollLeft;
}

// ----------------------------------------------------------------------
// Status-rad
// ----------------------------------------------------------------------

function sättStatus(text, läge) {
    statusEl.textContent = text;
    statusEl.className = "status" + (läge ? ` ${läge}` : "");
}

// ----------------------------------------------------------------------
// Rendering mot picoweb-servern (debounced)
// ----------------------------------------------------------------------

let timer = null;

function schemaläggRendering() {
    clearTimeout(timer);
    timer = setTimeout(rendera, FÖRDRÖJNING_MS);
}

async function rendera() {
    const text = kodEl.value.trim();
    if (!text) {
        bildEl.removeAttribute("src");
        senasteSvg = null;
        sättStatus("tom — skriv lite PlantUML-kod");
        return;
    }

    sättStatus("renderar …");

    try {
        const svg = await window.aiuda.renderaPuml(text);

        const härlettNamn = härledFilnamnFrånTitel(text);
        if (härlettNamn) senasteFilnamn = härlettNamn;

        const blob = new Blob([svg], { type: "image/svg+xml" });
        const objektUrl = URL.createObjectURL(blob);

        if (bildEl.dataset.föregåendeUrl) {
            URL.revokeObjectURL(bildEl.dataset.föregåendeUrl);
        }
        bildEl.dataset.föregåendeUrl = objektUrl;
        bildEl.src = objektUrl;

        const ärFel = /An error has occured|Syntax Error|Cannot find/i.test(svg);
        sättStatus(ärFel ? "PlantUML hittade ett fel i koden" : "uppdaterad", ärFel ? "fel" : "ok");

        senasteSvg = svg;
    } catch (fel) {
        sättStatus(`renderingsfel: ${fel.message}`, "fel");
    }
}

// ----------------------------------------------------------------------
// Export — SVG direkt, PNG via en mellanliggande canvas-rendering
// ----------------------------------------------------------------------

function laddaNer(blob, filnamn) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filnamn;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exporteraSvg() {
    if (!senasteSvg) return;
    laddaNer(new Blob([senasteSvg], { type: "image/svg+xml" }), `${senasteFilnamn}.svg`);
}

function exporteraPng() {
    if (!senasteSvg) return;

    // Rendera SVG:n i en osynlig <img>, rita den på en canvas i högre
    // upplösning (2x för skärpa) och exportera canvasen som PNG.
    const blob = new Blob([senasteSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const bild = new Image();

    bild.onload = () => {
        const skala = 2;
        const canvas = document.createElement("canvas");
        canvas.width = bild.naturalWidth * skala;
        canvas.height = bild.naturalHeight * skala;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; // SVG:n har ofta transparent bakgrund
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(skala, skala);
        ctx.drawImage(bild, 0, 0);

        canvas.toBlob((pngBlob) => {
            URL.revokeObjectURL(url);
            if (pngBlob) laddaNer(pngBlob, `${senasteFilnamn}.png`);
        }, "image/png");
    };

    bild.onerror = () => {
        URL.revokeObjectURL(url);
        sättStatus("kunde inte konvertera till PNG", "fel");
    };

    bild.src = url;
}

// ----------------------------------------------------------------------
// Konvertera till drawio — pratar med vår egen lokala konverteringsserver
// (src/server.js, startas automatiskt av Electron-appen).
//
// Pipelinen bygger ÄKTA, redigerbara drawio-element (inte en bild) genom att
// tolka PUML-källkoden direkt — men bara för de diagramtyper vi hittills
// byggt stöd för (use case, sekvens, komponent, aktivitet). Servern talar om
// om gissningen av diagramtyp var SÄKER eller inte (`säker`-fältet) — om den
// är osäker visar vi en varning innan nedladdning, så att användaren vet att
// resultatet kan bli fel även om inget tekniskt fel inträffat.
// ----------------------------------------------------------------------

// Visar typ-dialogen och returnerar ett Promise som resolvar med:
//   • vald typnyckel (string) om användaren klickar Konvertera
//   • null om användaren klickar Avbryt
function visaTypDialog(gissning) {
    return new Promise((resolve) => {
        const dialog    = document.getElementById("typ-dialog");
        const textEl    = document.getElementById("typ-dialog-text");
        const valEl     = document.getElementById("typ-dialog-val");
        const okKnapp   = document.getElementById("typ-dialog-ok");
        const avbrytKnapp = document.getElementById("typ-dialog-avbryt");

        textEl.textContent =
            `Konverteraren kunde inte avgöra diagramtypen säkert ` +
            `och gissade "${gissning}". ` +
            `Välj rätt typ om du vet vad det är, eller behåll gissningen.`;

        // Populera rullgardinen med alla kända typer, gissningen förvald
        valEl.innerHTML = "";
        for (const typ of DIAGRAM_TYPER) {
            const opt = document.createElement("option");
            opt.value = typ;
            opt.textContent = typ;
            opt.selected = typ === gissning;
            valEl.appendChild(opt);
        }

        function stäng(resultat) {
            okKnapp.removeEventListener("click", hanteraOk);
            avbrytKnapp.removeEventListener("click", hanteraAvbryt);
            dialog.removeEventListener("cancel", hanteraAvbryt);
            dialog.close();
            resolve(resultat);
        }
        function hanteraOk()     { stäng(valEl.value); }
        function hanteraAvbryt() { stäng(null); }

        okKnapp.addEventListener("click", hanteraOk);
        avbrytKnapp.addEventListener("click", hanteraAvbryt);
        dialog.addEventListener("cancel", hanteraAvbryt); // Escape-tangent

        dialog.showModal();
    });
}

let konverterar = false;

async function konverteraTillDrawio() {
    if (konverterar) return;
    const text = kodEl.value.trim();
    if (!text) {
        sättStatus("inget att konvertera — skriv lite PlantUML-kod först", "fel");
        return;
    }

    konverterar = true;
    sättStatus("konverterar till drawio …");

    try {
        async function hämtaKonvertering(typ) {
            return window.aiuda.konvertera(text, typ || null);
        }

        let data = await hämtaKonvertering(null);

        if (data.fel) {
            sättStatus(`konverteringsfel: ${data.fel}`, "fel");
            return;
        }

        // Diagramtypen kunde inte avgöras säkert — visa typ-dialog
        if (!data.säker) {
            const valdTyp = await visaTypDialog(data.typ);
            if (valdTyp === null) {
                sättStatus("konvertering avbruten", null);
                return;
            }
            // Om användaren valde en annan typ — konvertera om
            if (valdTyp !== data.typ) {
                sättStatus("konverterar med vald typ …");
                const omkonv = await hämtaKonvertering(valdTyp);
                if (omkonv.fel) {
                    sättStatus(`konverteringsfel: ${omkonv.fel}`, "fel");
                    return;
                }
                data = omkonv;
            }
        }

        const filnamn = `${senasteFilnamn}.drawio`;
        laddaNer(new Blob([data.xml], { type: "application/xml" }), filnamn);

        if (data.säker) {
            sättStatus(`konverterade som ${data.sammanfattning} → ${filnamn}`, "ok");
        } else {
            sättStatus(`laddade ner konvertering (${data.typ}) → ${filnamn}`, "ok");
        }

        if (data.saknadeXml && data.saknadeTyper && data.saknadeTyper.length) {
            // Granskningsfilen med platshållare för notationstyper utan bra
            // inbyggd drawio-motsvarighet — laddas ner som ett extra steg,
            // precis som CLI:t gör (se konvertera.js).
            laddaNer(
                new Blob([data.saknadeXml], { type: "application/xml" }),
                `${senasteFilnamn}-saknade-shapes.drawio`
            );
        }
    } catch (fel) {
        sättStatus(`konverteringsfel: ${fel.message}`, "fel");
    } finally {
        konverterar = false;
    }
}

// ----------------------------------------------------------------------
// Spara / öppna .puml-filer
// ----------------------------------------------------------------------

// Försöker härleda ett beskrivande filnamn ur ett title-direktiv i koden.
// Returnerar null om inget hittas — anroparen avgör då vilket namn som
// ska användas istället (t.ex. det öppnade filnamnet, eller "diagram").
function härledFilnamnFrånTitel(text) {
    const titelMatch = text.match(/^\s*title\s+(.+)$/im);
    if (!titelMatch) return null;

    const slug = titelMatch[1]
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-ZåäöÅÄÖ0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

    return slug || null;
}

function sparaTillFil() {
    const text = kodEl.value;
    laddaNer(new Blob([text], { type: "text/plain" }), `${senasteFilnamn}.puml`);
}

function öppnaFrånFil() {
    filInputEl.value = ""; // tillåt att öppna samma fil igen
    filInputEl.click();
}

function hanteraFilval(händelse) {
    const fil = händelse.target.files && händelse.target.files[0];
    if (!fil) return;

    const läsare = new FileReader();
    läsare.onload = () => {
        kodEl.value = String(läsare.result || "");
        senasteFilnamn = fil.name.replace(/\.[^.]+$/, "") || "diagram";
        uppdateraHighlight();
        sparaTillLagring();
        återställZoom(); // ny fil ska visas i ursprungsläge — inte kvar i gammal zoom/panorering
        rendera();
        sättStatus(`öppnade ${fil.name}`, "ok");
    };
    läsare.onerror = () => sättStatus(`kunde inte läsa ${fil.name}`, "fel");
    läsare.readAsText(fil, "utf-8");
}

// ----------------------------------------------------------------------
// Autosparande till localStorage — så att man inte tappar arbetet vid
// en sidladdning. Inget moln, inget konto — bara webbläsarens egen lagring.
// ----------------------------------------------------------------------

let lagringsTimer = null;

function sparaTillLagring() {
    clearTimeout(lagringsTimer);
    lagringsTimer = setTimeout(() => {
        try {
            localStorage.setItem(LAGRINGSNYCKEL, kodEl.value);
        } catch { /* t.ex. privat läge — strunta i det */ }
    }, 500);
}

function läsFrånLagring() {
    try {
        return localStorage.getItem(LAGRINGSNYCKEL);
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------------
// Zoom & panorering av förhandsvisningen.
//
// Förhandsvisningen fungerar som en "oändlig duk": vi styr bildens
// position OCH skala helt själva via en enda CSS-transform
// (translate + scale), istället för att förlita oss på webbläsarens
// inbyggda scroll. Anledningen: transform: scale() ändrar bara det
// VISUELLA utseendet — elementets scrollWidth/scrollHeight förblir
// oförändrade, så webbläsaren skulle aldrig "se" något överflöde och
// inbyggd scroll skulle aldrig kunna aktiveras.
//
// panX/panY mäts i overskalade pixlar (CSS-pixlar i bildens egen
// koordinatsystem) så att panoreringen känns lika "tung" oavsett
// zoomnivå — vi delar musrörelsen med zoomNivå innan vi lägger till den.
// ----------------------------------------------------------------------

const ZOOM_STEG = 1.2;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;

let zoomNivå = 1;
let panX = 0;
let panY = 0;

function tillämpaTransform() {
    bildEl.style.transform = (zoomNivå === 1 && panX === 0 && panY === 0)
        ? ""
        : `translate(${panX}px, ${panY}px) scale(${zoomNivå})`;
    förhandsvisningEl.classList.toggle("zoomad", zoomNivå !== 1);
    zoomNivåKnapp.textContent = `${Math.round(zoomNivå * 100)}%`;
}

function sättZoom(nyNivå) {
    zoomNivå = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nyNivå));
    tillämpaTransform();
}

function zoomaIn() { sättZoom(zoomNivå * ZOOM_STEG); }
function zoomaUt() { sättZoom(zoomNivå / ZOOM_STEG); }

function återställZoom() {
    zoomNivå = 1;
    panX = 0;
    panY = 0;
    tillämpaTransform();
}

zoomaInKnapp.addEventListener("click", zoomaIn);
zoomaUtKnapp.addEventListener("click", zoomaUt);
zoomNivåKnapp.addEventListener("click", återställZoom);

// Klicka-och-dra för att panorera. Tillåtet så fort vi är inzoomade
// (oavsett om webbläsaren "tycker" att något svämmar över — se ovan).
let panorerar = false;
let museFrånX = 0;
let museFrånY = 0;
let panFrånX = 0;
let panFrånY = 0;

förhandsvisningEl.addEventListener("mousedown", (händelse) => {
    if (händelse.button !== 0) return; // bara vänster musknapp
    if (zoomNivå === 1) return;        // inget att panorera vid 100 %

    panorerar = true;
    museFrånX = händelse.clientX;
    museFrånY = händelse.clientY;
    panFrånX = panX;
    panFrånY = panY;
    förhandsvisningEl.classList.add("panorerar");
    händelse.preventDefault(); // hindra textmarkering medan vi drar
});

window.addEventListener("mousemove", (händelse) => {
    if (!panorerar) return;
    // Dela med zoomNivå så att en viss muspekarrörelse flyttar samma
    // "punkt på diagrammet" oavsett hur inzoomade vi är.
    panX = panFrånX + (händelse.clientX - museFrånX) / zoomNivå;
    panY = panFrånY + (händelse.clientY - museFrånY) / zoomNivå;
    tillämpaTransform();
});

function avslutaPanorering() {
    if (!panorerar) return;
    panorerar = false;
    förhandsvisningEl.classList.remove("panorerar");
}
window.addEventListener("mouseup", avslutaPanorering);
window.addEventListener("mouseleave", avslutaPanorering);

// Cmd/Ctrl + scrollhjul zoomar förhandsvisningen
// (vanlig konvention i ritprogram/kartor — wheel-eventet har redan
// ctrlKey=true för pinch-to-zoom på styrplattor i de flesta webbläsare).
förhandsvisningEl.addEventListener("wheel", (händelse) => {
    if (!händelse.ctrlKey && !händelse.metaKey) return;
    händelse.preventDefault();
    const riktning = händelse.deltaY < 0 ? ZOOM_STEG : 1 / ZOOM_STEG;
    sättZoom(zoomNivå * riktning);
}, { passive: false });

// Tangentbordsgenvägar — Cmd (Mac) eller Ctrl (övriga) + "+"/"-"/"0".
window.addEventListener("keydown", (händelse) => {
    if (!(händelse.metaKey || händelse.ctrlKey)) return;

    if (händelse.key === "+" || händelse.key === "=") {
        händelse.preventDefault();
        zoomaIn();
    } else if (händelse.key === "-" || händelse.key === "_") {
        händelse.preventDefault();
        zoomaUt();
    } else if (händelse.key === "0") {
        händelse.preventDefault();
        återställZoom();
    }
});

// ----------------------------------------------------------------------
// Koppla ihop allt
// ----------------------------------------------------------------------

kodEl.addEventListener("input", () => {
    uppdateraHighlight();
    schemaläggRendering();
    sparaTillLagring();
});
kodEl.addEventListener("scroll", synkaScroll);

filInputEl.addEventListener("change", hanteraFilval);

// ----------------------------------------------------------------------
// Diagram-mallar
// ----------------------------------------------------------------------

const MALLAR = {
    usecase: `@startuml
title Bokningssystem

actor Kund
actor Admin

rectangle "Bokningssystem" {
  usecase "Sök resa" as UC1
  usecase "Boka resa" as UC2
  usecase "Avboka resa" as UC3
  usecase "Hantera resor" as UC4
}

Kund --> UC1
Kund --> UC2
Kund --> UC3
Admin --> UC4
@enduml`,

    sekvens: `@startuml
title Inloggningsflöde

actor Användare
participant "Webbläsare" as Webb
participant "Server" as Srv
database "Databas" as DB

Användare -> Webb : Fyll i formulär
Webb -> Srv : POST /login
Srv -> DB : Verifiera användare
DB --> Srv : OK
Srv --> Webb : 200 + token
Webb --> Användare : Inloggad
@enduml`,

    komponent: `@startuml
title Systemarkitektur

package "Frontend" {
  [Webbapp]
  [Mobilapp]
}

package "Backend" {
  [API-gateway]
  [Autentisering]
  [Affärslogik]
}

database "PostgreSQL" as DB

[Webbapp] --> [API-gateway]
[Mobilapp] --> [API-gateway]
[API-gateway] --> [Autentisering]
[API-gateway] --> [Affärslogik]
[Affärslogik] --> DB
@enduml`,

    aktivitet: `@startuml
title Beställningsprocess

start
:Ta emot beställning;
if (Finns i lager?) then (ja)
  :Reservera artikel;
  :Skicka bekräftelse;
else (nej)
  :Meddela kunden;
  stop
endif
:Packa order;
:Skicka paket;
stop
@enduml`,

    klass: `@startuml
title Djurklasser

abstract class Djur {
  +namn: String
  +ålder: int
  +ljud(): String
}

class Hund {
  +ras: String
  +ljud(): String
}

class Katt {
  +inomhus: boolean
  +ljud(): String
}

class Ägare {
  +namn: String
  +addDjur(d: Djur)
}

Djur <|-- Hund
Djur <|-- Katt
Ägare "1" o-- "0..*" Djur : äger
@enduml`,

    tillstånd: `@startuml
title Orderstatus

[*] --> Ny : Beställd

Ny --> Bekräftad : Bekräfta
Bekräftad --> Packad : Packa
Packad --> Skickad : Skicka
Skickad --> Levererad : Kvittera

Bekräftad --> Avbruten : Avbryt
Ny --> Avbruten : Avbryt
Avbruten --> [*]
Levererad --> [*]
@enduml`,

    er: `@startuml
title Bokningsdatabas

entity Kund {
  * id <<PK>>
  --
  namn
  email
  telefon
}

entity Bokning {
  * id <<PK>>
  --
  * kund_id <<FK>>
  datum
  status
}

entity Resa {
  * id <<PK>>
  --
  destination
  avgång
  pris
}

Kund ||--o{ Bokning : gör
Bokning }o--|| Resa : avser
@enduml`,

    deployment: `@startuml
title Webbapplikation

node "Webbserver" as web {
  component "Nginx" as nginx
  component "Node.js" as node
}

node "Databasserver" as dbsrv {
  database "PostgreSQL" as db
}

cloud "Internet" as internet

actor Användare

Användare --> internet
internet --> nginx
nginx --> node
node --> db
@enduml`,

    objekt: `@startuml
title Kundorder

object "kund1 : Kund" as kund1 {
  namn = "Anna Svensson"
  email = "anna@example.com"
}

object "order1 : Order" as order1 {
  id = 5001
  datum = 2024-03-15
  status = "bekräftad"
}

object "rad1 : Orderrad" as rad1 {
  produkt = "Tangentbord"
  antal = 1
  pris = 899
}

kund1 --> order1 : gör
order1 --> rad1 : innehåller
@enduml`,

    mindmap: `@startmindmap
* Teknikstack

** Frontend
*** React
*** TypeScript

** Backend
*** Node.js
*** PostgreSQL

left side

-- Infrastruktur
--- Docker
--- CI/CD

-- Säkerhet
--- OAuth 2.0
--- HTTPS
@endmindmap`,

    wbs: `@startwbs
* Webbprojekt

** Planering
*** Kravanalys
*** Prototyp

** Utveckling
*** Frontend
**** Komponenter
**** Responsivitet
*** Backend
**** API
**** Databas

** Lansering
*** Testning
*** Driftsättning
@endwbs`,

    network: `@startuml
nwdiag {
  network internet {
    address = "0.0.0.0/0"
    klient [address = "Användare"]
  }
  network dmz {
    address = "10.0.1.0/24"
    klient
    webb [address = "10.0.1.10"]
  }
  network internt {
    address = "10.0.2.0/24"
    webb
    app  [address = "10.0.2.10"]
    db   [address = "10.0.2.20", shape = "database"]
  }
}
@enduml`,

    gantt: `@startgantt
Project starts 2024-09-01

-- Förberedelse --
[Kravanalys] lasts 10 days
[Prototyp] lasts 7 days
[Prototyp] starts after [Kravanalys]'s end

-- Utveckling --
[Frontend] lasts 20 days
[Frontend] starts after [Prototyp]'s end
[Backend] lasts 20 days
[Backend] starts after [Prototyp]'s end
[Integration] lasts 7 days
[Integration] starts after [Frontend]'s end

-- Lansering --
[Testning] lasts 10 days
[Testning] starts after [Integration]'s end
[Driftsättning] lasts 3 days
[Driftsättning] starts after [Testning]'s end
@endgantt`,

    timing: `@startuml
title Processorschema

robust "CPU" as cpu
robust "Minne" as minne
concise "Buss" as buss

@0
cpu is Idle
minne is Idle
buss is Ledig

@20
cpu is Exekverar
buss is Aktiv

@40
minne is Läser

@70
minne is Idle
cpu is Väntar

@90
cpu is Exekverar
buss is Ledig

@100
cpu is Idle
@enduml`,
};

// ── Stäng diagram (kvar som knapp i toolbar) ──
document.getElementById("stäng-knapp").addEventListener("click", () => {
    if (kodEl.value.trim() && !confirm("Stäng och töm editorn? Chatthistoriken rensas.")) return;
    kodEl.value = "";
    uppdateraHighlight();
    schemaläggRendering();
    sparaTillLagring();
    rensaChatt();
});

// ── Ladda mall (anropas från meny-hanteraren) ──
function laddaMall(typ) {
    if (kodEl.value.trim() && !confirm("Ersätta nuvarande kod med mallen?")) return;
    kodEl.value = MALLAR[typ] || "";
    uppdateraHighlight();
    schemaläggRendering();
    sparaTillLagring();
}

// ── Menyhändelser från native-menyn (File / Edit) ──
window.aiuda.onMeny(async (händelse) => {
    switch (händelse) {
        case "nytt":
            if (kodEl.value.trim() && !confirm("Skapa nytt diagram? Nuvarande kod och chatthistorik rensas.")) return;
            kodEl.value = STARTKOD;
            uppdateraHighlight();
            schemaläggRendering();
            sparaTillLagring();
            rensaChatt();
            break;

        case "spara":
            sparaTillFil();
            break;

        case "spara-som": {
            const res = await window.aiuda.sparaSom(kodEl.value, senasteFilnamn);
            if (res.sparad) {
                senasteFilnamn = res.filnamn;
                sättStatus(`sparad som ${res.filnamn}.puml`, "ok");
            }
            break;
        }

        case "export-svg":    exporteraSvg();          break;
        case "export-png":    exporteraPng();          break;
        case "export-drawio": konverteraTillDrawio();  break;

        default:
            if (händelse.startsWith("mall:")) laddaMall(händelse.slice(5));
            break;
    }
});

// ── Öppna fil via native dialog (skickas från main) ──
window.aiuda.onÖppnaFil(({ innehåll, filnamn }) => {
    kodEl.value = innehåll;
    senasteFilnamn = filnamn;
    uppdateraHighlight();
    sparaTillLagring();
    återställZoom();
    rendera();
    sättStatus(`öppnade ${filnamn}.puml`, "ok");
});

kodEl.value = STARTKOD;
sparaTillLagring();
uppdateraHighlight();
rendera();

// ======================================================================
// RESIZE — dra-och-ändra storlek på panelerna
// ======================================================================

const aiPanelEl      = document.getElementById("ai-panel");
const editorPanelEl  = document.getElementById("editor-panel");
const previewPanelEl = document.getElementById("preview-panel");
const ALLA_PANELER   = [aiPanelEl, editorPanelEl, previewPanelEl];
const SKARV_BREDD    = 5; // px per skarv × 2 skarvar = 10px totalt

function läsPanelBredder() {
    try { return JSON.parse(localStorage.getItem("panelBredder") || "null"); } catch { return null; }
}

function sparaPanelBredder() {
    localStorage.setItem("panelBredder", JSON.stringify(
        ALLA_PANELER.map((p) => p.offsetWidth)
    ));
}

function tillämpaPanelBredder(bredder) {
    const tillgänglig = window.innerWidth - SKARV_BREDD * 2;
    const summa = bredder.reduce((s, b) => s + b, 0);
    // Skala proportionellt om fönstret ändrats sedan sist
    const skalade = bredder.map((b) => Math.max(150, Math.round((b / summa) * tillgänglig)));
    // Se till att summan stämmer (avrundningsfel kan ge ±1px)
    const diff = tillgänglig - skalade.reduce((s, b) => s + b, 0);
    skalade[1] += diff;
    ALLA_PANELER.forEach((p, i) => { p.style.width = skalade[i] + "px"; });
}

function initPanelBredder() {
    const sparade = läsPanelBredder();
    if (sparade && sparade.length === 3) {
        tillämpaPanelBredder(sparade);
    } else {
        const tillgänglig = window.innerWidth - SKARV_BREDD * 2;
        const aiBredd     = Math.min(300, Math.floor(tillgänglig * 0.22));
        const resten      = tillgänglig - aiBredd;
        tillämpaPanelBredder([aiBredd, Math.floor(resten / 2), Math.ceil(resten / 2)]);
    }
}

let resizeDrag = null;

document.querySelectorAll(".resize-skarv").forEach((skarv, idx) => {
    skarv.addEventListener("mousedown", (e) => {
        const vänster = ALLA_PANELER[idx];
        const höger   = ALLA_PANELER[idx + 1];
        resizeDrag = {
            skarv, startX: e.clientX,
            vänsterBredd: vänster.offsetWidth,
            högerBredd:   höger.offsetWidth,
            vänster, höger,
        };
        skarv.classList.add("drar");
        document.body.classList.add("col-resize");
        e.preventDefault();
    });
});

window.addEventListener("mousemove", (e) => {
    if (!resizeDrag) return;
    const delta        = e.clientX - resizeDrag.startX;
    const total        = resizeDrag.vänsterBredd + resizeDrag.högerBredd;
    const nyVänster    = Math.max(150, Math.min(total - 150, resizeDrag.vänsterBredd + delta));
    const nyHöger      = total - nyVänster;
    resizeDrag.vänster.style.width = nyVänster + "px";
    resizeDrag.höger.style.width   = nyHöger   + "px";
});

window.addEventListener("mouseup", () => {
    if (!resizeDrag) return;
    resizeDrag.skarv.classList.remove("drar");
    document.body.classList.remove("col-resize");
    sparaPanelBredder();
    resizeDrag = null;
});

window.addEventListener("resize", () => {
    const sparade = läsPanelBredder();
    if (sparade) tillämpaPanelBredder(sparade);
});

initPanelBredder();

// ======================================================================
// AI — inställningar, chatt och API-proxy
// ======================================================================

// ── Inbyggda modeller per leverantör ──
const AI_MODELLER = {
    anthropic: [
        { id: "claude-opus-4-8",    namn: "Claude Opus 4.8 (flagship)"   },
        { id: "claude-sonnet-4-6",  namn: "Claude Sonnet 4.6 (balans)"   },
        { id: "claude-haiku-4-5",   namn: "Claude Haiku 4.5 (snabb)"     },
    ],
    openai: [
        { id: "gpt-5.5",      namn: "GPT-5.5 (flagship)"  },
        { id: "gpt-5.4",      namn: "GPT-5.4 (prisvärd)"  },
        { id: "gpt-5.4-mini", namn: "GPT-5.4-mini (snabb)" },
    ],
};

// ── Spara/läs inställningar ──
function läsAiInst() {
    try { return JSON.parse(localStorage.getItem("aiInst") || "{}"); } catch { return {}; }
}
function sparaAiInst(inst) {
    localStorage.setItem("aiInst", JSON.stringify(inst));
}

// ── Element-refs ──
const aiInstEl        = document.getElementById("ai-inst");
const aiInstKnappEl   = document.getElementById("ai-inst-knapp");
const aiRensaKnappEl  = document.getElementById("ai-rensa-knapp");
const aiProviderEl    = document.getElementById("ai-provider");
const aiModellEl      = document.getElementById("ai-modell");
const aiSparaInstEl   = document.getElementById("ai-spara-inst");
const aiNyckelStatusEl = document.getElementById("ai-nyckel-status");
const aiMeddelandenEl = document.getElementById("ai-meddelanden");
const aiPromptEl      = document.getElementById("ai-prompt-input");
const aiSkickaEl      = document.getElementById("ai-skicka-knapp");
const aiInkluderaEl   = document.getElementById("ai-inkludera-kod");

// ── Chatthistorik ──
let aiChatt = []; // [{ role: "user"|"assistant", content }]
aiChatt = [];
localStorage.removeItem("aiChatt");

// ── Fyll modell-select utifrån vald leverantör ──
function uppdateraModellLista() {
    const provider = aiProviderEl.value;
    const modeller = AI_MODELLER[provider] || [];
    aiModellEl.innerHTML = modeller.map((m) =>
        `<option value="${m.id}">${m.namn}</option>`
    ).join("");
    const inst = läsAiInst();
    if (inst.modell && modeller.some((m) => m.id === inst.modell)) {
        aiModellEl.value = inst.modell;
    }
}
aiProviderEl.addEventListener("change", uppdateraModellLista);

// ── Kolla nyckelstatus via IPC och uppdatera UI ──
async function uppdateraNyckelStatus() {
    try {
        const data = await window.aiuda.aiStatus();
        const inst = läsAiInst();
        const provider = inst.provider || "anthropic";
        const harNyckel = provider === "openai" ? data.openai : data.anthropic;
        if (aiNyckelStatusEl) {
            aiNyckelStatusEl.innerHTML = harNyckel
                ? `<span style="color:#7fc97f;">✓ Nyckel konfigurerad</span>`
                : `<span style="color:#e07070;">✗ Nyckel saknas — lägg till i .env</span>`;
        }
        return harNyckel;
    } catch {
        if (aiNyckelStatusEl) {
            aiNyckelStatusEl.innerHTML = `<span style="color:#e07070;">✗ Kunde inte läsa nyckelstatus</span>`;
        }
        return false;
    }
}

// ── Ladda sparade inställningar ──
function laddaAiInst() {
    const inst = läsAiInst();
    if (inst.provider) aiProviderEl.value = inst.provider;
    uppdateraModellLista();
}
laddaAiInst();
aiProviderEl.addEventListener("change", uppdateraNyckelStatus);

// ── Spara-knapp ──
aiSparaInstEl.addEventListener("click", () => {
    sparaAiInst({
        provider: aiProviderEl.value,
        modell:   aiModellEl.value,
    });
    aiInstEl.classList.add("dold");
    uppdateraNyckelStatus();
});

// ── Öppna .env i texteditor ──
document.getElementById("ai-oppna-env").addEventListener("click", async () => {
    try {
        await window.aiuda.oppnaEnv();
        // Kort feedback — blinkar knappetiketten
        const knapp = document.getElementById("ai-oppna-env");
        const orig  = knapp.textContent;
        knapp.textContent = "✓ Öppnad";
        knapp.disabled = true;
        setTimeout(() => { knapp.textContent = orig; knapp.disabled = false; }, 2000);
    } catch (e) {
        alert(`Kunde inte öppna .env: ${e.message}`);
    }
});

// ── Växla inställningspanel ──
aiInstKnappEl.addEventListener("click", () => {
    aiInstEl.classList.toggle("dold");
});

// ── Rendera hela chatthistoriken ──
function renderaChatt() {
    aiMeddelandenEl.innerHTML = "";
    if (aiChatt.length === 0) {
        aiMeddelandenEl.innerHTML =
            `<div style="padding:16px;font-size:11px;color:#555;text-align:center;line-height:1.6;">
             Inga meddelanden ännu.<br>Ställ en fråga eller klicka på<br>en snabbknapp för att börja.
             </div>`;
        return;
    }
    for (const msg of aiChatt) {
        aiMeddelandenEl.appendChild(skapaMeddelandeEl(msg.role, msg.content));
    }
    aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
}

// ── Skapa ett meddelande-element ──
function skapaMeddelandeEl(roll, innehåll) {
    const wrap = document.createElement("div");
    wrap.className = `ai-meddelande ${roll === "user" ? "användare" : "assistent"}`;

    const avsändare = document.createElement("div");
    avsändare.className = "ai-avsändare";
    avsändare.textContent = roll === "user" ? "Du" : "AI";

    const bubbla = document.createElement("div");
    bubbla.className = "ai-bubbla";
    bubbla.appendChild(renderaMeddelandeInnehåll(innehåll));

    wrap.appendChild(avsändare);
    wrap.appendChild(bubbla);
    return wrap;
}

// ── Rendera text med kodblock ──
function renderaMeddelandeInnehåll(text) {
    const container = document.createElement("div");
    // Dela upp på ```plantuml ... ``` (eller bara ```) block
    const regex = /```(?:plantuml|puml)?\n?([\s\S]*?)```/g;
    let pos = 0, match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > pos) {
            container.appendChild(renderaText(text.slice(pos, match.index)));
        }
        container.appendChild(skapaKodblock(match[1].trim()));
        pos = match.index + match[0].length;
    }
    if (pos < text.length) {
        container.appendChild(renderaText(text.slice(pos)));
    }
    return container;
}

function renderaText(text) {
    const div = document.createElement("div");
    // Dela upp på radbrytningar och skapa <p>-element
    text.trim().split(/\n{2,}/).forEach((stycke) => {
        if (!stycke.trim()) return;
        const p = document.createElement("p");
        p.textContent = stycke.replace(/\n/g, " ");
        div.appendChild(p);
    });
    return div;
}

function skapaKodblock(kod) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-kodblock";

    const pre = document.createElement("pre");
    pre.textContent = kod;
    wrapper.appendChild(pre);

    const knapp = document.createElement("button");
    knapp.className = "ai-använd-kod";
    knapp.textContent = "↙ Använd koden i editorn";
    knapp.addEventListener("click", () => {
        kodEl.value = kod;
        uppdateraHighlight();
        schemaläggRendering();
        sparaTillLagring();
    });
    wrapper.appendChild(knapp);
    return wrapper;
}

// ── Visa hint om nyckeln saknas ──
async function visaIngenNyckelHint() {
    const harNyckel = await uppdateraNyckelStatus();
    const gammal = aiMeddelandenEl.querySelector(".ai-ingen-nyckel");
    if (gammal) gammal.remove();
    if (!harNyckel) {
        const div = document.createElement("div");
        div.className = "ai-ingen-nyckel";
        div.innerHTML = `Ingen API-nyckel konfigurerad.<br>
            Lägg till nyckeln i <code>.env</code>-filen<br>
            och starta om servern. &nbsp;
            <button onclick="document.getElementById('ai-inst').classList.remove('dold')">
            Inställningar ⚙</button>`;
        aiMeddelandenEl.insertBefore(div, aiMeddelandenEl.firstChild);
    }
}

// ── Skicka meddelande till AI ──
async function skickaAiMeddelande(prompt) {
    const inst = läsAiInst();

    const inkluderaKod = aiInkluderaEl.checked;
    let fullPrompt = prompt;
    if (inkluderaKod && kodEl.value.trim()) {
        fullPrompt += `\n\nAktuell PlantUML-källkod:\n\`\`\`plantuml\n${kodEl.value.trim()}\n\`\`\``;
    }

    // Lägg till i historiken och rendera
    aiChatt.push({ role: "user", content: fullPrompt });
    localStorage.setItem("aiChatt", JSON.stringify(aiChatt));
    renderaChatt();

    // Visa laddningsindikator
    const ladarEl = document.createElement("div");
    ladarEl.className = "ai-meddelande assistent";
    ladarEl.innerHTML = `<div class="ai-avsändare">AI</div>
        <div class="ai-bubbla">
            <div class="ai-laddar">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    aiMeddelandenEl.appendChild(ladarEl);
    aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
    aiSkickaEl.disabled = true;

    try {
        const data = await window.aiuda.ai(
            inst.provider || "anthropic",
            inst.modell   || null,
            aiChatt.map((m) => ({ role: m.role, content: m.content }))
        );

        ladarEl.remove();

        if (data.fel) {
            aiChatt.pop(); // Ta bort användarmeddelandet
            renderaChatt();
            // Visa fel som ett assistent-meddelande
            const felMsg = { role: "assistant", content: `⚠ Fel: ${data.fel || svar.status}` };
            aiMeddelandenEl.appendChild(skapaMeddelandeEl(felMsg.role, felMsg.content));
            aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
        } else {
            aiChatt.push({ role: "assistant", content: data.content });
            localStorage.setItem("aiChatt", JSON.stringify(aiChatt));
            renderaChatt();
        }
    } catch (nätfel) {
        ladarEl.remove();
        aiChatt.pop();
        renderaChatt();
        const felMsg = { role: "assistant", content: `⚠ Nätverksfel: ${nätfel.message}` };
        aiMeddelandenEl.appendChild(skapaMeddelandeEl(felMsg.role, felMsg.content));
        aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
    } finally {
        aiSkickaEl.disabled = false;
    }
}

// ── Skicka-knapp och Enter-tangent ──
aiSkickaEl.addEventListener("click", () => {
    const text = aiPromptEl.value.trim();
    if (!text) return;
    aiPromptEl.value = "";
    skickaAiMeddelande(text);
});

aiPromptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        aiSkickaEl.click();
    }
});

// ── Snabbknappar ──
const SNABB_PROMPTS = {
    förklara:  "Förklara vad det här diagrammet visar och vad det används till.",
    förbättra: "Förbättra och förenkla det här diagrammet. Behåll innebörden men gör koden tydligare.",
    generera:  "", // Fokuserar bara textarea
};

document.querySelectorAll(".ai-snabb").forEach((knapp) => {
    knapp.addEventListener("click", () => {
        const snabb = knapp.dataset.snabb;
        if (snabb === "generera") {
            aiPromptEl.focus();
            aiPromptEl.placeholder = "Beskriv diagrammet du vill skapa …";
        } else {
            skickaAiMeddelande(SNABB_PROMPTS[snabb]);
        }
    });
});

// ── Rensa chatthistorik (utan bekräftelse) ──
function rensaChatt() {
    aiChatt = [];
    localStorage.removeItem("aiChatt");
    renderaChatt();
    visaIngenNyckelHint();
}

// ── Rensa-knapp ──
aiRensaKnappEl.addEventListener("click", () => {
    if (aiChatt.length === 0) return;
    if (!confirm("Rensa hela chatthistoriken?")) return;
    rensaChatt();
});

// ── Init ──
renderaChatt();
visaIngenNyckelHint();
