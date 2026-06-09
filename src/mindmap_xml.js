// Genererar mxGraph/draw.io-XML för MindMap-diagram.
// Noder: ellips (rot) och rundade rektanglar (grenar) färgkodade per nivå.
// Kanter: böjda linjer utan pilspets.

"use strict";

function xmlEscape(t) {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Stil per djupnivå (0-indexerat: index 0 = djup 1 = rot)
const NIVÅSTILAR = [
    // Rot
    "ellipse;whiteSpace=wrap;html=1;fillColor=#1e4d78;strokeColor=#1a3f63;fontColor=#ffffff;fontSize=14;fontStyle=1;",
    // Djup 2
    "rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#1976d2;strokeColor=#1565c0;fontColor=#ffffff;fontSize=12;fontStyle=1;",
    // Djup 3
    "rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#bbdefb;strokeColor=#1976d2;fontColor=#0d47a1;fontSize=11;",
    // Djup 4+
    "rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#e3f2fd;strokeColor=#90caf9;fontColor=#1565c0;fontSize=11;",
];

function kantStil(nod) {
    const utX = nod.sida === "vänster" ? "0" : "1";
    const inX = nod.sida === "vänster" ? "1" : "0";
    return (
        `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;` +
        `exitX=${utX};exitY=0.5;exitDx=0;exitDy=0;` +
        `entryX=${inX};entryY=0.5;entryDx=0;entryDy=0;` +
        `endArrow=none;startArrow=none;strokeColor=#1976d2;strokeWidth=2;`
    );
}

function genereraMindmapXml(modell, positioner, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const { noder } = modell;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" ` +
        `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
        `pageWidth="1654" pageHeight="1169" math="0" shadow="0">`
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
            // Hex-kod eller CSS-färgnamn → ersätt fill och stroke
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
        const föräldraPos = positioner.get(nod.förälderId);
        const nodPos      = positioner.get(nod.id);
        if (!föräldraPos || !nodPos) continue;

        rader.push(
            `        <mxCell id="e${kantRäknare++}" value="" style="${kantStil(nod)}" ` +
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

module.exports = { genereraMindmapXml };
