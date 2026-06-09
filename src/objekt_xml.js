// Genererar mxGraph/draw.io-XML från ett objektdiagram (modell + layout).
//
// Ett UML-objekt renderas som en swimlane med:
//   1. Rubrik: "<u>instansnamn : Klass</u>" (understruken per UML-konvention)
//   2. En tunn avdelingslinje
//   3. En textradings-cell per fältvärde ("namn = värde")
//
// Liknande klass_xml.js men utan metod-fack och med annan rubrikformatering.

"use strict";

const { läggUtObjektModell, OBJEKT_BREDD, RUBRIK_HÖJD, FÄLT_HÖJD, AVDELARE_HÖJD } = require("./objekt_layout");

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Rubrikvärde: "<u>instansnamn : Klass</u>" (UML-konvention för objekt).
// Tvåstegs-escaping: steg 1 skyddar namnen i HTML, steg 2 XML-escapar hela HTML-strängen.
function objektRubrikVärde(obj) {
    const namnHtml  = xmlEscape(obj.etikett);
    const klassHtml = obj.klass ? ` : ${xmlEscape(obj.klass)}` : "";
    const html      = `<u>${namnHtml}${klassHtml}</u>`;
    return xmlEscape(html); // steg 2
}

const OBJEKT_STIL =
    "swimlane;fontStyle=0;align=center;startSize=36;container=1;collapsible=0;html=1;" +
    "fillColor=#dae8fc;strokeColor=#6c8ebf;";

const AVDELARE_STIL =
    "line;strokeColor=inherit;fillColor=none;";

const FÄLT_STIL =
    "text;strokeColor=none;fillColor=none;align=left;" +
    "spacingLeft=4;spacingRight=4;overflow=hidden;html=1;";

function kantStil(stil) {
    const bas = "html=1;fontSize=11;";
    switch (stil) {
        case "<-->": return bas + "startArrow=open;startFill=0;endArrow=open;endFill=0;";
        case "..>":
        case "..":   return bas + "endArrow=open;endFill=0;dashed=1;";
        case "--":   return bas + "endArrow=none;";
        case "-->":
        default:     return bas + "endArrow=open;endFill=0;";
    }
}

function genereraObjektXml(modell, positioner, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        '    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" ' +
        'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ' +
        'pageWidth="1100" pageHeight="850" math="0" shadow="0">'
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // --- Objekt: swimlane + fältrader ---
    for (const obj of modell.objekt) {
        const pos = positioner.get(obj.id);
        if (!pos) continue;

        // Swimlane
        rader.push(
            `    <mxCell id="${xmlEscape(obj.id)}" value="${objektRubrikVärde(obj)}" ` +
            `style="${OBJEKT_STIL}" vertex="1" parent="1">`
        );
        rader.push(
            `      <mxGeometry x="${pos.x}" y="${pos.y}" ` +
            `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Avdelare
        rader.push(
            `    <mxCell id="${xmlEscape(obj.id)}__avd" value="" ` +
            `style="${AVDELARE_STIL}" vertex="1" parent="${xmlEscape(obj.id)}">`
        );
        rader.push(
            `      <mxGeometry y="${RUBRIK_HÖJD}" width="${OBJEKT_BREDD}" ` +
            `height="${AVDELARE_HÖJD}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Fältrader
        let löpandeY = RUBRIK_HÖJD + AVDELARE_HÖJD;
        const rader_ = obj.fält.length > 0 ? obj.fält : [""];
        rader_.forEach((fält, i) => {
            // Tvåstegs-escaping: fälttexten kan innehålla < > & (t.ex. "typ = List<String>")
            const textHtml = xmlEscape(fält);
            const värde    = xmlEscape(textHtml);
            rader.push(
                `    <mxCell id="${xmlEscape(obj.id)}__f${i}" value="${värde}" ` +
                `style="${FÄLT_STIL}" vertex="1" parent="${xmlEscape(obj.id)}">`
            );
            rader.push(
                `      <mxGeometry x="4" y="${löpandeY}" ` +
                `width="${OBJEKT_BREDD - 8}" height="${FÄLT_HÖJD}" as="geometry" />`
            );
            rader.push("    </mxCell>");
            löpandeY += FÄLT_HÖJD;
        });
    }

    // --- Kanter ---
    modell.kanter.forEach((kant, i) => {
        const id = `objekt_kant_${i + 1}`;
        const etikettAttr = kant.etikett ? ` value="${xmlEscape(kant.etikett)}"` : "";
        rader.push(
            `    <mxCell id="${id}"${etikettAttr} style="${kantStil(kant.stil)}" ` +
            `edge="1" parent="1" source="${xmlEscape(kant.från)}" target="${xmlEscape(kant.till)}">`
        );
        rader.push('      <mxGeometry relative="1" as="geometry" />');
        rader.push("    </mxCell>");
    });

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraObjektXml };
