// ======================================================================
// AI — inställningar, chatt och API-proxy
// ======================================================================

// ── Inbyggda modeller per leverantör ──
const AI_MODELLER = {
    anthropic: [
        { id: "claude-opus-4-8",    namn: "Claude Opus 4.8 (flagship)"   },
        { id: "claude-sonnet-4-6",  namn: "Claude Sonnet 4.6 (balans)"   },
        { id: "claude-haiku-4-5-20251001", namn: "Claude Haiku 4.5 (snabb)" },
    ],
    openai: [
        { id: "gpt-5.5",      namn: "GPT-5.5 (flagship)"  },
        { id: "gpt-5.4",      namn: "GPT-5.4 (prisvärd)"  },
        { id: "gpt-5.4-mini", namn: "GPT-5.4-mini (snabb)" },
    ],
};

// ── Spara/läs inställningar ──
function läsAiInst() {
    try { return JSON.parse(localStorage.getItem("aiInst") || "{}"); } catch { return {}; }
}
function sparaAiInst(inst) {
    localStorage.setItem("aiInst", JSON.stringify(inst));
}

// ── Element-refs ──
const aiInstEl        = document.getElementById("ai-inst");
const aiInstKnappEl   = document.getElementById("ai-inst-knapp");
const aiRensaKnappEl  = document.getElementById("ai-rensa-knapp");
const aiProviderEl    = document.getElementById("ai-provider");
const aiModellEl      = document.getElementById("ai-modell");
const aiSparaInstEl   = document.getElementById("ai-spara-inst");
const aiNyckelStatusEl = document.getElementById("ai-nyckel-status");
const aiNyckelAnthropicEl = document.getElementById("ai-nyckel-anthropic");
const aiNyckelOpenaiEl     = document.getElementById("ai-nyckel-openai");
const aiMeddelandenEl = document.getElementById("ai-meddelanden");
const aiPromptEl      = document.getElementById("ai-prompt-input");
const aiSkickaEl      = document.getElementById("ai-skicka-knapp");
const aiInkluderaEl   = document.getElementById("ai-inkludera-kod");

// ── Chatthistorik ──
let aiChatt = []; // [{ role: "user"|"assistant", content }]
aiChatt = [];
localStorage.removeItem("aiChatt");

// ── Fyll modell-select utifrån vald leverantör ──
function uppdateraModellLista() {
    const provider = aiProviderEl.value;
    const modeller = AI_MODELLER[provider] || [];
    aiModellEl.innerHTML = modeller.map((m) =>
        `<option value="${m.id}">${m.namn}</option>`
    ).join("");
    const inst = läsAiInst();
    if (inst.modell && modeller.some((m) => m.id === inst.modell)) {
        aiModellEl.value = inst.modell;
    }
}
aiProviderEl.addEventListener("change", uppdateraModellLista);

// ── Kolla nyckelstatus via IPC och uppdatera UI ──
async function uppdateraNyckelStatus() {
    try {
        const data = await window.aiuda.aiStatus();
        const inst = läsAiInst();
        const provider = inst.provider || "anthropic";
        const harNyckel = provider === "openai" ? data.openai : data.anthropic;
        if (aiNyckelStatusEl) {
            aiNyckelStatusEl.innerHTML = harNyckel
                ? `<span style="color:#7fc97f;">✓ Nyckel konfigurerad</span>`
                : `<span style="color:#e07070;">✗ Ingen nyckel sparad ännu</span>`;
        }
        return harNyckel;
    } catch {
        if (aiNyckelStatusEl) {
            aiNyckelStatusEl.innerHTML = `<span style="color:#e07070;">✗ Kunde inte läsa nyckelstatus</span>`;
        }
        return false;
    }
}

// ── Ladda sparade inställningar ──
function laddaAiInst() {
    const inst = läsAiInst();
    if (inst.provider) aiProviderEl.value = inst.provider;
    uppdateraModellLista();
}
laddaAiInst();
aiProviderEl.addEventListener("change", uppdateraNyckelStatus);

// ── Spara-knapp ──
aiSparaInstEl.addEventListener("click", async () => {
    sparaAiInst({
        provider: aiProviderEl.value,
        modell:   aiModellEl.value,
    });

    const orig = aiSparaInstEl.textContent;
    try {
        if (aiNyckelAnthropicEl.value.trim()) {
            await window.aiuda.sparaApiNyckel("anthropic", aiNyckelAnthropicEl.value.trim());
            aiNyckelAnthropicEl.value = "";
        }
        if (aiNyckelOpenaiEl.value.trim()) {
            await window.aiuda.sparaApiNyckel("openai", aiNyckelOpenaiEl.value.trim());
            aiNyckelOpenaiEl.value = "";
        }
        aiSparaInstEl.textContent = "✓ Sparat";
    } catch (e) {
        alert(`Kunde inte spara API-nyckel: ${e.message}`);
    }

    setTimeout(() => { aiSparaInstEl.textContent = orig; }, 1500);
    aiInstEl.classList.add("dold");
    uppdateraNyckelStatus();
});

// ── Växla inställningspanel ──
aiInstKnappEl.addEventListener("click", () => {
    aiInstEl.classList.toggle("dold");
});

// ── Rendera hela chatthistoriken ──
function renderaChatt() {
    aiMeddelandenEl.innerHTML = "";
    if (aiChatt.length === 0) {
        aiMeddelandenEl.innerHTML =
            `<div style="padding:16px;font-size:11px;color:#555;text-align:center;line-height:1.6;">
             Inga meddelanden ännu.<br>Ställ en fråga eller klicka på<br>en snabbknapp för att börja.
             </div>`;
        return;
    }
    for (const msg of aiChatt) {
        aiMeddelandenEl.appendChild(skapaMeddelandeEl(msg.role, msg.content));
    }
    aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
}

// ── Skapa ett meddelande-element ──
function skapaMeddelandeEl(roll, innehåll) {
    const wrap = document.createElement("div");
    wrap.className = `ai-meddelande ${roll === "user" ? "användare" : "assistent"}`;

    const avsändare = document.createElement("div");
    avsändare.className = "ai-avsändare";
    avsändare.textContent = roll === "user" ? "Du" : "AI";

    const bubbla = document.createElement("div");
    bubbla.className = "ai-bubbla";
    bubbla.appendChild(renderaMeddelandeInnehåll(innehåll));

    wrap.appendChild(avsändare);
    wrap.appendChild(bubbla);
    return wrap;
}

// ── Rendera text med kodblock ──
function renderaMeddelandeInnehåll(text) {
    const container = document.createElement("div");
    // Dela upp på ```plantuml ... ``` (eller bara ```) block
    const regex = /```(?:plantuml|puml)?\n?([\s\S]*?)```/g;
    let pos = 0, match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > pos) {
            container.appendChild(renderaText(text.slice(pos, match.index)));
        }
        container.appendChild(skapaKodblock(match[1].trim()));
        pos = match.index + match[0].length;
    }
    if (pos < text.length) {
        container.appendChild(renderaText(text.slice(pos)));
    }
    return container;
}

function renderaText(text) {
    const div = document.createElement("div");
    // Dela upp på radbrytningar och skapa <p>-element
    text.trim().split(/\n{2,}/).forEach((stycke) => {
        if (!stycke.trim()) return;
        const p = document.createElement("p");
        p.textContent = stycke.replace(/\n/g, " ");
        div.appendChild(p);
    });
    return div;
}

function skapaKodblock(kod) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-kodblock";

    const pre = document.createElement("pre");
    pre.textContent = kod;
    wrapper.appendChild(pre);

    const knapp = document.createElement("button");
    knapp.className = "ai-använd-kod";
    knapp.textContent = "↙ Använd koden i editorn";
    knapp.addEventListener("click", () => {
        kodEl.value = kod;
        uppdateraHighlight();
        schemaläggRendering();
        sparaTillLagring();
    });
    wrapper.appendChild(knapp);
    return wrapper;
}

// ── Visa hint om nyckeln saknas ──
async function visaIngenNyckelHint() {
    const harNyckel = await uppdateraNyckelStatus();
    const gammal = aiMeddelandenEl.querySelector(".ai-ingen-nyckel");
    if (gammal) gammal.remove();
    if (!harNyckel) {
        const div = document.createElement("div");
        div.className = "ai-ingen-nyckel";
        div.innerHTML = `Ingen API-nyckel konfigurerad.<br>
            Lägg till den under &nbsp;
            <button onclick="document.getElementById('ai-inst').classList.remove('dold')">
            Inställningar ⚙</button>`;
        aiMeddelandenEl.insertBefore(div, aiMeddelandenEl.firstChild);
    }
}

// ── Skicka meddelande till AI ──
async function skickaAiMeddelande(prompt) {
    const inst = läsAiInst();

    const inkluderaKod = aiInkluderaEl.checked;
    let fullPrompt = prompt;
    if (inkluderaKod && kodEl.value.trim()) {
        fullPrompt += `\n\nAktuell PlantUML-källkod:\n\`\`\`plantuml\n${kodEl.value.trim()}\n\`\`\``;
    }

    // Lägg till i historiken och rendera
    aiChatt.push({ role: "user", content: fullPrompt });
    localStorage.setItem("aiChatt", JSON.stringify(aiChatt));
    renderaChatt();

    // Visa laddningsindikator
    const ladarEl = document.createElement("div");
    ladarEl.className = "ai-meddelande assistent";
    ladarEl.innerHTML = `<div class="ai-avsändare">AI</div>
        <div class="ai-bubbla">
            <div class="ai-laddar">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    aiMeddelandenEl.appendChild(ladarEl);
    aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
    aiSkickaEl.disabled = true;

    try {
        const data = await window.aiuda.ai(
            inst.provider || "anthropic",
            inst.modell   || null,
            aiChatt.map((m) => ({ role: m.role, content: m.content }))
        );

        ladarEl.remove();

        if (data.fel) {
            aiChatt.pop(); // Ta bort användarmeddelandet
            renderaChatt();
            // Visa fel som ett assistent-meddelande
            const felMsg = { role: "assistant", content: `⚠ Fel: ${data.fel}` };
            aiMeddelandenEl.appendChild(skapaMeddelandeEl(felMsg.role, felMsg.content));
            aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
        } else {
            aiChatt.push({ role: "assistant", content: data.content });
            localStorage.setItem("aiChatt", JSON.stringify(aiChatt));
            renderaChatt();
        }
    } catch (nätfel) {
        ladarEl.remove();
        aiChatt.pop();
        renderaChatt();
        const felMsg = { role: "assistant", content: `⚠ Nätverksfel: ${nätfel.message}` };
        aiMeddelandenEl.appendChild(skapaMeddelandeEl(felMsg.role, felMsg.content));
        aiMeddelandenEl.scrollTop = aiMeddelandenEl.scrollHeight;
    } finally {
        aiSkickaEl.disabled = false;
    }
}

// ── Skicka-knapp och Enter-tangent ──
aiSkickaEl.addEventListener("click", () => {
    const text = aiPromptEl.value.trim();
    if (!text) return;
    aiPromptEl.value = "";
    skickaAiMeddelande(text);
});

aiPromptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        aiSkickaEl.click();
    }
});

// ── Snabbknappar ──
const SNABB_PROMPTS = {
    förklara:  "Förklara vad det här diagrammet visar och vad det används till.",
    förbättra: "Förbättra och förenkla det här diagrammet. Behåll innebörden men gör koden tydligare.",
    generera:  "", // Fokuserar bara textarea
};

document.querySelectorAll(".ai-snabb").forEach((knapp) => {
    knapp.addEventListener("click", () => {
        const snabb = knapp.dataset.snabb;
        if (snabb === "generera") {
            aiPromptEl.focus();
            aiPromptEl.placeholder = "Beskriv diagrammet du vill skapa …";
        } else {
            skickaAiMeddelande(SNABB_PROMPTS[snabb]);
        }
    });
});

// ── Rensa chatthistorik (utan bekräftelse) ──
function rensaChatt() {
    aiChatt = [];
    localStorage.removeItem("aiChatt");
    renderaChatt();
    visaIngenNyckelHint();
}

// ── Rensa-knapp ──
aiRensaKnappEl.addEventListener("click", () => {
    if (aiChatt.length === 0) return;
    if (!confirm("Rensa hela chatthistoriken?")) return;
    rensaChatt();
});

// ── Init ──
renderaChatt();
visaIngenNyckelHint();
