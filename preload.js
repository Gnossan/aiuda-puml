"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Exponerar ett minimalt API till renderaren via contextBridge.
// Inga Node-API:er läcker in i renderer-kontexten.
contextBridge.exposeInMainWorld("aiuda", {
    // Renderar PlantUML-källkod till SVG via inbundlad Java (pipe-läge).
    // Returnerar ett Promise<string> med SVG-innehållet.
    renderaPuml: (källkod) => ipcRenderer.invoke("rendera-puml", källkod),
});
