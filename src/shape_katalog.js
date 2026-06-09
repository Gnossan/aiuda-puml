// Referenskatalog: för varje PlantUML-notationstyp vi känner till,
// ange om drawio redan har en bra INBYGGD shape för den (status "infödd"),
// eller om vi behöver generera en platshållare att granska/lägga i
// Anteckningsblocket (status "saknas").
//
// Källa för "infödd"-bedömningarna: grep mot
// drawio_th/src/main/webapp/js/grapheditor/Shapes.js (registerShape-anrop)
// samt drawios standardformer (ellipse, actor, rectangle m.fl. behöver
// ingen separat registrering).
//
// `stil` är en mall för drawio-stilsträngen. Plats för köra in
// skinparam-färger sker i xml.js — denna katalog ger BAS-stilen.

"use strict";

const STATUS = {
    INFÖDD: "infödd",   // drawio har redan en bra motsvarighet — inget genereringsbehov
    SAKNAS: "saknas",   // ingen bra direkt motsvarighet — generera platshållare för granskning
};

const KATALOG = {
    aktör: {
        status: STATUS.INFÖDD,
        stil: "shape=actor;whiteSpace=wrap;html=1;outlineConnect=0;",
        kommentar: "Inbyggd standardform (shape=actor) — matchar PlantUML:s streckgubbe väl.",
    },
    usecase: {
        status: STATUS.INFÖDD,
        stil: "ellipse;whiteSpace=wrap;html=1;",
        kommentar: "Geometrin är bara en ellips — drawios standardform räcker, stilen gör jobbet.",
    },
    gräns: {
        status: STATUS.INFÖDD,
        stil: "rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;align=left;container=1;collapsible=0;fillColor=none;",
        kommentar: "Systemgräns/paket — vanlig rektangel-container, ev. shape=folder för paket.",
    },
    komponent: {
        status: STATUS.INFÖDD,
        stil: "shape=component;whiteSpace=wrap;html=1;",
        kommentar: "Inbyggd ComponentShape (Shapes.js, rad ~3183) — ritar exakt UML-kontaktdonsikonen.",
    },
    gränssnitt: {
        status: STATUS.INFÖDD,
        stil: "shape=lollipop;whiteSpace=wrap;html=1;direction=north;",
        kommentar: "Inbyggd LollipopShape (Shapes.js, rad ~3043) — \"klubb-på-pinne\"-notationen.",
    },
    anteckning: {
        status: STATUS.INFÖDD,
        stil: "shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;",
        kommentar: "Inbyggd NoteShape (Shapes.js, rad ~700) — anteckningslapp med vikt hörn.",
    },
    // --- Objektdiagram ---
    objekt: {
        status: STATUS.INFÖDD,
        stil: "swimlane;fontStyle=0;align=center;startSize=36;container=1;collapsible=0;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;",
        kommentar:
            "UML-objekt renderas som swimlane med understruket instansnamn (<u>namn : Klass</u>). " +
            "Samma approach som klass men med blå fill och ingen metodsektion.",
    },
    // --- Deployment-diagram ---
    molnet: {
        status: STATUS.INFÖDD,
        // OBS: INTE "ellipse;shape=cloud" — shape=cloud räcker och ellipse konfliktar.
        // container=1 krävs för att draw.io ska behandla formen som en äkta container
        // (rätt properties-panel, drag-in av element, auto-resize).
        stil: "shape=cloud;whiteSpace=wrap;html=1;container=1;collapsible=0;verticalAlign=top;",
        kommentar: "Inbyggd CloudShape (Shapes.js) — molnformen för Internet/externt system.",
    },
    mapp: {
        status: STATUS.INFÖDD,
        stil: "shape=folder;whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacingTop=4;container=1;collapsible=0;",
        kommentar: "Inbyggd FolderShape — mapp/katalog.",
    },
    ram: {
        status: STATUS.INFÖDD,
        stil: "swimlane;fontStyle=0;align=center;startSize=26;container=1;collapsible=0;html=1;fillColor=none;strokeColor=#666666;",
        kommentar: "Ram/frame — swimlane-container med transparent bakgrund.",
    },
    paket: {
        status: STATUS.INFÖDD,
        stil: "shape=folder;whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacingTop=4;fillColor=#fff2cc;strokeColor=#d6b656;container=1;collapsible=0;",
        kommentar: "Paket/namespace — folder-shape i gult (PlantUML-konvention).",
    },
    rektangel: {
        status: STATUS.INFÖDD,
        stil: "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#555555;container=1;collapsible=0;",
        kommentar: "Enkel rektangel — boundary/rectangle/card.",
    },
    entitet: {
        status: STATUS.INFÖDD,
        stil:
            "swimlane;fontStyle=1;align=center;startSize=30;container=1;collapsible=0;html=1;" +
            "fillColor=#f0f0f0;strokeColor=#555555;",
        kommentar:
            "ER-entitet renderas som en swimlane-tabell med attributrader — same approach " +
            "as klass. Kråkfot-pilar (ERmandOne, ERzeroToMany m.fl.) är inbyggda i drawio.",
    },
    klass: {
        status: STATUS.INFÖDD,
        stil: "swimlane;fontStyle=0;align=center;startSize=26;container=1;collapsible=0;html=1;",
        kommentar:
            "Drawio har ingen registrerad 'UML-klass'-shape, men swimlane + barnceller " +
            "(attribut-/metodfack) ger ett native, redigerbart resultat. " +
            "klass_xml.js genererar swimlane-cellen med avdelingslinjer och textrader direkt.",
    },
    artefakt: {
        status: STATUS.SAKNAS,
        stil: "shape=note;whiteSpace=wrap;html=1;size=20;",
        kommentar:
            "PlantUML:s 'artifact' är en rektangel med ett litet dokumentmärke i hörnet. " +
            "Ingen exakt inbyggd motsvarighet — note-shapen är närmast men har fel hörn. " +
            "Genereras som platshållare.",
    },
    nod: {
        status: STATUS.INFÖDD,
        // container=1 gör att draw.io visar rätt properties och hanterar barn korrekt.
        // verticalAlign=top placerar etiketten i toppen av kuben (som PlantUML gör).
        stil: "shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundColor=#ffffff;darkOpacity=0.05;container=1;collapsible=0;verticalAlign=top;",
        kommentar: "Inbyggd CubeShape (Shapes.js, rad ~433) — 3D-nodlådan i deployment-diagram.",
    },
    databas: {
        status: STATUS.INFÖDD,
        // Databas i deployment kan innehålla artefakter/komponenter — container=1 behövs.
        stil: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;container=1;collapsible=0;verticalAlign=top;",
        kommentar: "Inbyggd CylinderShape3 (Shapes.js, rad ~870) — databascylindern.",
    },
    tillstånd: {
        status: STATUS.INFÖDD,
        stil: "rounded=1;whiteSpace=wrap;html=1;arcSize=40;",
        kommentar:
            "Vanliga tillstånd är bara rundade rektanglar. Start/slut har egna inbyggda " +
            "shapes (startState/endState, Shapes.js rad ~3290–3301).",
    },
    // --- Aktivitetsdiagram ---
    aktivitet: {
        status: STATUS.INFÖDD,
        stil: "rounded=1;whiteSpace=wrap;html=1;arcSize=40;",
        kommentar: "PlantUML:s ':Text;'-aktivitet är en rundad rektangel — samma geometri som 'tillstånd'.",
    },
    start: {
        status: STATUS.INFÖDD,
        stil: "ellipse;whiteSpace=wrap;html=1;fillColor=#000000;strokeColor=#000000;",
        kommentar: "Initial-noden är en fylld svart cirkel — vanlig ellips med svart fyllning räcker.",
    },
    slut: {
        status: STATUS.INFÖDD,
        stil: "shape=doubleEllipse;whiteSpace=wrap;html=1;fillColor=#000000;strokeColor=#000000;margin=10;",
        kommentar:
            "Slut-noden (activity final) är en \"tjuröga\"-cirkel — inbyggda doubleEllipse " +
            "(samma shape som UML-slutläge) ger den dubbla ringen, fylld mitt i.",
    },
    beslut: {
        status: STATUS.INFÖDD,
        stil: "rhombus;whiteSpace=wrap;html=1;",
        kommentar: "if/then/else-grenpunkten är en romb — drawios inbyggda rhombus-grundform.",
    },
    // --- Sekvensdiagram: livslinje-stereotyper ---
    // Geometrin är gemensam (umlLifeline, header + streckad linje nedåt) —
    // det som skiljer stereotyperna åt är vilken "inre form" som ritar
    // header-boxen (styrs av style-attributet participant=...).
    // Faktisk stilsträng byggs av sekvens_xml.js (kräver beräknad höjd);
    // här markerar vi bara om en bra inre form finns inbyggd.
    deltagare: {
        status: STATUS.INFÖDD,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;",
        kommentar: "Vanlig livslinje (umlLifeline) med rektangulär header — rakt motsvarande PlantUML:s 'participant'.",
    },
    gräns_lifeline: {
        status: STATUS.INFÖDD,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;participant=umlBoundary;",
        kommentar: "Livslinje med inbyggd UmlBoundaryShape som header — matchar PlantUML:s 'boundary'-cirkel-med-streck.",
    },
    kontroll: {
        status: STATUS.INFÖDD,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;participant=umlControl;",
        kommentar: "Livslinje med inbyggd UmlControlShape (pil-i-cirkel) — matchar PlantUML:s 'control'.",
    },
    entitet: {
        status: STATUS.INFÖDD,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;participant=umlEntity;",
        kommentar: "Livslinje med inbyggd UmlEntityShape (cirkel med understrykning) — matchar PlantUML:s 'entity'.",
    },
    databas_lifeline: {
        status: STATUS.SAKNAS,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;",
        kommentar:
            "PlantUML ritar 'database' i sekvensdiagram som en cylinderikon ovanför livslinjen. " +
            "umlLifeline har ingen inbyggd cylinder-'participant'-form — genereras som vanlig " +
            "rektangulär platshållare att komplettera med en cylinderikon manuellt.",
    },
    samling: {
        status: STATUS.SAKNAS,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;",
        kommentar:
            "PlantUML:s 'collections' ritas som tre staplade rektanglar ovanför livslinjen. " +
            "Ingen inbyggd motsvarighet i umlLifeline — platshållare med vanlig header.",
    },
    kö: {
        status: STATUS.SAKNAS,
        stil: "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;",
        kommentar:
            "PlantUML:s 'queue' ritas som en kösymbol (avrundad öppen rektangel) ovanför " +
            "livslinjen. Ingen inbyggd motsvarighet i umlLifeline — platshållare.",
    },
};

function slåUppKatalogpost(typNyckel) {
    return KATALOG[typNyckel] || null;
}

module.exports = { KATALOG, STATUS, slåUppKatalogpost };
