// Vektor-ikoner för sekvensdiagrammets deltagarstereotyper, ritade som
// stencil-path-fragment (move/line/arc/ellipse + stroke). Enkla, generiska
// piktogram i UML-stil — inte kopior av någon specifik ikonuppsättning.
//
// Varje funktion ritar EN ikon centrerad kring x=cx med ikonens topp vid
// y=topY, inom en ruta på ca IKON_BREDD x IKON_HÖJD. Används två gånger
// (topp + botten) av sekvens_xml.js för att bygga en sammanhållen
// lifeline-stencil.

"use strict";

const IKON_BREDD = 26;
const IKON_HÖJD = 30;

function path(delar) {
    return `<path>${delar.join("")}</path><stroke/>`;
}
function mv(x, y) { return `<move x="${x}" y="${y}"/>`; }
function ln(x, y) { return `<line x="${x}" y="${y}"/>`; }
function arc(rx, ry, x, y, sweep) {
    return `<arc rx="${rx}" ry="${ry}" x-axis-rotation="0" large-arc-flag="0" sweep-flag="${sweep}" x="${x}" y="${y}"/>`;
}

// Stickgubbe — huvud (cirkel) + kropp + armar + ben.
function aktör(cx, topY) {
    const r = 5;
    return (
        `<ellipse x="${cx - r}" y="${topY}" w="${r * 2}" h="${r * 2}"/><stroke/>` +
        path([
            mv(cx, topY + r * 2), ln(cx, topY + 21),
            mv(cx - 7, topY + 15), ln(cx + 7, topY + 15),
            mv(cx, topY + 21), ln(cx - 6, topY + 30),
            mv(cx, topY + 21), ln(cx + 6, topY + 30),
        ])
    );
}

// Gräns (boundary) — UML-symbolen "⊢○": cirkel + horisontell anslutningslinje
// + lodrät tvärslå i linjens ytterände.
function gräns(cx, topY) {
    const r = 7;
    const cy = topY + 15;
    const cirkelVänsterkant = cx + 1 - r;
    const linjeVänster = cirkelVänsterkant - 8;
    return (
        `<ellipse x="${cirkelVänsterkant}" y="${cy - r}" w="${r * 2}" h="${r * 2}"/><stroke/>` +
        path([
            mv(linjeVänster, cy), ln(cirkelVänsterkant, cy),
            mv(linjeVänster, cy - 5), ln(linjeVänster, cy + 5),
        ])
    );
}

// Kontroll — cirkel med en motursgående pilbåge som slutar i en
// vänsterpekande pilspets ovanpå (styrflödessymbolen).
function kontroll(cx, topY) {
    const r = 7;
    const cy = topY + 16;
    const bågHöger = cx + 6;
    const bågVänster = cx - 6;
    const bågY = cy - r;
    return (
        `<ellipse x="${cx - r}" y="${bågY}" w="${r * 2}" h="${r * 2}"/><stroke/>` +
        path([
            mv(bågHöger, bågY), arc(8, 7, bågVänster, bågY, 1),
            mv(bågVänster, bågY), ln(bågVänster + 4, bågY - 3),
            mv(bågVänster, bågY), ln(bågVänster + 2, bågY + 4),
        ])
    );
}

// Entitet — cirkel med understrykning.
function entitet(cx, topY) {
    const r = 8;
    const cy = topY + r + 2;
    return (
        `<ellipse x="${cx - r}" y="${topY + 2}" w="${r * 2}" h="${r * 2}"/><stroke/>` +
        path([mv(cx - r - 2, cy + r + 2), ln(cx + r + 2, cy + r + 2)])
    );
}

// Databas — liten cylinder.
function databas(cx, topY) {
    const rx = 11, ry = 4;
    const vänster = cx - rx, höger = cx + rx;
    const topp = topY + ry, botten = topY + IKON_HÖJD - ry;
    return path([
        mv(vänster, topp), arc(rx, ry, höger, topp, 0), arc(rx, ry, vänster, topp, 0),
        mv(vänster, topp), ln(vänster, botten), arc(rx, ry, höger, botten, 0), ln(höger, topp),
    ]);
}

const IKON_RITARE = {
    aktör, gräns_lifeline: gräns, kontroll, entitet, databas,
};

function rita(stereotyp, cx, topY) {
    const ritare = IKON_RITARE[stereotyp] || aktör;
    return ritare(cx, topY);
}

module.exports = { rita, IKON_BREDD, IKON_HÖJD };
