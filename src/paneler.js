// ======================================================================
// RESIZE — dra-och-ändra storlek på panelerna
// ======================================================================

const aiPanelEl      = document.getElementById("ai-panel");
const editorPanelEl  = document.getElementById("editor-panel");
const previewPanelEl = document.getElementById("preview-panel");
const ALLA_PANELER   = [aiPanelEl, editorPanelEl, previewPanelEl];
const SKARV_BREDD    = 5; // px per skarv × 2 skarvar = 10px totalt

function läsPanelBredder() {
    try { return JSON.parse(localStorage.getItem("panelBredder") || "null"); } catch { return null; }
}

function sparaPanelBredder() {
    localStorage.setItem("panelBredder", JSON.stringify(
        ALLA_PANELER.map((p) => p.offsetWidth)
    ));
}

function tillämpaPanelBredder(bredder) {
    const tillgänglig = window.innerWidth - SKARV_BREDD * 2;
    const summa = bredder.reduce((s, b) => s + b, 0);
    // Skala proportionellt om fönstret ändrats sedan sist
    const skalade = bredder.map((b) => Math.max(150, Math.round((b / summa) * tillgänglig)));
    // Se till att summan stämmer (avrundningsfel kan ge ±1px)
    const diff = tillgänglig - skalade.reduce((s, b) => s + b, 0);
    skalade[1] += diff;
    ALLA_PANELER.forEach((p, i) => { p.style.width = skalade[i] + "px"; });
}

function initPanelBredder() {
    const sparade = läsPanelBredder();
    if (sparade && sparade.length === 3) {
        tillämpaPanelBredder(sparade);
    } else {
        const tillgänglig = window.innerWidth - SKARV_BREDD * 2;
        const aiBredd     = Math.min(300, Math.floor(tillgänglig * 0.22));
        const resten      = tillgänglig - aiBredd;
        tillämpaPanelBredder([aiBredd, Math.floor(resten / 2), Math.ceil(resten / 2)]);
    }
}

let resizeDrag = null;

document.querySelectorAll(".resize-skarv").forEach((skarv, idx) => {
    skarv.addEventListener("mousedown", (e) => {
        const vänster = ALLA_PANELER[idx];
        const höger   = ALLA_PANELER[idx + 1];
        resizeDrag = {
            skarv, startX: e.clientX,
            vänsterBredd: vänster.offsetWidth,
            högerBredd:   höger.offsetWidth,
            vänster, höger,
        };
        skarv.classList.add("drar");
        document.body.classList.add("col-resize");
        e.preventDefault();
    });
});

window.addEventListener("mousemove", (e) => {
    if (!resizeDrag) return;
    const delta        = e.clientX - resizeDrag.startX;
    const total        = resizeDrag.vänsterBredd + resizeDrag.högerBredd;
    const nyVänster    = Math.max(150, Math.min(total - 150, resizeDrag.vänsterBredd + delta));
    const nyHöger      = total - nyVänster;
    resizeDrag.vänster.style.width = nyVänster + "px";
    resizeDrag.höger.style.width   = nyHöger   + "px";
});

window.addEventListener("mouseup", () => {
    if (!resizeDrag) return;
    resizeDrag.skarv.classList.remove("drar");
    document.body.classList.remove("col-resize");
    sparaPanelBredder();
    resizeDrag = null;
});

window.addEventListener("resize", () => {
    const sparade = läsPanelBredder();
    if (sparade) tillämpaPanelBredder(sparade);
});

initPanelBredder();
