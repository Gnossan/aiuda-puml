#!/usr/bin/env node
// AIuda™ PUML — lokal konverterings- och AI-server
//
// Endpoints:
//   POST /konvertera   — PlantUML → draw.io XML
//   POST /ai           — AI-chatt (proxyas till Anthropic eller OpenAI)
//   GET  /ai-status    — vilka API-nycklar är konfigurerade?
//
// API-nycklar läses från .env-filen i samma katalog (aldrig från klienten).
//
// Användning:
//   node server.js [port]   (standard: 8090)

"use strict";

const http           = require("http");
const fs             = require("fs");
const path           = require("path");
const { URL }        = require("url");
const { execFile }   = require("child_process");

// ── Läs .env-filen och lägg in värden i process.env ──
// AIUDA_ENV_STIG sätts av Electron main.js och pekar på userData/.env
function läsEnvFil() {
    const envStig = process.env.AIUDA_ENV_STIG || path.resolve(__dirname, ".env");
    if (!fs.existsSync(envStig)) return;
    for (const rad of fs.readFileSync(envStig, "utf8").split("\n")) {
        const m = rad.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let värde = m[2].trim();
        if (/^["']/.test(värde) && värde[0] === värde[värde.length - 1]) {
            värde = värde.slice(1, -1);
        }
        if (!process.env[m[1]]) process.env[m[1]] = värde;
    }
}
läsEnvFil();

const { konverteraKälla } = require("./konvertera");

const PORT = Number(process.argv[2]) || 8090;

// System-prompt som skickas till AI-modellen vid varje anrop.
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

async function anropAnthropic(apiKey, model, messages) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
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

async function anropOpenAI(apiKey, model, messages) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
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

const CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function läsKropp(begäran) {
    return new Promise((lös, förkasta) => {
        const delar = [];
        begäran.on("data", (del) => delar.push(del));
        begäran.on("end", () => lös(Buffer.concat(delar).toString("utf8")));
        begäran.on("error", förkasta);
    });
}

function skickaJson(svar, statusKod, data) {
    const kropp = JSON.stringify(data);
    svar.writeHead(statusKod, { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" });
    svar.end(kropp);
}

const server = http.createServer(async (begäran, svar) => {
    if (begäran.method === "OPTIONS") {
        svar.writeHead(204, CORS_HEADERS);
        svar.end();
        return;
    }

    const url = new URL(begäran.url, `http://localhost:${PORT}`);

    if (begäran.method === "POST" && url.pathname === "/konvertera") {
        try {
            const källkod = await läsKropp(begäran);
            if (!källkod.trim()) {
                skickaJson(svar, 400, { fel: "Tom källkod." });
                return;
            }

            const typ = url.searchParams.get("typ") || null;
            const resultat = konverteraKälla(källkod, { typ });

            skickaJson(svar, 200, {
                typ: resultat.typ,
                säker: resultat.säker,
                sammanfattning: resultat.sammanfattning,
                xml: resultat.xml,
                saknadeXml: resultat.saknadeXml || null,
                saknadeTyper: (resultat.saknadeTyper || []).map((s) => s.typNyckel),
            });
        } catch (fel) {
            skickaJson(svar, 400, { fel: fel.message || String(fel) });
        }
        return;
    }

    // GET /ai-status — vilka API-nycklar är konfigurerade?
    if (begäran.method === "GET" && url.pathname === "/ai-status") {
        skickaJson(svar, 200, {
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            openai:    !!process.env.OPENAI_API_KEY,
        });
        return;
    }

    // POST /ai — proxya ett AI-anrop till Anthropic eller OpenAI
    // Nyckeln hämtas från serverns miljövariabler (.env) — aldrig från klienten.
    if (begäran.method === "POST" && url.pathname === "/ai") {
        try {
            const kropp = JSON.parse(await läsKropp(begäran));
            const { provider, model, messages } = kropp;
            if (!messages?.length) { skickaJson(svar, 400, { fel: "Inga meddelanden." }); return; }

            const envNyckel = provider === "openai"
                ? process.env.OPENAI_API_KEY
                : process.env.ANTHROPIC_API_KEY;

            if (!envNyckel) {
                const variabel = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
                skickaJson(svar, 400, {
                    fel: `Ingen API-nyckel för ${provider}. Lägg till ${variabel} i .env-filen bredvid server.js.`,
                });
                return;
            }

            const content = provider === "openai"
                ? await anropOpenAI(envNyckel, model, messages)
                : await anropAnthropic(envNyckel, model, messages);

            skickaJson(svar, 200, { content });
        } catch (fel) {
            skickaJson(svar, 500, { fel: fel.message || String(fel) });
        }
        return;
    }

    // GET /open-env — skapa .env från mall om den saknas, öppna i systemets texteditor
    if (begäran.method === "GET" && url.pathname === "/open-env") {
        // I Electron-läge pekar AIUDA_ENV_STIG på userData-mappen
        const envStig     = process.env.AIUDA_ENV_STIG || path.resolve(__dirname, ".env");
        const exempelStig = path.resolve(__dirname, ".env.example");

        if (!fs.existsSync(envStig) && fs.existsSync(exempelStig)) {
            fs.copyFileSync(exempelStig, envStig);
        } else if (!fs.existsSync(envStig)) {
            fs.writeFileSync(envStig,
                "# AIuda™ PUML — API-nycklar\n" +
                "# Fyll i dina nycklar och starta om servern.\n\n" +
                "ANTHROPIC_API_KEY=sk-ant-\n\n" +
                "# OPENAI_API_KEY=sk-\n",
                "utf8"
            );
        }

        // Öppna med systemets standardprogram (macOS: open, Linux: xdg-open, Windows: start)
        const öppna = process.platform === "win32" ? "cmd"
                    : process.platform === "darwin" ? "open"
                    : "xdg-open";
        const args  = process.platform === "win32" ? ["/c", "start", "", envStig] : [envStig];

        execFile(öppna, args, (fel) => {
            if (fel) {
                skickaJson(svar, 500, { fel: fel.message, stig: envStig });
            } else {
                skickaJson(svar, 200, { ok: true, stig: envStig });
            }
        });
        return;
    }

    skickaJson(svar, 404, { fel: "Okänd endpoint — använd POST /konvertera eller POST /ai" });
});

server.listen(PORT, () => {
    process.stdout.write(`Konverteringsserver igång på http://localhost:${PORT}/konvertera\n`);
    process.stdout.write("Tryck Ctrl+C för att stoppa.\n");
});
