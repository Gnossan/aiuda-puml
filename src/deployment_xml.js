// Genererar mxGraph/drawio-XML från ett deployment-diagram (modell + layout).
//
// Den kritiska skillnaden mot xml.js: deployment-diagram kan ha godtyckligt
// nästlade containers (node { database { component } }). drawio kräver att
// varje förälder deklareras I XML:en INNAN sina barn. Vi använder därför
// rekursiv DFS-skrivning: container → barnens noder → barnens barn → ...
//
// Kantstilar hämtas från xml.js:s kantStil-logik (samma pilformer).

"use strict";

const { slåUppKatalogpost } = require("./shape_katalog");
const { CONTAINER_TYPER }   = require("./deployment_parser");
const { läggUtDeploymentModell } = require("./deployment_layout");

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ---- Stilhantering (lokal kopia av xml.js:s hjälpfunktioner) ----
// Vi kopierar dessa tre funktioner för att undvika att exportera internt
// state från xml.js — deployment_xml.js är ett självständigt spår.

function tolkaStilSträng(sträng) {
    const par = {};
    for (const del of String(sträng || "").split(";")) {
        const trimmad = del.trim();
        if (!trimmad) continue;
        const eq = trimmad.indexOf("=");
        if (eq === -1) { par[trimmad] = ""; }
        else           { par[trimmad.slice(0, eq)] = trimmad.slice(eq + 1); }
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

function byggNodStil(typNyckel, skinparamStilar) {
    const katalogpost = slåUppKatalogpost(typNyckel);
    const basSträng   = (katalogpost && katalogpost.stil) || "rounded=0;whiteSpace=wrap;html=1;";
    const par         = tolkaStilSträng(basSträng);

    const överskrivning = skinparamStilar && skinparamStilar[typNyckel];
    if (överskrivning) Object.assign(par, överskrivning);

    return serialiseraStil(par);
}

function kantStil(pilForm, kantÖverskrivning) {
    const bas = "html=1;fontSize=11;";
    let stil;
    switch (pilForm) {
        case "<-->":
            stil = bas + "startArrow=open;startFill=0;endArrow=open;endFill=0;"; break;
        case "..>":
        case "..":
        case "<..":
            stil = bas + "endArrow=open;endFill=0;dashed=1;"; break;
        case "--":
            stil = bas + "endArrow=none;"; break;
        case "<--":
        case "<-":
            stil = bas + "startArrow=open;startFill=0;endArrow=none;"; break;
        case "-->":
        case "->":
        default:
            stil = bas + "endArrow=open;endFill=0;";
    }
    if (kantÖverskrivning && Object.keys(kantÖverskrivning).length) {
        const par = tolkaStilSträng(stil);
        Object.assign(par, kantÖverskrivning);
        return serialiseraStil(par);
    }
    return stil;
}

// ---- Rekursiv XML-generering ----
// Skriver en nod och sedan ALLA dess ättlingar direkt efteråt,
// så att drawio:s parent-referens alltid pekar på en redan deklarerad cell.

function skrivNodRekursivt(nod, alla, positioner, skinparamStilar, rader) {
    const pos = positioner.get(nod.id);
    if (!pos) return;

    const förälderId = nod.förälder && positioner.get(nod.förälder)
        ? nod.förälder : "1";

    const stil = byggNodStil(nod.typ, skinparamStilar);

    rader.push(
        `    <mxCell id="${xmlEscape(nod.id)}" value="${xmlEscape(nod.etikett)}" ` +
        `style="${stil}" vertex="1" parent="${xmlEscape(förälderId)}">`
    );
    rader.push(
        `      <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${pos.bredd}" height="${pos.höjd}" as="geometry" />`
    );
    rader.push("    </mxCell>");

    // Barn direkt efter föräldern (rekursivt, DFS)
    const barn = alla.filter((n) => n.förälder === nod.id);
    for (const b of barn) {
        skrivNodRekursivt(b, alla, positioner, skinparamStilar, rader);
    }
}

function genereraDeploymentXml(modell, positioner, alternativ) {
    const opts       = alternativ || {};
    const diagramNamn = opts.diagramNamn || "Sida-1";
    const diagramId   = opts.diagramId   || `diagram_${Date.now()}`;
    const skinparam   = opts.skinparam   || { stilar: {}, kantStil: {}, strukturella: {} };

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

    // --- Noder: rekursiv DFS från top-level-noder ---
    const topNoder = modell.noder.filter((n) => !n.förälder);

    // Containers före leaf-noder (viktigast: containers måste finnas i XML
    // innan deras barn, men inom samma generation spelar ordningen ingen roll)
    const sorterade = [
        ...topNoder.filter((n) => CONTAINER_TYPER.has(n.typ)),
        ...topNoder.filter((n) => !CONTAINER_TYPER.has(n.typ)),
    ];

    for (const nod of sorterade) {
        skrivNodRekursivt(nod, modell.noder, positioner, skinparam.stilar, rader);
    }

    // --- Kanter ---
    modell.kanter.forEach((kant, i) => {
        const id = `deployment_kant_${i + 1}`;
        const etikettAttr = kant.etikett ? ` value="${xmlEscape(kant.etikett)}"` : "";
        rader.push(
            `    <mxCell id="${id}"${etikettAttr} ` +
            `style="${kantStil(kant.stil, skinparam.kantStil)}" edge="1" parent="1" ` +
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

module.exports = { genereraDeploymentXml };
