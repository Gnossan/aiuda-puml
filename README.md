# AIuda™ PUML

PlantUML-editor som skrivbordsapp med inbyggd AI-assistent och export till draw.io.

![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron)
![PlantUML](https://img.shields.io/badge/PlantUML-bundled-orange)
![License](https://img.shields.io/badge/license-MIT-green)

## Funktioner

- **14 diagramtyper** — Use case, Sekvens, Klass, Aktivitet, Komponent, Tillstånd, ER, Deployment, Objekt, Timing, MindMap, WBS, Network (nwdiag), Gantt
- **Live-förhandsgranskning** via inbundlad PlantUML (ingen internetuppkoppling krävs)
- **Export till draw.io** — konverterar PUML-källa till draw.io XML
- **AI-assistent** — chatt med Claude eller GPT direkt i editorn; kan generera, förklara och förbättra diagram
- **Inbundlad Java-runtime** — användaren behöver inte installera Java separat

## Krav

- macOS (Apple Silicon eller Intel)
- [Node.js](https://nodejs.org) 18+
- [Java JDK 21+](https://formulae.brew.sh/formula/openjdk) — endast för att bygga den inbundlade JRE:n (engångssteg)

```bash
brew install node openjdk@21
```

## Installation

```bash
git clone https://github.com/Gnossan/aiuda-puml.git
cd aiuda-puml
npm install
```

### Bygg inbundlad JRE (engångssteg)

Skapar en minimal Java-runtime (~50 MB) med jlink som läggs i `resources/jre/`:

```bash
bash scripts/build-jre.sh
```

### Konfigurera API-nycklar (valfritt)

För AI-funktionen behövs en nyckel från [Anthropic](https://console.anthropic.com) och/eller [OpenAI](https://platform.openai.com).

Klicka på **⚙ → 📝 Öppna .env** i appen, fyll i nyckeln och starta om.

Eller skapa filen manuellt:

```bash
cp src/.env.example ~/Library/Application\ Support/aiuda-puml/.env
# Öppna och fyll i ANTHROPIC_API_KEY
```

## Starta

```bash
npm start
```

## Projektstruktur

```
aiuda-puml/
├── main.js              # Electron main — startar PlantUML och konverteringsservern
├── preload.js
├── src/
│   ├── index.html       # UI — tre paneler: AI-chatt, editor, förhandsgranskning
│   ├── app.js           # Frontend-logik
│   ├── server.js        # Lokal server: /konvertera, /ai, /ai-status, /open-env
│   └── *_parser.js      # Parser + layout + XML-generering per diagramtyp
├── resources/
│   ├── plantuml.jar     # PlantUML (~28 MB)
│   └── jre/             # Inbundlad JRE, byggd av build-jre.sh (ej i git)
└── scripts/
    └── build-jre.sh     # jlink-skript
```

## Bygga distribuerbar app

```bash
npm run dist
```

Bygger en `.dmg` i `dist/`. Kräver att `resources/jre/` är byggd och att `resources/icon.icns` finns.

## Licens

MIT
