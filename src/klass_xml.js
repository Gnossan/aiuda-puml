// Genererar mxGraph/drawio-XML från ett klassdiagram (modell + layout).
//
// En UML-klass i drawio byggs upp som:
//   1. En swimlane-container-cell (klasshuvudet med namn / stereotyp)
//   2. En tunn avdelingslinje-cell (attributfack) — barnCell till swimlane
//   3. En textradings-cell per attribut               — barnCell till swimlane
//   4. En tunn avdelingslinje-cell (metodfack, om metoder finns)
//   5. En textradings-cell per metod                  — barnCell till swimlane
//
// Paket (namespace/package) genereras som streckade container-rektanglar.
// Kanter genereras med UML-korrekta pilformer per relationssemantik.

"use strict";

const { STEREOTYP } = require("./klass_parser");
const {
    läggUtKlassModell,
    rubrikHöjd,
    KLASS_BREDD,
    FACK_HÖJD,
    AVDELARE_HÖJD,
} = require("./klass_layout");

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// --- Klasshuvud: stereotyptext + namn i HTML ---
//
// VIKTIGT: drawio lagrar HTML i value-attributet XML-escaped, d.v.s.
// "<b>Namn</b>" skrivs som "&lt;b&gt;Namn&lt;/b&gt;" i XML:en.
// Vi bygger därför HTML-strängen i två steg:
//   1. xmlEscape(klassnamnet) — skyddar mot specialtecken i själva namnet
//   2. xmlEscape(hela HTML-strängen) — XML-escapar taggarna för attributet
// När drawio sedan läser attributet XML-unescapar den det och renderar
// resultatet som HTML (tack vare html=1 i stilen).
function klassHuvudVärde(klass) {
    const namnHtml = xmlEscape(klass.etikett); // steg 1: skydda klassnamnet

    let html;
    switch (klass.stereotyp) {
        case STEREOTYP.GRÄNSSNITT:
            html = `<i>«interface»</i><br><b>${namnHtml}</b>`;
            break;
        case STEREOTYP.ABSTRAKT:
            html = `<i>${namnHtml}</i>`; // kursivt = abstrakt (UML-konvention)
            break;
        case STEREOTYP.ENUM:
            html = `«enumeration»<br><b>${namnHtml}</b>`;
            break;
        default: // klass
            html = `<b>${namnHtml}</b>`;
    }

    return xmlEscape(html); // steg 2: XML-escapa hela HTML-strängen
}

// Bygger stilsträngen för swimlane-cellen.
function klassStil(klass, skinparamStilar) {
    const rh = rubrikHöjd(klass);
    // Grundstil: swimlane med stackLayout inaktiverat (vi placerar barn manuellt
    // med absoluta y-värden relativt föräldern — drawio respekterar det rakt av).
    let stil =
        `swimlane;fontStyle=0;align=center;startSize=${rh};` +
        `container=1;collapsible=0;html=1;`;

    // Färg per stereotyp (om skinparam inte säger annat)
    const färger = {
        [STEREOTYP.KLASS]:      { fillColor: "#dae8fc", strokeColor: "#6c8ebf" },
        [STEREOTYP.ABSTRAKT]:   { fillColor: "#f5f5f5", strokeColor: "#666666" },
        [STEREOTYP.GRÄNSSNITT]: { fillColor: "#d5e8d4", strokeColor: "#82b366" },
        [STEREOTYP.ENUM]:       { fillColor: "#fff2cc", strokeColor: "#d6b656" },
    };
    const f = färger[klass.stereotyp] || {};

    const överskrivning = (skinparamStilar && skinparamStilar[klass.stereotyp]) || {};
    const fc = överskrivning.fillColor || f.fillColor;
    const sc = överskrivning.strokeColor || f.strokeColor;
    if (fc) stil += `fillColor=${fc};`;
    if (sc) stil += `strokeColor=${sc};`;

    return stil;
}

// Stilsträngar för barn-celler inuti swimlane
const AVDELARE_STIL =
    "line;strokeColor=inherit;fillColor=none;";
const FACK_STIL =
    "text;strokeColor=none;fillColor=none;align=left;" +
    "spacingLeft=4;spacingRight=4;overflow=hidden;html=1;";

// Mappar relationsstil till drawio-kantstil.
function kantStil(stil) {
    switch (stil) {
        case "ärver":
            // Generalisering: ihålig triangel vid superklassen (target/to-änden)
            return "endArrow=block;endFill=0;startArrow=none;html=1;";
        case "realiserar":
            // Realisering: streckad linje + ihålig triangel
            return "endArrow=block;endFill=0;dashed=1;startArrow=none;html=1;";
        case "komposition":
            // Komposition: fylld diamant vid helheten (source/from-änden)
            return "startArrow=diamond;startFill=1;endArrow=none;html=1;";
        case "aggregation":
            // Aggregering: öppen diamant vid helheten
            return "startArrow=diamond;startFill=0;endArrow=none;html=1;";
        case "beroende":
            // Beroende: streckad öppen pil
            return "endArrow=open;endFill=0;dashed=1;startArrow=none;html=1;";
        case "association":
        default:
            return "endArrow=open;endFill=0;startArrow=none;html=1;";
    }
}

function genereraKlassXml(modell, positioner, alternativ) {
    const opts = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId = opts.diagramId || `diagram_${Date.now()}`;
    const skinparam = opts.skinparam || { stilar: {}, kantStil: {}, strukturella: {} };

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push(
        '    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" ' +
        'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" ' +
        'pageWidth="850" pageHeight="1100" math="0" shadow="0">'
    );
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    // --- Paket: streckad container-rektangel ---
    for (const paket of modell.paket) {
        const pos = positioner.get(paket.id);
        if (!pos) continue;

        const förälderId = paket.förälder && positioner.get(paket.förälder)
            ? paket.förälder : "1";

        rader.push(
            `    <mxCell id="${xmlEscape(paket.id)}" value="${xmlEscape(paket.etikett)}" ` +
            `style="rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;align=left;` +
            `container=1;collapsible=0;fillColor=none;dashed=1;strokeColor=#999999;" ` +
            `vertex="1" parent="${xmlEscape(förälderId)}">`
        );
        rader.push(
            `      <mxGeometry x="${pos.x}" y="${pos.y}" ` +
            `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("    </mxCell>");
    }

    // --- Klasser: swimlane + barnfack ---
    for (const klass of modell.klasser) {
        const pos = positioner.get(klass.id);
        if (!pos) continue;

        const förälderId = klass.förälder && positioner.get(klass.förälder)
            ? klass.förälder : "1";

        const rh = rubrikHöjd(klass);

        // Swimlane-container
        rader.push(
            `    <mxCell id="${xmlEscape(klass.id)}" value="${klassHuvudVärde(klass)}" ` +
            `style="${klassStil(klass, skinparam.stilar)}" ` +
            `vertex="1" parent="${xmlEscape(förälderId)}">`
        );
        rader.push(
            `      <mxGeometry x="${pos.x}" y="${pos.y}" ` +
            `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        const harAttribut = klass.attribut.length > 0;
        const harMetoder = klass.metoder.length > 0;

        if (!harAttribut && !harMetoder) continue;

        // Avdelare attributfack
        const avd1Id = `${klass.id}__avd1`;
        rader.push(
            `    <mxCell id="${xmlEscape(avd1Id)}" value="" ` +
            `style="${AVDELARE_STIL}" vertex="1" parent="${xmlEscape(klass.id)}">`
        );
        rader.push(
            `      <mxGeometry y="${rh}" width="${KLASS_BREDD}" ` +
            `height="${AVDELARE_HÖJD}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Attributrader
        let löpandeY = rh + AVDELARE_HÖJD;
        for (let i = 0; i < klass.attribut.length; i++) {
            const attrId = `${klass.id}__a${i}`;
            rader.push(
                `    <mxCell id="${xmlEscape(attrId)}" value="${xmlEscape(klass.attribut[i])}" ` +
                `style="${FACK_STIL}" vertex="1" parent="${xmlEscape(klass.id)}">`
            );
            rader.push(
                `      <mxGeometry x="4" y="${löpandeY}" ` +
                `width="${KLASS_BREDD - 8}" height="${FACK_HÖJD}" as="geometry" />`
            );
            rader.push("    </mxCell>");
            löpandeY += FACK_HÖJD;
        }

        if (!harMetoder) continue;

        // Avdelare metodfack
        const avd2Id = `${klass.id}__avd2`;
        rader.push(
            `    <mxCell id="${xmlEscape(avd2Id)}" value="" ` +
            `style="${AVDELARE_STIL}" vertex="1" parent="${xmlEscape(klass.id)}">`
        );
        rader.push(
            `      <mxGeometry y="${löpandeY}" width="${KLASS_BREDD}" ` +
            `height="${AVDELARE_HÖJD}" as="geometry" />`
        );
        rader.push("    </mxCell>");

        // Metodrader
        löpandeY += AVDELARE_HÖJD;
        for (let i = 0; i < klass.metoder.length; i++) {
            const metId = `${klass.id}__m${i}`;
            rader.push(
                `    <mxCell id="${xmlEscape(metId)}" value="${xmlEscape(klass.metoder[i])}" ` +
                `style="${FACK_STIL}" vertex="1" parent="${xmlEscape(klass.id)}">`
            );
            rader.push(
                `      <mxGeometry x="4" y="${löpandeY}" ` +
                `width="${KLASS_BREDD - 8}" height="${FACK_HÖJD}" as="geometry" />`
            );
            rader.push("    </mxCell>");
            löpandeY += FACK_HÖJD;
        }
    }

    // --- Kanter ---
    let kantRäknare = 0;
    for (const kant of modell.kanter) {
        kantRäknare += 1;
        const id = `kant_${kantRäknare}`;

        // Etikett och eventuell multiplicitet sammanfogas
        let värde = kant.etikett || "";

        rader.push(
            `    <mxCell id="${id}"` +
            (värde ? ` value="${xmlEscape(värde)}"` : "") +
            ` style="${kantStil(kant.stil)}" edge="1" parent="1" ` +
            `source="${xmlEscape(kant.från)}" target="${xmlEscape(kant.till)}">`
        );
        rader.push('      <mxGeometry relative="1" as="geometry" />');
        rader.push("    </mxCell>");

        // Multiplicitetsetiketter som fristående textatomer (drawio stödjer
        // sourceLabel/targetLabel via extra barn till edge-cellen)
        if (kant.frånMult) {
            kantRäknare += 1;
            rader.push(
                `    <mxCell id="kant_${kantRäknare}" value="${xmlEscape(kant.frånMult)}" ` +
                `style="resizable=0;html=1;align=left;verticalAlign=bottom;fontSize=11;" ` +
                `vertex="1" connectable="0" parent="${id}">`
            );
            rader.push('      <mxGeometry x="-0.9" y="0" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry>');
            rader.push("    </mxCell>");
        }
        if (kant.tillMult) {
            kantRäknare += 1;
            rader.push(
                `    <mxCell id="kant_${kantRäknare}" value="${xmlEscape(kant.tillMult)}" ` +
                `style="resizable=0;html=1;align=right;verticalAlign=bottom;fontSize=11;" ` +
                `vertex="1" connectable="0" parent="${id}">`
            );
            rader.push('      <mxGeometry x="0.9" y="0" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry>');
            rader.push("    </mxCell>");
        }
    }

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraKlassXml };
