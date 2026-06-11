// Delad hjälpfunktion: escapar text för användning i XML-attribut/innehåll.

"use strict";

function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

module.exports = { xmlEscape };
