// Textbaserad parser för PlantUML-TIMING-diagram.
// Timing-diagram visar hur deltagares tillstånd förändras längs en tidslinje.
//
// Stödd syntax:
//   robust "Etikett" as alias         (deltagare med distinkta tillståndsgränser)
//   concise "Etikett" as alias        (deltagare med textannotering)
//   robust "Etikett"                  (utan alias)
//   @tidpunkt                         (absolut tidsmarkering, heltal eller decimal)
//   alias is Tillstånd                (sätter tillstånd för deltagare vid aktuell tid)
//   @tidpunkt
//   alias@offset is Tillstånd        (valfri, ignoreras tills vidare)
//   alias -> alias : meddelande       (synkroniseringspil mellan deltagare)
//   note top of alias : text         (anteckning, ignoreras)
//
// Modellstruktur:
//   deltagare: [{ id, etikett, typ }]
//     typ: "robust" | "concise"
//   tillstånd: [{ deltagarId, tid, tillstånd }]
//     — sorteras automatiskt per deltagare och tid
//   pilar: [{ från, till, tid, etikett }]

"use strict";

const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

function parsaTiming(källkod) {
    const modell = {
        deltagare:  [],
        tillstånd:  [],   // { deltagarId, tid, tillstånd }
        pilar:      [],   // { från, till, tid, etikett }
    };

    const rader      = källkod.split(/\r?\n/);
    let aktivTid     = 0;   // aktuell tidpunkt (sätts av @N-rader)

    // Hjälp: säkerställ deltagare
    function säkerställDeltagare(id, etikett, typ) {
        if (!modell.deltagare.find((d) => d.id === id)) {
            modell.deltagare.push({ id, etikett: etikett || id, typ: typ || "concise" });
        }
    }

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@start") || rad.startsWith("@end")) continue;
        if (/^(title|header|footer|legend|scale|skinparam)\b/i.test(rad)) continue;
        if (/^note\b/i.test(rad) || /^end\s*note$/i.test(rad)) continue;
        if (/^hide\b/i.test(rad)) continue;

        // ---- Tidsmarkering: @N eller @N.N ----
        const tidM = rad.match(/^@(\d+(?:\.\d+)?)$/);
        if (tidM) {
            aktivTid = parseFloat(tidM[1]);
            continue;
        }

        // ---- Deltagare-deklaration ----
        // robust "Etikett" as alias  /  concise "Etikett" as alias
        let m = rad.match(
            new RegExp(`^(robust|concise|clock|binary)\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i")
        );
        if (m) {
            säkerställDeltagare(m[3], m[2], m[1].toLowerCase());
            continue;
        }

        // robust "Etikett"  (ingen alias — normaliserat namn som id)
        m = rad.match(/^(robust|concise|clock|binary)\s+"([^"]+)"/i);
        if (m) {
            const id = m[2].replace(/\s+/g, "_");
            säkerställDeltagare(id, m[2], m[1].toLowerCase());
            continue;
        }

        // robust Alias  (ingen sträng-etikett)
        m = rad.match(new RegExp(`^(robust|concise|clock|binary)\\s+(${ID})`, "i"));
        if (m) {
            säkerställDeltagare(m[2], m[2], m[1].toLowerCase());
            continue;
        }

        // ---- Tillståndsändring: alias is Tillstånd ----
        // Hanterar också "alias@offset is Tillstånd" — vi ignorerar offset-delen
        m = rad.match(new RegExp(`^(${ID})(?:@[^\\s]+)?\\s+is\\s+(.+)$`));
        if (m) {
            const deltagarId = m[1];
            const tillstånd  = m[2].trim();
            // Säkerställ att deltagaren finns
            säkerställDeltagare(deltagarId, deltagarId, "concise");
            modell.tillstånd.push({ deltagarId, tid: aktivTid, tillstånd });
            continue;
        }

        // ---- Synkroniseringspil: alias -> alias : etikett ----
        m = rad.match(new RegExp(`^(${ID})\\s*->\\s*(${ID})(?:\\s*:\\s*(.+))?$`));
        if (m) {
            säkerställDeltagare(m[1], m[1], "concise");
            säkerställDeltagare(m[2], m[2], "concise");
            modell.pilar.push({
                från:    m[1],
                till:    m[2],
                tid:     aktivTid,
                etikett: m[3] ? m[3].trim() : null,
            });
            continue;
        }

        // Okänd rad — ignoreras tyst
    }

    return modell;
}

module.exports = { parsaTiming };
