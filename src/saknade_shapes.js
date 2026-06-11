// Genererar en liten, GRANSKNINGSBAR .drawio-fil med platshållarformer för
// PlantUML-notationstyper som (enligt shape_katalog.js) saknar en bra
// inbyggd drawio-motsvarighet.
//
// Tanken är INTE att smyga in shapes i användarens Anteckningsblock —
// det vore skört (olika lagringsbackends, risk att klanta data) och
// kringgår drawios egen, säkra mekanism. Istället: generera ett litet
// dokument där varje saknad typ finns som en färdigstylad platshållare.
// Användaren öppnar filen, granskar/justerar, markerar och väljer själv
// "Lägg till i kladdblocket" — drawios egen, inbyggda funktion gör resten.

"use strict";

const { TYP } = require("./parser");
const { slåUppKatalogpost, STATUS } = require("./shape_katalog");
const { xmlEscape } = require("./xml_escape");

// Mappar en parser-TYP till den typnyckel som shape_katalog.js använder.
// (För TYP-värdena råkar de redan vara identiska strängar — men vi håller
// en explicit mappning så att framtida diagramtyper med andra TYP-namn
// (t.ex. sekvensdiagrammets "livslinje") kan kopplas hit utan att parser.js
// och shape_katalog.js behöver dela exakt samma vokabulär.)
const TYP_TILL_KATALOGNYCKEL = {
    [TYP.AKTÖR]: "aktör",
    [TYP.USECASE]: "usecase",
    [TYP.GRÄNS]: "gräns",
};

// Hittar vilka katalogtyper som FÖREKOMMER i modellen och saknar bra
// inbyggd motsvarighet. Returnerar en lista av { typNyckel, katalogpost,
// exempelEtikett } — en post per saknad TYP, med ett exempel hämtat ur
// modellen så att platshållaren får en realistisk etikett.
function hittaSaknadeTyper(modell) {
    const sedda = new Map(); // typNyckel -> exempelnod

    for (const nod of modell.noder) {
        const typNyckel = TYP_TILL_KATALOGNYCKEL[nod.typ] || nod.typ;
        if (sedda.has(typNyckel)) continue;

        const katalogpost = slåUppKatalogpost(typNyckel);
        if (katalogpost && katalogpost.status === STATUS.SAKNAS) {
            sedda.set(typNyckel, nod);
        }
    }

    return Array.from(sedda.entries()).map(([typNyckel, exempelNod]) => ({
        typNyckel,
        katalogpost: slåUppKatalogpost(typNyckel),
        exempelEtikett: exempelNod.etikett,
    }));
}

// Bygger ett litet granskningsdokument: en rubriktext per saknad typ +
// en platshållarshape med katalogens föreslagna bas-stil och en
// kort kommentar som värde, så att användaren ser VARFÖR den ser ut som den gör.
function genereraSaknadeShapesXml(modell, alternativ) {
    const opts = alternativ || {};
    const saknade = hittaSaknadeTyper(modell);

    if (saknade.length === 0) return null; // inget att generera — allt fanns redan inbyggt

    const diagramNamn = opts.diagramNamn || "Saknade shapes — granska";
    const diagramId = opts.diagramId || `saknade_${Date.now()}`;

    const rader = [];
    rader.push(`<mxfile host="app.diagrams.net" agent="puml-till-drawio" version="24.0.0">`);
    rader.push(`  <diagram name="${xmlEscape(diagramNamn)}" id="${xmlEscape(diagramId)}">`);
    rader.push('    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">');
    rader.push("      <root>");
    rader.push('        <mxCell id="0" />');
    rader.push('        <mxCell id="1" parent="0" />');

    let y = 40;
    let id = 0;
    for (const { typNyckel, katalogpost, exempelEtikett } of saknade) {
        id += 1;
        const rubrikId = `rubrik_${id}`;
        const formId = `form_${id}`;
        const kommentarId = `kommentar_${id}`;

        rader.push(
            `        <mxCell id="${rubrikId}" value="${xmlEscape(`Saknas: ${typNyckel}`)}" ` +
            `style="text;html=1;fontStyle=1;fontSize=14;align=left;verticalAlign=middle;" vertex="1" parent="1">`
        );
        rader.push(`          <mxGeometry x="40" y="${y}" width="300" height="30" as="geometry" />`);
        rader.push("        </mxCell>");

        rader.push(
            `        <mxCell id="${formId}" value="${xmlEscape(exempelEtikett)}" ` +
            `style="${katalogpost.stil}" vertex="1" parent="1">`
        );
        rader.push(`          <mxGeometry x="40" y="${y + 36}" width="180" height="80" as="geometry" />`);
        rader.push("        </mxCell>");

        rader.push(
            `        <mxCell id="${kommentarId}" value="${xmlEscape(katalogpost.kommentar)}" ` +
            `style="text;html=1;fontSize=11;fontColor=#666666;align=left;verticalAlign=top;whiteSpace=wrap;" vertex="1" parent="1">`
        );
        rader.push(`          <mxGeometry x="260" y="${y + 36}" width="520" height="80" as="geometry" />`);
        rader.push("        </mxCell>");

        y += 150;
    }

    // En kort instruktionsruta längst ner — påminnelse om nästa steg.
    rader.push(
        `        <mxCell id="instruktion" value="${xmlEscape(
            "Granska formerna ovan, justera vid behov, markera och välj " +
            "\"Lägg till i kladdblocket\" för dem du vill spara för återanvändning."
        )}" style="text;html=1;fontSize=12;fontStyle=2;fontColor=#999999;align=left;verticalAlign=top;whiteSpace=wrap;" vertex="1" parent="1">`
    );
    rader.push(`          <mxGeometry x="40" y="${y}" width="740" height="50" as="geometry" />`);
    rader.push("        </mxCell>");

    rader.push("      </root>");
    rader.push("    </mxGraphModel>");
    rader.push("  </diagram>");
    rader.push("</mxfile>");

    return rader.join("\n");
}

module.exports = { genereraSaknadeShapesXml, hittaSaknadeTyper };
