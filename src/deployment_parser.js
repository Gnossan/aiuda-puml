// Textbaserad parser för PlantUML-DEPLOYMENT-diagram.
// Bygger en modell { noder, kanter } med stöd för godtyckligt nästlade
// containers (node { database { component ... } }).
//
// Stödda nyckelord:
//   node, database, cloud, folder, frame, package, rectangle
//   component, artifact, actor
//   [Komponent]  (hakparentes-notation — shorthand för component)
//
// Stödd pil-syntax:
//   A --> B : etikett    (riktad pil)
//   A -- B               (oriktad koppling)
//   A ..> B : etikett    (streckad pil)
//   A .. B               (streckad oriktad)
//
// Modellstruktur:
//   noder:  [{ id, typ, etikett, förälder }]
//   kanter: [{ från, till, etikett, stil }]
//
// Typvärden:
//   "nod"       node  — 3D kub/server
//   "databas"   database — cylinder
//   "komponent" component / [bracket] — UML-komponent
//   "artefakt"  artifact — dokument
//   "molnet"    cloud — molnform
//   "mapp"      folder — mapp
//   "ram"       frame — rektangulär ram
//   "paket"     package — paket/namespace
//   "rektangel" rectangle / boundary / card — enkel rektangel
//   "aktör"     actor — gubben

"use strict";

const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

// Mappar PlantUML-nyckelord till interna typvärden
const NYCKELORD_TILL_TYP = {
    node:       "nod",
    database:   "databas",
    component:  "komponent",
    artifact:   "artefakt",
    cloud:      "molnet",
    folder:     "mapp",
    frame:      "ram",
    package:    "paket",
    rectangle:  "rektangel",
    boundary:   "rektangel",
    card:       "rektangel",
    actor:      "aktör",
    storage:    "databas",
    collections:"rektangel",
    queue:      "rektangel",
    agent:      "komponent",
    hexagon:    "rektangel",
    interface:  "komponent",
    label:      "artefakt",
    person:     "aktör",
    usecase:    "rektangel",
    stack:      "rektangel",
    file:       "artefakt",
    rack:       "rektangel",
};

// Typer som kan innehålla barn (block med { ... })
const CONTAINER_TYPER = new Set([
    "nod", "databas", "molnet", "mapp", "ram", "paket", "rektangel", "komponent", "artefakt",
]);

// Pilformer och deras interna stil-id (matchar xml.js:s kantStil-funktion)
const PILAR = [
    { mönster: /^(.+?)\s*<-->\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "<-->" },
    { mönster: /^(.+?)\s*\.\.>\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "..>" },
    { mönster: /^(.+?)\s*<\.\.\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "..>" },
    { mönster: /^(.+?)\s*\.\.\s*(.+?)(?:\s*:\s*(.+))?$/,  stil: ".." },
    { mönster: /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/,   stil: "-->" },
    { mönster: /^(.+?)\s*<--\s*(.+?)(?:\s*:\s*(.+))?$/,   stil: "-->" },
    { mönster: /^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.+))?$/,    stil: "-->" },
    { mönster: /^(.+?)\s*--\s*(.+?)(?:\s*:\s*(.+))?$/,    stil: "--" },
];

function normaliserId(text) {
    // Tar bort citationstecken och konverterar mellanslag till underscore
    return text.trim().replace(/^["']|["']$/g, "").trim().replace(/\s+/g, "_");
}

function parsaDeployment(källkod) {
    const modell = { noder: [], kanter: [] };
    const rader  = källkod.split(/\r?\n/);
    const stack  = []; // stack av aktiva container-id:n

    function aktivFörälder() {
        return stack.length ? stack[stack.length - 1] : null;
    }

    function säkerställNod(id, typ, etikett, förälder) {
        let nod = modell.noder.find((n) => n.id === id);
        if (!nod) {
            nod = { id, typ: typ || "komponent", etikett: etikett || id, förälder: förälder || null };
            modell.noder.push(nod);
        } else {
            if (typ  && nod.typ === "komponent") nod.typ = typ;
            if (etikett) nod.etikett = etikett;
            if (förälder && !nod.förälder) nod.förälder = förälder;
        }
        return nod;
    }

    // Försöker tolka en rad som en nod-deklaration.
    // Returnerar true om raden konsumerades.
    function parsaDeklaration(rad) {
        const förälder = aktivFörälder();

        // ---- Hakparentes-notation: [Namn] ----
        // Kan förekomma ensam ELLER som del av en pil-rad — pil-parsern hanterar det fallet.
        // Här hanterar vi bara deklarationer som BÖRJAR med [ och inte innehåller -->
        const hakM = rad.match(/^\[([^\]]+)\]\s*(?:as\s+(\w+))?\s*(?:\{)?$/i);
        if (hakM && !rad.includes("-->") && !rad.includes("..>") && !rad.includes("--")) {
            const etikett = hakM[1].trim();
            const alias   = hakM[2] || normaliserId(etikett);
            const nod     = säkerställNod(alias, "komponent", etikett, förälder);
            if (rad.includes("{")) stack.push(alias);
            return true;
        }

        // ---- Nyckelord-deklarationer ----
        // Provmönster i specificitetordning:
        //   keyword "Lång etikett" as alias {
        //   keyword "Lång etikett" as alias
        //   keyword "Lång etikett" {
        //   keyword "Lång etikett"
        //   keyword alias {
        //   keyword alias

        const nyckelordStr = Object.keys(NYCKELORD_TILL_TYP).join("|");
        const NYCKEL_RE = new RegExp(`^(${nyckelordStr})\\s+`, "i");
        const nyckelM   = rad.match(NYCKEL_RE);
        if (!nyckelM) return false;

        const nyckelord = nyckelM[1].toLowerCase();
        const typ       = NYCKELORD_TILL_TYP[nyckelord];
        const rest      = rad.slice(nyckelM[0].length).trim();

        let etikett, alias;
        const ärContainer = CONTAINER_TYPER.has(typ);

        // "Lång etikett" as alias
        let m = rest.match(/^"([^"]+)"\s+as\s+(\S+?)(?:\s*<<[^>]*>>)?(?:\s*\{)?(?:\s*#\S+)?$/i);
        if (m) { etikett = m[1]; alias = m[2].replace(/[{]$/, "").trim(); }

        // "Lång etikett"
        if (!alias) {
            m = rest.match(/^"([^"]+)"(?:\s*<<[^>]*>>)?(?:\s*\{)?(?:\s*#\S+)?$/i);
            if (m) { etikett = m[1]; alias = normaliserId(m[1]); }
        }

        // Identifier as "Lång etikett"
        if (!alias) {
            m = rest.match(new RegExp(`^(${ID})\\s+as\\s+"([^"]+)"(?:\\s*<<[^>]*>>)?(?:\\s*\\{)?`, "i"));
            if (m) { alias = m[1]; etikett = m[2]; }
        }

        // Identifier as Identifier
        if (!alias) {
            m = rest.match(new RegExp(`^(${ID})\\s+as\\s+(${ID})(?:\\s*<<[^>]*>>)?(?:\\s*\\{)?`, "i"));
            if (m) { etikett = m[1]; alias = m[2]; }
        }

        // Bara Identifier (eller Identifier + stereotyp/hashfärg)
        if (!alias) {
            m = rest.match(new RegExp(`^(${ID})(?:\\s*<<[^>]*>>)?(?:\\s*\\{)?(?:\\s*#\\S+)?$`, "i"));
            if (m) { alias = m[1]; etikett = m[1]; }
        }

        if (!alias) return false;

        säkerställNod(alias, typ, etikett, förälder);
        if (rest.includes("{")) stack.push(alias);
        return true;
    }

    // Löser ett nodnamn (etikett, hakparentes, alias eller ID) till ett nod-id.
    // Skapar noden om den inte finns.
    function lösId(text, förälder) {
        const t = text.trim().replace(/^["']|["']$/g, "").trim();

        // Hakparentes-notation: [Komponent]
        const hakM = t.match(/^\[(.+)\]$/);
        if (hakM) {
            const etikett = hakM[1].trim();
            const id      = normaliserId(etikett);
            säkerställNod(id, "komponent", etikett, förälder);
            return id;
        }

        // Citerat namn
        if (t.startsWith('"') || t.startsWith("'")) {
            const ren = t.replace(/^["']|["']$/g, "").trim();
            const id  = normaliserId(ren);
            säkerställNod(id, "komponent", ren, förälder);
            return id;
        }

        // Vanlig identifierare
        säkerställNod(t, undefined, t, förälder);
        return t;
    }

    // Försöker tolka en rad som en pil/relation.
    // Returnerar true om raden konsumerades.
    function parsaRelation(rad) {
        for (const { mönster, stil } of PILAR) {
            const m = rad.match(mönster);
            if (!m) continue;

            const råFrån = m[1].trim();
            let   råTill = m[2].trim();
            const etikett = m[3] ? m[3].trim().replace(/^["']|["']$/g, "").trim() : null;

            // Pilen kan ha hakparentes-notation eller enkel identifierare
            const frånId = lösId(råFrån, null);
            const tillId = lösId(råTill, null);

            modell.kanter.push({ från: frånId, till: tillId, etikett, stil });
            return true;
        }
        return false;
    }

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^(title|header|footer|legend|scale|hide|show|skinparam)\b/i.test(rad)) continue;
        if (/^note\b/i.test(rad) || /^end\s*note$/i.test(rad)) continue;
        if (/^(left\s+to\s+right|top\s+to\s+bottom)\s+direction\b/i.test(rad)) continue;

        if (rad === "}") {
            stack.pop();
            continue;
        }

        if (parsaDeklaration(rad)) continue;
        if (parsaRelation(rad)) continue;
        // Okänd rad — ignoreras tyst
    }

    return modell;
}

module.exports = { parsaDeployment, CONTAINER_TYPER, NYCKELORD_TILL_TYP };
