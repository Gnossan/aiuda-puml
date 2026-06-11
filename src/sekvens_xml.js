// Genererar mxGraph/drawio-XML för SEKVENSDIAGRAM.
//
// Skiljer sig från xml.js (use case) på en viktig punkt: meddelanden
// kan INTE uttryckas som vanliga source/target-kanter mellan
// livslinje-cellerna — det skulle få drawio att fritt routa om linjerna
// och förstöra den meningsbärande tidsordningen (lodrät position = när i
// tiden meddelandet skickas). Istället genereras meddelanden som "flytande"
// kanter med EXPLICITA absoluta ändpunkter (mxPoint), beräknade av
// sekvens_layout.js — fortfarande riktiga, redigerbara mxGraph-kanter,
// bara inte logiskt "fastnaglade" vid cellerna.

"use strict";

const { slåUppKatalogpost } = require("./shape_katalog");
const { HEADER_HÖJD } = require("./sekvens_layout");
const { xmlEscape } = require("./xml_escape");

function tolkaStilSträng(sträng) {
    const par = {};
    for (const del of String(sträng || "").split(";")) {
        const trimmad = del.trim();
        if (!trimmad) continue;
        const eq = trimmad.indexOf("=");
        if (eq === -1) par[trimmad] = "";
        else par[trimmad.slice(0, eq)] = trimmad.slice(eq + 1);
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

// Bygger stilsträngen för en livslinje: katalogens bas (inbyggd umlLifeline
// med rätt "participant"-headerform) + beräknad header-storlek + ev.
// skinparam-överskrivning. "Bra nog är bra nog" — vi pausar det egna
// ikon-/stencil-spåret och kör vidare på native-shapes för att komma
// vidare med fler diagramtyper.
function byggLivslinjeStil(stereotyp, skinparamStilar) {
    const katalogpost = slåUppKatalogpost(stereotyp);
    const basSträng = (katalogpost && katalogpost.stil)
        || "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;";

    const par = tolkaStilSträng(basSträng);
    par.size = String(HEADER_HÖJD);
    if (!("container" in par)) par.container = "0";
    if (!("collapsible" in par)) par.collapsible = "0";
    if (!("recursiveResize" in par)) par.recursiveResize = "0";
    if (!("outlineConnect" in par)) par.outlineConnect = "0";

    const överskrivning = skinparamStilar && skinparamStilar[stereotyp];
    if (överskrivning) Object.assign(par, överskrivning);

    return serialiseraStil(par);
}

// Mappar meddelandets (streckad/öppen)-egenskaper till en drawio-kantstil.
// Motsvarar PlantUML:s fyra grundformer:
//   ->   solid + fylld pilspets   (synkront anrop)
//   -->  streckad + fylld         (svar)
//   ->>  solid + öppen pilspets   (asynkront)
//   -->> streckad + öppen         (asynkront svar)
function byggMeddelandeStil(meddelande, kantÖverskrivning) {
    const par = {
        html: "1",
        fontSize: "11",
        endArrow: meddelande.öppen ? "open" : "block",
        endFill: meddelande.öppen ? "0" : "1",
        edgeStyle: "none",   // rak linje — ingen automatisk vinkling
        rounded: "0",
    };
    if (meddelande.streckad) par.dashed = "1";

    if (kantÖverskrivning && Object.keys(kantÖverskrivning).length) {
        Object.assign(par, kantÖverskrivning);
    }

    return serialiseraStil(par);
}

function genereraSekvensXml(modell, layout, alternativ) {
    const opts = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId = opts.diagramId || `diagram_${Date.now()}`;
    const skinparam = opts.skinparam || { stilar: {}, kantStil: {}, strukturella: {} };

    const { deltagarPositioner, meddelandePositioner, totalHöjd, totalBredd } = layout;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" ` +
        `arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.max(850, totalBredd + 80)}" ` +
        `pageHeight="${Math.max(1100, totalHöjd + 80)}" math="0" shadow="0">`
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // --- Livslinjer ---
    for (const deltagare of modell.deltagare) {
        const pos = deltagarPositioner.get(deltagare.id);
        if (!pos) continue;

        const stil = byggLivslinjeStil(deltagare.stereotyp, skinparam.stilar);

        rader.push(
            `        <mxCell id="${xmlEscape(deltagare.id)}" value="${xmlEscape(deltagare.etikett)}" ` +
            `style="${stil}" vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("        </mxCell>");
    }

    // --- Meddelanden: flytande kanter med absoluta ändpunkter ---
    // (parent="1", inget source/target — positionerna är de facto
    // "fastnaglade" vid den beräknade tidpunkten/livslinjen genom de
    // explicita mxPoint-koordinaterna. Fortfarande fullt redigerbara
    // mxGraph-kanter: markera, dra om, byt stil, allt fungerar.)
    let räknare = 0;
    for (const meddelande of modell.meddelanden) {
        räknare += 1;
        const id = `meddelande_${räknare}`;
        const pos = meddelandePositioner.get(meddelande.ordning);
        if (!pos) continue;

        const etikettAttr = meddelande.etikett ? ` value="${xmlEscape(meddelande.etikett)}"` : "";
        const stil = byggMeddelandeStil(meddelande, skinparam.kantStil);

        rader.push(
            `        <mxCell id="${id}"${etikettAttr} style="${stil}" edge="1" parent="1">`
        );
        rader.push('          <mxGeometry relative="1" as="geometry">');
        rader.push(`            <mxPoint x="${pos.frånX}" y="${pos.y}" as="sourcePoint" />`);
        rader.push(`            <mxPoint x="${pos.tillX}" y="${pos.y}" as="targetPoint" />`);
        rader.push("          </mxGeometry>");
        rader.push("        </mxCell>");
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraSekvensXml };
