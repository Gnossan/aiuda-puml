// Genererar mxGraph/draw.io-XML för Gantt-diagram.
//
// Layout:
//   • Vänsterkolumn: uppgiftsetiketter (+ fas-rubrik)
//   • Höger: Gantt-staplar, skalade i pixlar per dag
//   • Övre rad: datumaxel (månadsrubriker)
//   • Klar-procent visas som en mörkare del av stapeln
//   • Fasgrupperingar markeras med en bakgrundsfärg

"use strict";

const { xmlEscape } = require("./xml_escape");

// Layout-konstanter
const ETIKETT_BREDD = 180;
const RAD_HÖJD      = 32;
const RAD_AVST      = 4;
const PX_PER_DAG    = 14;     // pixlar per dag
const AXEL_HÖJD     = 36;     // höjd för datumaxeln
const START_X       = ETIKETT_BREDD;
const START_Y       = AXEL_HÖJD;
const FAS_RUBRIK_H  = 28;     // höjd för fas-rubrik-rad

// Färgpalett för staplar (roterar)
const STAPELCOLOR = [
    { fill: "#1976d2", stroke: "#1565c0", klar: "#0d47a1" },
    { fill: "#388e3c", stroke: "#2e7d32", klar: "#1b5e20" },
    { fill: "#f57c00", stroke: "#e65100", klar: "#bf360c" },
    { fill: "#7b1fa2", stroke: "#6a1b9a", klar: "#4a148c" },
    { fill: "#0097a7", stroke: "#00838f", klar: "#006064" },
];

function formatDatum(datum) {
    if (!datum) return "";
    const d = new Date(datum);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function datumFrånDag(projektStart, dag) {
    const d = new Date(projektStart);
    d.setUTCDate(d.getUTCDate() + dag);
    return d;
}

const MÅNADNAMN = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

function genereraGanttXml(modell, _positioner, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const { uppgifter } = modell;
    if (uppgifter.length === 0) {
        return `<mxfile><diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
    }

    const proj = modell.projektStart || new Date(Date.UTC(2024, 0, 1));

    // Beräkna totalt dagnr-spann
    const maxDag = Math.max(...uppgifter.map((u) => u.startDag + u.varaktighet));

    // Bygg rader: fas-rubriker insprängda
    const RADER = [];
    let   senasteFas = null;
    for (const upp of uppgifter) {
        if (upp.fas && upp.fas !== senasteFas) {
            RADER.push({ typ: "fas", fas: upp.fas });
            senasteFas = upp.fas;
        }
        RADER.push({ typ: "uppgift", upp });
    }

    // Y-koordinat per rad
    let y = START_Y;
    const radY = new Map();
    for (const r of RADER) {
        const h = r.typ === "fas" ? FAS_RUBRIK_H : RAD_HÖJD;
        radY.set(r, y);
        y += h + RAD_AVST;
    }
    const totalHöjd = y + 20;
    const totalBredd = START_X + maxDag * PX_PER_DAG + 60;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" ` +
        `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
        `pageWidth="${Math.max(1200, totalBredd + 40)}" pageHeight="${Math.max(850, totalHöjd + 40)}" ` +
        `math="0" shadow="0">`
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    let cellId = 100;
    function nId() { return `gc_${cellId++}`; }

    // ---- Datumaxel (månadsrubriker) ----
    let d = 0;
    let förraDatum = datumFrånDag(proj, 0);
    let förraX = START_X;

    while (d <= maxDag) {
        const datum = datumFrånDag(proj, d);
        const nyMånad = datum.getUTCMonth() !== förraDatum.getUTCMonth() || d === 0;

        if (nyMånad || d === maxDag) {
            if (d > 0) {
                const bredd = (d === maxDag ? d : d) * PX_PER_DAG - (förraX - START_X);
                const mån   = `${MÅNADNAMN[förraDatum.getUTCMonth()]} ${förraDatum.getUTCFullYear()}`;
                rader.push(
                    `        <mxCell id="${nId()}" value="${xmlEscape(mån)}" ` +
                    `style="text;html=1;align=center;verticalAlign=middle;fontStyle=1;fontSize=10;` +
                    `strokeColor=#cccccc;fillColor=#f5f5f5;" vertex="1" parent="1">`
                );
                rader.push(
                    `          <mxGeometry x="${förraX}" y="0" width="${START_X + d * PX_PER_DAG - förraX}" height="${AXEL_HÖJD}" as="geometry" />`
                );
                rader.push("        </mxCell>");
            }
            förraX = START_X + d * PX_PER_DAG;
            förraDatum = datum;
        }
        d++;
    }

    // ---- Rader ----
    let uppIdx = 0;
    for (const r of RADER) {
        const ry = radY.get(r);

        if (r.typ === "fas") {
            // Fas-rubrikrad
            rader.push(
                `        <mxCell id="${nId()}" value="${xmlEscape(r.fas)}" ` +
                `style="text;html=1;align=left;verticalAlign=middle;fontStyle=3;fontSize=11;` +
                `strokeColor=none;fillColor=#fffde7;spacingLeft=8;" vertex="1" parent="1">`
            );
            rader.push(
                `          <mxGeometry x="0" y="${ry}" width="${totalBredd}" height="${FAS_RUBRIK_H}" as="geometry" />`
            );
            rader.push("        </mxCell>");
            continue;
        }

        const { upp } = r;
        const färgPalett = STAPELCOLOR[uppIdx % STAPELCOLOR.length];
        const fill   = upp.färg || färgPalett.fill;
        const stroke = upp.färg ? upp.färg : färgPalett.stroke;
        const klarFill = färgPalett.klar;
        uppIdx++;

        // Etikett till vänster
        rader.push(
            `        <mxCell id="${nId()}" value="${xmlEscape(upp.etikett)}" ` +
            `style="text;html=1;align=right;verticalAlign=middle;fontSize=11;` +
            `strokeColor=none;fillColor=none;spacingRight=8;" vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="0" y="${ry}" width="${ETIKETT_BREDD - 8}" height="${RAD_HÖJD}" as="geometry" />`
        );
        rader.push("        </mxCell>");

        // Bakgrundsrad (zebra)
        if (uppIdx % 2 === 0) {
            rader.push(
                `        <mxCell id="${nId()}" value="" ` +
                `style="rounded=0;fillColor=#f9f9f9;strokeColor=none;" vertex="1" parent="1">`
            );
            rader.push(
                `          <mxGeometry x="${START_X}" y="${ry}" width="${maxDag * PX_PER_DAG}" height="${RAD_HÖJD}" as="geometry" />`
            );
            rader.push("        </mxCell>");
        }

        // Gantt-stapel
        const stapelX = START_X + upp.startDag * PX_PER_DAG;
        const stapelB = Math.max(4, upp.varaktighet * PX_PER_DAG);

        rader.push(
            `        <mxCell id="${upp.id}" value="" ` +
            `style="rounded=1;arcSize=20;fillColor=${fill};strokeColor=${stroke};fontSize=10;" ` +
            `vertex="1" parent="1">`
        );
        rader.push(
            `          <mxGeometry x="${stapelX}" y="${ry + 4}" width="${stapelB}" height="${RAD_HÖJD - 8}" as="geometry" />`
        );
        rader.push("        </mxCell>");

        // Klar-del
        if (upp.klar > 0) {
            const klarB = Math.max(1, Math.round(stapelB * upp.klar / 100));
            rader.push(
                `        <mxCell id="${nId()}" value="" ` +
                `style="rounded=1;arcSize=20;fillColor=${klarFill};strokeColor=none;" ` +
                `vertex="1" parent="1">`
            );
            rader.push(
                `          <mxGeometry x="${stapelX}" y="${ry + 4}" width="${klarB}" height="${RAD_HÖJD - 8}" as="geometry" />`
            );
            rader.push("        </mxCell>");
        }

        // Etikett inuti stapeln (om tillräckligt bred)
        const datumText = formatDatum(datumFrånDag(proj, upp.startDag));
        if (stapelB >= 60) {
            rader.push(
                `        <mxCell id="${nId()}" value="${xmlEscape(upp.klar > 0 ? `${upp.klar}%` : datumText)}" ` +
                `style="text;html=1;align=center;verticalAlign=middle;fontSize=9;fontColor=#ffffff;strokeColor=none;fillColor=none;" ` +
                `vertex="1" parent="1">`
            );
            rader.push(
                `          <mxGeometry x="${stapelX}" y="${ry + 4}" width="${stapelB}" height="${RAD_HÖJD - 8}" as="geometry" />`
            );
            rader.push("        </mxCell>");
        }
    }

    // ---- Vertikal linje för "idag" (dag 0 = projektstart, dagens offset) ----
    const idag = new Date();
    const idagDag = Math.round((Date.UTC(idag.getFullYear(), idag.getMonth(), idag.getDate()) - proj.getTime()) / 86400000);
    if (idagDag > 0 && idagDag < maxDag) {
        const idagX = START_X + idagDag * PX_PER_DAG;
        rader.push(
            `        <mxCell id="${nId()}" value="" ` +
            `style="endArrow=none;startArrow=none;html=1;strokeColor=#b85450;strokeWidth=2;dashed=1;" ` +
            `edge="1" parent="1">`
        );
        rader.push(`          <mxGeometry as="geometry">`);
        rader.push(`            <mxPoint x="${idagX}" y="0" as="sourcePoint" />`);
        rader.push(`            <mxPoint x="${idagX}" y="${totalHöjd}" as="targetPoint" />`);
        rader.push("          </mxGeometry>");
        rader.push("        </mxCell>");
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraGanttXml };
