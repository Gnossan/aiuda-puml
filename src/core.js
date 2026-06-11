// core.js — delade konstanter, DOM-referenser och state för editorn.
//
// Laddas FÖRST i index.html eftersom övriga moduler (highlight.js,
// preview.js, fil_io.js, paneler.js, ai_chatt.js) refererar till dessa
// const-deklarationer redan vid sin egen toppnivåkod (t.ex.
// preview.js kopplar klick-lyssnare på zoom-knapparna direkt).

// Interna typnycklar (speglar konvertera.js KÄNDA_TYPER) — används i typ-dialogen.
const DIAGRAM_TYPER = [
    "usecase", "sekvens", "komponent", "aktivitet", "klass",
    "tillstånd", "er", "deployment", "objekt", "timing",
    "mindmap", "wbs", "network", "gantt",
];
// Läsbara etiketter för visning i felmeddelanden
const STÖDDA_DIAGRAMTYPER = ["usecase (use case)", "sekvens", "komponent", "aktivitet", "klass", "tillstånd", "er", "deployment", "objekt", "timing", "mindmap", "wbs", "network (nwdiag)", "gantt"];
const FÖRDRÖJNING_MS = 400; // debounce — rendera inte vid varje tangenttryck
const LAGRINGSNYCKEL = "puml-editor:senaste-kod";

const kodEl = document.getElementById("kod");
const highlightEl = document.querySelector("#highlight code");
const bildEl = document.getElementById("bild");
const statusEl = document.getElementById("status");
const filInputEl = document.getElementById("fil-input");


const förhandsvisningEl = document.querySelector(".förhandsvisning");
const zoomaUtKnapp = document.getElementById("zooma-ut-knapp");
const zoomaInKnapp = document.getElementById("zooma-in-knapp");
const zoomNivåKnapp = document.getElementById("zoom-nivå-knapp");

const STARTKOD = `@startuml
Alice -> Bob: Hej, hur är läget?
Bob --> Alice: Bra! Och du?
@enduml`;

// Den senast lyckat renderade SVG-koden — används av export-knapparna.
let senasteSvg = null;
let senasteFilnamn = "diagram";
