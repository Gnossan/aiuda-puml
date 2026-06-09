// Textbaserad parser för PlantUML-SEKVENSDIAGRAM (delmängd).
// Samma filosofi som parser.js: bygg en logisk modell, ingen geometri.
//
// Modellen ser annorlunda ut än use-case-modellen — ORDNINGEN på
// meddelandena är själva poängen (den avgör den lodräta positionen),
// så vi håller en enkel { deltagare, meddelanden } -struktur istället
// för { noder, kanter }.
//
// Stödd syntax:
//   participant X / participant "Etikett" as alias
//   actor / boundary / control / entity / database / collections / queue
//     — samma "as alias"-mönster, olika stereotyp → olika lifeline-utseende
//   A -> B : text     (synkront anrop, fylld pilspets)
//   A --> B : text    (streckat — t.ex. svar)
//   A ->> B : text    (asynkront, öppen pilspets)
//   A -->> B : text   (asynkront streckat)
//   <- / <-- / <<- / <<-- — samma former i motsatt riktning (källa/mål byts)
//   skinparam, title, autonumber, kommentarer (') ignoreras
//
// INTE stött ännu (medvetet, för att hålla detta hanterbart):
//   activate/deactivate, note, alt/loop/opt-ramar, gruppering — se README.

"use strict";

const STEREOTYP_NYCKELORD = {
    participant: "deltagare",
    actor: "aktör",
    boundary: "gräns_lifeline",
    control: "kontroll",
    entity: "entitet",
    database: "databas",
    collections: "samling",
    queue: "kö",
};

function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

function nyTomModell() {
    return {
        deltagare: [],   // { id, etikett, stereotyp }
        meddelanden: [], // { från, till, etikett, stil, ordning }
    };
}

function säkerställDeltagare(modell, alias, stereotyp, etikett) {
    let d = modell.deltagare.find((x) => x.id === alias);
    if (!d) {
        d = { id: alias, etikett: etikett || alias, stereotyp: stereotyp || "deltagare" };
        modell.deltagare.push(d);
    } else {
        if (stereotyp && d.stereotyp === "deltagare") d.stereotyp = stereotyp;
        if (etikett && d.etikett === d.id) d.etikett = etikett;
    }
    return d;
}

// Pilformer, LÄNGSTA FÖRST så att t.ex. "-->>" hittas före "->" eller "-->".
const MEDDELANDE_PILFORMER = [
    "<-->>", "<<-->>",
    "-->>", "<<-->", "->>", "<<--",
    "-->", "<->", "<--",
    "->", "<-",
];

function hittaMeddelandePil(rad) {
    let bästPos = -1;
    let bästForm = null;
    for (const form of MEDDELANDE_PILFORMER) {
        const pos = rad.indexOf(form);
        if (pos !== -1 && (bästPos === -1 || pos < bästPos || (pos === bästPos && form.length > bästForm.length))) {
            bästPos = pos;
            bästForm = form;
        }
    }
    if (bästPos === -1) return null;
    return {
        vänster: rad.slice(0, bästPos).trim(),
        pil: bästForm,
        höger: rad.slice(bästPos + bästForm.length).trim(),
    };
}

// Normaliserar en pilform till { riktning: "höger"|"vänster", streckad, öppen }
// så att xml-generatorn kan slå upp rätt drawio-stil oavsett vilket håll
// pilen pekade i källan (vi vänder från/till så att "från" alltid är avsändaren).
function tolkaMeddelandeStil(pil) {
    const riktning = pil.startsWith("<") ? "vänster" : "höger";
    // Ta bort eventuella inledande/avslutande riktningstecken för att
    // avgöra streckning/öppenhet på den "rena" pilkroppen.
    const kropp = pil.replace(/^<+|>+$/g, "");
    const streckad = kropp.includes("--");
    // "öppen" pilspets markeras i PlantUML med dubbla '>'/'<' i spetsen,
    // t.ex. "->>" eller "<<-"
    const öppen = />>$|^<</.test(pil);

    return { riktning, streckad, öppen };
}

function parsaSekvens(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);
    let ordning = 0;

    for (const råRad of rader) {
        const rad = råRad.trim();
        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^(skinparam|title|autonumber|hide|footer|header|legend|end legend)\b/i.test(rad)) continue;
        if (/^(activate|deactivate|destroy|note|alt|else|opt|loop|par|end|group|box|end box|return)\b/i.test(rad)) {
            continue; // medvetet utelämnat i denna version — se README
        }

        // Deltagardeklaration: <stereotyp> "Etikett" as alias  |  <stereotyp> alias
        const stereotypMönster = Object.keys(STEREOTYP_NYCKELORD).join("|");
        let m = rad.match(new RegExp(`^(${stereotypMönster})\\s+"([^"]+)"\\s+as\\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)`, "i"))
             || rad.match(new RegExp(`^(${stereotypMönster})\\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)\\s+as\\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)`, "i"))
             || rad.match(new RegExp(`^(${stereotypMönster})\\s+"([^"]+)"`, "i"))
             || rad.match(new RegExp(`^(${stereotypMönster})\\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)`, "i"));
        if (m) {
            const nyckelord = m[1].toLowerCase();
            const stereotyp = STEREOTYP_NYCKELORD[nyckelord];
            const harAlias = m.length > 3 && m[3];
            const etikett = rensaCitat(m[2]);
            const alias = harAlias ? m[3] : etikett;
            säkerställDeltagare(modell, alias, stereotyp, etikett);
            continue;
        }

        // Meddelande: vänster <pil> höger [: etikett]
        let meddelandeEtikett = null;
        let relRad = rad;
        const delningPos = rad.indexOf(":");
        if (delningPos !== -1) {
            relRad = rad.slice(0, delningPos).trim();
            meddelandeEtikett = rad.slice(delningPos + 1).trim();
        }

        const pilInfo = hittaMeddelandePil(relRad);
        if (pilInfo) {
            const vänsterAlias = rensaCitat(pilInfo.vänster);
            const högerAlias = rensaCitat(pilInfo.höger);
            const { riktning, streckad, öppen } = tolkaMeddelandeStil(pilInfo.pil);

            säkerställDeltagare(modell, vänsterAlias, null, vänsterAlias);
            säkerställDeltagare(modell, högerAlias, null, högerAlias);

            // Normalisera: "från" är alltid den faktiska avsändaren —
            // vänd vänster/höger om pilen pekade åt vänster (<-).
            const från = riktning === "höger" ? vänsterAlias : högerAlias;
            const till = riktning === "höger" ? högerAlias : vänsterAlias;

            ordning += 1;
            modell.meddelanden.push({
                från,
                till,
                etikett: meddelandeEtikett,
                streckad,
                öppen,
                ordning,
            });
            continue;
        }

        // Okänd rad — ignoreras tyst ("bra nog", inte fullständig grammatik)
    }

    return modell;
}

module.exports = { parsaSekvens, STEREOTYP_NYCKELORD };
