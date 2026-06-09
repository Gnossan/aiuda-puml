// Genererar mxGraph/draw.io-XML från ett timing-diagram (modell + layout).
//
// draw.io har ingen inbyggd "timing diagram"-shape. Vi konstruerar diagrammet
// med enkla primitiver:
//
//   ┌─────────────────────────────────────────────┐
//   │ Etikett │ Idle │ Processing │ Idle           │ ← deltagarrad
//   └─────────────────────────────────────────────┘
//   ┌─────────────────────────────────────────────┐
//   │ Server  │ Idle │ Busy       │ Idle           │
//   └─────────────────────────────────────────────┘
//   ──┬─────────┬───────────┬──────────────────────
//     0        100         200                       ← tidaxelmarkeringar
//
// Varje tillståndssegment = en rektangel, färgkodad per unikt tillstånd.
// Tidaxeln = en horisontell linje med vertikala tick-marks och etiketter.
// Deltagare-etikett = en textruta till vänster.
//
// Pilarna (synkronisering) = vertikala linjer med pilspets och etikett.

"use strict";

// ---- Layout-konstanter ----
const ETIKETT_BREDD  = 120;   // bredd för deltagaretiketten till vänster
const RAD_HÖJD       = 50;    // höjd per deltagarrad
const RAD_MELLANRUM  = 10;    // vertikalt gap mellan rader
const START_Y        = 40;    // top-marginal
const TIDAXEL_HÖJD   = 30;    // höjd för tidaxelraden längst ner
const MIN_SEGMENT_B  = 40;    // minsta segmentbredd i pixlar
const PX_PER_TIDSENHET = 4;   // pixlar per tidsenhet (justeras efter tidspan)

// Tillståndsfärger — roterar runt en fast palett
const FÄRGER = [
    { fill: "#d5e8d4", stroke: "#82b366" },  // grön
    { fill: "#dae8fc", stroke: "#6c8ebf" },  // blå
    { fill: "#fff2cc", stroke: "#d6b656" },  // gul
    { fill: "#f8cecc", stroke: "#b85450" },  // röd
    { fill: "#e1d5e7", stroke: "#9673a6" },  // lila
    { fill: "#f5f5f5", stroke: "#666666" },  // grå (Idle/default)
];
const IDLE_FÄRG = { fill: "#f5f5f5", stroke: "#999999" };

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Tilldela en färg per unikt tillståndsnamn
function byggFärgMap(modell) {
    const karta = new Map();
    let index   = 0;
    for (const ts of modell.tillstånd) {
        const namn = ts.tillstånd.toLowerCase();
        if (!karta.has(namn)) {
            if (namn === "idle" || namn === "{hidden}" || namn === "inactive") {
                karta.set(namn, IDLE_FÄRG);
            } else {
                karta.set(namn, FÄRGER[index % FÄRGER.length]);
                index++;
            }
        }
    }
    return karta;
}

function genereraTidingsXml(modell, alternativ) {
    const opts        = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const { deltagare, tillstånd, pilar } = modell;

    // ---- Beräkna tidspan ----
    const tider = tillstånd.map((t) => t.tid);
    if (tider.length === 0) {
        // Tom modell — returnera tomt diagram
        return `<mxfile><diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
    }

    const minTid  = Math.min(...tider);
    const maxTid  = Math.max(...tider);
    const tidSpan = maxTid - minTid || 1;

    // Anpassa pixel-per-enhet så diagrammet inte blir för smalt/brett
    const önskadBredd = 700;
    const pxPerEnhet  = Math.max(MIN_SEGMENT_B / tidSpan * deltagare.length,
                                  önskadBredd / tidSpan);

    function tidTillX(tid) {
        return ETIKETT_BREDD + (tid - minTid) * pxPerEnhet;
    }

    const totalBredd = ETIKETT_BREDD + tidSpan * pxPerEnhet + 40;
    const färgMap    = byggFärgMap(modell);

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        `    <mxGraphModel dx="900" dy="700" grid="1" gridSize="10" guides="1" ` +
        `tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ` +
        `pageWidth="${Math.max(1100, totalBredd + 100)}" pageHeight="850" math="0" shadow="0">`
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    let cellId = 100;
    function nästaId() { return `tc_${cellId++}`; }

    // ---- Deltagare-rader ----
    deltagare.forEach((d, dIdx) => {
        const y = START_Y + dIdx * (RAD_HÖJD + RAD_MELLANRUM);

        // Etikettruta till vänster
        const etikId = nästaId();
        rader.push(
            `    <mxCell id="${etikId}" value="${xmlEscape(d.etikett)}" ` +
            `style="text;html=1;align=right;verticalAlign=middle;fontStyle=1;fontSize=12;` +
            `strokeColor=none;fillColor=none;spacingRight=8;" ` +
            `vertex="1" parent="1">`
        );
        rader.push(
            `      <mxGeometry x="0" y="${y}" width="${ETIKETT_BREDD - 8}" height="${RAD_HÖJD}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Hämta tillståndshändelser för denna deltagare, sorterade per tid
        const händelser = tillstånd
            .filter((t) => t.deltagarId === d.id)
            .sort((a, b) => a.tid - b.tid);

        if (händelser.length === 0) return;

        // Generera segment: från tid[i] till tid[i+1] (eller maxTid + lite extra)
        händelser.forEach((h, hIdx) => {
            const x1  = tidTillX(h.tid);
            const x2  = hIdx + 1 < händelser.length
                ? tidTillX(händelser[hIdx + 1].tid)
                : tidTillX(maxTid) + 20;
            const bredd = Math.max(x2 - x1, MIN_SEGMENT_B);

            const normNamn = h.tillstånd.toLowerCase();
            const färg     = färgMap.get(normNamn) || FÄRGER[0];

            const segId = nästaId();
            rader.push(
                `    <mxCell id="${segId}" value="${xmlEscape(h.tillstånd)}" ` +
                `style="rounded=0;whiteSpace=wrap;html=1;` +
                `fillColor=${färg.fill};strokeColor=${färg.stroke};fontSize=11;` +
                `verticalAlign=middle;align=center;" ` +
                `vertex="1" parent="1">`
            );
            rader.push(
                `      <mxGeometry x="${x1}" y="${y}" width="${bredd}" height="${RAD_HÖJD}" as="geometry" />`
            );
            rader.push("    </mxCell>");
        });
    });

    // ---- Tidaxel ----
    const tidaxelY = START_Y + deltagare.length * (RAD_HÖJD + RAD_MELLANRUM);

    // Horisontell linje
    const linjeId = nästaId();
    rader.push(
        `    <mxCell id="${linjeId}" value="" ` +
        `style="endArrow=open;endFill=0;html=1;strokeColor=#333333;" ` +
        `edge="1" parent="1">`
    );
    rader.push(
        `      <mxGeometry x="${ETIKETT_BREDD}" y="${tidaxelY}" ` +
        `width="${tidSpan * pxPerEnhet + 20}" height="0" as="geometry" >`
    );
    rader.push(
        `        <mxPoint x="${ETIKETT_BREDD}" y="${tidaxelY}" as="sourcePoint" />`
    );
    rader.push(
        `        <mxPoint x="${tidTillX(maxTid) + 20}" y="${tidaxelY}" as="targetPoint" />`
    );
    rader.push("      </mxGeometry>");
    rader.push("    </mxCell>");

    // Tick-marks och tidsetiketter för varje unik tid
    const unikaTider = [...new Set(tider)].sort((a, b) => a - b);
    for (const tid of unikaTider) {
        const x = tidTillX(tid);

        // Tick (kort vertikal linje)
        const tickId = nästaId();
        rader.push(
            `    <mxCell id="${tickId}" value="" ` +
            `style="endArrow=none;html=1;strokeColor=#333333;" ` +
            `edge="1" parent="1">`
        );
        rader.push(`      <mxGeometry as="geometry">`);
        rader.push(`        <mxPoint x="${x}" y="${tidaxelY - 5}" as="sourcePoint" />`);
        rader.push(`        <mxPoint x="${x}" y="${tidaxelY + 5}" as="targetPoint" />`);
        rader.push("      </mxGeometry>");
        rader.push("    </mxCell>");

        // Tidsetikett under tick
        const tidEtikId = nästaId();
        rader.push(
            `    <mxCell id="${tidEtikId}" value="${xmlEscape(String(tid))}" ` +
            `style="text;html=1;align=center;verticalAlign=top;fontSize=10;` +
            `strokeColor=none;fillColor=none;" ` +
            `vertex="1" parent="1">`
        );
        rader.push(
            `      <mxGeometry x="${x - 20}" y="${tidaxelY + 6}" width="40" height="20" as="geometry" />`
        );
        rader.push("    </mxCell>");
    }

    // ---- Synkroniseringspilar ----
    for (const pil of pilar) {
        const frånDIdx = deltagare.findIndex((d) => d.id === pil.från);
        const tillDIdx = deltagare.findIndex((d) => d.id === pil.till);
        if (frånDIdx === -1 || tillDIdx === -1) continue;

        const x     = tidTillX(pil.tid);
        const yFrån = START_Y + frånDIdx * (RAD_HÖJD + RAD_MELLANRUM) + RAD_HÖJD / 2;
        const yTill = START_Y + tillDIdx * (RAD_HÖJD + RAD_MELLANRUM) + RAD_HÖJD / 2;

        const pilId = nästaId();
        rader.push(
            `    <mxCell id="${pilId}" ` +
            (pil.etikett ? `value="${xmlEscape(pil.etikett)}" ` : `value="" `) +
            `style="endArrow=open;endFill=0;html=1;strokeColor=#b85450;fontColor=#b85450;fontSize=10;" ` +
            `edge="1" parent="1">`
        );
        rader.push(`      <mxGeometry as="geometry">`);
        rader.push(`        <mxPoint x="${x}" y="${yFrån}" as="sourcePoint" />`);
        rader.push(`        <mxPoint x="${x}" y="${yTill}" as="targetPoint" />`);
        rader.push("      </mxGeometry>");
        rader.push("    </mxCell>");
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraTidingsXml };
