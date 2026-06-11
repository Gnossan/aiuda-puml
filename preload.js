"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Exponerar ett minimalt API till renderaren via contextBridge.
// Inga Node-API:er läcker in i renderer-kontexten.
contextBridge.exposeInMainWorld("aiuda", {
    // Renderar PlantUML-källkod till SVG via inbundlad Java (pipe-läge).
    renderaPuml: (källkod) =>
        ipcRenderer.invoke("rendera-puml", källkod),

    // Konverterar PUML-källkod till draw.io XML.
    konvertera: (källkod, typ) =>
        ipcRenderer.invoke("konvertera", { källkod, typ: typ || null }),

    // Returnerar { anthropic: bool, openai: bool } — vilka nycklar finns?
    aiStatus: () =>
        ipcRenderer.invoke("ai-status"),

    // Skickar ett AI-anrop till Anthropic eller OpenAI.
    ai: (provider, model, messages) =>
        ipcRenderer.invoke("ai", { provider, model, messages }),

    // Sparar en API-nyckel krypterat (Electron safeStorage / OS-nyckelring).
    sparaApiNyckel: (provider, nyckel) =>
        ipcRenderer.invoke("spara-api-nyckel", { provider, nyckel }),

    // Menyhändelser från main-processen → renderer.
    onMeny:     (cb) => ipcRenderer.on("meny",           (_, h) => cb(h)),
    onÖppnaFil: (cb) => ipcRenderer.on("meny-öppna-fil", (_, d) => cb(d)),

    // Spara som: renderer skickar innehåll, main visar dialog och skriver.
    sparaSom: (innehåll, föreslagetNamn) =>
        ipcRenderer.invoke("spara-som", { innehåll, föreslagetNamn }),
});
