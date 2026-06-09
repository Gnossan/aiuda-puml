// Parser för PlantUML @startgantt / @endgantt.
//
// Stödd syntax:
//   Project starts YYYY-MM-DD
//   Project starts the Nth of month YYYY
//   [Uppgift] lasts N days
//   [Uppgift] lasts N weeks
//   [Uppgift] starts YYYY-MM-DD and lasts N days
//   [Uppgift] starts N days after [Annan]'s end
//   [Uppgift] starts after [Annan]'s end
//   then [Uppgift] lasts N days    ← startar direkt efter föregående
//   -- Fase rubrik --
//   [Uppgift] is colored in #FFAAAA
//   [Uppgift] is 40% completed
//
// Modell:
//   {
//     projektStart: Date | null,
//     uppgifter: [{
//       id, etikett, fas,
//       start: Date | null, startDag: number,
//       varaktighet: number,        ← dagar
//       beroende: string | null,    ← etikett på beroende uppgift
//       färg: string | null,
//       klar: number,               ← 0–100 procent
//     }]
//   }

"use strict";

const DAGAR_PER_VECKA = 7;

function parsaDatum(s) {
    // YYYY-MM-DD
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return null;
}

function dagskillnad(frånDatum, tillDatum) {
    return Math.round((tillDatum - frånDatum) / 86400000);
}

function parsaGantt(källkod) {
    const modell = {
        projektStart: null,
        uppgifter:    [],
    };

    const rader = källkod.split(/\r?\n/);
    let aktuellFas = "";
    let föregåendeUppgift = null;   // för "then"-syntax
    let räknare = 0;

    for (const råRad of rader) {
        const rad = råRad.trim();
        if (!rad) continue;
        if (/^@(start|end)gantt/i.test(rad)) continue;
        if (rad.startsWith("'")) continue;
        if (/^(title|header|footer|skinparam|scale|today|saturday|sunday|hide)\b/i.test(rad)) continue;

        // Fas-rubrik: -- Rubrikttext --
        const fasM = rad.match(/^--\s*(.+?)\s*--$/);
        if (fasM) { aktuellFas = fasM[1]; continue; }

        // Project starts
        const projM = rad.match(/^[Pp]roject\s+starts\s+(\d{4}-\d{2}-\d{2})/);
        if (projM) { modell.projektStart = parsaDatum(projM[1]); continue; }

        // Varaktighet: N days / N weeks
        function parsaVaraktighet(s) {
            const dm = s.match(/(\d+)\s*(day|week)/i);
            if (!dm) return 1;
            return dm[2].toLowerCase().startsWith("week")
                ? +dm[1] * DAGAR_PER_VECKA
                : +dm[1];
        }

        // --- Parsing av [Uppgift]-rader ---

        // then [Uppgift] lasts N days
        let m = rad.match(/^then\s+\[([^\]]+)\]\s+lasts\s+(.+)$/i);
        if (m) {
            const upp = {
                id:          `g${räknare++}`,
                etikett:     m[1].trim(),
                fas:         aktuellFas,
                start:       null,
                startDag:    null,
                varaktighet: parsaVaraktighet(m[2]),
                beroende:    föregåendeUppgift ? `__föregående__:${föregåendeUppgift}` : null,
                färg:        null,
                klar:        0,
            };
            modell.uppgifter.push(upp);
            föregåendeUppgift = upp.etikett;
            continue;
        }

        // [Uppgift] starts after [Annan]'s end and lasts N days
        m = rad.match(/^\[([^\]]+)\]\s+starts\s+after\s+\[([^\]]+)\]'s\s+end\s+and\s+lasts\s+(.+)$/i);
        if (m) {
            const upp = {
                id:          `g${räknare++}`,
                etikett:     m[1].trim(),
                fas:         aktuellFas,
                start:       null,
                startDag:    null,
                varaktighet: parsaVaraktighet(m[3]),
                beroende:    m[2].trim(),
                färg:        null,
                klar:        0,
            };
            modell.uppgifter.push(upp);
            föregåendeUppgift = upp.etikett;
            continue;
        }

        // [Uppgift] starts after [Annan]'s end
        m = rad.match(/^\[([^\]]+)\]\s+starts\s+after\s+\[([^\]]+)\]'s\s+end$/i);
        if (m) {
            // Lägg märket på föregående uppgift om samma etikett, annars leta upp
            const upp = modell.uppgifter.find((u) => u.etikett === m[1].trim());
            if (upp) { upp.beroende = m[2].trim(); }
            continue;
        }

        // [Uppgift] starts YYYY-MM-DD and lasts N days
        m = rad.match(/^\[([^\]]+)\]\s+starts\s+(\d{4}-\d{2}-\d{2})\s+and\s+lasts\s+(.+)$/i);
        if (m) {
            const upp = {
                id:          `g${räknare++}`,
                etikett:     m[1].trim(),
                fas:         aktuellFas,
                start:       parsaDatum(m[2]),
                startDag:    null,
                varaktighet: parsaVaraktighet(m[3]),
                beroende:    null,
                färg:        null,
                klar:        0,
            };
            modell.uppgifter.push(upp);
            föregåendeUppgift = upp.etikett;
            continue;
        }

        // [Uppgift] lasts N days
        m = rad.match(/^\[([^\]]+)\]\s+lasts\s+(.+)$/i);
        if (m) {
            const upp = {
                id:          `g${räknare++}`,
                etikett:     m[1].trim(),
                fas:         aktuellFas,
                start:       null,
                startDag:    null,
                varaktighet: parsaVaraktighet(m[2]),
                beroende:    null,
                färg:        null,
                klar:        0,
            };
            modell.uppgifter.push(upp);
            föregåendeUppgift = upp.etikett;
            continue;
        }

        // [Uppgift] is colored in #RRGGBB
        m = rad.match(/^\[([^\]]+)\]\s+is\s+colored\s+in\s+#([0-9a-fA-F]{3,6})/i);
        if (m) {
            const upp = modell.uppgifter.find((u) => u.etikett === m[1].trim());
            if (upp) upp.färg = `#${m[2]}`;
            continue;
        }

        // [Uppgift] is N% completed
        m = rad.match(/^\[([^\]]+)\]\s+is\s+(\d+)%\s+completed/i);
        if (m) {
            const upp = modell.uppgifter.find((u) => u.etikett === m[1].trim());
            if (upp) upp.klar = Math.min(100, Math.max(0, +m[2]));
            continue;
        }
    }

    // ---- Lös upp startdagar (relativa till projektstart) ----
    const proj = modell.projektStart || new Date(Date.UTC(2024, 0, 1));

    // Bygg etikett→uppgift-karta
    const etikettKarta = new Map(modell.uppgifter.map((u) => [u.etikett, u]));

    // Hjälpfunktion: beräkna startdag (rekursivt via beroende)
    const cache = new Map();
    function startdag(upp) {
        if (cache.has(upp.id)) return cache.get(upp.id);
        let dag;
        if (upp.start) {
            dag = dagskillnad(proj, upp.start);
        } else if (upp.beroende) {
            const beroetikett = upp.beroende.startsWith("__föregående__:")
                ? upp.beroende.slice("__föregående__:".length)
                : upp.beroende;
            const bero = etikettKarta.get(beroetikett);
            dag = bero ? startdag(bero) + bero.varaktighet : 0;
        } else {
            // Ingen beroende och inget datum — använd slutdag för föregående uppgift i listan
            const idx = modell.uppgifter.indexOf(upp);
            if (idx > 0) {
                const föreg = modell.uppgifter[idx - 1];
                dag = startdag(föreg) + föreg.varaktighet;
            } else {
                dag = 0;
            }
        }
        cache.set(upp.id, dag);
        return dag;
    }

    for (const upp of modell.uppgifter) {
        upp.startDag = startdag(upp);
    }

    return modell;
}

module.exports = { parsaGantt };
