"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
app.name = "AIuda PUML";
const path        = require("path");
const { spawn, execFile } = require("child_process");
const fs          = require("fs");
const { autoUpdater } = require("electron-updater");

// Ladda inte ner automatiskt — fråga användaren först
autoUpdater.autoDownload    = false;
autoUpdater.autoInstallOnAppQuit = true;

// ── Sökvägar ── (fungerar både i dev och paketerad app)
const isDev       = !app.isPackaged;
const resDir      = isDev
    ? path.join(__dirname, "resources")
    : process.resourcesPath;

const JAVA_BIN    = path.join(resDir, "jre", "bin", "java");
const PUML_JAR    = path.join(resDir, "plantuml.jar");
const INDEX_HTML  = path.join(__dirname, "src", "index.html");
const { konverteraKälla } = require(path.join(__dirname, "src", "konvertera"));

let mainWindow = null;

// ── Hjälp: hitta .env-fil (userData > src/.env) ──
function hämtaEnvStig() {
    const userData = app.getPath("userData");
    return fs.existsSync(path.join(userData, ".env"))
        ? path.join(userData, ".env")
        : path.join(__dirname, "src", ".env");
}

// ── Hjälp: läs .env och returnera nyckel→värde-objekt ──
function läsEnvFil(stig) {
    if (!fs.existsSync(stig)) return {};
    const env = {};
    for (const rad of fs.readFileSync(stig, "utf8").split("\n")) {
        const m = rad.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let värde = m[2].trim();
        if (/^["']/.test(värde) && värde[0] === värde[värde.length - 1]) {
            värde = värde.slice(1, -1);
        }
        env[m[1]] = värde;
    }
    return env;
}

// ── AI: system-prompt ──
const AI_SYSTEMPROMPT = `\
Du är en expert på PlantUML och systemmodellering, inbyggd i en lokal PlantUML-editor.

Du kan:
- Generera PlantUML-kod från en beskrivning
- Förklara vad ett befintligt diagram visar
- Förbättra, förenkla eller felsöka PlantUML-kod
- Svara på frågor om diagram, arkitektur och modellering

Regler:
- Svara alltid på svenska om inte användaren skriver på ett annat språk
- Lägg alltid PlantUML-kod i ett kodblock märkt med \`\`\`plantuml
- Koden ska börja med rätt @start-direktiv och sluta med @end-direktiv
- Håll svar kortfattade och fokuserade
- Om användaren skickar med källkod, referera till den när det är relevant

Stödda diagramtyper i editorn: use case, sekvens, komponent, aktivitet, klass, tillstånd, \
ER (entity-relationship), deployment, object, timing, mindmap, WBS (work breakdown structure), \
network (nwdiag), gantt.`;

// ── AI: anropa Anthropic ──
async function anropAnthropic(apiKey, model, messages) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: {
            "x-api-key":         apiKey,
            "anthropic-version": "2023-06-01",
            "content-type":      "application/json; charset=utf-8",
        },
        body: Buffer.from(JSON.stringify({
            model:      model || "claude-sonnet-4-6",
            max_tokens: 4096,
            system:     AI_SYSTEMPROMPT,
            messages,
        }), "utf8"),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Anthropic HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content[0].text;
}

// ── AI: anropa OpenAI ──
async function anropOpenAI(apiKey, model, messages) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method:  "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "content-type":  "application/json; charset=utf-8",
        },
        body: Buffer.from(JSON.stringify({
            model:    model || "gpt-4o",
            messages: [{ role: "system", content: AI_SYSTEMPROMPT }, ...messages],
        }), "utf8"),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenAI HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
}

// ── IPC: rendera PlantUML → SVG via pipe ──
ipcMain.handle("rendera-puml", (_händelse, källkod) => {
    if (!fs.existsSync(JAVA_BIN)) {
        return Promise.reject(new Error("Java-runtime saknas — kör scripts/build-jre.sh"));
    }
    return new Promise((lös, förkasta) => {
        const proc = spawn(
            JAVA_BIN,
            ["-Djava.awt.headless=true", "-jar", PUML_JAR, "-pipe", "-tsvg"],
            { stdio: ["pipe", "pipe", "pipe"] }
        );
        let svg = "";
        let err = "";
        proc.stdout.on("data", (del) => { svg += del; });
        proc.stderr.on("data", (del) => { err += del; });
        proc.on("close", (kod) => {
            if (svg.includes("<svg")) lös(svg);
            else förkasta(new Error(err.trim() || `PlantUML exit ${kod}`));
        });
        proc.on("error", förkasta);
        proc.stdin.write(källkod, "utf8");
        proc.stdin.end();
    });
});

// ── IPC: konvertera PUML → draw.io XML ──
ipcMain.handle("konvertera", (_händelse, { källkod, typ }) => {
    if (!källkod?.trim()) return { fel: "Tom källkod." };
    try {
        const r = konverteraKälla(källkod, { typ });
        return {
            typ:           r.typ,
            säker:         r.säker,
            sammanfattning: r.sammanfattning,
            xml:           r.xml,
            saknadeXml:    r.saknadeXml  || null,
            saknadeTyper:  (r.saknadeTyper || []).map((s) => s.typNyckel),
        };
    } catch (fel) {
        return { fel: fel.message || String(fel) };
    }
});

// ── IPC: vilka API-nycklar är konfigurerade? ──
ipcMain.handle("ai-status", () => {
    const env = läsEnvFil(hämtaEnvStig());
    return {
        anthropic: !!(env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY),
        openai:    !!(env.OPENAI_API_KEY    || process.env.OPENAI_API_KEY),
    };
});

// ── IPC: AI-chatt (proxyas till Anthropic eller OpenAI) ──
ipcMain.handle("ai", async (_händelse, { provider, model, messages }) => {
    if (!messages?.length) return { fel: "Inga meddelanden." };
    const env     = läsEnvFil(hämtaEnvStig());
    const apiNyckel = provider === "openai"
        ? (env.OPENAI_API_KEY    || process.env.OPENAI_API_KEY)
        : (env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);

    if (!apiNyckel) {
        const variabel = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
        return { fel: `Ingen API-nyckel för ${provider}. Lägg till ${variabel} i .env-filen.` };
    }

    try {
        const content = provider === "openai"
            ? await anropOpenAI(apiNyckel, model, messages)
            : await anropAnthropic(apiNyckel, model, messages);
        return { content };
    } catch (fel) {
        return { fel: fel.message || String(fel) };
    }
});

// ── IPC: öppna .env i systemets texteditor ──
ipcMain.handle("oppna-env", () => {
    return new Promise((lös, förkasta) => {
        const envStig     = hämtaEnvStig();
        const exempelStig = path.join(__dirname, "src", ".env.example");

        if (!fs.existsSync(envStig) && fs.existsSync(exempelStig)) {
            fs.copyFileSync(exempelStig, envStig);
        } else if (!fs.existsSync(envStig)) {
            fs.writeFileSync(envStig,
                "# AIuda™ PUML — API-nycklar\n" +
                "# Fyll i dina nycklar och starta om appen.\n\n" +
                "ANTHROPIC_API_KEY=sk-ant-\n\n" +
                "# OPENAI_API_KEY=sk-\n",
                "utf8"
            );
        }

        const öppna = process.platform === "win32" ? "cmd"
                    : process.platform === "darwin" ? "open"
                    : "xdg-open";
        const args  = process.platform === "win32" ? ["/c", "start", "", envStig] : [envStig];
        execFile(öppna, args, (fel) => {
            if (fel) förkasta(fel);
            else lös({ ok: true, stig: envStig });
        });
    });
});

// ── Öppna fil via native dialog ──
async function visaÖppnaDialog() {
    const res = await dialog.showOpenDialog(mainWindow, {
        title:      "Öppna PlantUML-fil",
        filters:    [{ name: "PlantUML", extensions: ["puml", "pu", "txt"] }],
        properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths.length) return;
    const stig     = res.filePaths[0];
    const innehåll  = fs.readFileSync(stig, "utf-8");
    const filnamn   = path.basename(stig, path.extname(stig));
    mainWindow?.webContents.send("meny-öppna-fil", { innehåll, filnamn });
}

// ── Spara som via native dialog ──
ipcMain.handle("spara-som", async (_händelse, { innehåll, föreslagetNamn }) => {
    const res = await dialog.showSaveDialog(mainWindow, {
        title:       "Spara som",
        defaultPath: `${föreslagetNamn || "diagram"}.puml`,
        filters:     [{ name: "PlantUML", extensions: ["puml"] }],
    });
    if (res.canceled || !res.filePath) return { sparad: false };
    fs.writeFileSync(res.filePath, innehåll, "utf-8");
    const filnamn = path.basename(res.filePath, path.extname(res.filePath));
    return { sparad: true, filnamn };
});

// ── Hjälp: skicka menyhändelse till renderer ──
function skickaMeny(händelse) {
    mainWindow?.webContents.send("meny", händelse);
}

// ── Auto-update ──
function sökUppdateringar(manuell = false) {
    autoUpdater.checkForUpdates().catch((err) => {
        if (manuell) {
            dialog.showMessageBox(mainWindow, {
                type:    "error",
                title:   "Kunde inte söka",
                message: `Kunde inte kontrollera uppdateringar:\n${err.message}`,
                buttons: ["OK"],
            });
        }
    });
}

autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox(mainWindow, {
        type:    "info",
        title:   "Uppdatering tillgänglig",
        message: `Version ${info.version} är tillgänglig.`,
        detail:  "Vill du ladda ner den nu? Installationen sker när du stänger appen.",
        buttons: ["Ladda ner", "Senare"],
        defaultId: 0,
    }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
    });
});

autoUpdater.on("update-not-available", (_info) => {
    // Visa bara vid manuell kontroll — undvik störande popup vid varje start
    if (autoUpdater._manuellKontroll) {
        autoUpdater._manuellKontroll = false;
        dialog.showMessageBox(mainWindow, {
            type:    "info",
            title:   "Inga uppdateringar",
            message: "Du har redan den senaste versionen.",
            buttons: ["OK"],
        });
    }
});

autoUpdater.on("update-downloaded", (info) => {
    dialog.showMessageBox(mainWindow, {
        type:    "info",
        title:   "Klar att installera",
        message: `Version ${info.version} är nedladdad.`,
        detail:  "Starta om appen för att installera uppdateringen.",
        buttons: ["Starta om nu", "Senare"],
        defaultId: 0,
    }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
    });
});

// ── Bygg native-meny ──
function byggMeny() {
    const isMac = process.platform === "darwin";
    const mall  = Menu.buildFromTemplate([
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: "about" },
                { type: "separator" },
                { label: "Sök efter uppdateringar …", click: () => {
                    autoUpdater._manuellKontroll = true;
                    sökUppdateringar(true);
                }},
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
            ],
        }] : []),
        {
            label: "File",
            submenu: [
                { label: "Nytt",        accelerator: "CmdOrCtrl+N",       click: () => skickaMeny("nytt")      },
                { type:  "separator" },
                { label: "Öppna …",     accelerator: "CmdOrCtrl+O",       click: visaÖppnaDialog               },
                { label: "Spara",       accelerator: "CmdOrCtrl+S",       click: () => skickaMeny("spara")     },
                { label: "Spara som …", accelerator: "CmdOrCtrl+Shift+S", click: () => skickaMeny("spara-som") },
                { type: "separator" },
                { label: "Export …", submenu: [
                    { label: "Exportera SVG",           accelerator: "CmdOrCtrl+E",       click: () => skickaMeny("export-svg")   },
                    { label: "Exportera PNG",           accelerator: "CmdOrCtrl+Shift+E", click: () => skickaMeny("export-png")   },
                    { label: "Konvertera till drawio …",                                  click: () => skickaMeny("export-drawio") },
                ]},
                ...(!isMac ? [{ type: "separator" }, { role: "quit" }] : []),
            ],
        },
        {
            label: "Edit",
            submenu: [
                { role: "undo"      },
                { role: "redo"      },
                { type: "separator" },
                { role: "cut"       },
                { role: "copy"      },
                { role: "paste"     },
                { role: "selectAll" },
                { type: "separator" },
                { label: "Mall", submenu: [
                    { label: "Use case",   click: () => skickaMeny("mall:usecase")    },
                    { label: "Sekvens",    click: () => skickaMeny("mall:sekvens")    },
                    { label: "Klass",      click: () => skickaMeny("mall:klass")      },
                    { label: "Aktivitet",  click: () => skickaMeny("mall:aktivitet")  },
                    { label: "Komponent",  click: () => skickaMeny("mall:komponent")  },
                    { label: "Tillstånd",  click: () => skickaMeny("mall:tillstånd")  },
                    { label: "ER",         click: () => skickaMeny("mall:er")         },
                    { label: "Deployment", click: () => skickaMeny("mall:deployment") },
                    { label: "Objekt",     click: () => skickaMeny("mall:objekt")     },
                    { label: "Timing",     click: () => skickaMeny("mall:timing")     },
                    { label: "MindMap",    click: () => skickaMeny("mall:mindmap")    },
                    { label: "WBS",        click: () => skickaMeny("mall:wbs")        },
                    { label: "Network",    click: () => skickaMeny("mall:network")    },
                    { label: "Gantt",      click: () => skickaMeny("mall:gantt")      },
                ]},
            ],
        },
        {
            label: "View",
            submenu: [
                { role: "reload"         },
                { role: "forceReload"    },
                { role: "toggleDevTools" },
                { type: "separator"      },
                { role: "resetZoom"      },
                { role: "zoomIn"         },
                { role: "zoomOut"        },
                { type: "separator"      },
                { role: "togglefullscreen" },
            ],
        },
        {
            label: "Window",
            submenu: [
                { role: "minimize" },
                { role: "zoom"     },
                ...(isMac ? [{ type: "separator" }, { role: "front" }] : []),
            ],
        },
    ]);
    Menu.setApplicationMenu(mall);
}

// ── Skapa huvudfönstret ──
function createWindow() {
    mainWindow = new BrowserWindow({
        width:     1400,
        height:    900,
        minWidth:  800,
        minHeight: 600,
        title: "AIuda™ PUML",
        webPreferences: {
            preload:          path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });

    mainWindow.loadFile(INDEX_HTML);

    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

    mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App-livscykel ──
app.whenReady().then(() => {
    byggMeny();
    createWindow();

    // Kolla tyst efter uppdateringar vid start (bara i paketerad app)
    if (app.isPackaged) sökUppdateringar(false);

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
