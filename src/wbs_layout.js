// Layout för WBS (Work Breakdown Structure): uppifrån-och-ned träd.
// Roten längst upp, barn horisontellt fördelade under sin förälder.
// Subträdsbredd räknas rekursivt — inga överlapp.

"use strict";

const ROT_BREDD  = 200;
const ROT_HÖJD   = 56;
const NOD_HÖJD   = 40;
const HORIZ_AVST = 20;   // vågrätt gap mellan syskon
const VERT_AVST  = 60;   // lodrätt gap mellan nivåer
const CENTER_X   = 700;
const START_Y    = 60;

function nodBredd(djup) {
    return Math.max(100, 180 - (djup - 2) * 20);
}

// Total bredd som ett subträd behöver
function subträdsBredd(nod, alla) {
    const barn = alla.filter((n) => n.förälderId === nod.id);
    if (barn.length === 0) return nodBredd(nod.djup);
    return (
        barn.reduce((s, b) => s + subträdsBredd(b, alla), 0) +
        (barn.length - 1) * HORIZ_AVST
    );
}

function positionera(nod, mittenX, y, alla, pos) {
    const bredd = nod.djup === 1 ? ROT_BREDD : nodBredd(nod.djup);
    const höjd  = nod.djup === 1 ? ROT_HÖJD  : NOD_HÖJD;

    pos.set(nod.id, { x: mittenX - bredd / 2, y, bredd, höjd, mittenX });

    const barn = alla.filter((n) => n.förälderId === nod.id);
    if (barn.length === 0) return;

    const totalBredd =
        barn.reduce((s, b) => s + subträdsBredd(b, alla), 0) +
        (barn.length - 1) * HORIZ_AVST;

    const barnY = y + höjd + VERT_AVST;
    let   x     = mittenX - totalBredd / 2;

    for (const b of barn) {
        const bBredd = subträdsBredd(b, alla);
        positionera(b, x + bBredd / 2, barnY, alla, pos);
        x += bBredd + HORIZ_AVST;
    }
}

function läggUtWbs(modell) {
    const { noder, rotId } = modell;
    const pos = new Map();
    if (!rotId) return pos;
    const rot = noder.find((n) => n.id === rotId);
    if (!rot) return pos;
    positionera(rot, CENTER_X, START_Y, noder, pos);
    return pos;
}

module.exports = { läggUtWbs };
