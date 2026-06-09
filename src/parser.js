// Enkel textbaserad parser för PlantUML use-case-diagram.
// Mål: bygga en LOGISK modell (noder + kanter + typer + etiketter) —
// ingen grafik, ingen geometri. Layouten sköts av ett separat steg.
//
// Stödd (delmängd av) syntax:
//   actor "Etikett" as alias
//   actor alias
//   usecase "Etikett" as alias
//   usecase alias
//   (Etikett) as alias            <- parentes-formen
//   rectangle "Etikett" { ... }   <- systemgräns, kan innehålla usecases
//   A --> B / A -> B / A ..> B / A --|> B / A -- B   (med valfri ": etikett")
//   skinparam / left to right direction / kommentarer (') ignoreras

"use strict";

const TYP = {
    AKTÖR: "aktör",
    USECASE: "usecase",
    GRÄNS: "gräns",
};

function nyTomModell() {
    return {
        noder: [],   // { id, typ, etikett, förälder }
        kanter: [],  // { från, till, etikett, stil }
    };
}

// Tar bort citattecken och trimmar
function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

// Hittar (eller skapar) en nod med ett visst alias. Om noden redan
// finns men saknar etikett/typ fylls den i — annars uppdateras inget
// (källan kan referera till en nod innan den formellt deklareras).
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

// Genererar ett stabilt internt alias när källan inte anger något
// (t.ex. "(Boka resa)" utan "as ...")
let autoRäknare = 0;
function autoAlias(prefix) {
    autoRäknare += 1;
    return `${prefix}_${autoRäknare}`;
}

const RELATIONS_REGEX = /^(.+?)\s*(<?--?\.?\.?\|?>?-?-?>?|--\|>|\.\.\|>|--|\.\.)\s*(.+)$/;
// ^ avsiktligt bred — vi smalnar av nedan med en explicit lista över pilformer
const PIL_FORMER = [
    "<-->", "-->", "->",
    "<..>", "..>", "..",
    "--|>", "..|>",
    "--", "<-", "<..",
];

function hittaPil(rad) {
    // Leta upp den första förekomsten av någon känd pilform, och
    // dela raden i (vänster, pil, höger)
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

function tolkaRelationsSida(text) {
    // Sidan kan vara "alias" eller "alias : etikett" hanteras separat.
    return rensaCitat(text);
}

function parsa(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);

    // Stack för aktiva systemgränser (rectangle { ... })
    const gränsStack = [];

    for (let råRad of rader) {
        let rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue; // kommentar / @start.. @end..
        if (/^skinparam\b/i.test(rad)) continue;
        if (/^(left to right direction|top to bottom direction|title\b|hide\b)/i.test(rad)) continue;

        // Stäng en systemgräns
        if (rad === "}") {
            gränsStack.pop();
            continue;
        }

        const aktivFörälder = gränsStack.length ? gränsStack[gränsStack.length - 1] : null;

        // rectangle "Namn" { ... }   (systemgräns)
        let m = rad.match(/^rectangle\s+"([^"]+)"\s*(?:as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+))?\s*\{?\s*$/i)
             || rad.match(/^rectangle\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)\s*(?:as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+))?\s*\{?\s*$/i);
        if (m && rad.includes("{")) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2] || autoAlias("gräns");
            const nod = säkerställNod(modell, alias, TYP.GRÄNS, etikett, aktivFörälder);
            gränsStack.push(nod.id);
            continue;
        }

        // actor "Namn" as alias   |   actor alias
        m = rad.match(/^actor\s+"([^"]+)"\s+as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^actor\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)\s+as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^actor\s+"([^"]+)"/i)
         || rad.match(/^actor\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i);
        if (m) {
            const harAlias = !!m[2];
            const etikett = rensaCitat(m[1]);
            const alias = harAlias ? m[2] : etikett;
            säkerställNod(modell, alias, TYP.AKTÖR, etikett, aktivFörälder);
            continue;
        }

        // usecase "Namn" as alias  |  usecase alias  |  (Namn) as alias
        m = rad.match(/^usecase\s+"([^"]+)"\s+as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^usecase\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)\s+as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^usecase\s+"([^"]+)"/i)
         || rad.match(/^usecase\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^\(([^)]+)\)\s+as\s+([A-Za-zÀ-ÖØ-öø-ÿ0-9_]+)/i)
         || rad.match(/^\(([^)]+)\)/i);
        if (m) {
            const harAlias = !!m[2];
            const etikett = rensaCitat(m[1]);
            const alias = harAlias ? m[2] : autoAlias("uc");
            säkerställNod(modell, alias, TYP.USECASE, etikett, aktivFörälder);
            continue;
        }

        // Relationer: vänster <pil> höger [: etikett]
        let kantEtikett = null;
        let relRad = rad;
        const delningPos = rad.indexOf(":");
        // Endast dela på ":" om det INTE sitter inuti citattecken — i
        // use-case-syntax är detta ovanligt nog att en enkel split räcker
        if (delningPos !== -1) {
            relRad = rad.slice(0, delningPos).trim();
            kantEtikett = rad.slice(delningPos + 1).trim();
        }

        const pilInfo = hittaPil(relRad);
        if (pilInfo) {
            const vänsterAlias = tolkaRelationsSida(pilInfo.vänster);
            const högerAlias = tolkaRelationsSida(pilInfo.höger);

            // Säkerställ att noderna finns (även om de dyker upp först här)
            säkerställNod(modell, vänsterAlias, null, vänsterAlias, aktivFörälder);
            säkerställNod(modell, högerAlias, null, högerAlias, aktivFörälder);

            modell.kanter.push({
                från: vänsterAlias,
                till: högerAlias,
                etikett: kantEtikett,
                stil: pilInfo.pil,
            });
            continue;
        }

        // Okänd rad — ignoreras tyst (vi siktar på "bra nog", inte komplett grammatik)
    }

    // Efterhandskorrigering: noder utan typ men som förekommer i en
    // relation och har versal etikett gissar vi är aktörer om etiketten
    // är ett enda ord, annars usecase. (Heuristik — kan justeras.)
    for (const nod of modell.noder) {
        if (!nod.typ) {
            nod.typ = /^[A-ZÅÄÖ]\w*$/.test(nod.etikett) ? TYP.AKTÖR : TYP.USECASE;
        }
    }

    return modell;
}

module.exports = { parsa, TYP };
