const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const settingsPath = path.join(dataDir, "bot-settings.json");
const settings = { global: {}, groups: {} };
const quizzes = new Map();
const listeners = new WeakSet();

function loadSettings() {
    try {
        const saved = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        Object.assign(settings.global, saved.global || {});
        Object.assign(settings.groups, saved.groups || {});
    } catch (error) {
        if (error.code !== "ENOENT") console.error("[AUTOMATIONS] Paramètres ignorés :", error.message);
    }
}

function persist() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const temporary = `${settingsPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, settingsPath);
}

loadSettings();

async function setFeature(name, enabled, scope = "global") {
    const bucket = scope === "global" ? settings.global : (settings.groups[scope] ||= {});
    bucket[name] = Boolean(enabled);
    persist();
}

function isEnabled(name, group) {
    if (group && Object.hasOwn(settings.groups[group] || {}, name)) return settings.groups[group][name];
    return Boolean(settings.global[name]);
}

function textOf(message) {
    let current = message?.message;
    for (let i = 0; i < 4 && current; i++) {
        const wrapper = current.ephemeralMessage || current.viewOnceMessage || current.viewOnceMessageV2 || current.documentWithCaptionMessage;
        if (!wrapper?.message) break;
        current = wrapper.message;
    }
    return String(current?.conversation || current?.extendedTextMessage?.text || current?.imageMessage?.caption || current?.videoMessage?.caption || "");
}

function attach(sock, config) {
    if (listeners.has(sock)) return;
    listeners.add(sock);
    sock.ev.on("group-participants.update", async update => {
        if (!isEnabled("welcome", update.id) || !["add", "remove"].includes(update.action)) return;
        const joined = update.action === "add";
        const mentions = update.participants || [];
        const names = mentions.map(jid => `@${jid.split("@")[0]}`).join(" ");
        try {
            await sock.sendMessage(update.id, { text: `${joined ? "👋 Bienvenue" : "👋 Au revoir"} ${names} !\n— ${config.botName}`, mentions });
        } catch (error) { console.error("[AUTOMATIONS] Message de bienvenue impossible :", error.message); }
    });
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages || []) {
            const chat = msg?.key?.remoteJid;
            if (!chat || !msg.message || msg.key.fromMe || chat === "status@broadcast") continue;
            if (isEnabled("readall")) {
                try { await sock.readMessages([msg.key]); } catch {}
            }
            if (isEnabled("autoreact")) {
                const emojis = config.CUSTOM_REACT_EMOJIS || ["❤️"];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)] || "❤️";
                try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
            }
            if (!chat.endsWith("@g.us") || !isEnabled("antilink", chat)) continue;
            const text = textOf(msg);
            if (!/(?:https?:\/\/)?chat\.whatsapp\.com\/[\w-]+/i.test(text)) continue;
            try {
                const metadata = await sock.groupMetadata(chat);
                const senderId = msg.key.participant;
                const botNumber = String(sock.user?.id || "").split(":")[0].split("@")[0];
                const member = metadata.participants.find(p => p.id === senderId);
                const bot = metadata.participants.find(p => p.id.split(":")[0].split("@")[0] === botNumber);
                if (!member?.admin && bot?.admin) await sock.sendMessage(chat, { delete: msg.key });
            } catch (error) { console.error("[AUTOMATIONS] Modération du lien impossible :", error.message); }
        }
    });
}

function setQuizAnswer(chat, answer) { quizzes.set(chat, { answer, expires: Date.now() + 5 * 60 * 1000 }); }
function checkQuizAnswer(chat, value) {
    const quiz = quizzes.get(chat);
    if (!quiz || quiz.expires < Date.now()) { quizzes.delete(chat); return null; }
    if (String(value).trim().toLowerCase() !== quiz.answer) return false;
    quizzes.delete(chat);
    return true;
}
function getPrefix() { return process.env.PREFIX || "."; }

module.exports = { attach, setFeature, setQuizAnswer, checkQuizAnswer, getPrefix };
