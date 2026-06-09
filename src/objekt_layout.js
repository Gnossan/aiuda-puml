// Layout för objektdiagram: grid (3 per rad), höjd från antal fält.
// Samma strategi som klass_layout.js men med objektspecifika dimensioner.

"use strict";

const OBJEKT_BREDD  = 200;
const RUBRIK_HÖJD   = 36;   // instansnamn understruket — lite mer luft
const FÄLT_HÖJD     = 20;
const AVDELARE_HÖJD = 8;
const MELLANRUM_X   = 60;
const MELLANRUM_Y   = 60;
const KOLUMNER      = 3;
const START_X       = 40;
const START_Y       = 40;

function objektHöjd(obj) {
    let h = RUBRIK_HÖJD + AVDELARE_HÖJD;
    h += obj.fält.length * FÄLT_HÖJD;
    if (obj.fält.length === 0) h += FÄLT_HÖJD; // minst en tom rad
    return h;
}

function läggUtObjektModell(modell) {
    const positioner = new Map();
    const objekt     = modell.objekt;

    const antalRader = Math.ceil(objekt.length / KOLUMNER);

    // Förberäkna kolumnbredder (alla lika — alla har OBJEKT_BREDD)
    const kolumnStartX = new Array(KOLUMNER).fill(0);
    kolumnStartX[0] = START_X;
    for (let k = 1; k < KOLUMNER; k++) {
        kolumnStartX[k] = kolumnStartX[k - 1] + OBJEKT_BREDD + MELLANRUM_X;
    }

    // Förberäkna radstart-Y (maxhöjd per rad)
    const radStartY = new Array(antalRader).fill(0);
    radStartY[0] = START_Y;
    for (let r = 1; r < antalRader; r++) {
        let maxH = 0;
        for (let k = 0; k < KOLUMNER; k++) {
            const idx = (r - 1) * KOLUMNER + k;
            if (idx < objekt.length) maxH = Math.max(maxH, objektHöjd(objekt[idx]));
        }
        radStartY[r] = radStartY[r - 1] + maxH + MELLANRUM_Y;
    }

    objekt.forEach((obj, index) => {
        const kol = index % KOLUMNER;
        const rad = Math.floor(index / KOLUMNER);
        positioner.set(obj.id, {
            x:     kolumnStartX[kol],
            y:     radStartY[rad],
            bredd: OBJEKT_BREDD,
            höjd:  objektHöjd(obj),
        });
    });

    return positioner;
}

module.exports = {
    läggUtObjektModell,
    objektHöjd,
    OBJEKT_BREDD,
    RUBRIK_HÖJD,
    FÄLT_HÖJD,
    AVDELARE_HÖJD,
};
