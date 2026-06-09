// Layout för deployment-diagram.
//
// Deployment-diagram kan ha godtyckligt nästlade containers
// (node { database { component } }). Vi löser detta med en
// rekursiv bottom-up-strategi:
//
//   Pass 1 (inifrån och ut):
//     Beräkna varje nods storlek. Leaf-noder har fixa dimensioner.
//     Container-noder dimensioneras utifrån sina barns samlade storlek.
//
//   Pass 2 (utifrån och in):
//     Tilldela absoluta koordinater till top-level-noder (grid, 3 per rad).
//     Barnpositioner är relativa till föräldern (drawio hanterar det).

"use strict";

const { CONTAINER_TYPER } = require("./deployment_parser");

// ---- Dimensioner ----
const CONTAINER_PADDING  = 40;   // marginal inuti en container (alla sidor)
const CONTAINER_TITEL    = 30;   // extra höjd för container-rubriken
const LEAF_BREDD         = 160;  // standardbredd för leaf-noder
const LEAF_HÖJD          = 60;   // standardhöjd för leaf-noder
const AKTÖR_BREDD        = 40;
const AKTÖR_HÖJD         = 80;
const BARN_MELLANRUM     = 20;   // gap mellan barn inuti en container
const KOLUMNER           = 3;    // max antal top-level-noder per rad
const START_X            = 40;
const START_Y            = 40;
const KOLUMN_MELLANRUM   = 60;
const RAD_MELLANRUM      = 60;

function ärContainer(typ) {
    return CONTAINER_TYPER.has(typ);
}

function leafDimensioner(nod) {
    if (nod.typ === "aktör") return { bredd: AKTÖR_BREDD, höjd: AKTÖR_HÖJD };
    return { bredd: LEAF_BREDD, höjd: LEAF_HÖJD };
}

// --- Pass 1: beräkna storlekar bottom-up ---
// Returnerar en Map { id -> { bredd, höjd } }
function beräknaStolek(modell) {
    const storlekar = new Map();

    // Beräkna rekursivt; börjar med att lösa leaf-noder (inga barn)
    function lös(nod) {
        if (storlekar.has(nod.id)) return storlekar.get(nod.id);

        const barn = modell.noder.filter((n) => n.förälder === nod.id);

        if (!ärContainer(nod.typ) || barn.length === 0) {
            // Leaf-nod (eller container utan barn) — fast storlek
            const dim = leafDimensioner(nod);
            storlekar.set(nod.id, dim);
            return dim;
        }

        // Container med barn: arrangera barn i en rad och beräkna sammanlagd storlek.
        // Vi lägger barn i en horisontell rad för enkelhets skull.
        let totBredd = 0;
        let maxHöjd  = 0;
        for (const b of barn) {
            const d = lös(b);
            totBredd += d.bredd;
            maxHöjd   = Math.max(maxHöjd, d.höjd);
        }
        totBredd += Math.max(0, barn.length - 1) * BARN_MELLANRUM;

        const bredd = totBredd + CONTAINER_PADDING * 2;
        const höjd  = maxHöjd  + CONTAINER_PADDING * 2 + CONTAINER_TITEL;

        storlekar.set(nod.id, { bredd, höjd });
        return { bredd, höjd };
    }

    for (const nod of modell.noder) lös(nod);
    return storlekar;
}

// --- Pass 2: tilldela positioner top-down ---
function läggUtDeploymentModell(modell) {
    const positioner = new Map();
    const storlekar  = beräknaStolek(modell);

    // Top-level-noder (ingen förälder)
    const topNoder = modell.noder.filter((n) => !n.förälder);

    // Sorterar: containers (nod, molnet etc.) före leaf-komponenter
    const sorterade = [
        ...topNoder.filter((n) => ärContainer(n.typ)),
        ...topNoder.filter((n) => !ärContainer(n.typ)),
    ];

    // Antal rader i rutnät
    const antalRader = Math.ceil(sorterade.length / KOLUMNER);

    // Förberäkna maxhöjd per rad
    const radStartY = new Array(antalRader).fill(0);
    radStartY[0] = START_Y;
    for (let r = 1; r < antalRader; r++) {
        let maxH = 0;
        for (let k = 0; k < KOLUMNER; k++) {
            const idx = (r - 1) * KOLUMNER + k;
            if (idx < sorterade.length) {
                maxH = Math.max(maxH, storlekar.get(sorterade[idx].id)?.höjd || LEAF_HÖJD);
            }
        }
        radStartY[r] = radStartY[r - 1] + maxH + RAD_MELLANRUM;
    }

    // Förberäkna kolumnbredder: max-bredd bland alla noder i respektive kolumn.
    // (Annars beräknas x med *nuvarande* nods bredd → kolumner överlappar varandra
    // om noderna har olika bredd.)
    const kolumnBredd = new Array(KOLUMNER).fill(0);
    sorterade.forEach((nod, index) => {
        const kol  = index % KOLUMNER;
        const bredd = storlekar.get(nod.id)?.bredd || LEAF_BREDD;
        kolumnBredd[kol] = Math.max(kolumnBredd[kol], bredd);
    });

    const kolumnStartX = new Array(KOLUMNER).fill(0);
    kolumnStartX[0] = START_X;
    for (let k = 1; k < KOLUMNER; k++) {
        kolumnStartX[k] = kolumnStartX[k - 1] + kolumnBredd[k - 1] + KOLUMN_MELLANRUM;
    }

    // Tilldela absoluta positioner för top-level-noder
    sorterade.forEach((nod, index) => {
        const kol = index % KOLUMNER;
        const rad = Math.floor(index / KOLUMNER);
        const dim = storlekar.get(nod.id) || leafDimensioner(nod);

        positioner.set(nod.id, {
            x:     kolumnStartX[kol],
            y:     radStartY[rad],
            bredd: dim.bredd,
            höjd:  dim.höjd,
        });
    });

    // Tilldela relativa positioner för barn (relativa till sin förälder)
    function placeraBarni(förälderId) {
        const barn = modell.noder.filter((n) => n.förälder === förälderId);
        if (barn.length === 0) return;

        // Horisontell rad inuti containern
        let x = CONTAINER_PADDING;
        const y = CONTAINER_TITEL + CONTAINER_PADDING;

        for (const b of barn) {
            const dim = storlekar.get(b.id) || leafDimensioner(b);

            positioner.set(b.id, {
                x,
                y,
                bredd: dim.bredd,
                höjd:  dim.höjd,
                relativTillFörälder: true,
            });

            x += dim.bredd + BARN_MELLANRUM;

            // Rekursivt för barnens barn
            if (ärContainer(b.typ)) {
                placeraBarni(b.id);
            }
        }
    }

    for (const nod of sorterade) {
        if (ärContainer(nod.typ)) {
            placeraBarni(nod.id);
        }
    }

    return positioner;
}

module.exports = { läggUtDeploymentModell };
