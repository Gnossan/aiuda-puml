// Textbaserad parser för PlantUML-KOMPONENTDIAGRAM.
// Bygger samma slags logiska modell som use-case-parsern
// ({ noder: [{id, typ, etikett, förälder}], kanter: [{från, till, etikett, stil}] })
// — vilket gör att den befintliga, generiska XML-generatorn (xml.js) och
// layouten kan återanvändas rakt av. Inget nytt XML-/stil-spår behövs.
//
// Stödd (delmängd av) syntax:
//   [Komponentnamn]                       <- klammerform, vanligast i exempel
//   component "Etikett" as alias / component alias
//   interface "Etikett" as alias / () "Etikett" as alias / () alias
//   package/node/folder/cloud/database/frame "Namn" { ... }   <- behållare
//   A --> B / A --( B / [A] --> [B] / A -- B   (med valfri ": etikett")

"use strict";

const TYP = {
    KOMPONENT: "komponent",
    GRÄNSSNITT: "gränssnitt",
    GRÄNS: "gräns",     // generisk behållare — samma katalogpost som use-case-systemgränser
};

// Alla behållarformer (package/node/folder/cloud/database/frame/rectangle)
// renderas som GENERISKA rektangel-behållare (samma katalogpost/stil som
// use-case-systemgränser) — INTE som "nod" (kub) eller "databas" (cylinder),
// eftersom de styckena är solida ikonformer utan container-stöd och skulle
// se fel ut med barn ovanpå sig. "Bra nog är bra nog": en streckad rektangel
// med rubrik kommunicerar "behållare" tydligt nog, oavsett PlantUML-nyckelord.
const CONTAINER_NYCKELORD = "package|node|folder|cloud|database|frame|rectangle";

const ALIAS_TECKEN = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

function nyTomModell() {
    return { noder: [], kanter: [] };
}

function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

let autoRäknare = 0;
function autoAlias(prefix) {
    autoRäknare += 1;
    return `${prefix}_${autoRäknare}`;
}

function säkerställNod(modell, alias, typ, etikett, förälder) {
    let nod = modell.noder.find((n) => n.id === alias);
    if (!nod) {
        nod = { id: alias, typ: typ || null, etikett: etikett || alias, förälder: förälder || null };
        modell.noder.push(nod);
    } else {
        if (typ && !nod.typ) nod.typ = typ;
        if (etikett && nod.etikett === nod.id) nod.etikett = etikett;
        if (förälder && !nod.förälder) nod.förälder = förälder;
    }
    return nod;
}

// Letar upp (eller skapar) en komponentnod utifrån en klammerreferens
// "[Namn]" — i PlantUML är klammeretiketten själva identiteten, så vi
// matchar i första hand på etikett, annars skapar vi en ny komponent.
function säkerställKomponentFrånKlammer(modell, etikett, förälder) {
    let nod = modell.noder.find((n) => n.etikett === etikett && n.typ === TYP.KOMPONENT);
    if (!nod) {
        nod = modell.noder.find((n) => n.id === etikett);
    }
    if (!nod) {
        nod = säkerställNod(modell, etikett, TYP.KOMPONENT, etikett, förälder);
    } else if (!nod.typ) {
        nod.typ = TYP.KOMPONENT;
    }
    return nod;
}

const PIL_FORMER = [
    "<-->", "-->", "->",
    "..>", "..", "<..",
    "--", "<-",
    "-",   // bar association utan pilspets, t.ex. "api - tjänst"
           // — sist i listan så att de längre formerna ("--", "->" m.fl.)
           // alltid vinner vid samma position (se hittaPil: första träff på
           // lägst position i rad-ordning behåller företräde).
];

function hittaPil(rad) {
    let bästPos = -1;
    let bästForm = null;
    for (const form of PIL_FORMER) {
        const pos = rad.indexOf(form);
        if (pos !== -1 && (bästPos === -1 || pos < bästPos)) {
            bästPos = pos;
            bästForm = form;
        }
    }
    if (bästPos === -1) return null;
    return {
        vänster: rad.slice(0, bästPos).trim(),
        pil: bästForm,
        höger: rad.slice(bästPos + bästForm.length).trim(),
    };
}

// Tolkar en relationssida: kan vara "[Komponentnamn]", "alias", eller en
// citerad etikett. Returnerar { typ: "klammer"|"alias", värde }.
function tolkaRelationsSida(text) {
    const t = text.trim();
    const klammerMatch = t.match(/^\[(.+)\]$/);
    if (klammerMatch) return { typ: "klammer", värde: klammerMatch[1].trim() };
    return { typ: "alias", värde: rensaCitat(t) };
}

function löstUppSida(modell, sida, aktivFörälder) {
    if (sida.typ === "klammer") {
        return säkerställKomponentFrånKlammer(modell, sida.värde, aktivFörälder).id;
    }
    säkerställNod(modell, sida.värde, null, sida.värde, aktivFörälder);
    return sida.värde;
}

function parsaKomponent(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);
    const gränsStack = [];

    for (let råRad of rader) {
        let rad = råRad.trim();
        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^skinparam\b/i.test(rad)) continue;
        if (/^(left to right direction|top to bottom direction|title\b|hide\b)/i.test(rad)) continue;

        if (rad === "}") {
            gränsStack.pop();
            continue;
        }

        const aktivFörälder = gränsStack.length ? gränsStack[gränsStack.length - 1] : null;

        // Behållare: package/node/folder/cloud/database/frame "Namn" [as alias] {
        let m = rad.match(new RegExp(`^(${CONTAINER_NYCKELORD})\\s+"([^"]+)"\\s*(?:as\\s+(${ALIAS_TECKEN}))?\\s*\\{?\\s*$`, "i"))
             || rad.match(new RegExp(`^(${CONTAINER_NYCKELORD})\\s+(${ALIAS_TECKEN})\\s*(?:as\\s+(${ALIAS_TECKEN}))?\\s*\\{?\\s*$`, "i"));
        if (m) {
            const etikett = rensaCitat(m[2]);
            const alias = m[3] || autoAlias("behållare");
            if (rad.includes("{")) {
                const nod = säkerställNod(modell, alias, TYP.GRÄNS, etikett, aktivFörälder);
                gränsStack.push(nod.id);
            } else {
                // Samma nyckelord men utan klammer, t.ex. database "Namn" as alias
                // — inte en behållare utan ett enskilt typat element. "Bra nog":
                // behandlas som en generisk komponent (se motivering ovan om
                // varför vi inte mappar till "nod"/"databas"-katalogposterna).
                säkerställNod(modell, alias, TYP.KOMPONENT, etikett, aktivFörälder);
            }
            continue;
        }

        // component "Etikett" as alias | component alias
        m = rad.match(new RegExp(`^component\\s+"([^"]+)"\\s+as\\s+(${ALIAS_TECKEN})`, "i"))
         || rad.match(new RegExp(`^component\\s+(${ALIAS_TECKEN})\\s+as\\s+(${ALIAS_TECKEN})`, "i"))
         || rad.match(new RegExp(`^component\\s+"([^"]+)"`, "i"))
         || rad.match(new RegExp(`^component\\s+(${ALIAS_TECKEN})`, "i"));
        if (m) {
            const harAlias = !!m[2];
            const etikett = rensaCitat(m[1]);
            const alias = harAlias ? m[2] : autoAlias("komp");
            säkerställNod(modell, alias, TYP.KOMPONENT, etikett, aktivFörälder);
            continue;
        }

        // interface "Etikett" as alias | () "Etikett" as alias | () alias | interface alias
        m = rad.match(new RegExp(`^(?:interface|\\(\\))\\s+"([^"]+)"\\s+as\\s+(${ALIAS_TECKEN})`, "i"))
         || rad.match(new RegExp(`^(?:interface|\\(\\))\\s+(${ALIAS_TECKEN})\\s+as\\s+(${ALIAS_TECKEN})`, "i"))
         || rad.match(new RegExp(`^(?:interface|\\(\\))\\s+"([^"]+)"`, "i"))
         || rad.match(new RegExp(`^(?:interface|\\(\\))\\s+(${ALIAS_TECKEN})`, "i"));
        if (m) {
            const harAlias = !!m[2];
            const etikett = rensaCitat(m[1]);
            const alias = harAlias ? m[2] : autoAlias("gränssnitt");
            säkerställNod(modell, alias, TYP.GRÄNSSNITT, etikett, aktivFörälder);
            continue;
        }

        // Klammerdeklaration med explicit alias: [Etikett] as alias
        // — skiljer sig från den fristående formen genom att ge noden ett eget,
        // stabilt id (annars skulle id:t bli själva etiketten, vilket krånglar
        // till matchningen mot relationer som refererar till aliaset direkt).
        m = rad.match(new RegExp(`^\\[([^\\]]+)\\]\\s+as\\s+(${ALIAS_TECKEN})\\s*$`, "i"));
        if (m) {
            const etikett = m[1].trim();
            const alias = m[2];
            säkerställNod(modell, alias, TYP.KOMPONENT, etikett, aktivFörälder);
            continue;
        }

        // Fristående komponentdeklaration i klammerform: [Namn]
        m = rad.match(/^\[([^\]]+)\]\s*$/);
        if (m) {
            säkerställKomponentFrånKlammer(modell, m[1].trim(), aktivFörälder);
            continue;
        }

        // Relationer: vänster <pil> höger [: etikett]
        let kantEtikett = null;
        let relRad = rad;
        const delningPos = rad.indexOf(":");
        if (delningPos !== -1) {
            relRad = rad.slice(0, delningPos).trim();
            kantEtikett = rad.slice(delningPos + 1).trim();
        }

        const pilInfo = hittaPil(relRad);
        if (pilInfo) {
            const vänsterSida = tolkaRelationsSida(pilInfo.vänster);
            const högerSida = tolkaRelationsSida(pilInfo.höger);

            const frånId = löstUppSida(modell, vänsterSida, aktivFörälder);
            const tillId = löstUppSida(modell, högerSida, aktivFörälder);

            modell.kanter.push({ från: frånId, till: tillId, etikett: kantEtikett, stil: pilInfo.pil });
            continue;
        }

        // Okänd rad — ignoreras tyst ("bra nog", inte komplett grammatik)
    }

    // Efterhandsgissning: noder utan typ — klammerreferenser har redan typ
    // KOMPONENT, så det som återstår är troligen alias som aldrig formellt
    // deklarerats. Gissa komponent (vanligast i komponentdiagram).
    for (const nod of modell.noder) {
        if (!nod.typ) nod.typ = TYP.KOMPONENT;
    }

    return modell;
}

module.exports = { parsaKomponent, TYP };
