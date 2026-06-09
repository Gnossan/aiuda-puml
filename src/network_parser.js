// Parser för PlantUML nwdiag (nätverksdiagram).
//
// Stödd syntax:
//   nwdiag {
//     network internet {
//       address = "0.0.0.0/0"
//       web01 [address = "1.2.3.4", shape = "server"]
//       web02
//     }
//     network dmz {
//       address = "192.168.1.0/24"
//       web01                          ← nod i flera nätverk
//       db01 [address = "192.168.1.10"]
//     }
//     group backend {
//       color = "#FFEECC"
//       db01
//       app01
//     }
//   }
//
// Modell:
//   {
//     nätverk: [{ id, etikett, adress, färg, nodIds: [] }],
//     noder:   [{ id, etikett, adress, form, nätverkIds: [] }],
//     grupper: [{ id, etikett, färg, nodIds: [] }],
//   }

"use strict";

// Extrahera värdet av ett nyckel=värde-par (t.ex. address = "192.168.1.1")
function extrahera(text, nyckel) {
    const m = text.match(new RegExp(`${nyckel}\\s*=\\s*"([^"]*)"`, "i"))
        || text.match(new RegExp(`${nyckel}\\s*=\\s*([^,\\]\\s]+)`, "i"));
    return m ? m[1] : null;
}

function parsaNetwork(källkod) {
    const modell = {
        nätverk: [],
        noder:   [],
        grupper: [],
    };

    // Normalisera bort @startuml/@enduml och @startnwdiag/@endnwdiag
    const kropp = källkod
        .replace(/@(start|end)(uml|nwdiag)[^\n]*/gi, "")
        .trim();

    // Enkel stack-baserad parser — vi bryr oss bara om nätverk-/grupp-block
    const rader    = kropp.split(/\r?\n/);
    let kontext    = "root";      // "root", "nwdiag", "network:<id>", "group:<id>"
    let aktNätverk = null;
    let aktGrupp   = null;
    let djup       = 0;
    let nätId      = 0;
    let nodId      = 0;
    let grpId      = 0;

    function säkerställNod(etikett) {
        let nod = modell.noder.find((n) => n.etikett === etikett);
        if (!nod) {
            nod = { id: `nw_n${nodId++}`, etikett, adress: null, form: "server", nätverkIds: [] };
            modell.noder.push(nod);
        }
        return nod;
    }

    for (const råRad of rader) {
        const rad = råRad.trim();
        if (!rad || rad.startsWith("//") || rad.startsWith("'")) continue;

        // Öppet block
        if (rad.endsWith("{")) {
            djup++;
            const huvud = rad.slice(0, -1).trim();

            if (/^nwdiag$/i.test(huvud)) {
                kontext = "nwdiag";
                continue;
            }

            // network Namn {
            const nätM = huvud.match(/^network\s+(\S+)(?:\s+.*)?$/i);
            if (nätM && kontext === "nwdiag") {
                aktNätverk = {
                    id: `nw_net${nätId++}`,
                    etikett: nätM[1],
                    adress: null,
                    färg: "#dae8fc",
                    nodIds: [],
                };
                modell.nätverk.push(aktNätverk);
                kontext = `network:${aktNätverk.id}`;
                continue;
            }

            // group Namn {
            const grpM = huvud.match(/^group(?:\s+(\S+))?$/i);
            if (grpM && kontext === "nwdiag") {
                aktGrupp = {
                    id: `nw_grp${grpId++}`,
                    etikett: grpM[1] || `Grupp${grpId}`,
                    färg: "#ffe6cc",
                    nodIds: [],
                };
                modell.grupper.push(aktGrupp);
                kontext = `group:${aktGrupp.id}`;
                continue;
            }

            continue;
        }

        // Stängt block
        if (rad === "}") {
            djup--;
            if (kontext.startsWith("network:") || kontext.startsWith("group:")) {
                kontext = "nwdiag";
                aktNätverk = null;
                aktGrupp   = null;
            } else {
                kontext = "root";
            }
            continue;
        }

        // Nyckel=värde inuti network-block
        if (kontext.startsWith("network:") && aktNätverk) {
            const kvM = rad.match(/^(\w+)\s*=\s*"([^"]*)"/);
            if (kvM) {
                if (kvM[1] === "address") aktNätverk.adress = kvM[2];
                if (kvM[1] === "color")   aktNätverk.färg  = kvM[2];
                continue;
            }
            // Nod-rad: nodnamn  eller  nodnamn [address="...", shape="..."]
            const nodM = rad.match(/^(\w+)(?:\s*\[([^\]]*)\])?$/);
            if (nodM) {
                const nod = säkerställNod(nodM[1]);
                if (nodM[2]) {
                    nod.adress = extrahera(nodM[2], "address") || nod.adress;
                    nod.form   = extrahera(nodM[2], "shape")   || nod.form;
                }
                if (!nod.nätverkIds.includes(aktNätverk.id)) {
                    nod.nätverkIds.push(aktNätverk.id);
                }
                if (!aktNätverk.nodIds.includes(nod.id)) {
                    aktNätverk.nodIds.push(nod.id);
                }
            }
            continue;
        }

        // Nyckel=värde eller nodnamn inuti group-block
        if (kontext.startsWith("group:") && aktGrupp) {
            const kvM = rad.match(/^(\w+)\s*=\s*"([^"]*)"/);
            if (kvM && kvM[1] === "color") { aktGrupp.färg = kvM[2]; continue; }
            const nodM = rad.match(/^(\w+)$/);
            if (nodM) {
                const nod = säkerställNod(nodM[1]);
                if (!aktGrupp.nodIds.includes(nod.id)) aktGrupp.nodIds.push(nod.id);
            }
        }
    }

    return modell;
}

module.exports = { parsaNetwork };
