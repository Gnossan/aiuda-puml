// Genererar mxGraph/draw.io-XML för nätverksdiagram (nwdiag).
//
// Layout:
//   • Varje nätverk = en horisontell band (rektangel med etikett till vänster)
//   • Noder = serverikoner, placerade i kolumner
//   • En nod som finns i flera nätverk placeras vid mitten av de banden
//   • Nätverksbanden är BAKGRUNDER (inte containers) — noder är fristående

"use strict";

const { xmlEscape } = require("./xml_escape");

// draw.io-stilar per nodform
const NODFORM_STIL = {
    server:   "shape=mxgraph.cisco.servers.standard_server;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;",
    database: "shape=mxgraph.cisco.storage.generic_storage;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;",
    router:   "shape=mxgraph.cisco.routers.router;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;",
    firewall: "shape=mxgraph.cisco.firewalls.firewall;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;",
    cloud:    "ellipse;whiteSpace=wrap;html=1;shape=cloud;fillColor=#dae8fc;strokeColor=#6c8ebf;",
    actor:    "shape=mxgraph.flowchart.actor;fillColor=#dae8fc;strokeColor=#6c8ebf;",
};
const DEFAULT_NOD_STIL =
    "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=11;";

// Fallback för okänd form
function nodStil(form) {
    return NODFORM_STIL[form?.toLowerCase()] || DEFAULT_NOD_STIL;
}

// Layout-konstanter
const ETIKETT_BREDD    = 150;  // nätverksetikett till vänster
const NÄT_HÖJD         = 110;  // höjd per nätverksband
const NÄT_MELLANRUM    = 16;
const NOD_BREDD        = 80;
const NOD_HÖJD         = 60;
const NOD_KOL_BREDD    = 120;  // pixlar per nodkolumn
const NOD_START_X      = ETIKETT_BREDD + 40;
const START_Y          = 40;

function genereraNetworkXml(modell, _positioner, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const { nätverk, noder } = modell;

    // Tilldela en fix kolumn per nod (ordning: första nätverks-uppträdande)
    const nodKolumn = new Map();
    let kolRäknare  = 0;
    for (const nät of nätverk) {
        for (const nId of nät.nodIds) {
            if (!nodKolumn.has(nId)) nodKolumn.set(nId, kolRäknare++);
        }
    }

    // Y-position för varje nätverk
    const nätY = new Map();
    nätverk.forEach((nät, i) => {
        nätY.set(nät.id, START_Y + i * (NÄT_HÖJD + NÄT_MELLANRUM));
    });

    // Y-position för varje nod = medel-y av de nätverk det tillhör
    function nodMittenY(nod) {
        const ys = nod.nätverkIds.map((nId) => nätY.get(nId) + NÄT_HÖJD / 2).filter(Boolean);
        if (ys.length === 0) return START_Y + NÄT_HÖJD / 2;
        return ys.reduce((s, y) => s + y, 0) / ys.length;
    }

    const totalBredd = NOD_START_X + kolRäknare * NOD_KOL_BREDD + 60;
    const totalHöjd  = START_Y + nätverk.length * (NÄT_HÖJD + NÄT_MELLANRUM) + 60;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" ` +
        `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
        `pageWidth="${Math.max(1100, totalBredd)}" pageHeight="${Math.max(850, totalHöjd)}" ` +
        `math="0" shadow="0">`
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // ---- Nätverksband ----
    for (const nät of nätverk) {
        const y   = nätY.get(nät.id);
        const etikettText = nät.adress
            ? `${nät.etikett}\n${nät.adress}`
            : nät.etikett;

        // Bakgrundsrektangel
        rader.push(
            `        <mxCell id="${nät.id}_bg" value="" ` +
            `style="rounded=0;whiteSpace=wrap;html=1;fillColor=${nät.färg};strokeColor=#6c8ebf;opacity=60;" ` +
            `vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="${ETIKETT_BREDD}" y="${y}" ` +
            `width="${Math.max(400, totalBredd - ETIKETT_BREDD)}" height="${NÄT_HÖJD}" as="geometry" />`
        );
        rader.push("        </mxCell>");

        // Etikettruta till vänster
        rader.push(
            `        <mxCell id="${nät.id}_lbl" value="${xmlEscape(etikettText)}" ` +
            `style="text;html=1;align=right;verticalAlign=middle;fontStyle=1;fontSize=11;` +
            `strokeColor=none;fillColor=none;spacingRight=8;whiteSpace=wrap;" ` +
            `vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="0" y="${y}" width="${ETIKETT_BREDD - 8}" height="${NÄT_HÖJD}" as="geometry" />`
        );
        rader.push("        </mxCell>");
    }

    // ---- Noder ----
    for (const nod of noder) {
        const kol    = nodKolumn.get(nod.id) ?? 0;
        const mittenX = NOD_START_X + kol * NOD_KOL_BREDD + NOD_BREDD / 2;
        const mittenY = nodMittenY(nod);

        const etikett = nod.adress
            ? `${nod.etikett}\n${nod.adress}`
            : nod.etikett;

        rader.push(
            `        <mxCell id="${nod.id}" value="${xmlEscape(etikett)}" ` +
            `style="${nodStil(nod.form)}" vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="${mittenX - NOD_BREDD / 2}" y="${mittenY - NOD_HÖJD / 2}" ` +
            `width="${NOD_BREDD}" height="${NOD_HÖJD}" as="geometry" />`
        );
        rader.push("        </mxCell>");

        // Vertikal linje: nätverksband(en) till nod
        for (const nätId of nod.nätverkIds) {
            const nätMittenY = (nätY.get(nätId) || 0) + NÄT_HÖJD / 2;
            if (Math.abs(nätMittenY - mittenY) < 4) continue; // nod i ett enda nät
            const linjeId = `${nod.id}_${nätId}_linje`;
            rader.push(
                `        <mxCell id="${linjeId}" value="" ` +
                `style="endArrow=none;startArrow=none;html=1;strokeColor=#6c8ebf;dashed=1;" ` +
                `edge="1" parent="1">`
            );
            rader.push(`          <mxGeometry as="geometry">`);
            rader.push(`            <mxPoint x="${mittenX}" y="${nätMittenY}" as="sourcePoint" />`);
            rader.push(`            <mxPoint x="${mittenX}" y="${mittenY - NOD_HÖJD / 2}" as="targetPoint" />`);
            rader.push("          </mxGeometry>");
            rader.push("        </mxCell>");
        }
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraNetworkXml };
