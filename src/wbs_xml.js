// Genererar mxGraph/draw.io-XML för WBS-diagram (Work Breakdown Structure).
// Noder: rundade rektanglar färgkodade per nivå.
// Kanter: ortogonala linjer utan pilspets, kopplade nerifrån/ovanifrån.

"use strict";

const { xmlEscape } = require("./xml_escape");

const NIVÅSTILAR = [
    // Rot (djup 1)
    "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#1e4d78;strokeColor=#1a3f63;fontColor=#ffffff;fontSize=14;fontStyle=1;",
    // Djup 2
    "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#23445d;fontSize=12;fontStyle=1;",
    // Djup 3
    "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontColor=#594300;fontSize=11;",
    // Djup 4+
    "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontSize=11;",
];

const KANTSTIL =
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;" +
    "exitX=0.5;exitY=1;exitDx=0;exitDy=0;" +
    "entryX=0.5;entryY=0;entryDx=0;entryDy=0;" +
    "endArrow=none;startArrow=none;strokeColor=#6c8ebf;strokeWidth=1.5;";

function genereraWbsXml(modell, positioner, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const { noder } = modell;

    // Beräkna bredd/höjd för pageWidth
    let maxX = 0, maxY = 0;
    positioner.forEach((p) => {
        maxX = Math.max(maxX, p.x + p.bredd);
        maxY = Math.max(maxY, p.y + p.höjd);
    });

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" ` +
        `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
        `pageWidth="${Math.max(1100, maxX + 100)}" pageHeight="${Math.max(850, maxY + 80)}" ` +
        `math="0" shadow="0">`
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // Noder
    for (const nod of noder) {
        const pos = positioner.get(nod.id);
        if (!pos) continue;

        const idx  = Math.min(nod.djup - 1, NIVÅSTILAR.length - 1);
        let   stil = NIVÅSTILAR[idx];

        if (nod.färg) {
            const hex = /^[0-9a-fA-F]{3,6}$/.test(nod.färg) ? `#${nod.färg}` : nod.färg;
            stil = stil.replace(/fillColor=[^;]+;/, `fillColor=${hex};`);
            stil = stil.replace(/strokeColor=[^;]+;/, `strokeColor=${hex};`);
        }

        rader.push(
            `        <mxCell id="${nod.id}" value="${xmlEscape(nod.text)}" ` +
            `style="${stil}" vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="${pos.x}" y="${pos.y}" ` +
            `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("        </mxCell>");
    }

    // Kanter
    let kantRäknare = 9000;
    for (const nod of noder) {
        if (!nod.förälderId) continue;
        if (!positioner.has(nod.förälderId) || !positioner.has(nod.id)) continue;

        rader.push(
            `        <mxCell id="e${kantRäknare++}" value="" style="${KANTSTIL}" ` +
            `edge="1" source="${nod.förälderId}" target="${nod.id}" parent="1">`
        );
        rader.push(`          <mxGeometry relative="1" as="geometry" />`);
        rader.push("        </mxCell>");
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraWbsXml };
