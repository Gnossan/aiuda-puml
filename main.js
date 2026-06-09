"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
app.name = "AIuda PUML";
const path        = require("path");
const { spawn, fork } = require("child_process");
const fs          = require("fs");

// ── Sökvägar ── (fungerar både i dev och paketerad app)
const isDev       = !app.isPackaged;
const resDir      = isDev
    ? path.join(__dirname, "resources")
    : process.resourcesPath;

const JAVA_BIN    = path.join(resDir, "jre", "bin", "java");
const PUML_JAR    = path.join(resDir, "plantuml.jar");
const SERVER_JS   = path.join(__dirname, "src", "server.js");
const INDEX_HTML  = path.join(__dirname, "src", "index.html");

let serverProc    = null;
let mainWindow    = null;

// ── IPC: rendera PlantUML → SVG via pipe (ingen server behövs) ──
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

// ── Starta konverterings- och AI-server (port 8090) ──
function startKonverterServer() {
    // .env: userData-mappen om den finns, annars src/.env (dev-fallback)
    const userData = app.getPath("userData");
    const envStig  = fs.existsSync(path.join(userData, ".env"))
        ? path.join(userData, ".env")
        : path.join(__dirname, "src", ".env");

    serverProc = fork(SERVER_JS, ["8090"], {
        env: { ...process.env, AIUDA_ENV_STIG: envStig },
        stdio: "inherit",
    });
    serverProc.on("error", (err) =>
        console.error("[server] Startfel:", err.message)
    );
}

// ── Hjälpfunktion: skicka menyhändelse till renderer ──
function skickaMeny(händelse) {
    mainWindow?.webContents.send("meny", händelse);
}

// ── Öppna fil via native dialog (hanteras i main) ──
async function visaÖppnaDialog() {
    const res = await dialog.showOpenDialog(mainWindow, {
        title:      "Öppna PlantUML-fil",
        filters:    [{ name: "PlantUML", extensions: ["puml", "pu", "txt"] }],
        properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths.length) return;
    const stig    = res.filePaths[0];
    const innehåll = fs.readFileSync(stig, "utf-8");
    const filnamn  = path.basename(stig, path.extname(stig));
    mainWindow?.webContents.send("meny-öppna-fil", { innehåll, filnamn });
}

// ── Spara som via native dialog (IPC-anrop från renderer) ──
ipcMain.handle("spara-som", async (_händelse, { innehåll, föreslagetNamn }) => {
    const res = await dialog.showSaveDialog(mainWindow, {
        title:          "Spara som",
        defaultPath:    `${föreslagetNamn || "diagram"}.puml`,
        filters:        [{ name: "PlantUML", extensions: ["puml"] }],
    });
    if (res.canceled || !res.filePath) return { sparad: false };
    fs.writeFileSync(res.filePath, innehåll, "utf-8");
    const filnamn = path.basename(res.filePath, path.extname(res.filePath));
    return { sparad: true, filnamn };
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
                { label: "Mall …", accelerator: "CmdOrCtrl+T", click: () => skickaMeny("mall") },
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
        width:  1400,
        height: 900,
        minWidth:  800,
        minHeight: 600,
        title: "AIuda PUML™",
        webPreferences: {
            preload:            path.join(__dirname, "preload.js"),
            contextIsolation:   true,
            nodeIntegration:    false,
        },
    });

    mainWindow.loadFile(INDEX_HTML);

    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

    mainWindow.on("closed", () => { mainWindow = null; });
}

// ── Stäng barnprocesser prydligt ──
function stängAllt() {
    if (serverProc) { serverProc.kill(); serverProc = null; }
}

// ── Vänta tills en port svarar (max maxMs ms) ──
function väntatillPort(port, maxMs = 15000) {
    return new Promise((lös) => {
        const start = Date.now();
        const net = require("net");
        function försök() {
            const sock = new net.Socket();
            sock.setTimeout(300);
            sock.on("connect", () => { sock.destroy(); lös(true); });
            sock.on("error",   () => { sock.destroy(); retry(); });
            sock.on("timeout", () => { sock.destroy(); retry(); });
            sock.connect(port, "127.0.0.1");
        }
        function retry() {
            if (Date.now() - start > maxMs) { lös(false); return; }
            setTimeout(försök, 300);
        }
        försök();
    });
}

// ── App-livscykel ──
app.whenReady().then(async () => {
    byggMeny();
    startKonverterServer();

    // Vänta tills konverteringsservern lyssnar innan fönstret öppnas
    await väntatillPort(8090, 10000);

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    stängAllt();
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stängAllt);
app.on("will-quit",   stängAllt);
