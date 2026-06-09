// Layout för tillståndsdiagram: vertikalt flöde i en enda kolumn,
// sammansatta tillstånd (composite states, typ "gräns") läggs ut som
// containers runt sina barn — precis som use-case-layouten hanterar
// systemgränser, men med tillståndsspecifika mått.
//
// "Bra nog är bra nog": layouten syftar till att ge varje nod en rimlig,
// icke-överlappande startposition. Användaren kan flytta om i drawio.

"use strict";

const { TYP } = require("./tillstand_parser");

// Dimensioner
const TILLSTÅND_BREDD   = 160;
const TILLSTÅND_HÖJD    = 50;
const PSEUDO_DIAMETER   = 30;    // start/slut — liten fylld/dubbel cirkel
const KOMPOSIT_PADDING  = 30;    // marginal inuti sammansatta tillstånd
const KOMPOSIT_TITEL    = 26;    // rubrikhöjd för composite-container
const KOLUMN_X          = 220;   // center-x för noder utan förälder
const START_Y           = 40;
const MELLANRUM_Y       = 40;    // vertikalt gap mellan noder

function nodBredd(nod) {
    if (nod.typ === TYP.START || nod.typ === TYP.SLUT) return PSEUDO_DIAMETER;
    return TILLSTÅND_BREDD;
}

function nodHöjd(nod) {
    if (nod.typ === TYP.START || nod.typ === TYP.SLUT) return PSEUDO_DIAMETER;
    return TILLSTÅND_HÖJD;
}

function läggUtTillståndModell(modell) {
    const positioner = new Map();

    // --- Pass 1: sammansatta tillstånd ---
    // Beräkna storlek inifrån och ut: barnens positioner (relativa till
    // föräldern) fastställs före förälderns absoluta position.
    const kompositNoder = modell.noder.filter((n) => n.typ === TYP.KOMPOSIT);

    for (const komposit of kompositNoder) {
        const barn = modell.noder.filter((n) => n.förälder === komposit.id);

        let barnY = KOMPOSIT_TITEL + KOMPOSIT_PADDING;
        let maxBarnBredd = TILLSTÅND_BREDD;

        for (const barn_ of barn) {
            const b = nodBredd(barn_);
            const h = nodHöjd(barn_);
            // Centrera barnet horisontellt inuti containern
            const barnX = KOMPOSIT_PADDING + (maxBarnBredd - b) / 2;

            positioner.set(barn_.id, {
                x: barnX,
                y: barnY,
                bredd: b,
                höjd: h,
                relativTillFörälder: true,
            });

            barnY += h + MELLANRUM_Y;
        }

        const kompositBredd = maxBarnBredd + KOMPOSIT_PADDING * 2;
        const kompositHöjd  = barnY + KOMPOSIT_PADDING - MELLANRUM_Y;

        // Absolutpositionen för komposit-noden sätts i pass 2 nedan,
        // men vi sparar storleken redan nu.
        positioner.set(komposit.id, {
            x: 0, y: 0, // placeholder — skrivs över nedan
            bredd: Math.max(kompositBredd, TILLSTÅND_BREDD + KOMPOSIT_PADDING * 2),
            höjd: Math.max(kompositHöjd, KOMPOSIT_TITEL + PSEUDO_DIAMETER + KOMPOSIT_PADDING * 2),
        });
    }

    // --- Pass 2: top-level noder i vertikal ordning ---
    // Ordning: initial pseudo-state → övriga → final pseudo-state.
    const toppNoder = modell.noder.filter((n) => !n.förälder);

    // Sortera: START-noder före TILLSTÅND/KOMPOSIT, SLUT-noder sist
    const ordnad = [
        ...toppNoder.filter((n) => n.typ === TYP.START),
        ...toppNoder.filter((n) => n.typ !== TYP.START && n.typ !== TYP.SLUT),
        ...toppNoder.filter((n) => n.typ === TYP.SLUT),
    ];

    let y = START_Y;
    for (const nod of ordnad) {
        const befintlig = positioner.get(nod.id);
        const b = befintlig ? befintlig.bredd : nodBredd(nod);
        const h = befintlig ? befintlig.höjd : nodHöjd(nod);

        positioner.set(nod.id, {
            ...(befintlig || {}),
            x: KOLUMN_X - b / 2,
            y,
            bredd: b,
            höjd: h,
        });

        y += h + MELLANRUM_Y;
    }

    return positioner;
}

module.exports = { läggUtTillståndModell };
