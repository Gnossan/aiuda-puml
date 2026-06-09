#!/usr/bin/env node
// CLI: läs en PlantUML-fil (use case ELLER sekvensdiagram), skriv ut
// motsvarande drawio-XML.
//
// Arbetsflöde — gemensamt för båda diagramtyperna:
//   1. checka skinparam            → skinparam.js
//   2. inventera mot drawio-katalog → shape_katalog.js
//   3. generera ev. saknade som ett granskningsbart bibliotek → saknade_shapes.js
//
// Diagramtyp avgörs automatiskt (kan tvingas med --typ).
//
// Användning:
//   node konvertera.js diagram.puml -o diagram.drawio
//   node konvertera.js diagram.puml --typ sekvens -o diagram.drawio
//   node konvertera.js diagram.puml          (skriver huvud-XML till stdout)

"use strict";

const fs = require("fs");
const path = require("path");

const { parsa } = require("./parser");
const { läggUtModell } = require("./layout");
const { genereraDrawioXml } = require("./xml");

const { parsaSekvens } = require("./sekvens_parser");
const { läggUtSekvens } = require("./sekvens_layout");
const { genereraSekvensXml } = require("./sekvens_xml");

const { parsaKomponent } = require("./komponent_parser");
const { läggUtKomponentModell } = require("./komponent_layout");
// Komponentmodellen har samma form ({noder, kanter}) som use-case-modellen
// — återanvänder genereraDrawioXml direkt, inget eget XML-spår behövs.

const { parsaAktivitet } = require("./aktivitet_parser");
const { läggUtAktivitetModell } = require("./aktivitet_layout");
// Samma sak gäller aktivitetsmodellen — egen parser och layout (flödet är
// vertikalt och styrs av if/else-grenar), men formen ({noder, kanter}) är
// densamma så genereraDrawioXml återanvänds rakt av.

const { parsaKlass } = require("./klass_parser");
const { läggUtKlassModell } = require("./klass_layout");
const { genereraKlassXml } = require("./klass_xml");

const { parsaTillstånd } = require("./tillstand_parser");
const { läggUtTillståndModell } = require("./tillstand_layout");
// Tillståndsmodellen delar formen ({noder, kanter}) med use-case/komponent/aktivitet
// — genereraDrawioXml (xml.js) återanvänds rakt av.
// Klassdiagrammet har en rikare modell ({klasser, kanter, paket}) och
// egna swimlane-celler med barnfack — kräver ett eget XML-spår.

const { parsaER } = require("./er_parser");
const { läggUtERModell } = require("./er_layout");
const { genereraERXml } = require("./er_xml");
// ER-diagrammet har sin egen modell ({entiteter, kanter}) och eget XML-spår
// med kråkfot-kantstilar och tabellentiteter.

const { parsaObjekt } = require("./objekt_parser");
const { läggUtObjektModell } = require("./objekt_layout");
const { genereraObjektXml } = require("./objekt_xml");
// Objektdiagrammet har sin egen modell ({objekt, kanter}) och eget XML-spår
// med UML-understruken rubrik (<u>instans : Klass</u>).

const { parsaDeployment } = require("./deployment_parser");
const { läggUtDeploymentModell } = require("./deployment_layout");
const { genereraDeploymentXml } = require("./deployment_xml");
// Deployment-diagrammet har {noder, kanter}-modell men kräver eget XML-spår
// (deployment_xml.js) för rekursiv containerhantering — godtycklig nästling.

const { parsaTiming } = require("./timing_parser");
const { genereraTidingsXml } = require("./timing_xml");
// Timing-diagrammet har sin egen modell ({deltagare, tillstånd, pilar}) och eget
// XML-spår (timing_xml.js) med horisontell tidslinje, tillståndssegment och sync-pilar.

const { parsaMindmapEllerWbs } = require("./mindmap_parser");
const { läggUtMindmap } = require("./mindmap_layout");
const { genereraMindmapXml } = require("./mindmap_xml");
const { läggUtWbs } = require("./wbs_layout");
const { genereraWbsXml } = require("./wbs_xml");
// MindMap och WBS delar parser — skiljs åt i layout (radial vs. top-down).

const { parsaNetwork } = require("./network_parser");
const { genereraNetworkXml } = require("./network_xml");
// Nätverksdiagram (nwdiag): horisontella nätverksband med serverikoner.

const { parsaGantt } = require("./gantt_parser");
const { genereraGanttXml } = require("./gantt_xml");
// Gantt-diagram: uppgiftsrader med staplar på en tidslinje.

const { tolkaSkinparam } = require("./skinparam");
const { genereraSaknadeShapesXml, hittaSaknadeTyper } = require("./saknade_shapes");

// Avgör diagramtyp utifrån vilka nyckelord som förekommer i källan.
// "participant"/meddelandepilar med ":" är ett starkt sekvenstecken;
// "usecase" är ett starkt use-case-tecken. Vid oklarhet: use case
// (det ursprungliga, mer utforskade läget).
function gissaDiagramTyp(källkod) {
    // OBS: "database"/"entity"/m.fl. är tvetydiga — i sekvensdiagram är de
    // deltagartyper ("database alias"), men i komponentdiagram kan samma ord
    // inleda en behållardeklaration ("database "Namn" as alias {"). En rad som
    // slutar med "{" är alltså INTE ett sekvens-deltagartecken — exkludera den.
    const harParticipant = källkod.split(/\r?\n/).some((rad) =>
        /^\s*(participant|actor\s+\S+\s+as|boundary|control|entity|database|collections|queue)\b/i.test(rad)
        && !/\{\s*$/.test(rad)
    );
    const harUsecase = /^\s*(usecase|\(.+\)\s+as\s+\w+)/im.test(källkod);
    // Klammerkomponenter "[Namn]" och "component"/"interface"-deklarationer
    // är de starkaste, mest entydiga komponentdiagram-tecknen — de förekommer
    // inte alls i use-case- eller sekvenssyntax.
    const harKomponent = /^\s*(\[[^\]]+\]|component\b|interface\b|\(\)\s)/im.test(källkod);
    // Aktivitetsdiagrammets ":Text;"-aktiviteter och "start"/"stop"/"if...then"
    // är lika entydiga — de förekommer inte i någon av de andra diagramtyperna.
    const harAktivitet = /^\s*(:.+;\s*$|start$|stop$|if\s*\(.*\)\s*then\b)/im.test(källkod);
    // Klassdiagrammets tydligaste tecken: "class"/"abstract class"/"enum"-nyckelord
    // ELLER klass-specifika pilformer (<|--, --|>, *--, o--) som inte förekommer
    // i någon annan diagramtyp. "interface" ENSAMT räknas inte — det används
    // även i komponentdiagram.
    // OBS: kråkfot-notationen (||--o{, |}--||) innehåller delsträngar som "o--" och "--o"
    // — vi undviker falskt positiv genom att kräva att "o--"/"--o" INTE omges av kråkfotsymboler.
    // Lookbehind (?<![|{})]) och lookahead (?![{|}]) är stödda i V8 (Node 10+).
    const harKlassNyckelord = /^\s*(?:abstract\s+)?class\b/im.test(källkod)
        || /^\s*enum\s+\w/im.test(källkod);
    const harKlassPil = /<\|--|--\|>|\*--|--\*|(?<![|{}\]])o--(?![{|}])|(?<![|{}\]])--o(?![{|}])/.test(källkod);
    const harKlass = harKlassNyckelord || harKlassPil;
    // Tillståndsdiagrammets tydligaste tecken: [*]-pseudotillståndet är helt
    // unikt för state-syntax och förekommer inte i någon annan diagramtyp.
    const harTillstånd = /\[\*\]/.test(källkod)
        || /^\s*state\s+\w/im.test(källkod);
    // Objektdiagrammets tydligaste tecken: "object"-nyckelordet ensamt (inte
    // i kombination med klass-nyckelord). Instansrader "alias : Klass" kan
    // förekomma i andra diagram men "object"-nyckelordet gör det entydigt.
    const harObjekt = /^\s*object\s+/im.test(källkod);
    // @startmindmap / @startwbs / @startgantt — helt entydiga direktiv.
    const harMindmap = /^@startmindmap/im.test(källkod);
    const harWbs     = /^@startwbs/im.test(källkod);
    const harGantt   = /^@startgantt/im.test(källkod)
        || (/\[.+\]\s+lasts\s+\d+/im.test(källkod) && /project\s+starts/im.test(källkod));
    // nwdiag: "nwdiag {" eller "@startnwdiag"
    const harNetwork = /^@startnwdiag/im.test(källkod)
        || /^\s*nwdiag\s*\{/im.test(källkod);
    // Timing-diagrammets tydligaste tecken: "robust"/"concise"-nyckelorden
    // kombinerat med "@N"-tidsmarkeringar. Dessa förekommer INTE i andra diagramtyper.
    const harTiming = /^\s*(robust|concise)\s+/im.test(källkod)
        && /^@\d/im.test(källkod);
    // ER-diagrammets tydligaste tecken: kråkfot-notationen (||--o{ m.fl.) är
    // helt unik för ER — förekommer inte i andra diagramtyper.
    // Vi skiljer på det starka kråkfot-signalen (kan slå igenom harKlass)
    // och det svagare "entity"-nyckelordet (vinner bara om harKlass är falskt).
    const harERKråkfot = /[\|o\{\}]{1,2}-{2,}[\|o\{\}]{1,2}/.test(källkod);
    const harER = harERKråkfot || (/^\s*entity\s+/im.test(källkod) && !harParticipant);

    // De entydiga tecknen (komponent, aktivitet) går först och vinner även om
    // harParticipant råkar slå till på en tvetydig rad ("database"/"entity" m.fl.
    // är genuint tvetydiga — de finns både som sekvensdeltagartyper OCH som
    // komponentdiagrammets behållarnyckelord).
    // @start*-direktiv är helt entydiga — detekteras allra först.
    if (harMindmap) return { typ: "mindmap", säker: true };
    if (harWbs)     return { typ: "wbs",     säker: true };
    if (harGantt)   return { typ: "gantt",   säker: true };
    if (harNetwork) return { typ: "network", säker: true };
    // Timing: "robust"/"concise" + "@N" är helt unikt.
    if (harTiming) return { typ: "timing", säker: true };
    if (harAktivitet && !harUsecase && !harKomponent && !harKlass) return { typ: "aktivitet", säker: true };
    // "object"-nyckelordet är unikt för objektdiagram.
    if (harObjekt && !harAktivitet && !harKlass && !harTillstånd) return { typ: "objekt", säker: true };
    // [*] är unikt för tillståndsdiagram — detekteras före klass/komponent.
    if (harTillstånd && !harAktivitet && !harUsecase && !harKlass) return { typ: "tillstånd", säker: true };
    // Kråkfot-notationen är helt unik för ER och vinner även om harKlass råkar
    // vara true (klass-pilregexen kan falskt triggas av delsträngar i kråkfoten).
    if (harERKråkfot && !harAktivitet && !harTillstånd) return { typ: "er", säker: true };
    // Svagare ER-signal (entity-nyckelordet) — vinner bara när inga klass-tecken finns.
    if (harER && !harAktivitet && !harTillstånd && !harKlass) return { typ: "er", säker: true };
    // Deployment: "node"-nyckelordet, eller cloud/folder/frame som inte förekommer
    // i andra typer. Detekteras efter ER och klass (som har starkare signaler).
    const harDeployment = /^\s*node\s+/im.test(källkod)
        || /^\s*(cloud|folder|frame)\s+/im.test(källkod)
        || (/^\s*artifact\s+/im.test(källkod) && !harKlass && !harER);
    if (harDeployment && !harAktivitet && !harTillstånd && !harKlass && !harER) return { typ: "deployment", säker: true };
    // Klass detekteras före komponent: "class"-nyckelordet förekommer inte i
    // komponentdiagram, och klass-pilformer (<|--, o-- m.fl.) är helt entydiga.
    if (harKlass && !harAktivitet && !harUsecase) return { typ: "klass", säker: true };
    if (harKomponent && !harUsecase && !harKlass) return { typ: "komponent", säker: true };
    if (harUsecase && !harParticipant) return { typ: "usecase", säker: true };
    if (harParticipant && !harUsecase) return { typ: "sekvens", säker: true };

    // Båda eller ingendera — leta efter sekvensens typiska "A -> B : text"-form
    // i kombination med "participant", som inte förekommer i use-case-syntax.
    if (/^\s*participant\b/im.test(källkod)) return { typ: "sekvens", säker: true };

    // Inget av våra fyra kända, entydiga tecken slog till — sista utväg är
    // gissningen "use case". OSÄKER: källan kan lika gärna vara en
    // diagramtyp vi inte byggt stöd för än (klass, tillstånd, deployment, …)
    // — anroparen bör varna användaren om detta (se `säker`-fältet).
    return { typ: "usecase", säker: false };
}

// Bygger en sekvensmodells deltagare om till samma { id, typ, etikett, förälder }
// -form som saknade_shapes.js förväntar sig — så att samma granskningslogik
// kan återanvändas oförändrad för båda diagramtyperna.
function deltagareSomNoder(sekvensModell) {
    return sekvensModell.deltagare.map((d) => ({
        id: d.id,
        typ: d.stereotyp,
        etikett: d.etikett,
        förälder: null,
    }));
}

const KÄNDA_TYPER = ["usecase", "sekvens", "komponent", "aktivitet", "klass", "tillstånd", "er", "deployment", "objekt", "timing", "mindmap", "wbs", "network", "gantt"];

// Kärnan i konverteringen — fristående från CLI:t (filinläsning/utskrift)
// så att den kan återanvändas av t.ex. en lokal HTTP-server för editorn.
// Returnerar { typ, säker, sammanfattning, xml, saknadeXml, saknadeTyper, skinparam }.
//   `säker`: false betyder att diagramtypen GISSADES (inget av våra fyra
//   kända, entydiga tecken slog till) — anroparen bör då varna användaren
//   om att resultatet kan bli fel, se konverteringsknappen i editorn.
function konverteraKälla(källkod, alternativ) {
    const opts = alternativ || {};
    let typ = opts.typ || null;
    let säker = true;

    if (!typ) {
        const gissning = gissaDiagramTyp(källkod);
        typ = gissning.typ;
        säker = gissning.säker;
    }
    if (!KÄNDA_TYPER.includes(typ)) {
        throw new Error(`Okänd diagramtyp "${typ}" — använd ${KÄNDA_TYPER.map((t) => `"${t}"`).join(", ")}.`);
    }

    // --- Steg 1: checka skinparam (gemensamt för alla typer) ---
    const skinparam = tolkaSkinparam(källkod);

    let xml;
    let nodLikaPoster; // för saknade-shapes-granskningen
    let sammanfattning;

    if (typ === "usecase") {
        const modell = parsa(källkod);
        const positioner = läggUtModell(modell);
        xml = genereraDrawioXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder;
        sammanfattning = `use case (${modell.noder.length} noder, ${modell.kanter.length} kanter)`;
    } else if (typ === "sekvens") {
        const modell = parsaSekvens(källkod);
        const layout = läggUtSekvens(modell);
        xml = genereraSekvensXml(modell, layout, { skinparam });
        nodLikaPoster = deltagareSomNoder(modell);
        sammanfattning = `sekvens (${modell.deltagare.length} deltagare, ${modell.meddelanden.length} meddelanden)`;
    } else if (typ === "komponent") {
        // Komponentmodellen delar form med use-case-modellen ({noder, kanter})
        // — samma generiska XML-generator (xml.js) återanvänds rakt av.
        const modell = parsaKomponent(källkod);
        const positioner = läggUtKomponentModell(modell);
        xml = genereraDrawioXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder;
        sammanfattning = `komponent (${modell.noder.length} noder, ${modell.kanter.length} kanter)`;
    } else if (typ === "aktivitet") {
        // Aktivitetsmodellen delar form med use-case-modellen ({noder, kanter})
        // — samma generiska XML-generator återanvänds.
        const modell = parsaAktivitet(källkod);
        const positioner = läggUtAktivitetModell(modell);
        xml = genereraDrawioXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder;
        sammanfattning = `aktivitet (${modell.noder.length} noder, ${modell.kanter.length} kanter)`;
    } else if (typ === "tillstånd") {
        // Tillståndsmodellen delar formen {noder, kanter} — xml.js återanvänds.
        // "gräns"-noder = composite states (containers), "start"/"slut"/"tillstånd"
        // hämtas från katalogen direkt (alla är INFÖDD).
        const modell = parsaTillstånd(källkod);
        const positioner = läggUtTillståndModell(modell);
        xml = genereraDrawioXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder;
        sammanfattning = `tillstånd (${modell.noder.filter(n => !["start","slut"].includes(n.typ)).length} tillstånd, ${modell.kanter.length} övergångar)`;
    } else if (typ === "objekt") {
        const modell     = parsaObjekt(källkod);
        const positioner = läggUtObjektModell(modell);
        xml = genereraObjektXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.objekt.map((o) => ({
            id: o.id, typ: "objekt", etikett: o.etikett, förälder: null,
        }));
        sammanfattning = `objekt (${modell.objekt.length} objekt, ${modell.kanter.length} kanter)`;
    } else if (typ === "deployment") {
        const modell    = parsaDeployment(källkod);
        const positioner = läggUtDeploymentModell(modell);
        xml = genereraDeploymentXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder;
        sammanfattning = `deployment (${modell.noder.length} noder, ${modell.kanter.length} kanter)`;
    } else if (typ === "mindmap") {
        const modell     = parsaMindmapEllerWbs(källkod);
        const positioner = läggUtMindmap(modell);
        xml = genereraMindmapXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder.map((n) => ({ id: n.id, typ: "mindmap_nod", etikett: n.text, förälder: null }));
        sammanfattning = `mindmap (${modell.noder.length} noder)`;
    } else if (typ === "wbs") {
        const modell     = parsaMindmapEllerWbs(källkod);
        const positioner = läggUtWbs(modell);
        xml = genereraWbsXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.noder.map((n) => ({ id: n.id, typ: "wbs_nod", etikett: n.text, förälder: null }));
        sammanfattning = `wbs (${modell.noder.length} noder)`;
    } else if (typ === "network") {
        const modell = parsaNetwork(källkod);
        xml = genereraNetworkXml(modell, null, { skinparam });
        nodLikaPoster = modell.noder.map((n) => ({ id: n.id, typ: "server", etikett: n.etikett, förälder: null }));
        sammanfattning = `network (${modell.nätverk.length} nätverk, ${modell.noder.length} noder)`;
    } else if (typ === "gantt") {
        const modell = parsaGantt(källkod);
        xml = genereraGanttXml(modell, null, { skinparam });
        nodLikaPoster = modell.uppgifter.map((u) => ({ id: u.id, typ: "gantt_uppgift", etikett: u.etikett, förälder: null }));
        sammanfattning = `gantt (${modell.uppgifter.length} uppgifter)`;
    } else if (typ === "timing") {
        // Timing-diagram — horisontell tidslinje med tillståndssegment och sync-pilar.
        // Eget XML-spår (timing_xml.js).
        const modell = parsaTiming(källkod);
        xml = genereraTidingsXml(modell, { skinparam });
        nodLikaPoster = modell.deltagare.map((d) => ({
            id: d.id, typ: "timing_deltagare", etikett: d.etikett, förälder: null,
        }));
        sammanfattning = `timing (${modell.deltagare.length} deltagare, ${modell.tillstånd.length} tillståndsändringar)`;
    } else if (typ === "er") {
        // ER-diagram — entiteter med attributrader, kråkfot-kantstilar.
        // Eget XML-spår (er_xml.js).
        const modell    = parsaER(källkod);
        const positioner = läggUtERModell(modell);
        xml = genereraERXml(modell, positioner, { skinparam });
        nodLikaPoster = modell.entiteter.map((e) => ({
            id:      e.id,
            typ:     "entitet",
            etikett: e.etikett,
            förälder: null,
        }));
        sammanfattning = `er (${modell.entiteter.length} entiteter, ${modell.kanter.length} relationer)`;
    } else {
        // Klassdiagram — rik modell med stereotyper, attribut, metoder och paket.
        // Eget XML-spår (klass_xml.js) som genererar swimlane-celler med barnfack.
        const modell = parsaKlass(källkod);
        const positioner = läggUtKlassModell(modell);
        xml = genereraKlassXml(modell, positioner, { skinparam });
        // Konvertera till det format saknade_shapes.js förväntar sig ({id, typ, etikett}).
        // "klass" är INFÖDD i katalogen; "abstrakt"/"gränssnitt"/"enum" finns inte
        // i katalogen och ignoreras tyst — inga platshållarfiler genereras.
        nodLikaPoster = modell.klasser.map((k) => ({
            id: k.id,
            typ: k.stereotyp,
            etikett: k.etikett,
            förälder: k.förälder,
        }));
        sammanfattning = `klass (${modell.klasser.length} klasser, ${modell.kanter.length} kanter)`;
    }

    // --- Steg 3: generera ev. saknade-shapes-granskningsfil ---
    // (saknade_shapes.js arbetar mot { noder } — vi ger den en likadan struktur
    // oavsett diagramtyp, se deltagareSomNoder ovan.)
    const liknandeModell = { noder: nodLikaPoster, kanter: [] };
    const saknadeTyper = hittaSaknadeTyper(liknandeModell);
    const saknadeXml = genereraSaknadeShapesXml(liknandeModell);

    return { typ, säker, sammanfattning, xml, saknadeXml, saknadeTyper, skinparam };
}

function main(argv) {
    const args = argv.slice(2);
    if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
        process.stderr.write(
            "Användning: node konvertera.js <indata.puml> [-o <utdata.drawio>] [--typ usecase|sekvens|komponent|aktivitet]\n" +
            "Diagramtyp gissas automatiskt om --typ inte anges.\n" +
            "Skriver huvud-XML till stdout om ingen -o anges.\n" +
            "Genererar dessutom <utdata>-saknade-shapes.drawio om PUML-källan\n" +
            "innehåller notationstyper utan bra inbyggd drawio-motsvarighet.\n"
        );
        process.exit(args.length === 0 ? 1 : 0);
    }

    const inFil = args[0];
    let utFil = null;
    const oIndex = args.indexOf("-o");
    if (oIndex !== -1 && args[oIndex + 1]) utFil = args[oIndex + 1];

    let typ = null;
    const typIndex = args.indexOf("--typ");
    if (typIndex !== -1 && args[typIndex + 1]) typ = args[typIndex + 1];

    const källkod = fs.readFileSync(path.resolve(inFil), "utf8");

    let resultat;
    try {
        resultat = konverteraKälla(källkod, { typ });
    } catch (fel) {
        process.stderr.write(`${fel.message}\n`);
        process.exit(1);
    }

    const { typ: avgjordTyp, säker, sammanfattning, xml, saknadeXml, saknadeTyper, skinparam } = resultat;
    process.stderr.write(`Diagramtyp: ${sammanfattning}\n`);
    if (!säker) {
        process.stderr.write(
            `OBS: diagramtypen kunde inte avgöras säkert (gissning: "${avgjordTyp}") — ` +
            `källan kan vara en typ vi inte byggt stöd för än. Resultatet kan bli fel.\n`
        );
    }

    if (utFil) {
        const utPath = path.resolve(utFil);
        fs.writeFileSync(utPath, xml, "utf8");
        process.stderr.write(`Skrev ${utFil}\n`);

        if (Object.keys(skinparam.stilar).length || Object.keys(skinparam.kantStil).length) {
            process.stderr.write(
                `Tillämpade skinparam-stilar: ${JSON.stringify({ ...skinparam.stilar, __kanter__: skinparam.kantStil })}\n`
            );
        }

        if (saknadeXml) {
            const saknadeFil = utPath.replace(/(\.[^.]+)?$/, (ändelse) => `-saknade-shapes${ändelse || ".drawio"}`);
            fs.writeFileSync(saknadeFil, saknadeXml, "utf8");
            process.stderr.write(
                `Hittade ${saknadeTyper.length} notationstyp(er) utan bra inbyggd drawio-motsvarighet ` +
                `(${saknadeTyper.map((s) => s.typNyckel).join(", ")}).\n` +
                `Skrev granskningsfil: ${path.basename(saknadeFil)}\n` +
                `→ Öppna den, granska/justera platshållarna, markera och välj ` +
                `"Lägg till i kladdblocket" för dem du vill spara.\n`
            );
        } else {
            process.stderr.write("Alla använda notationstyper har bra inbyggda drawio-motsvarigheter — inget extra att granska.\n");
        }
    } else {
        process.stdout.write(xml + "\n");
    }
}

module.exports = { konverteraKälla, gissaDiagramTyp, KÄNDA_TYPER };

if (require.main === module) {
    main(process.argv);
}
