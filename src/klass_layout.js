// Layout för klassdiagram: placerar klasser i ett enkelt rutnät
// (vänster till höger, uppifrån och ned) med en fast bredd per cell
// och en höjd som beräknas utifrån antalet attribut och metoder.
//
// Paket (namespace/package) läggs ut som streckade behållare runt
// sina innehållna klasser — de placeras SIST i passet och storleksanpassas
// så att de omsluter sina barn med lite marginal.
//
// Exporterar också hjälpfunktionerna `rubrikHöjd` och `klassHöjd` —
// dessa återanvänds av klass_xml.js för att beräkna barnens y-positioner
// inuti swimlane-cellen.

"use strict";

const KLASS_BREDD = 200;
const RUBRIK_HÖJD          = 26;   // standard swimlane-header (en rad)
const RUBRIK_HÖJD_STEREOTYP = 46;  // header med stereotyprad + namnrad
const FACK_HÖJD            = 20;   // höjd per attribut- eller metodrad
const AVDELARE_HÖJD        = 8;    // tunn avdelingslinje mellan fack
const KLASS_MIN_HÖJD       = 60;
const KLASSER_PER_RAD      = 3;
const MELLANRUM_X          = 40;
const MELLANRUM_Y          = 60;
const START_X              = 60;
const START_Y              = 60;
const PAKET_PADDING        = 30;
const PAKET_TITELHÖJD      = 26;

// Hur hög ska swimlane-headern vara för en given klass?
// Gränssnitt och enum visar stereotyptext ovanför namnet — behöver mer utrymme.
function rubrikHöjd(klass) {
    return (klass.stereotyp === "gränssnitt" || klass.stereotyp === "enum")
        ? RUBRIK_HÖJD_STEREOTYP
        : RUBRIK_HÖJD;
}

// Beräknar den totala höjden på en klass-swimlane inklusive fack.
function klassHöjd(klass) {
    const rh = rubrikHöjd(klass);
    const harAttribut = klass.attribut.length > 0;
    const harMetoder = klass.metoder.length > 0;

    let h = rh;

    // Attributfack: avdelare + en rad per attribut
    if (harAttribut || harMetoder) {
        h += AVDELARE_HÖJD;
    }
    h += klass.attribut.length * FACK_HÖJD;

    // Metodfack: avdelare + en rad per metod
    if (harMetoder) {
        h += AVDELARE_HÖJD;
        h += klass.metoder.length * FACK_HÖJD;
    }

    return Math.max(h, KLASS_MIN_HÖJD);
}

function läggUtKlassModell(modell) {
    const positioner = new Map(); // id -> { x, y, bredd, höjd }

    // Klasser som INTE ligger inuti ett paket läggs ut i rutnätet direkt.
    const fristående = modell.klasser.filter((k) => !k.förälder);

    let kolumn = 0;
    let maxHöjdIRad = 0;
    let y = START_Y;

    for (const klass of fristående) {
        const x = START_X + kolumn * (KLASS_BREDD + MELLANRUM_X);
        const höjd = klassHöjd(klass);

        positioner.set(klass.id, { x, y, bredd: KLASS_BREDD, höjd });

        maxHöjdIRad = Math.max(maxHöjdIRad, höjd);
        kolumn++;
        if (kolumn >= KLASSER_PER_RAD) {
            kolumn = 0;
            y += maxHöjdIRad + MELLANRUM_Y;
            maxHöjdIRad = 0;
        }
    }
    if (kolumn > 0) {
        y += maxHöjdIRad + MELLANRUM_Y;
    }

    // Paket: lägg ut sina barn med RELATIVA koordinater (mxGraph hanterar
    // förskjutning automatiskt när parent-attributet är satt).
    for (const paket of modell.paket) {
        const barn = modell.klasser.filter((k) => k.förälder === paket.id);

        let barnKolumn = 0;
        let maxBarnHöjd = 0;
        let barnY = PAKET_TITELHÖJD + PAKET_PADDING;
        let paketBredd = PAKET_PADDING * 2;
        let paketHöjd = barnY;

        for (const barn_ of barn) {
            const bx = PAKET_PADDING + barnKolumn * (KLASS_BREDD + MELLANRUM_X);
            const höjd = klassHöjd(barn_);

            positioner.set(barn_.id, {
                x: bx,
                y: barnY,
                bredd: KLASS_BREDD,
                höjd,
                relativTillFörälder: true,
            });

            maxBarnHöjd = Math.max(maxBarnHöjd, höjd);
            barnKolumn++;
            if (barnKolumn >= KLASSER_PER_RAD) {
                barnKolumn = 0;
                barnY += maxBarnHöjd + MELLANRUM_Y;
                paketHöjd = barnY;
                maxBarnHöjd = 0;
            }

            // Håll koll på hur bred paketet behöver vara
            const behövdBredd = bx + KLASS_BREDD + PAKET_PADDING;
            if (behövdBredd > paketBredd) paketBredd = behövdBredd;
        }

        paketHöjd += maxBarnHöjd + PAKET_PADDING;

        // Paketets absoluta position — stapla paket nedanför rutnätet
        positioner.set(paket.id, {
            x: START_X,
            y,
            bredd: paketBredd,
            höjd: paketHöjd,
        });

        y += paketHöjd + MELLANRUM_Y;
    }

    return positioner;
}

module.exports = { läggUtKlassModell, klassHöjd, rubrikHöjd, KLASS_BREDD, FACK_HÖJD, AVDELARE_HÖJD };
