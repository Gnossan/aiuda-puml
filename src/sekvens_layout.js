// Layout för sekvensdiagram: HELT ANNAN rumslig logik än use-case.
// Deltagare placeras horisontellt i en rad, livslinjer sträcker sig
// nedåt, och meddelanden staplas i TIDSORDNING (ordning → y-position).
//
// Returnerar:
//   { deltagarPositioner: Map<id, {x,y,bredd,höjd,centerX}>,
//     meddelandePositioner: Map<ordning, {y, frånX, tillX}>,
//     totalHöjd, totalBredd }

"use strict";

const HEADER_HÖJD = 40;     // umlLifeline-shapens "size" — höjden på toppboxen
const DELTAGARE_BREDD = 120;
const DELTAGARE_MELLANRUM = 160;
const START_X = 80;
const START_Y = 40;
const MEDDELANDE_MELLANRUM = 60;
const BOTTEN_MARGINAL = 40;

function läggUtSekvens(modell) {
    const deltagarPositioner = new Map();
    const meddelandePositioner = new Map();

    const antalMeddelanden = modell.meddelanden.length;
    const totalHöjd = HEADER_HÖJD + (antalMeddelanden + 1) * MEDDELANDE_MELLANRUM + BOTTEN_MARGINAL;

    // --- Deltagare: jämnt fördelade i en rad ---
    modell.deltagare.forEach((deltagare, index) => {
        const x = START_X + index * DELTAGARE_MELLANRUM;
        deltagarPositioner.set(deltagare.id, {
            x,
            y: START_Y,
            bredd: DELTAGARE_BREDD,
            höjd: totalHöjd,
            centerX: x + DELTAGARE_BREDD / 2,
        });
    });

    const totalBredd = START_X * 2 + Math.max(0, modell.deltagare.length - 1) * DELTAGARE_MELLANRUM + DELTAGARE_BREDD;

    // --- Meddelanden: staplade i tidsordning under header ---
    modell.meddelanden.forEach((meddelande, index) => {
        const y = START_Y + HEADER_HÖJD + (index + 1) * MEDDELANDE_MELLANRUM;
        const frånPos = deltagarPositioner.get(meddelande.från);
        const tillPos = deltagarPositioner.get(meddelande.till);

        meddelandePositioner.set(meddelande.ordning, {
            y,
            frånX: frånPos ? frånPos.centerX : START_X,
            tillX: tillPos ? tillPos.centerX : START_X,
        });
    });

    return { deltagarPositioner, meddelandePositioner, totalHöjd, totalBredd };
}

module.exports = { läggUtSekvens, HEADER_HÖJD };
