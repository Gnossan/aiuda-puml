// Textbaserad parser för PlantUML-TILLSTÅNDSDIAGRAM.
// Bygger en modell på formen { noder, kanter } — kompatibel med den
// generiska xml.js-generatorn (precis som use-case/komponent/aktivitet).
//
// Typvärden för noder:
//   "start"    — fylld cirkel (initial pseudotillstånd [*] som källa)
//   "slut"     — dubbel cirkel (final pseudotillstånd [*] som mål)
//   "tillstånd" — normalt tillstånd (rundad rektangel)
//   "gräns"    — sammansatt tillstånd / composite state (container i drawio)
//               samma typnyckel som use-casens systemgräns → xml.js renderar
//               det automatiskt som en container-cell
//
// Stödd syntax (delmängd):
//   [*] --> Tillstånd / Tillstånd --> [*]   (pseudo-tillståndsövergångar)
//   StateA --> StateB : etikett             (övergång med valfri etikett)
//   state "Lång etikett" as alias           (tillstånd med alias)
//   state Alias                             (enkel deklaration)
//   state Alias : beskrivning              (inline-beskrivning)
//   state Alias {                           (sammansatt tillstånd)
//     [*] --> SubA
//     ...
//   }
//   state Alias <<stereotype>>             (ignoreras — vi bryr oss inte om stereotypen)
// Ignoreras: note, hide, scale, skinparam, concurrency-separatorn (--)

"use strict";

const TYP = {
    TILLSTÅND: "tillstånd",
    START:     "start",
    SLUT:      "slut",
    KOMPOSIT:  "gräns",   // "gräns" matchar xml.js:s container-logik
};

function nyTomModell() {
    return { noder: [], kanter: [] };
}

function rensaCitat(text) {
    return text.trim().replace(/^["']|["']$/g, "").trim();
}

// Hämtar (eller skapar) en nod. Om noden redan finns uppdateras bara
// de fält som saknas — samma mönster som i övriga parsers.
function säkerställNod(modell, id, typ, etikett, förälder) {
    let nod = modell.noder.find((n) => n.id === id);
    if (!nod) {
        nod = {
            id,
            typ: typ || TYP.TILLSTÅND,
            etikett: etikett || id,
            förälder: förälder || null,
        };
        modell.noder.push(nod);
    } else {
        if (typ && nod.typ === TYP.TILLSTÅND) nod.typ = typ;
        if (etikett && nod.etikett === nod.id) nod.etikett = etikett;
        if (förälder && !nod.förälder) nod.förälder = förälder;
    }
    return nod;
}

// Varje scope (global eller ett sammansatt tillstånd) har exakt ett
// initial- och ett final-pseudotillstånd. Vi delar dem om fler övergångar
// pekar mot [*] i samma scope.
function hämtaStartId(modell, förälder) {
    const id = förälder ? `__start_${förälder}` : "__start_global";
    säkerställNod(modell, id, TYP.START, "", förälder);
    return id;
}

function hämtaSlutId(modell, förälder) {
    const id = förälder ? `__slut_${förälder}` : "__slut_global";
    säkerställNod(modell, id, TYP.SLUT, "", förälder);
    return id;
}

function parsaTillstånd(källkod) {
    const modell = nyTomModell();
    const rader = källkod.split(/\r?\n/);

    // Stack för öppna sammansatta tillstånd: [{ id }]
    const stack = [];

    function aktivFörälder() {
        return stack.length ? stack[stack.length - 1].id : null;
    }

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^skinparam\b/i.test(rad)) continue;
        if (/^(title|header|footer|legend|scale|hide|show)\b/i.test(rad)) continue;
        if (/^note\b/i.test(rad) || /^end\s*note$/i.test(rad)) continue;
        // Concurrent-separator inuti sammansatta tillstånd
        if (/^--$/.test(rad)) continue;

        // ---- Stäng ett sammansatt tillstånd ----
        if (rad === "}") {
            stack.pop();
            continue;
        }

        const förälder = aktivFörälder();

        // ---- state-deklarationer ----
        // Vi provar mönstren i fallande specificitet.

        // \w matchar inte svenska tecken — vi använder en bredare klass
        // som täcker alla latinska bokstäver inkl. åäö (samma som övriga parsers).
        const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

        // state "Etikett" as alias { / state "Etikett" as alias : beskr
        let m = rad.match(new RegExp(`^state\\s+"([^"]+)"\\s+as\\s+(${ID})(?:\\s*\\{)?(?:\\s*<<[^>]+>>)?(?:\\s*:\\s*(.+))?$`, "i"));
        if (m) {
            const etikett = rensaCitat(m[1]);
            const alias = m[2];
            const beskr = m[3] ? rensaCitat(m[3]) : null;
            const ärKomposit = rad.includes("{");
            const typ = ärKomposit ? TYP.KOMPOSIT : TYP.TILLSTÅND;
            säkerställNod(modell, alias, typ, beskr ? `${etikett}\n${beskr}` : etikett, förälder);
            if (ärKomposit) stack.push({ id: alias });
            continue;
        }

        // state "Etikett" { / state "Etikett" : beskr
        m = rad.match(/^state\s+"([^"]+)"(?:\s*\{)?(?:\s*<<[^>]+>>)?(?:\s*:\s*(.+))?$/i);
        if (m) {
            const etikett = rensaCitat(m[1]);
            const beskr = m[2] ? rensaCitat(m[2]) : null;
            const ärKomposit = rad.includes("{");
            const typ = ärKomposit ? TYP.KOMPOSIT : TYP.TILLSTÅND;
            // Använd etiketten som id när inget alias ges
            const id = etikett.replace(/\s+/g, "_");
            säkerställNod(modell, id, typ, beskr ? `${etikett}\n${beskr}` : etikett, förälder);
            if (ärKomposit) stack.push({ id });
            continue;
        }

        // state Alias { / state Alias : beskr / state Alias <<stereo>>
        m = rad.match(new RegExp(`^state\\s+(${ID})(?:\\s*\\{)?(?:\\s*<<[^>]+>>)?(?:\\s*:\\s*(.+))?$`, "i"));
        if (m) {
            const alias = m[1];
            const beskr = m[2] ? rensaCitat(m[2]) : null;
            const ärKomposit = rad.includes("{");
            const typ = ärKomposit ? TYP.KOMPOSIT : TYP.TILLSTÅND;
            säkerställNod(modell, alias, typ, beskr ? `${alias}\n${beskr}` : alias, förälder);
            if (ärKomposit) stack.push({ id: alias });
            continue;
        }

        // ---- Övergångar: StateA --> StateB : etikett ----
        // Pilen kan vara --> eller ->; etiketten är valfri.
        // [*] som källa = initial pseudotillstånd; [*] som mål = final pseudotillstånd.
        m = rad.match(/^(.+?)\s*--?>+\s*(.+?)(?:\s*:\s*(.+))?$/);
        if (m) {
            const råFrån = m[1].trim();
            let råTill = m[2].trim();
            const etikett = m[3] ? rensaCitat(m[3]) : null;

            // Pilen kan ha en etikett direkt i högerledet om kolonnet inte
            // separerades; dubbelkolla att vi inte har rest kvar i råTill.
            // (Ovanstående regex delar på den sista ": etikett" — om ingen
            // kolon finns hamnar allt i m[2]. Det är OK: etikett = null.)

            let frånId, tillId;

            if (råFrån === "[*]") {
                frånId = hämtaStartId(modell, förälder);
            } else {
                frånId = råFrån;
                säkerställNod(modell, frånId, TYP.TILLSTÅND, frånId, förälder);
            }

            if (råTill === "[*]") {
                tillId = hämtaSlutId(modell, förälder);
            } else {
                tillId = råTill;
                säkerställNod(modell, tillId, TYP.TILLSTÅND, tillId, förälder);
            }

            modell.kanter.push({ från: frånId, till: tillId, etikett, stil: "-->" });
            continue;
        }

        // Okänd rad — ignoreras tyst
    }

    return modell;
}

module.exports = { parsaTillstånd, TYP };
