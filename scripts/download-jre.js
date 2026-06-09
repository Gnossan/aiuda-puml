#!/usr/bin/env node
// Laddas ner automatiskt via "postinstall" i package.json.
// Hoppar över om resources/jre/ redan finns.
"use strict";

const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const { execSync } = require("child_process");

const ROOT     = path.join(__dirname, "..");
const JRE_DIR  = path.join(ROOT, "resources", "jre");
const TARBALL  = path.join(ROOT, "resources", "jre-macos-arm64.tar.gz");
const JRE_URL  = "https://github.com/Gnossan/aiuda-puml/releases/download/v1.0.0-jre/jre-macos-arm64.tar.gz";

if (fs.existsSync(JRE_DIR)) {
    console.log("✓ JRE finns redan — hoppar över nedladdning.");
    process.exit(0);
}

if (process.platform !== "darwin") {
    console.warn("⚠ Ingen förbyggd JRE för detta OS. Kör scripts/build-jre.sh manuellt.");
    process.exit(0);
}

console.log("→ Laddar ner inbundlad JRE (~29 MB) …");

function hämta(url, målStig, callback) {
    const fil = fs.createWriteStream(målStig);
    https.get(url, (svar) => {
        // Följ redirects (GitHub Releases använder dem)
        if (svar.statusCode === 301 || svar.statusCode === 302) {
            fil.close();
            fs.unlinkSync(målStig);
            return hämta(svar.headers.location, målStig, callback);
        }
        if (svar.statusCode !== 200) {
            fil.close();
            fs.unlinkSync(målStig);
            callback(new Error(`HTTP ${svar.statusCode}`));
            return;
        }
        const total = parseInt(svar.headers["content-length"] || "0", 10);
        let nedladdat = 0;
        svar.on("data", (del) => {
            nedladdat += del.length;
            if (total) {
                const procent = Math.round((nedladdat / total) * 100);
                process.stdout.write(`\r   ${procent}%  (${(nedladdat / 1e6).toFixed(1)} MB)`);
            }
        });
        svar.pipe(fil);
        fil.on("finish", () => { fil.close(); process.stdout.write("\n"); callback(null); });
    }).on("error", (fel) => {
        fil.close();
        if (fs.existsSync(målStig)) fs.unlinkSync(målStig);
        callback(fel);
    });
}

hämta(JRE_URL, TARBALL, (fel) => {
    if (fel) {
        console.error("✗ Nedladdning misslyckades:", fel.message);
        console.error("  Kör scripts/build-jre.sh manuellt för att bygga JRE:n lokalt.");
        process.exit(1);
    }

    console.log("→ Packar upp …");
    try {
        execSync(`tar -xzf "${TARBALL}" -C "${path.join(ROOT, "resources")}"`);
        fs.unlinkSync(TARBALL);
        console.log("✓ JRE installerad i resources/jre/");
    } catch (e) {
        console.error("✗ Uppackning misslyckades:", e.message);
        process.exit(1);
    }
});
