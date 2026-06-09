// Layout för ER-diagram: rutnät (3 entiteter per rad), höjd från innehållet.
//
// Entiteter placeras uppifrån-ned, vänster-höger i max 3 kolumner —
// samma strategi som klass_layout.js men med ER-specifika mått.

"use strict";

// Dimensioner
const ENTITET_BREDD  = 220;   // entitetens bredd i pixlar
const RUBRIK_HÖJD    = 30;    // rubrikens höjd (entitetnamnet)
const RAD_HÖJD       = 22;    // höjd per attributrad
const AVDELARE_HÖJD  = 8;     // synlig avdelingslinje
const MELLANRUM_X    = 60;    // horisontellt gap mellan entiteter
const MELLANRUM_Y    = 60;    // vertikalt gap mellan rader
const KOLUMNER       = 3;     // max antal entiteter per rad
const START_X        = 40;    // vänstermarginalen
const START_Y        = 40;    // topmarginalen

// Beräknar entitetens totala höjd utifrån attribut-listan.
function entitetHöjd(entitet) {
    let h = RUBRIK_HÖJD;
    for (const attr of entitet.attribut) {
        h += attr.separator ? AVDELARE_HÖJD : RAD_HÖJD;
    }
    // Minst en rad så entiteten inte ser tom ut
    if (entitet.attribut.length === 0) h += RAD_HÖJD;
    return h;
}

function läggUtERModell(modell) {
    const positioner = new Map();
    const entiteter  = modell.entiteter;

    // Antal rader i rutnätet
    const antalRader = Math.ceil(entiteter.length / KOLUMNER);

    // Förberäkna y-startposition per rad (varje rad har maxhöjden bland sina entiteter)
    const radStartY = new Array(antalRader).fill(0);
    radStartY[0] = START_Y;
    for (let r = 1; r < antalRader; r++) {
        let maxH = 0;
        for (let k = 0; k < KOLUMNER; k++) {
            const idx = (r - 1) * KOLUMNER + k;
            if (idx < entiteter.length) {
                maxH = Math.max(maxH, entitetHöjd(entiteter[idx]));
            }
        }
        radStartY[r] = radStartY[r - 1] + maxH + MELLANRUM_Y;
    }

    entiteter.forEach((entitet, index) => {
        const kol = index % KOLUMNER;
        const rad = Math.floor(index / KOLUMNER);

        positioner.set(entitet.id, {
            x:     START_X + kol * (ENTITET_BREDD + MELLANRUM_X),
            y:     radStartY[rad],
            bredd: ENTITET_BREDD,
            höjd:  entitetHöjd(entitet),
        });
    });

    return positioner;
}

module.exports = {
    läggUtERModell,
    entitetHöjd,
    ENTITET_BREDD,
    RUBRIK_HÖJD,
    RAD_HÖJD,
    AVDELARE_HÖJD,
};
