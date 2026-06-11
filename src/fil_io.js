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

    network: `@startnwdiag
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
@endnwdiag`,

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
