// Tolkar PlantUML "skinparam"-direktiv (enkelradsformen) och bygger
// en stilkarta: { elementTyp: { fillColor, strokeColor, fontColor, ... } }
// som senare kan slås upp av xml.js när stilsträngar genereras.
//
// Stödd form (den vanligaste i praktiken):
//   skinparam <ElementNamn><Egenskap> <värde>
//   skinparam ArrowColor <värde>                (globalt, gäller kanter)
//   skinparam componentStyle rectangle          (strukturella växlar — sparas rått)
//
// Blockformen `skinparam usecase { BackgroundColor ... }` stöds INTE ännu
// (markerad som möjlig vidareutveckling) — vi siktar på "bra nog".

"use strict";

// Mappar PlantUML-elementnamn (skiftlägesokänsligt) till våra interna typnycklar.
const ELEMENT_ALIAS = {
    usecase: "usecase",
    actor: "aktör",
    rectangle: "gräns",
    package: "gräns",
    note: "anteckning",
    interface: "gränssnitt",
    component: "komponent",
    activity: "aktivitet",
    class: "klass",
    arrow: "__kant__", // specialfall: gäller kanter, inte en nodtyp
};

// Mappar PlantUML-egenskapssuffix till drawio-stilattribut.
const EGENSKAP_TILL_STILATTRIBUT = {
    backgroundcolor: "fillColor",
    bordercolor: "strokeColor",
    fontcolor: "fontColor",
    fontname: "fontFamily",
    fontsize: "fontSize",
    color: "strokeColor", // t.ex. ArrowColor → strokeColor på kanter
};

// Normaliserar en PlantUML-färgangivelse till något drawio förstår.
// PlantUML accepterar både hex (#FEFECE) och CSS-färgnamn (LightBlue,
// utan #). Ett vanligt misstag (även från min sida i ett testexempel!)
// är att skriva "#LightSkyBlue" — ogiltig CSS som varken är hex eller
// rent namn. Vi rättar till just det fallet: om det som följer på "#"
// INTE är giltiga hex-siffror, antar vi att det är ett färgnamn och
// tar bort "#"-tecknet.
function normaliseraFärg(värde) {
    let v = värde.trim().replace(/^"|"$/g, "");
    const hexMatch = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (v.startsWith("#") && !hexMatch) {
        v = v.slice(1);
    }
    return v;
}

function tolkaSkinparam(källkod) {
    const stilar = {};       // { typNyckel: { fillColor, ... } }
    const kantStil = {};     // { strokeColor, ... } — från ArrowColor m.fl.
    const strukturella = {}; // t.ex. { componentStyle: "rectangle" }

    const rader = källkod.split(/\r?\n/);

    for (const råRad of rader) {
        const rad = råRad.trim();
        if (!rad.toLowerCase().startsWith("skinparam")) continue;
        if (rad.includes("{")) continue; // blockform — hoppas över i denna version

        // skinparam <Namn> <värde>   där <Namn> kan vara t.ex.
        // "useCaseBackgroundColor", "ArrowColor", "componentStyle"
        const m = rad.match(/^skinparam\s+(\w+)\s+(.+)$/i);
        if (!m) continue;

        const namn = m[1];
        const värde = normaliseraFärg(m[2]);

        // Försök bryta isär <ElementNamn><Egenskap> genom att matcha ett
        // känt egenskapssuffix i slutet av namnet.
        const namnGemener = namn.toLowerCase();
        let matchat = false;

        for (const suffix of Object.keys(EGENSKAP_TILL_STILATTRIBUT)) {
            if (namnGemener.endsWith(suffix)) {
                const elementDel = namnGemener.slice(0, namnGemener.length - suffix.length);
                const stilattribut = EGENSKAP_TILL_STILATTRIBUT[suffix];

                if (elementDel === "" || elementDel === "arrow") {
                    // Globalt — gäller kanter (ArrowColor, ArrowFontColor, ...)
                    kantStil[stilattribut] = värde;
                } else if (ELEMENT_ALIAS[elementDel]) {
                    const typNyckel = ELEMENT_ALIAS[elementDel];
                    stilar[typNyckel] = stilar[typNyckel] || {};
                    stilar[typNyckel][stilattribut] = värde;
                } else {
                    // Okänt elementnamn — spara ändå rått, kan vara användbart
                    stilar[elementDel] = stilar[elementDel] || {};
                    stilar[elementDel][stilattribut] = värde;
                }
                matchat = true;
                break;
            }
        }

        if (!matchat) {
            // Strukturella växlar utan färgsuffix, t.ex. "componentStyle rectangle"
            strukturella[namn] = värde;
        }
    }

    return { stilar, kantStil, strukturella };
}

module.exports = { tolkaSkinparam, ELEMENT_ALIAS };
