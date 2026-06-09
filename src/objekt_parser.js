// Textbaserad parser för PlantUML-OBJEKTDIAGRAM.
// Objektdiagram visar instanser (konkreta objekt) med fältvärden —
// syntaxmässigt likt klassdiagram men med instansnamn och "=" för värden.
//
// Stödd syntax:
//   object "etikett" as alias { fält = värde; ... }
//   object alias { fält = värde }
//   object alias
//   alias : Klass     (deklarerar typ för ett redan namngivet objekt)
//   A --> B : etikett
//   A -- B
//   A ..> B : etikett
//
// Modellstruktur:
//   objekt: [{ id, etikett, klass, fält: [String] }]
//   kanter: [{ från, till, etikett, stil }]
//
//   etikett = instansnamnet ("alice", "kund1" m.m.)
//   klass   = klassnamnet  ("Person", "Kund" m.m.) — null om okänt
//   fält    = ["namn = värde", ...] — bevaras som rå text

"use strict";

const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

// Pilformer — samma som deployment/klass
const PILAR = [
    { mönster: /^(.+?)\s*<-->\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "<-->" },
    { mönster: /^(.+?)\s*\.\.>\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "..>" },
    { mönster: /^(.+?)\s*<\.\.\s*(.+?)(?:\s*:\s*(.+))?$/, stil: "..>" },
    { mönster: /^(.+?)\s*\.\.\s*(.+?)(?:\s*:\s*(.+))?$/,  stil: ".." },
    { mönster: /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/,   stil: "-->" },
    { mönster: /^(.+?)\s*<--\s*(.+?)(?:\s*:\s*(.+))?$/,   stil: "-->" },
    { mönster: /^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.+))?$/,    stil: "-->" },
    { mönster: /^(.+?)\s*<-\s*(.+?)(?:\s*:\s*(.+))?$/,    stil: "-->" },
    { mönster: /^(.+?)\s*--\s*(.+?)(?:\s*:\s*(.+))?$/,    stil: "--" },
];

function parsaObjekt(källkod) {
    const modell = { objekt: [], kanter: [] };
    const rader  = källkod.split(/\r?\n/);

    let aktuellObj = null; // { id, etikett, klass, fält }

    function säkerställObj(id, etikett, klass) {
        let obj = modell.objekt.find((o) => o.id === id);
        if (!obj) {
            obj = { id, etikett: etikett || id, klass: klass || null, fält: [] };
            modell.objekt.push(obj);
        } else {
            if (etikett) obj.etikett = etikett;
            if (klass && !obj.klass) obj.klass = klass;
        }
        return obj;
    }

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^(title|header|footer|legend|scale|hide|show|skinparam)\b/i.test(rad)) continue;
        if (/^note\b/i.test(rad) || /^end\s*note$/i.test(rad)) continue;

        // ---- Stäng ett objektblock ----
        if (aktuellObj && rad === "}") {
            aktuellObj = null;
            continue;
        }

        // ---- Inuti ett objektblock: fältrader ----
        if (aktuellObj) {
            // Ignorera separatorer och tomma rader
            if (rad !== "--") {
                aktuellObj.fält.push(rad);
            }
            continue;
        }

        // ---- Objektdeklaration ----
        // Formerna (i specificitetordning):
        //   object "Lång etikett" as alias [: Klass] [{]
        //   object "Lång etikett" [: Klass] [{]
        //   object alias [: Klass] [{]

        let m;

        // object "Etikett" as Alias [: Klass] [{]
        m = rad.match(
            new RegExp(`^object\\s+"([^"]+)"\\s+as\\s+(${ID})(?:\\s*:\\s*(${ID}))?(?:\\s*\\{)?`, "i")
        );
        if (m) {
            const obj = säkerställObj(m[2], m[1], m[3] || null);
            if (rad.includes("{")) aktuellObj = obj;
            continue;
        }

        // object "Etikett" [: Klass] [{]   (ingen alias — använder normaliserat namn som id)
        m = rad.match(/^object\s+"([^"]+)"(?:\s*:\s*(\w+))?(?:\s*\{)?/i);
        if (m) {
            const id  = m[1].replace(/\s+/g, "_");
            const obj = säkerställObj(id, m[1], m[2] || null);
            if (rad.includes("{")) aktuellObj = obj;
            continue;
        }

        // object Alias [: Klass] [{]
        m = rad.match(new RegExp(`^object\\s+(${ID})(?:\\s*:\\s*(${ID}))?(?:\\s*\\{)?`, "i"));
        if (m) {
            const obj = säkerställObj(m[1], m[1], m[2] || null);
            if (rad.includes("{")) aktuellObj = obj;
            continue;
        }

        // ---- Typ-annotation i efterhand: Alias : Klass ----
        // (PlantUML tillåter "kund1 : Kund" som en fristående rad)
        m = rad.match(new RegExp(`^(${ID})\\s*:\\s*(${ID})\\s*$`));
        if (m && !rad.includes("-->") && !rad.includes("->") && !rad.includes("--")) {
            säkerställObj(m[1], m[1], m[2]);
            continue;
        }

        // ---- Relationer ----
        for (const { mönster, stil } of PILAR) {
            const pm = rad.match(mönster);
            if (!pm) continue;

            const råFrån = pm[1].trim().replace(/^["']|["']$/g, "").trim();
            const råTill = pm[2].trim().replace(/^["']|["']$/g, "").trim();
            const etikett = pm[3] ? pm[3].trim().replace(/^["']|["']$/g, "").trim() : null;

            säkerställObj(råFrån, råFrån, null);
            säkerställObj(råTill, råTill, null);
            modell.kanter.push({ från: råFrån, till: råTill, etikett, stil });
            break;
        }
    }

    return modell;
}

module.exports = { parsaObjekt };
