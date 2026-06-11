// app.js — kopplar ihop textarean med PlantUML och AI via Electron IPC.
// Förhandsgranskning, konvertering och AI-anrop sker via window.aiuda.*
// (contextBridge → IPC → main-processen) — ingen separat server behövs.
//
// Funktionaliteten är uppdelad i:
//   - core.js       — delade konstanter, DOM-referenser och state
//   - highlight.js  — syntax-highlighting
//   - preview.js    — rendering, export, zoom/panorering
//   - fil_io.js     — spara/öppna, mallar, autosparande
//   - paneler.js    — storlek på de tre panelerna
//   - ai_chatt.js   — AI-inställningar och chatt
// Filerna laddas i den ordningen i index.html, med app.js sist eftersom
// initieringen nedan anropar funktioner från samtliga.

// ----------------------------------------------------------------------
// Koppla ihop allt
// ----------------------------------------------------------------------

kodEl.addEventListener("input", () => {
    uppdateraHighlight();
    schemaläggRendering();
    sparaTillLagring();
});
kodEl.addEventListener("scroll", synkaScroll);

filInputEl.addEventListener("change", hanteraFilval);

kodEl.value = STARTKOD;
sparaTillLagring();
uppdateraHighlight();
rendera();
