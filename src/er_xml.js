// Genererar mxGraph/drawio-XML från ett ER-diagram (modell + layout).
//
// En entitet renderas som:
//   1. En swimlane-container (entitetens namn som rubrik)
//   2. Barnrader — en per attribut, avdelare renderas som tunna streck
//
// Kanter renderas med drawios inbyggda kråkfot-pilar:
//   ERone, ERmany, ERmandOne, ERzeroToOne, ERoneToMany, ERzeroToMany
//
// Se also: er_parser.js för modellstrukturen, er_layout.js för positioner.

"use strict";

const { läggUtERModell, ENTITET_BREDD, RUBRIK_HÖJD, RAD_HÖJD, AVDELARE_HÖJD } = require("./er_layout");
const { xmlEscape } = require("./xml_escape");

// Mappar PlantUMLs kråkfot-symbol till drawio-pilnamn.
// Symbolerna är de som dyker upp inuti parsern (vänsterCard/högerCard).
function kortTillArrow(symbol) {
    switch (symbol) {
        case "||": return "ERmandOne";
        case "|o":
        case "o|": return "ERzeroToOne";
        case "|{":
        case "}|": return "ERoneToMany";
        case "o{":
        case "}o": return "ERzeroToMany";
        case "{":
        case "}":  return "ERmany";
        case "|":  return "ERone";
        case "o":  return "ERzeroToOne";
        default:   return "ERmandOne";
    }
}

// Bygger drawio-kantstilen för en kråkfot-kant.
// startArrow = vid källentiteten (vänsterCard), endArrow = vid målentiteten (högerCard).
function kantStil(kant) {
    const start   = kortTillArrow(kant.vänsterCard);
    const slut    = kortTillArrow(kant.högerCard);
    const streckad = kant.linje && kant.linje.includes(".") ? "dashed=1;" : "";
    return `startArrow=${start};startFill=0;endArrow=${slut};endFill=0;${streckad}html=1;`;
}

// Stilsträngar
const ENTITET_STIL =
    "swimlane;fontStyle=1;align=center;startSize=30;container=1;collapsible=0;html=1;" +
    "fillColor=#f0f0f0;strokeColor=#555555;fontSize=13;";

const AVDELARE_STIL =
    "line;strokeColor=#555555;fillColor=none;";

const ATTR_STIL =
    "text;strokeColor=none;fillColor=none;align=left;" +
    "spacingLeft=6;spacingRight=4;overflow=hidden;html=1;fontSize=12;";

// Markera primärnycklar med fet stil — vi letar efter <<PK>> eller <<pk>>.
function attrVärde(text) {
    if (/<<PK>>/i.test(text)) {
        // Fet text för primärnyckelfält
        return xmlEscape(`<b>${text}</b>`);
    }
    return xmlEscape(text);
}

function genereraERXml(modell, positioner, alternativ) {
    const opts       = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        '    <mxGraphModel dx="900" dy="700" grid="1" gridSize="10" guides="1" ' +
        'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ' +
        'pageWidth="1100" pageHeight="850" math="0" shadow="0">'
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // --- Entiteter: swimlane + attributrader ---
    for (const entitet of modell.entiteter) {
        const pos = positioner.get(entitet.id);
        if (!pos) continue;

        // Swimlane-container (rubrik)
        rader.push(
            `    <mxCell id="${xmlEscape(entitet.id)}" value="${xmlEscape(entitet.etikett)}" ` +
            `style="${ENTITET_STIL}" vertex="1" parent="1">`
        );
        rader.push(
            `      <mxGeometry x="${pos.x}" y="${pos.y}" ` +
            `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Barnrader
        // VIKTIGT: cellerna har html=1 — värdet tolkas som HTML av drawio.
        // Vi behöver därför tvåstegs-escaping (precis som klassHuvudVärde i klass_xml.js):
        //   steg 1: xmlEscape(attr.text)          → skyddar specialtecken (<,>,& etc.)
        //           för HTML-rendering, inkl. «PK» / «FK» som annars tolkas som HTML-taggar
        //   steg 2: xmlEscape(hela HTML-strängen)  → XML-escapar attributvärdet
        let löpandeY = RUBRIK_HÖJD;
        entitet.attribut.forEach((attr, i) => {
            if (attr.separator) {
                const avdId = `${entitet.id}__sep${i}`;
                rader.push(
                    `    <mxCell id="${xmlEscape(avdId)}" value="" ` +
                    `style="${AVDELARE_STIL}" vertex="1" parent="${xmlEscape(entitet.id)}">`
                );
                rader.push(
                    `      <mxGeometry y="${löpandeY}" width="${ENTITET_BREDD}" ` +
                    `height="${AVDELARE_HÖJD}" as="geometry" />`
                );
                rader.push("    </mxCell>");
                löpandeY += AVDELARE_HÖJD;
            } else {
                const attrId  = `${entitet.id}__a${i}`;
                const hasPK   = /<<PK>>/i.test(attr.text);
                const textHtml = xmlEscape(attr.text); // steg 1: HTML-escapa texten
                const värde   = hasPK
                    ? xmlEscape(`<b>${textHtml}</b>`) // steg 2: XML-escapa bold-HTML
                    : xmlEscape(textHtml);             // steg 2: XML-escapa ren HTML-text
                rader.push(
                    `    <mxCell id="${xmlEscape(attrId)}" value="${värde}" ` +
                    `style="${ATTR_STIL}" vertex="1" parent="${xmlEscape(entitet.id)}">`
                );
                rader.push(
                    `      <mxGeometry x="4" y="${löpandeY}" ` +
                    `width="${ENTITET_BREDD - 8}" height="${RAD_HÖJD}" as="geometry" />`
                );
                rader.push("    </mxCell>");
                löpandeY += RAD_HÖJD;
            }
        });

        // Tom rad om inga attribut definierats
        if (entitet.attribut.length === 0) {
            rader.push(
                `    <mxCell id="${xmlEscape(entitet.id)}__tom" value="" ` +
                `style="${ATTR_STIL}" vertex="1" parent="${xmlEscape(entitet.id)}">`
            );
            rader.push(
                `      <mxGeometry x="4" y="${RUBRIK_HÖJD}" ` +
                `width="${ENTITET_BREDD - 8}" height="${RAD_HÖJD}" as="geometry" />`
            );
            rader.push("    </mxCell>");
        }
    }

    // --- Kanter: kråkfot-pilar ---
    modell.kanter.forEach((kant, i) => {
        const id = `er_kant_${i + 1}`;
        rader.push(
            `    <mxCell id="${id}"` +
            (kant.etikett ? ` value="${xmlEscape(kant.etikett)}"` : ` value=""`) +
            ` style="${kantStil(kant)}" edge="1" parent="1" ` +
            `source="${xmlEscape(kant.från)}" target="${xmlEscape(kant.till)}">`
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

module.exports = { genereraERXml };
