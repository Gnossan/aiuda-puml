# AIuda™ PUML

PlantUML-editor som skrivbordsapp med inbyggd AI-assistent och export till draw.io.

![Version](https://img.shields.io/badge/version-1.2.12-blue)
![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron)
![PlantUML](https://img.shields.io/badge/PlantUML-bundled-orange)
![License](https://img.shields.io/badge/license-GPL%20v2-green)

## Funktioner

- **14 diagramtyper** — Use case, Sekvens, Klass, Aktivitet, Komponent, Tillstånd, ER, Deployment, Objekt, Timing, MindMap, WBS, Network (nwdiag), Gantt
- **Live-förhandsgranskning** via inbundlad PlantUML — ingen internetuppkoppling krävs för rendering
- **Export** — SVG, PNG och draw.io XML (File → Export …)
- **AI-assistent** — chatt med Claude eller GPT direkt i editorn; generera, förklara och förbättra diagram
- **Inbundlad Java-runtime** — ingen separat Java-installation krävs
- **Auto-update** — appen söker automatiskt efter nya versioner via GitHub Releases

## Arkitektur

Appen körs helt lokalt utan externa beroenden vid runtime:

- **PlantUML-rendering** sker via Java-pipe direkt i Electron-processen
- **AI-anrop** proxyas till Anthropic / OpenAI via Electron IPC — API-nycklar stannar lokalt i `.env`
- **draw.io-konvertering** tolkar PUML-källkod direkt, ingen server behövs

## Krav

- macOS 10.12+ (Apple Silicon eller Intel)
- [Node.js](https://nodejs.org) 18+ — för att köra från källkod
- Java JDK 21+ — endast för att bygga den inbundlade JRE:n (engångssteg för utvecklare)

## Installation från källkod

```bash
git clone https://github.com/Gnossan/aiuda-puml.git
cd aiuda-puml
npm install
```

`npm install` laddar automatiskt ner en färdigbyggd JRE (~29 MB) från GitHub Releases.

### Bygg inbundlad JRE (valfritt)

Vill du bygga JRE:n själv från din lokala OpenJDK-installation:

```bash
brew install openjdk
bash scripts/build-jre.sh
```

### Konfigurera API-nycklar

För AI-funktionen behövs en nyckel från [Anthropic](https://console.anthropic.com) och/eller [OpenAI](https://platform.openai.com).

Klicka på **⚙ → Öppna .env** i appen, fyll i nyckeln och starta om.

Eller skapa filen manuellt:

```
~/Library/Application Support/aiuda-puml/.env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
```

## Starta

```bash
npm start
```

## Installation från DMG

Ladda ner senaste `.dmg` från [Releases](https://github.com/Gnossan/aiuda-puml/releases).

Appen är signerad och notariserad av Apple — öppnas utan varningar.

## Bygga distribuerbar app

Releasebyggen sker automatiskt via GitHub Actions när en versionstagg pushas:

```bash
git tag v1.2.0
git push origin v1.2.0
```

`.dmg` och `.zip` laddas upp till GitHub Releases av CI.

## Projektstruktur

```
aiuda-puml/
├── main.js              # Electron main — IPC-handlers för PlantUML, AI och konvertering
├── preload.js           # contextBridge — exponerar window.aiuda till renderer
├── src/
│   ├── index.html       # UI — tre paneler: AI-chatt, editor, förhandsvisning
│   ├── app.js           # Frontend-logik, menyhantering, export
│   ├── konvertera.js    # PUML → draw.io XML-konvertering
│   └── *_parser.js      # Parser + layout per diagramtyp
├── resources/
│   ├── plantuml.jar     # PlantUML (~28 MB)
│   ├── icon.icns        # App-ikon (macOS)
│   ├── icon.svg         # Källfil för ikonen
│   └── jre/             # Inbundlad JRE (ej i git — laddas ner vid npm install)
└── scripts/
    ├── build-jre.sh     # Bygger JRE med jlink
    └── download-jre.js  # Laddar ner färdigbyggd JRE (körs vid npm install)
```

## Licens

Copyright © 2026 Tomas Gnossa

Licensierad under [GNU General Public License v2](LICENSE).

Appen buntar [PlantUML](https://plantuml.com) (GPL v2) och en minimal Java-runtime
baserad på [OpenJDK](https://openjdk.org) (GPL v2 + Classpath Exception).
