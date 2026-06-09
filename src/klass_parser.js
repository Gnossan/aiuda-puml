// Textbaserad parser för PlantUML-KLASSDIAGRAM.
// Bygger en logisk modell: { klasser, kanter, paket }
//
// klasser: [{ id, etikett, stereotyp, attribut, metoder, förälder }]
//   stereotyp: "klass" | "abstrakt" | "gränssnitt" | "enum"
//   attribut/metoder: ["+ namn: Typ", ...] (råtext, visas direkt i drawio)
//
// kanter: [{ från, till, etikett, stil, frånMult, tillMult }]
//   stil: "ärver" | "realiserar" | "komposition" | "aggregation" |
//         "association" | "beroende"
//
// paket: [{ id, etikett, förälder }] — namespace/package-behållare
//
// Stödd syntax (delmängd):
//   class "Etikett" as alias / class Alias { ... }
//   abstract class Name / abstract "Name" as alias
//   interface Name { ... }
//   enum Name { ... }
//   package "Name" { ... } / namespace "Name" { ... }
//   Klassmedlemmar: + fält: Typ  |  + metod(): Typ  |  {static} ...
//   Sektionsavdelare inuti klassen (--) ignoreras
//   Relationer: --|>, <|--, ..|>, *--, --*, o--, --o, -->, <--, --, ..>
//   Multiplicitet: A "1" --> "n" B
//   Kantettiketter: A --> B : text

"use strict";

const STEREOTYP = {
    KLASS:      "klass",
    ABSTRAKT:   "abstrakt",
    GRÄNSSNITT: "gränssnitt",
    ENUM:       "enum",
    PAKET:      "paket",
};

function nyTomModell() {
    return { klasser: [], kanter: [], paket: [] };
}

function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

// Identifierare: bokstäver, siffror, understreck, punkt (inget citat)
const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_.]+";

let autoRäknare = 0;
function autoAlias(prefix) {
    autoRäknare += 1;
    return `${prefix}_${autoRäknare}`;
}

// Hittar (eller skapar) en klassnod med ett visst alias.
// Om noden redan finns men saknar stereotyp/etikett/förälder fylls den i.
function säkerställKlass(modell, id, stereotyp, etikett, förälder) {
    // Rensa bort ett eventuellt kvarliggande "{" i slutet av aliasnamnet
    const renId = id.replace(/\{.*$/, "").trim();
    let klass = modell.klasser.find((k) => k.id === renId);
    if (!klass) {
        klass = {
            id: renId,
            etikett: etikett || renId,
            stereotyp: stereotyp || STEREOTYP.KLASS,
            attribut: [],
            metoder: [],
            förälder: förälder || null,
        };
        modell.klasser.push(klass);
    } else {
        if (stereotyp && klass.stereotyp === STEREOTYP.KLASS) klass.stereotyp = stereotyp;
        if (etikett && klass.etikett === klass.id) klass.etikett = etikett;
        if (förälder && !klass.förälder) klass.förälder = förälder;
    }
    return klass;
}

// --- Pilformer: längst/mest-specifika FÖRST så att indexOf aldrig matchar
// en kortare delsträng innan vi ens testat den långa formen. ---
const PIL_FORMER = [
    // Arv (generalisering) — ihålig triangel
    { form: "<|--",  stil: "ärver",       vänd: true  },
    { form: "--|>",  stil: "ärver",       vänd: false },
    { form: "<|..",  stil: "realiserar",  vänd: true  },
    { form: "..|>",  stil: "realiserar",  vänd: false },
    // Komposition — fylld diamant
    { form: "*-->",  stil: "komposition", vänd: false },
    { form: "-->*",  stil: "komposition", vänd: true  },
    { form: "*--",   stil: "komposition", vänd: false },
    { form: "--*",   stil: "komposition", vänd: true  },
    // Aggregering — öppen diamant
    { form: "o-->",  stil: "aggregation", vänd: false },
    { form: "-->o",  stil: "aggregation", vänd: true  },
    { form: "o--",   stil: "aggregation", vänd: false },
    { form: "--o",   stil: "aggregation", vänd: true  },
    // Riktad/oriktad association
    { form: "<-->",  stil: "association", vänd: false },
    { form: "-->",   stil: "association", vänd: false },
    { form: "<--",   stil: "association", vänd: true  },
    { form: "->",    stil: "association", vänd: false },
    { form: "<-",    stil: "association", vänd: true  },
    // Beroende (streckad)
    { form: "<..>",  stil: "beroende",    vänd: false },
    { form: "..>",   stil: "beroende",    vänd: false },
    { form: "<..",   stil: "beroende",    vänd: true  },
    // Enkla: sist så att de inte "äter upp" längre former
    { form: "--",    stil: "association", vänd: false },
    { form: "..",    stil: "beroende",    vänd: false },
];

function hittaPil(rad) {
    // Ersätt INNEHÅLLET i citattecken med mellanslag så att multiplicitetssyntax
    // som "0..*" inte råkar matcha pilformer (t.ex. ".." eller "-->").
    // Söker i den "säkra" strängen men klipper i den URSPRUNGLIGA så att
    // multipliciteterna bevaras för tolkaRelationsSida.
    const säker = rad.replace(/"[^"]*"/g, (m) => '"' + " ".repeat(m.length - 2) + '"');

    let bästPos = Infinity;
    let bästPil = null;
    for (const pil of PIL_FORMER) {
        const pos = säker.indexOf(pil.form);
        if (pos !== -1 && pos < bästPos) {
            bästPos = pos;
            bästPil = pil;
        }
    }
    if (!bästPil) return null;
    return {
        vänster: rad.slice(0, bästPos).trim(),           // original (med citat)
        höger: rad.slice(bästPos + bästPil.form.length).trim(),
        stil: bästPil.stil,
        vänd: bästPil.vänd,
    };
}

// Tolkar en relationssida som kan ha multiplicitet i citattecken:
//   "1" ClassName  eller  ClassName "n"  eller  bara ClassName
function tolkaRelationsSida(text) {
    const t = text.trim();
    let mult = null;
    let alias = t;

    // Ledande multiplicitet: "1" ClassName
    let m = t.match(/^"([^"]*?)"\s+(.+)$/);
    if (m) { mult = m[1]; alias = m[2].trim(); }
    else {
        // Efterföljande multiplicitet: ClassName "n"
        m = t.match(/^(.+?)\s+"([^"]*?)"$/);
        if (m) { alias = m[1].trim(); mult = m[2]; }
    }

    return { alias: rensaCitat(alias), mult };
}

// Avgör om en klassmedlemsrad är en metod (innehåller parenteser).
function äMetod(rad) {
    return /\(.*?\)/.test(rad);
}

function parsaKlass(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);

    // Stack för öppna block: { typ: "paket"|"klass", id }
    const stack = [];
    // Den klass vars kropp vi för tillfället befinner oss inuti
    let aktivKlass = null;

    // Returnerar id:t på det närmaste omslutande paketet (ej klass)
    function aktivPaketFörälder() {
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].typ === "paket") return stack[i].id;
        }
        return null;
    }

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@") || rad.startsWith("!")) continue;
        if (/^skinparam\b/i.test(rad)) continue;
        if (/^(left to right direction|top to bottom direction|title\b|hide\b|show\b|scale\b|header\b|footer\b)/i.test(rad)) continue;
        // Noteringar är flerrads-block — för enkelhets skull ignorerar vi alla "note"-rader
        if (/^(?:note\b|end\s+note\b)/i.test(rad)) continue;

        // Stäng ett block
        if (rad === "}") {
            if (aktivKlass) {
                aktivKlass = null;
            }
            stack.pop();
            continue;
        }

        // ---- Inuti en klasskropp: tolka som medlem ----
        if (aktivKlass) {
            // Sektionsavdelare som "--" eller "__" ignoreras — vi delar upp
            // attribut/metoder baserat på om raden innehåller parenteser.
            if (/^[-_=]{2,}$/.test(rad)) continue;
            // Stereotypdeklarationer som {field} eller {method} (sektionsrubriker)
            if (/^\{(?:field|method|classifier)\}$/i.test(rad)) continue;

            if (äMetod(rad)) {
                aktivKlass.metoder.push(rad);
            } else {
                aktivKlass.attribut.push(rad);
            }
            continue;
        }

        // ---- Paket / namespace ----
        let m = rad.match(new RegExp(`^(?:package|namespace)\\s+"([^"]+)"\\s*(?:as\\s+(${ID}))?\\s*(?:\\{.*)?$`, "i"))
              || rad.match(new RegExp(`^(?:package|namespace)\\s+(${ID})\\s*(?:as\\s+(${ID}))?\\s*(?:\\{.*)?$`, "i"));
        if (m && rad.includes("{")) {
            const etikett = rensaCitat(m[1]);
            const id = m[2] || autoAlias("paket");
            modell.paket.push({ id, etikett, förälder: aktivPaketFörälder() });
            stack.push({ typ: "paket", id });
            continue;
        }

        // ---- Abstract class ----
        m = rad.match(new RegExp(`^abstract\\s+class\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^abstract\\s+class\\s+"([^"]+)"`, "i"))
          || rad.match(new RegExp(`^abstract\\s+class\\s+(${ID})\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^abstract\\s+class\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^abstract\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^abstract\\s+"([^"]+)"`, "i"))
          || rad.match(new RegExp(`^abstract\\s+(${ID})\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^abstract\\s+(${ID})`, "i"));
        if (m) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2] || etikett;
            const klass = säkerställKlass(modell, alias, STEREOTYP.ABSTRAKT, etikett, aktivPaketFörälder());
            if (rad.includes("{")) {
                aktivKlass = klass;
                stack.push({ typ: "klass", id: klass.id });
            }
            continue;
        }

        // ---- Interface ----
        m = rad.match(new RegExp(`^interface\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^interface\\s+"([^"]+)"`, "i"))
          || rad.match(new RegExp(`^interface\\s+(${ID})\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^interface\\s+(${ID})`, "i"));
        if (m) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2] || etikett;
            const klass = säkerställKlass(modell, alias, STEREOTYP.GRÄNSSNITT, etikett, aktivPaketFörälder());
            if (rad.includes("{")) {
                aktivKlass = klass;
                stack.push({ typ: "klass", id: klass.id });
            }
            continue;
        }

        // ---- Enum ----
        m = rad.match(new RegExp(`^enum\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^enum\\s+"([^"]+)"`, "i"))
          || rad.match(new RegExp(`^enum\\s+(${ID})\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^enum\\s+(${ID})`, "i"));
        if (m) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2] || etikett;
            const klass = säkerställKlass(modell, alias, STEREOTYP.ENUM, etikett, aktivPaketFörälder());
            if (rad.includes("{")) {
                aktivKlass = klass;
                stack.push({ typ: "klass", id: klass.id });
            }
            continue;
        }

        // ---- Class ----
        m = rad.match(new RegExp(`^class\\s+"([^"]+)"\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^class\\s+"([^"]+)"`, "i"))
          || rad.match(new RegExp(`^class\\s+(${ID})\\s+as\\s+(${ID})`, "i"))
          || rad.match(new RegExp(`^class\\s+(${ID})`, "i"));
        if (m) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2] || etikett;
            const klass = säkerställKlass(modell, alias, STEREOTYP.KLASS, etikett, aktivPaketFörälder());
            if (rad.includes("{")) {
                aktivKlass = klass;
                stack.push({ typ: "klass", id: klass.id });
            }
            continue;
        }

        // ---- Relationer ----
        // Skala av en eventuell " : etikett" i slutet (sista förekomsten,
        // utanför citattecken — enkel heuristik: använd lastIndexOf).
        let kantEtikett = null;
        let relRad = rad;
        const kolonPos = rad.lastIndexOf(" : ");
        if (kolonPos !== -1) {
            kantEtikett = rad.slice(kolonPos + 3).trim();
            relRad = rad.slice(0, kolonPos).trim();
        }

        const pilInfo = hittaPil(relRad);
        if (pilInfo) {
            const vänsterSida = tolkaRelationsSida(pilInfo.vänster);
            const högerSida = tolkaRelationsSida(pilInfo.höger);

            // Normalisera riktning: för "vända" pilformer (t.ex. <|--)
            // byter vi från/till så att "från" alltid är källan i den
            // semantiska meningen (t.ex. subklass för arv, helheten för komposition).
            let från, till, frånMult, tillMult;
            if (pilInfo.vänd) {
                från = högerSida.alias;
                till = vänsterSida.alias;
                frånMult = högerSida.mult;
                tillMult = vänsterSida.mult;
            } else {
                från = vänsterSida.alias;
                till = högerSida.alias;
                frånMult = vänsterSida.mult;
                tillMult = högerSida.mult;
            }

            // Säkerställ att noderna finns (de kan dyka upp först i en relation
            // utan att ha deklarerats explicit ovan)
            säkerställKlass(modell, från, null, från, aktivPaketFörälder());
            säkerställKlass(modell, till, null, till, aktivPaketFörälder());

            modell.kanter.push({
                från,
                till,
                etikett: kantEtikett,
                stil: pilInfo.stil,
                frånMult,
                tillMult,
            });
            continue;
        }

        // Okänd rad — ignoreras tyst ("bra nog", inte komplett grammatik)
    }

    return modell;
}

module.exports = { parsaKlass, STEREOTYP };
