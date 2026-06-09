"use strict";

const { app, BrowserWindow, dialog } = require("electron");
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

let picowebProc   = null;
let serverProc    = null;
let mainWindow    = null;

// ── Starta PlantUML PicoWeb (port 8080) ──
function startPicoweb() {
    if (!fs.existsSync(JAVA_BIN)) {
        dialog.showErrorBox(
            "Java saknas",
            `Kunde inte hitta Java-runtime på:\n${JAVA_BIN}\n\nKör scripts/build-jre.sh för att bygga den inbundlade JRE:n.`
        );
        return;
    }
    picowebProc = spawn(JAVA_BIN, ["-jar", PUML_JAR, "-picoweb:8080"], {
        stdio: "ignore",
        detached: false,
    });
    picowebProc.on("error", (err) =>
        console.error("[picoweb] Startfel:", err.message)
    );
}

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
    if (picowebProc) { picowebProc.kill(); picowebProc = null; }
    if (serverProc)  { serverProc.kill();  serverProc  = null; }
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
    startPicoweb();
    startKonverterServer();

    // Vänta tills båda servrarna faktiskt lyssnar innan fönstret öppnas
    await Promise.all([
        väntatillPort(8080, 15000),
        väntatillPort(8090, 10000),
    ]);

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
