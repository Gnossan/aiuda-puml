// Genererar mxGraph/drawio-XML från (modell + layout).
// Använder drawios INBYGGDA standardformer (actor, ellipse, rectangle som
// container) — inget eget "PlantUML-look"-bibliotek i det här steget.
// Resultatet är native, flyttbara, sammankopplade drawio-element.

"use strict";

const { TYP } = require("./parser");
const { slåUppKatalogpost } = require("./shape_katalog");
const { xmlEscape } = require("./xml_escape");

// Reservfärger när varken katalogen eller skinparam ger besked —
// håller diagrammet läsbart även för typer vi inte känner igen.
const RESERVFÄRGER_PER_TYP = {
    [TYP.AKTÖR]: { fillColor: "#dae8fc", strokeColor: "#6c8ebf" },
    [TYP.USECASE]: { fillColor: "#d5e8d4", strokeColor: "#82b366" },
    [TYP.GRÄNS]: { fillColor: "none", strokeColor: "#666666", dashed: "1", spacingLeft: "8", spacingTop: "4" },
};

// --- Hjälpfunktioner för att tolka/slå ihop/serialisera drawio-stilsträngar ---
// (format: "nyckel1=värde1;nyckel2=värde2;enbartFlagga;...")

function tolkaStilSträng(sträng) {
    const par = {};
    for (const del of String(sträng || "").split(";")) {
        const trimmad = del.trim();
        if (!trimmad) continue;
        const eq = trimmad.indexOf("=");
        if (eq === -1) {
            par[trimmad] = ""; // ren flagga utan värde, t.ex. "ellipse"
        } else {
            par[trimmad.slice(0, eq)] = trimmad.slice(eq + 1);
        }
    }
    return par;
}

function serialiseraStil(par) {
    const delar = [];
    for (const [nyckel, värde] of Object.entries(par)) {
        delar.push(värde === "" ? nyckel : `${nyckel}=${värde}`);
    }
    return delar.join(";") + (delar.length ? ";" : "");
}

// Bygger den slutgiltiga stilsträngen för en given nodtyp:
// katalogens bas-stil  →  reservfärger (om attributet saknas)  →  skinparam-överskrivningar
function byggNodStil(typNyckel, skinparamStilar) {
    const katalogpost = slåUppKatalogpost(typNyckel);
    const basSträng = (katalogpost && katalogpost.stil) || "rounded=0;whiteSpace=wrap;html=1;";

    const par = tolkaStilSträng(basSträng);

    const reserv = RESERVFÄRGER_PER_TYP[typNyckel];
    if (reserv) {
        for (const [nyckel, värde] of Object.entries(reserv)) {
            if (!(nyckel in par)) par[nyckel] = värde;
        }
    }

    const överskrivning = skinparamStilar && skinparamStilar[typNyckel];
    if (överskrivning) {
        Object.assign(par, överskrivning);
    }

    return serialiseraStil(par);
}

// Mappar PlantUML-pilformer till drawio-kantstilar. `kantÖverskrivning`
// kommer från skinparam (t.ex. ArrowColor → strokeColor) och läggs på sist.
function kantStil(plantUmlPil, kantÖverskrivning) {
    const bas = "html=1;fontSize=11;";
    let stil;
    switch (plantUmlPil) {
        case "--|>":
            stil = bas + "endArrow=block;endFill=0;startArrow=none;"; break; // generalisering (ärver)
        case "..|>":
            stil = bas + "endArrow=block;endFill=0;dashed=1;"; break; // realisering
        case "..>":
        case "..":
        case "<..":
            stil = bas + "endArrow=open;endFill=0;dashed=1;"; break; // beroende (<<include>>/<<extend>>)
        case "--":
            stil = bas + "endArrow=none;"; break; // oriktad association
        case "<-->":
            stil = bas + "startArrow=open;startFill=0;endArrow=open;endFill=0;"; break;
        case "<-":
            stil = bas + "startArrow=open;startFill=0;endArrow=none;"; break;
        case "-->":
        case "->":
        default:
            stil = bas + "endArrow=open;endFill=0;"; // vanlig association/riktat flöde
    }

    if (kantÖverskrivning && Object.keys(kantÖverskrivning).length) {
        const par = tolkaStilSträng(stil);
        Object.assign(par, kantÖverskrivning);
        return serialiseraStil(par);
    }
    return stil;
}

function genereraDrawioXml(modell, positioner, alternativ) {
    const opts = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId = opts.diagramId || `diagram_${Date.now()}`;
    // Skinparam-tolkat resultat (från skinparam.js) — { stilar, kantStil, strukturella }
    const skinparam = opts.skinparam || { stilar: {}, kantStil: {}, strukturella: {} };

    const rader = [];
    // mxfile/diagram-omslaget krävs för att drawio ska känna igen filen
    // som ett komplett dokument (annars måste användaren klistra in
    // XML:en manuellt via "Extras > Edit Diagram").
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push('    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">');
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // --- Noder ---
    // Viktigt: gränser (containers) måste skrivas FÖRE sina barn i XML:en
    // så att parent-referensen pekar på en redan deklarerad cell.
    const gränser = modell.noder.filter((n) => n.typ === TYP.GRÄNS);
    const ickeGränser = modell.noder.filter((n) => n.typ !== TYP.GRÄNS);

    function skrivNod(nod) {
        const pos = positioner.get(nod.id);
        if (!pos) return; // borttappad nod (bör inte hända, men var defensiv)

        const förälderId = nod.förälder && positioner.get(nod.förälder) ? nod.förälder : "1";
        const stil = byggNodStil(nod.typ, skinparam.stilar);

        rader.push(
            `    <mxCell id="${xmlEscape(nod.id)}" value="${xmlEscape(nod.etikett)}" ` +
            `style="${stil}" vertex="1" parent="${xmlEscape(förälderId)}">`
        );
        rader.push(
            `      <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("    </mxCell>");
    }

    for (const gräns of gränser) skrivNod(gräns);
    for (const nod of ickeGränser) skrivNod(nod);

    // --- Kanter ---
    let kantRäknare = 0;
    for (const kant of modell.kanter) {
        kantRäknare += 1;
        const id = `kant_${kantRäknare}`;
        const etikettAttr = kant.etikett ? ` value="${xmlEscape(kant.etikett)}"` : "";

        rader.push(
            `    <mxCell id="${id}"${etikettAttr} style="${kantStil(kant.stil, skinparam.kantStil)}" edge="1" parent="1" ` +
            `source="${xmlEscape(kant.från)}" target="${xmlEscape(kant.till)}">`
        );
        rader.push('      <mxGeometry relative="1" as="geometry" />');
        rader.push("    </mxCell>");
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraDrawioXml };
