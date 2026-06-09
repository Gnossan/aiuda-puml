// Enkel "lagrad" layout för use-case-modeller: aktörer i en vänsterkolumn,
// systemgränser (om några) i mitten med sina usecases staplade inuti,
// lösa usecases (utan gräns) i en egen kolumn till höger om aktörerna.
//
// Målet är INTE att efterlikna PlantUML:s layout pixel för pixel — bara
// att ge varje nod en rimlig, icke-överlappande position så att resultatet
// går att öppna och plocka isär direkt i drawio. ("Bra nog är bra nog.")

"use strict";

const { TYP } = require("./parser");

const AKTÖR_BREDD = 40;
const AKTÖR_HÖJD = 80;
const USECASE_BREDD = 180;
const USECASE_HÖJD = 70;
const GRÄNS_PADDING = 30;
const GRÄNS_TITELHÖJD = 30;
const MELLANRUM_Y = 40;
const KOLUMN_X_AKTÖRER = 60;
const KOLUMN_X_INNEHÅLL = 260;

function läggUtModell(modell) {
    const positioner = new Map(); // id -> { x, y, bredd, höjd }

    const aktörer = modell.noder.filter((n) => n.typ === TYP.AKTÖR && !n.förälder);
    const gränser = modell.noder.filter((n) => n.typ === TYP.GRÄNS);
    const lösaUsecases = modell.noder.filter((n) => n.typ === TYP.USECASE && !n.förälder);

    // --- Aktörer: vänsterkolumn, staplade ---
    let y = 40;
    for (const aktör of aktörer) {
        positioner.set(aktör.id, {
            x: KOLUMN_X_AKTÖRER,
            y,
            bredd: AKTÖR_BREDD,
            höjd: AKTÖR_HÖJD,
        });
        y += AKTÖR_HÖJD + MELLANRUM_Y;
    }

    // --- Innehåll (gränser + lösa usecases): höger kolumn, staplade ---
    let innehållY = 40;

    for (const gräns of gränser) {
        const barn = modell.noder.filter((n) => n.förälder === gräns.id);
        const innerHöjd = barn.length * USECASE_HÖJD + Math.max(0, barn.length - 1) * MELLANRUM_Y;
        const gränsBredd = USECASE_BREDD + GRÄNS_PADDING * 2;
        const gränsHöjd = innerHöjd + GRÄNS_PADDING * 2 + GRÄNS_TITELHÖJD;

        positioner.set(gräns.id, {
            x: KOLUMN_X_INNEHÅLL,
            y: innehållY,
            bredd: gränsBredd,
            höjd: gränsHöjd,
        });

        // Barnens positioner är RELATIVA till föräldern i mxGraph
        // (eftersom vi sätter parent-attributet) — så vi räknar i lokala koordinater.
        let barnY = GRÄNS_TITELHÖJD + GRÄNS_PADDING;
        for (const barn_ of barn) {
            positioner.set(barn_.id, {
                x: GRÄNS_PADDING,
                y: barnY,
                bredd: USECASE_BREDD,
                höjd: USECASE_HÖJD,
                relativTillFörälder: true,
            });
            barnY += USECASE_HÖJD + MELLANRUM_Y;
        }

        innehållY += gränsHöjd + MELLANRUM_Y;
    }

    for (const uc of lösaUsecases) {
        positioner.set(uc.id, {
            x: KOLUMN_X_INNEHÅLL,
            y: innehållY,
            bredd: USECASE_BREDD,
            höjd: USECASE_HÖJD,
        });
        innehållY += USECASE_HÖJD + MELLANRUM_Y;
    }

    return positioner;
}

module.exports = { läggUtModell };
