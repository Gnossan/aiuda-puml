// Layout för aktivitetsdiagram: HELT ANNAN rumslig logik än use-case/komponent
// — flödet är vertikalt (uppifrån och ned i skapelseordning, vilket för ett
// styrflöde MOTSVARAR exekveringsordning). Grenar (if/then/else) läggs sida
// vid sida med hjälp av `gren`-fältet som parsern satte ("vänster"/"höger"/null).
//
// "Bra nog är bra nog": ingen ambition att efterlikna PlantUML:s egen
// (Graphviz-baserade) layout med exakta sammanflätningspunkter — varje nod
// får en rimlig, icke-överlappande plats att flytta vidare från i drawio.

"use strict";

const { TYP } = require("./aktivitet_parser");

const AKTIVITET_BREDD = 160;
const AKTIVITET_HÖJD = 50;
const RUND_DIAMETER = 30;     // start/slut — små cirklar
const BESLUT_BREDD = 120;
const BESLUT_HÖJD = 70;

const START_X = 240;          // centerlinjens x — huvudflödet
const GREN_FÖRSKJUTNING = 200; // hur långt vänster/höger-grenar flyttas ut
const START_Y = 40;
const RAD_MELLANRUM = 70;     // vertikalt avstånd mellan flödesnoder

function bredd(nod) {
    if (nod.typ === TYP.START || nod.typ === TYP.SLUT) return RUND_DIAMETER;
    if (nod.typ === TYP.BESLUT) return BESLUT_BREDD;
    return AKTIVITET_BREDD;
}
function höjd(nod) {
    if (nod.typ === TYP.START || nod.typ === TYP.SLUT) return RUND_DIAMETER;
    if (nod.typ === TYP.BESLUT) return BESLUT_HÖJD;
    return AKTIVITET_HÖJD;
}

// Centrerar en nod kring en given x-centerlinje (varje shape har egen bredd).
function centreraX(centerX, nodBredd) {
    return centerX - nodBredd / 2;
}

function centerXFörGren(gren) {
    if (gren === "vänster") return START_X - GREN_FÖRSKJUTNING;
    if (gren === "höger") return START_X + GREN_FÖRSKJUTNING;
    return START_X;
}

function läggUtAktivitetModell(modell) {
    const positioner = new Map();

    let y = START_Y;
    for (const nod of modell.noder) {
        const b = bredd(nod);
        const h = höjd(nod);
        const centerX = centerXFörGren(nod.gren);

        positioner.set(nod.id, {
            x: centreraX(centerX, b),
            y,
            bredd: b,
            höjd: h,
        });

        y += h + RAD_MELLANRUM;
    }

    // genereraDrawioXml (xml.js) förväntar sig positionskartan direkt — precis
    // som komponentlayouten — så att den kan återanvändas oförändrad.
    return positioner;
}

module.exports = { läggUtAktivitetModell };
