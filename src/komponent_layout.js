// Enkel layout för komponentdiagram: behållare (package/node/database/...)
// staplade i en vänsterkolumn med sina barn radade inuti, lösa komponenter
// och gränssnitt i ett rutnät till höger. Samma "bra nog är bra nog"-princip
// som use-case-layouten — ingen ambition att efterlikna PlantUML:s egen
// (Graphviz-baserade) layout, bara att ge varje nod en rimlig,
// icke-överlappande plats att flytta vidare från i drawio.

"use strict";

const { TYP } = require("./komponent_parser");

const KOMPONENT_BREDD = 160;
const KOMPONENT_HÖJD = 60;
const GRÄNSSNITT_BREDD = 40;
const GRÄNSSNITT_HÖJD = 40;
const BEHÅLLARE_PADDING = 30;
const BEHÅLLARE_TITELHÖJD = 30;
const MELLANRUM = 40;
const KOLUMN_X_BEHÅLLARE = 60;
const KOLUMN_X_LÖSA = 360;
const RUTNÄT_KOLUMNER = 2;

function bredd(nod) {
    return nod.typ === TYP.GRÄNSSNITT ? GRÄNSSNITT_BREDD : KOMPONENT_BREDD;
}
function höjd(nod) {
    return nod.typ === TYP.GRÄNSSNITT ? GRÄNSSNITT_HÖJD : KOMPONENT_HÖJD;
}

function läggUtKomponentModell(modell) {
    const positioner = new Map();

    const behållare = modell.noder.filter((n) => n.typ === TYP.GRÄNS && !n.förälder);
    const lösaNoder = modell.noder.filter(
        (n) => (n.typ === TYP.KOMPONENT || n.typ === TYP.GRÄNSSNITT) && !n.förälder
    );

    // --- Behållare: vänsterkolumn, staplade, barn radade inuti ---
    let behållareY = 40;
    for (const behållarNod of behållare) {
        const barn = modell.noder.filter((n) => n.förälder === behållarNod.id);
        const innerHöjd = barn.length
            ? barn.length * KOMPONENT_HÖJD + Math.max(0, barn.length - 1) * MELLANRUM
            : KOMPONENT_HÖJD;
        const behållarBredd = KOMPONENT_BREDD + BEHÅLLARE_PADDING * 2;
        const behållarHöjd = innerHöjd + BEHÅLLARE_PADDING * 2 + BEHÅLLARE_TITELHÖJD;

        positioner.set(behållarNod.id, {
            x: KOLUMN_X_BEHÅLLARE,
            y: behållareY,
            bredd: behållarBredd,
            höjd: behållarHöjd,
        });

        let barnY = BEHÅLLARE_TITELHÖJD + BEHÅLLARE_PADDING;
        for (const barn_ of barn) {
            positioner.set(barn_.id, {
                x: BEHÅLLARE_PADDING,
                y: barnY,
                bredd: bredd(barn_),
                höjd: höjd(barn_),
                relativTillFörälder: true,
            });
            barnY += KOMPONENT_HÖJD + MELLANRUM;
        }

        behållareY += behållarHöjd + MELLANRUM;
    }

    // --- Lösa komponenter/gränssnitt: rutnät till höger ---
    let rad = 0;
    let kolumn = 0;
    for (const nod of lösaNoder) {
        const x = KOLUMN_X_LÖSA + kolumn * (KOMPONENT_BREDD + MELLANRUM);
        const y = 40 + rad * (KOMPONENT_HÖJD + MELLANRUM);

        positioner.set(nod.id, { x, y, bredd: bredd(nod), höjd: höjd(nod) });

        kolumn += 1;
        if (kolumn >= RUTNÄT_KOLUMNER) {
            kolumn = 0;
            rad += 1;
        }
    }

    return positioner;
}

module.exports = { läggUtKomponentModell };
