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
// Konvertera till drawio — sker direkt i Electron-processen via IPC
// (main.js, konverteraKälla).
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
