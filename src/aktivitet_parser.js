// Textbaserad parser för PlantUML-AKTIVITETSDIAGRAM (moderna ":Text;"-syntaxen).
// Bygger samma slags logiska modell som use-case-/komponent-parsern
// ({ noder: [{id, typ, etikett, gren}], kanter: [{från, till, etikett}] })
// — vilket gör att den befintliga, generiska XML-generatorn (xml.js) kan
// återanvändas rakt av. Layouten är dock egen (aktivitet_layout.js) eftersom
// flödet är vertikalt och grenar (if/else) ska hamna sida vid sida.
//
// Stödd (delmängd av) syntax — "bra nog är bra nog":
//   start / stop / end
//   :Aktivitetstext;
//   if (villkor?) then (etikett)
//     ...
//   else (etikett)
//     ...
//   endif
//
// MEDVETET UTANFÖR omfånget i denna första version (vanliga, men mer sällsynta
// konstruktioner — kan läggas till senare om behov uppstår):
//   while/endwhile, repeat/repeat while, fork/fork again/end fork, switch/case,
//   elseif, partitions/swimlanes, noteringar
// Sådana rader ignoreras tyst, precis som "okända rader" i övriga parsrar.

"use strict";

const TYP = {
    AKTIVITET: "aktivitet",
    START: "start",
    SLUT: "slut",
    BESLUT: "beslut",
};

function nyTomModell() {
    return { noder: [], kanter: [] };
}

function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

let räknare = 0;
function nyttId(prefix) {
    räknare += 1;
    return `${prefix}_${räknare}`;
}

// Lägger till en nod i modellen och returnerar dess id.
// `gren` ärvs in från den aktiva grenkontexten — används av layouten för att
// placera "then"-grenen till vänster och "else"-grenen till höger om huvudflödet.
function läggTillNod(modell, typ, etikett, gren) {
    const id = nyttId(typ);
    modell.noder.push({ id, typ, etikett: etikett || "", gren: gren || null });
    return id;
}

function läggTillKant(modell, från, till, etikett) {
    if (!från || !till) return;
    modell.kanter.push({ från, till, etikett: etikett || null });
}

// `aktuella` representerar de "öppna flödesändar" som väntar på att kopplas
// till nästa nod — en lista av { från, etikett } (etiketten hamnar på kanten,
// t.ex. grenvillkoret "ja"/"nej" från en beslutsnod).
function kopplaTillNästa(modell, aktuella, tillId) {
    for (const ände of aktuella) {
        läggTillKant(modell, ände.från, tillId, ände.etikett);
    }
}

function parsaAktivitet(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);

    let aktuella = []; // öppna flödesändar — kopplas till nästa nod som skapas
    let aktivGren = null; // "vänster" | "höger" | null — för layoutens spaltplacering
    const grenStack = []; // nästlade if/else-kontexter

    for (let råRad of rader) {
        const rad = råRad.trim();
        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^skinparam\b/i.test(rad)) continue;
        if (/^(title|footer|header|legend|note)\b/i.test(rad)) continue;

        // start
        if (/^start$/i.test(rad)) {
            const id = läggTillNod(modell, TYP.START, "", aktivGren);
            kopplaTillNästa(modell, aktuella, id);
            aktuella = [{ från: id, etikett: null }];
            continue;
        }

        // stop / end
        if (/^(stop|end)$/i.test(rad)) {
            const id = läggTillNod(modell, TYP.SLUT, "", aktivGren);
            kopplaTillNästa(modell, aktuella, id);
            aktuella = []; // flödet är avslutat på den här grenen
            continue;
        }

        // :Aktivitetstext;  (PlantUML tillåter radbrytning före ";", men vi
        // håller oss till den vanligaste formen — en rad per aktivitet)
        let m = rad.match(/^:(.+?);\s*$/);
        if (m) {
            const id = läggTillNod(modell, TYP.AKTIVITET, rensaCitat(m[1]), aktivGren);
            kopplaTillNästa(modell, aktuella, id);
            aktuella = [{ från: id, etikett: null }];
            continue;
        }

        // if (villkor) then (etikett)
        m = rad.match(/^if\s*\(([^)]*)\)\s*then\s*(?:\(([^)]*)\))?/i);
        if (m) {
            const id = läggTillNod(modell, TYP.BESLUT, rensaCitat(m[1]), aktivGren);
            kopplaTillNästa(modell, aktuella, id);

            grenStack.push({ beslutId: id, ärenden: [], föräldraGren: aktivGren });
            const thenEtikett = m[2] ? rensaCitat(m[2]) : "ja";
            aktivGren = "vänster";
            aktuella = [{ från: id, etikett: thenEtikett }];
            continue;
        }

        // else (etikett)
        m = rad.match(/^else\s*(?:\(([^)]*)\))?/i);
        if (m && grenStack.length) {
            const kontext = grenStack[grenStack.length - 1];
            kontext.ärenden.push(aktuella); // spara "then"-grenens öppna ändar
            const elseEtikett = m[1] ? rensaCitat(m[1]) : "nej";
            aktivGren = "höger";
            aktuella = [{ från: kontext.beslutId, etikett: elseEtikett }];
            continue;
        }

        // endif
        if (/^endif$/i.test(rad) && grenStack.length) {
            const kontext = grenStack.pop();
            kontext.ärenden.push(aktuella); // spara sista grenens öppna ändar

            // Slå ihop alla grenars öppna ändar — flödet återförenas här.
            // (Ingen explicit sammanfogningsnod: nästa skapade nod kopplas
            // direkt från samtliga grenändar, vilket räcker för "bra nog".)
            aktuella = [];
            for (const ändar of kontext.ärenden) {
                for (const ände of ändar) {
                    aktuella.push({ från: ände.från, etikett: null });
                }
            }
            aktivGren = kontext.föräldraGren;
            continue;
        }

        // Okänd/ostödd rad — ignoreras tyst ("bra nog", inte komplett grammatik)
    }

    return modell;
}

module.exports = { parsaAktivitet, TYP };
