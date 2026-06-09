// Textbaserad parser för PlantUML-ER-DIAGRAM (Entity-Relationship).
// Bygger en modell på formen { entiteter, kanter } med kråkfot-kardinalitet.
//
// Stödd syntax:
//   entity Namn { ... }
//   entity "Lång etikett" as Alias { ... }
//   Entitet1 ||--o{ Entitet2 : "etikett"       (kråkfotnotation)
//
// Inuti entitetsblocket:
//   * fält : Typ <<PK>>    ('*' = obligatorisk/not-null, bevaras som text)
//   fält : Typ              (valfritt fält)
//   --                      (avdelare, t.ex. primärnyckel-sektion / övrigt)
//
// Modellstruktur:
//   entiteter: [{ id, etikett, attribut: [{ text, separator }] }]
//   kanter:    [{ från, till, etikett, vänsterCard, högerCard, linje }]
//
// Kråkfot-kardinalitetssymboler (vänsterCard/högerCard):
//   "||"  exakt en (ERmandOne)
//   "|o"  noll eller en (ERzeroToOne)
//   "o|"  noll eller en (ERzeroToOne)
//   "|{"  en eller många (ERoneToMany)
//   "}|"  en eller många (ERoneToMany)
//   "o{"  noll eller många (ERzeroToMany)
//   "}o"  noll eller många (ERzeroToMany)
//   "|"   exakt en (ERone)
//   "{"   många (ERmany)
//   "}"   många (ERmany)

"use strict";

// Breddare ID-klass: matchar svenska tecken åäö (som \w missar).
const ID = "[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+";

// Kråkfot-relationsmönster: LeftCard(--+|\.\.+)RightCard
// Exempel: "||--o{", "|o..|{", "}--||"
const REL_REGEX = /([\|o\{\}]{1,2})(-{2,}|\.{2,})([\|o\{\}]{1,2})/;

function nyTomModell() {
    return { entiteter: [], kanter: [] };
}

function säkerställEntitet(modell, id, etikett) {
    let e = modell.entiteter.find((x) => x.id === id);
    if (!e) {
        e = { id, etikett: etikett || id, attribut: [] };
        modell.entiteter.push(e);
    }
    return e;
}

// Försöker tolka en rad som en kråkfot-relation.
// Returnerar { från, till, etikett, vänsterCard, högerCard, linje } eller null.
function parsaRelationRad(rad) {
    const m = rad.match(REL_REGEX);
    if (!m) return null;

    const pilStr  = m[0];
    const pilPos  = rad.indexOf(pilStr);
    const vänster = rad.slice(0, pilPos).trim();
    const resten  = rad.slice(pilPos + pilStr.length).trim();

    if (!vänster) return null;

    // Resten kan ha valfri ": etikett" i slutet
    let höger, etikett;
    const kolonPos = resten.indexOf(":");
    if (kolonPos !== -1) {
        höger   = resten.slice(0, kolonPos).trim();
        etikett = resten.slice(kolonPos + 1).trim().replace(/^["']|["']$/g, "").trim();
    } else {
        höger   = resten.trim();
        etikett = null;
    }

    if (!höger) return null;

    return {
        från:        vänster,
        till:        höger,
        etikett:     etikett || null,
        vänsterCard: m[1],
        högerCard:   m[3],
        linje:       m[2],
    };
}

function parsaER(källkod) {
    const modell = nyTomModell();
    const rader  = källkod.split(/\r?\n/);

    let aktuellEntitet = null; // { id, etikett, attribut } — icke-null när vi är inuti ett {}-block

    for (const råRad of rader) {
        const rad = råRad.trim();

        if (!rad) continue;
        if (rad.startsWith("'") || rad.startsWith("@")) continue;
        if (/^(title|header|footer|legend|scale|hide|show|skinparam)\b/i.test(rad)) continue;
        if (/^note\b/i.test(rad) || /^end\s*note$/i.test(rad)) continue;

        // ---- Inuti ett entitetsblock ----
        if (aktuellEntitet) {
            if (rad === "}") {
                aktuellEntitet = null;
                continue;
            }
            if (rad === "--") {
                // Avdelare (t.ex. PK-sektion / övriga fält)
                aktuellEntitet.attribut.push({ text: "--", separator: true });
                continue;
            }
            // Attributrad — bevara texten som den är (inkl. '*', '<<PK>>' m.m.)
            aktuellEntitet.attribut.push({ text: rad, separator: false });
            continue;
        }

        // ---- Entitetsdeklaration: entity "Lång etikett" as Alias { ----
        let m = rad.match(new RegExp(
            `^(?:entity|table)\\s+"([^"]+)"\\s+as\\s+(${ID})(?:\\s*\\{)?`,
            "i"
        ));
        if (m) {
            const id      = m[2];
            const etikett = m[1];
            const ent     = säkerställEntitet(modell, id, etikett);
            if (rad.includes("{")) aktuellEntitet = ent;
            continue;
        }

        // ---- Entitetsdeklaration: entity "Lång etikett" { ----
        m = rad.match(/^(?:entity|table)\s+"([^"]+)"(?:\s*\{)?/i);
        if (m) {
            const etikett = m[1];
            const id      = etikett.replace(/\s+/g, "_");
            const ent     = säkerställEntitet(modell, id, etikett);
            if (rad.includes("{")) aktuellEntitet = ent;
            continue;
        }

        // ---- Entitetsdeklaration: entity Namn { ----
        m = rad.match(new RegExp(`^(?:entity|table)\\s+(${ID})(?:\\s*\\{)?`, "i"));
        if (m) {
            const id  = m[1];
            const ent = säkerställEntitet(modell, id, id);
            if (rad.includes("{")) aktuellEntitet = ent;
            continue;
        }

        // ---- Kråkfot-relation ----
        const rel = parsaRelationRad(rad);
        if (rel) {
            // Lägg till entiteter som inte deklarerats explicit
            säkerställEntitet(modell, rel.från);
            säkerställEntitet(modell, rel.till);
            modell.kanter.push(rel);
            continue;
        }

        // Okänd rad — ignoreras tyst
    }

    return modell;
}

module.exports = { parsaER };
