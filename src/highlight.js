// ----------------------------------------------------------------------
// Syntax-highlighting — enkel regexbaserad tokenisering.
// Overlay-tekniken kräver att highlight-<pre> och textarean har EXAKT
// samma textinnehåll (inkl. radbrytning i slutet) så att scrollningen
// och radbrytningarna matchar perfekt.
// ----------------------------------------------------------------------

const PLANTUML_NYCKELORD = [
    "actor", "participant", "boundary", "control", "entity", "database",
    "collections", "queue", "class", "interface", "enum", "abstract",
    "package", "namespace", "node", "folder", "frame", "cloud", "rectangle",
    "component", "usecase", "agent", "artifact", "card", "file", "storage",
    "object", "annotation", "circle", "state", "partition",
    "if", "else", "elseif", "endif", "while", "endwhile", "repeat",
    "fork", "again", "end", "split", "loop", "alt", "opt", "par", "break",
    "critical", "group", "note", "legend", "endlegend", "title", "header",
    "footer", "caption", "newpage", "skinparam", "autonumber", "scale",
    "left", "right", "top", "bottom", "over", "of", "as", "extends",
    "implements", "return", "activate", "deactivate", "destroy", "create",
    "box", "endbox", "ref", "is", "then", "detach", "start", "stop"
];
const NYCKELORD_MÄNGD = new Set(PLANTUML_NYCKELORD.map(ord => ord.toLowerCase()));

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Tokeniserar EN rad till highlightad HTML. Vi jobbar radvis så att
// kommentarer/strängar inte läcker över radbrytningar på ett sätt som
// förstör synkningen.
function highlightaRad(rad) {
    // Hel-radskommentarer (' ...) eller direktiv (@start.../@end...)
    const kommentarMatch = rad.match(/^(\s*)('.*)$/);
    if (kommentarMatch) {
        return escapeHtml(kommentarMatch[1]) +
            `<span class="syn-kommentar">${escapeHtml(kommentarMatch[2])}</span>`;
    }

    const direktivMatch = rad.match(/^(\s*)(@(?:start|end)\w+.*)$/i);
    if (direktivMatch) {
        return escapeHtml(direktivMatch[1]) +
            `<span class="syn-direktiv">${escapeHtml(direktivMatch[2])}</span>`;
    }

    // Tokenisera resten: strängar, stereotyper, pilar, nyckelord
    const tokenRegex = /("(?:[^"\\]|\\.)*")|(<<[^>]*>>)|(<-+>?|-+>|\.+>|--+\*|--+o|\*--+|o--+|--+\|>|\|>--+|--+\\|\/--+)|(\b[A-Za-zÅÄÖåäö_]\w*\b)/gu;

    let resultat = "";
    let senastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(rad)) !== null) {
        resultat += escapeHtml(rad.slice(senastIndex, match.index));
        const [hela, sträng, stereotyp, pil, ord] = match;

        if (sträng) {
            resultat += `<span class="syn-sträng">${escapeHtml(sträng)}</span>`;
        } else if (stereotyp) {
            resultat += `<span class="syn-stereotyp">${escapeHtml(stereotyp)}</span>`;
        } else if (pil) {
            resultat += `<span class="syn-pil">${escapeHtml(pil)}</span>`;
        } else if (ord && NYCKELORD_MÄNGD.has(ord.toLowerCase())) {
            resultat += `<span class="syn-nyckelord">${escapeHtml(ord)}</span>`;
        } else {
            resultat += escapeHtml(ord || hela);
        }

        senastIndex = match.index + hela.length;
    }
    resultat += escapeHtml(rad.slice(senastIndex));
    return resultat;
}

function uppdateraHighlight() {
    const rader = kodEl.value.split("\n");
    highlightEl.innerHTML = rader.map(highlightaRad).join("\n");
}

function synkaScroll() {
    const pre = highlightEl.parentElement;
    pre.scrollTop = kodEl.scrollTop;
    pre.scrollLeft = kodEl.scrollLeft;
}
