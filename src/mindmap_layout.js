// Layout för MindMap-diagram: radial trädlayout med roten i mitten.
//
// Höger-grenar expanderar till höger, vänster-grenar till vänster.
// Varje undernivå beräknar nödvändig höjd rekursivt — inga överlapp.

"use strict";

const ROT_BREDD  = 180;
const ROT_HÖJD   = 60;
const NOD_HÖJD   = 40;
const HORIZ_AVST = 50;   // vågrätt gap mellan förälder och barn
const VERT_AVST  = 16;   // lodrätt gap mellan syskon
const CENTER_X   = 700;
const CENTER_Y   = 420;

function nodBredd(djup) {
    return Math.max(100, 160 - (djup - 2) * 15);
}

// Total höjd för hela subträdet rotat i nodId
function subträdsHöjd(nodId, alla) {
    const barn = alla.filter((n) => n.förälderId === nodId);
    if (barn.length === 0) return NOD_HÖJD;
    return (
        barn.reduce((s, b) => s + subträdsHöjd(b.id, alla), 0) +
        (barn.length - 1) * VERT_AVST
    );
}

// Placera nod centrerad på (mittenX, mittenY), rekursera till barn
function positionera(nod, mittenX, mittenY, alla, pos) {
    const bredd = nodBredd(nod.djup);
    pos.set(nod.id, {
        x:      mittenX - bredd / 2,
        y:      mittenY - NOD_HÖJD / 2,
        bredd,
        höjd:   NOD_HÖJD,
        mittenX,
        mittenY,
    });

    const barn = alla.filter((n) => n.förälderId === nod.id);
    if (barn.length === 0) return;

    const totalHöjd =
        barn.reduce((s, b) => s + subträdsHöjd(b.id, alla), 0) +
        (barn.length - 1) * VERT_AVST;

    const riktning  = nod.sida === "vänster" ? "vänster" : "höger";
    const barnBredd = nodBredd(nod.djup + 1);
    const barnX     =
        riktning === "höger"
            ? mittenX + bredd / 2 + HORIZ_AVST + barnBredd / 2
            : mittenX - bredd / 2 - HORIZ_AVST - barnBredd / 2;

    let y = mittenY - totalHöjd / 2;
    for (const b of barn) {
        const bHöjd = subträdsHöjd(b.id, alla);
        positionera(b, barnX, y + bHöjd / 2, alla, pos);
        y += bHöjd + VERT_AVST;
    }
}

function läggUtMindmap(modell) {
    const { noder, rotId } = modell;
    const pos = new Map();
    if (!rotId) return pos;

    // Rot i mitten
    pos.set(rotId, {
        x:      CENTER_X - ROT_BREDD / 2,
        y:      CENTER_Y - ROT_HÖJD / 2,
        bredd:  ROT_BREDD,
        höjd:   ROT_HÖJD,
        mittenX: CENTER_X,
        mittenY: CENTER_Y,
    });

    // Separera direktbarn i höger resp. vänster
    const höger   = noder.filter((n) => n.förälderId === rotId && n.sida !== "vänster");
    const vänster = noder.filter((n) => n.förälderId === rotId && n.sida === "vänster");

    function layoutGrupp(grupp, riktning) {
        if (grupp.length === 0) return;
        const totalHöjd =
            grupp.reduce((s, b) => s + subträdsHöjd(b.id, noder), 0) +
            (grupp.length - 1) * VERT_AVST;
        const barnBredd = nodBredd(2);
        const barnX =
            riktning === "höger"
                ? CENTER_X + ROT_BREDD / 2 + HORIZ_AVST + barnBredd / 2
                : CENTER_X - ROT_BREDD / 2 - HORIZ_AVST - barnBredd / 2;
        let y = CENTER_Y - totalHöjd / 2;
        for (const b of grupp) {
            const bHöjd = subträdsHöjd(b.id, noder);
            positionera(b, barnX, y + bHöjd / 2, noder, pos);
            y += bHöjd + VERT_AVST;
        }
    }

    layoutGrupp(höger,   "höger");
    layoutGrupp(vänster, "vänster");

    return pos;
}

module.exports = { läggUtMindmap };
