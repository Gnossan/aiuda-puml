// Hjälpfunktioner för att bädda in EGNA stencil-shapes direkt i genererad
// drawio-XML, via styleattributet shape=stencil(<komprimerad-stencil-xml>).
//
// Det här är INTE "konstgjord" extra-kod jämfört med drawios native shapes —
// stencil-XML är exakt det format hela drawios bibliotek (AWS, Azure, UML, ...)
// är uppbyggda av (se t.ex. "Users"-shapen i stencils/networks.xml, som ritar
// tre figurer som EN sammansatt vektorform med flera <path>-block).
//
// Komprimeringen måste matcha drawios egen Graph.compress (app.min.js):
//   pako.deflateRaw(encodeURIComponent(xml))  →  base64
// vilket är detsamma som zlib.deflateRawSync på den URI-encodade strängen.

"use strict";

const zlib = require("zlib");

function komprimeraStencil(stencilXml) {
    const uriEncoded = encodeURIComponent(stencilXml);
    const deflaterad = zlib.deflateRawSync(Buffer.from(uriEncoded, "binary"));
    return deflaterad.toString("base64");
}

// Bygger style-strängens shape=stencil(...)-del. `geometri` styr hur stencilens
// w/h-rutnät (0..100 normalt) skalas till cellens faktiska bredd/höjd.
function stencilStilSträng(stencilXml) {
    return `shape=stencil(${komprimeraStencil(stencilXml)})`;
}

module.exports = { komprimeraStencil, stencilStilSträng };
