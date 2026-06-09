// Parser för PlantUML @startmindmap och @startwbs.
// Syntaxen är identisk för båda — skillnaden är enbart layouten (radial vs. träd).
//
// Stödd syntax:
//   * Root                    — rot (djup 1)
//   ** Gren                   — höger, djup 2
//   *** Löv                   — höger, djup 3
//   -- Gren                   — vänster, djup 2  (bara mindmap)
//   --- Löv                   — vänster, djup 3
//   + Root / ++ Gren          — alternativ syntax med +/-
//   ** [#FFAAAA] Färgad gren  — valfri anpassad bakgrundsfärg
//   left side                 — allt efter detta märke går till vänster
//
// Modell:
//   { noder: [{ id, text, djup, sida, förälderId, färg }], rotId }
//     sida: 'rot' | 'höger' | 'vänster'

"use strict";

function parsaMindmapEllerWbs(källkod) {
    const noder = [];
    let räknare = 0;
    let vänsterLäge = false;

    for (const råRad of källkod.split(/\r?\n/)) {
        const rad = råRad.trim();
        if (!rad) continue;
        if (/^@(start|end)(mindmap|wbs)/i.test(rad)) continue;
        if (rad.startsWith("'")) continue;
        if (/^(title|header|footer|skinparam|scale|caption)\b/i.test(rad)) continue;

        // Vänster-markör
        if (/^left\s+side$/i.test(rad)) {
            vänsterLäge = true;
            continue;
        }

        // Matcha prefix: *, + eller - (repeterade), valfri [#färg], sedan text
        const m = rad.match(/^([*+\-]+)(?:\[#([a-fA-F0-9]{3,6}|[a-zA-Z]+)\])?\s*(.+)$/);
        if (!m) continue;

        const förstaChar = m[1][0];
        const djup       = m[1].length;
        const färg       = m[2] || null;
        const text       = m[3].trim();

        let sida;
        if (djup === 1) {
            sida = "rot";
        } else if (förstaChar === "-") {
            sida = "vänster";
        } else {
            sida = vänsterLäge ? "vänster" : "höger";
        }

        noder.push({ id: `mm${räknare++}`, text, djup, sida, färg, förälderId: null });
    }

    if (noder.length === 0) return { noder: [], rotId: null };

    // Hitta rot (djup 1) — ta den första
    const rot   = noder.find((n) => n.djup === 1) || noder[0];
    const rotId = rot.id;

    // Tilldela förälder: gå bakåt och hitta närmaste nod med djup = djup - 1
    for (let i = 1; i < noder.length; i++) {
        const nod = noder[i];
        if (nod.djup <= 1) continue;
        for (let j = i - 1; j >= 0; j--) {
            if (noder[j].djup === nod.djup - 1) {
                nod.förälderId = noder[j].id;
                break;
            }
        }
        if (!nod.förälderId) nod.förälderId = rotId;
    }

    return { noder, rotId };
}

module.exports = { parsaMindmapEllerWbs };
