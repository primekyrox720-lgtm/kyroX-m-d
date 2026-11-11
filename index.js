const {
    default: makeWASocket, useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, Browsers, delay
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.disable("x-powered-by");
app.use(express.json({ limit: "4kb" }));

const commands = new Map();
let sock = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let pairingInProgress = false;
const pairAttempts = new Map();

function loadCommands() {
    const dir = path.join(__dirname, "commands");
    fs.mkdirSync(dir, { recursive: true });
    commands.clear();
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".js"))) {
        try {
            const filePath = path.join(dir, file);
            delete require.cache[require.resolve(filePath)];
            const mod = require(filePath);
            for (const cmd of (Array.isArray(mod) ? mod : [mod])) {
                if (cmd?.name && typeof cmd.execute === "function") commands.set(cmd.name.toLowerCase().trim(), cmd);
            }
        } catch (error) { console.error(`Erreur commands/${file} :`, error.message); }
    }
    console.log(`[KYROX-MD] ${commands.size} commandes chargées.`);
    return commands.size;
}

function unwrapMessage(msg) {
    let content = msg?.message;
    for (let i = 0; i < 4 && content; i++) {
        const wrapper = content.ephemeralMessage || content.viewOnceMessage || content.viewOnceMessageV2 || content.documentWithCaptionMessage;
        if (!wrapper?.message) break;
        content = wrapper.message;
    }
    return content;
}

function getMessageBody(msg) {
    const message = unwrapMessage(msg);
    return (message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption ||
        message?.videoMessage?.caption || message?.documentMessage?.caption || "").trim();
}

function normaliseNumber(value) { return String(value || "").split("@")[0].split(":")[0].replace(/\D/g, ""); }
function isAdmin(sender) {
    const number = normaliseNumber(sender);
    return Boolean(number && [config.ownerNumber, ...(config.adminNumbers || [])].some(n => normaliseNumber(n) === number));
}

function modeAllows(mode, from, sender) {
    if (mode === "private") return isAdmin(sender);
    if (mode === "group") return from.endsWith("@g.us");
    if (mode === "inbox") return !from.endsWith("@g.us");
    return true;
}

function restoreSessionIfAvailable() {
    let session = String(process.env.SESSION_ID || config.sessionId || "").trim().replace(/^['"]|['"]$/g, "");
    if (!session) return;
    const credsPath = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) return;
    try {
        fs.mkdirSync(config.sessionDir, { recursive: true, mode: 0o700 });
        session = session.startsWith("Kyrox~") ? session.slice("Kyrox~".length) : session;
        const decoded = Buffer.from(session, "base64").toString("utf8");
        JSON.parse(decoded);
        fs.writeFileSync(credsPath, decoded, { encoding: "utf8", mode: 0o600, flag: "wx" });
        console.log("[KYROX-MD] Session restaurée depuis SESSION_ID.");
    } catch (error) { console.error("SESSION_ID invalide ou impossible à restaurer :", error.message); }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    const wait = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; initBot().catch(error => console.error("Reconnexion impossible :", error.message)); }, wait);
}

async function initBot(phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    const current = makeWASocket({
        version, logger: pino({ level: process.env.LOG_LEVEL || "silent" }), auth: state,
        browser: Browsers.macOS("Safari"), markOnlineOnConnect: true,
        syncFullHistory: false, shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: jid => jid?.endsWith("@newsletter"), getMessage: async () => undefined,
        keepAliveIntervalMs: 10000, connectTimeoutMs: 30000, defaultQueryTimeoutMs: 60000
    });
    sock = current;
    current.ev.on("creds.update", saveCreds);
    current.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (sock !== current) return;
        if (connection === "open") {
            reconnectDelay = 1000;
            console.log(`[KYROX-MD] ${config.botName} connecté; mode=${config.mode}.`);
            try { await current.sendPresenceUpdate("available"); } catch {}
            return;
        }
        if (connection !== "close") return;
        sock = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
            console.error("Session WhatsApp déconnectée. Supprimez/réassociez la session explicitement avant de relancer le pairing.");
            return;
        }
        scheduleReconnect();
    });

    current.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages || []) {
            if (!msg?.message) continue;
            const from = msg.key.remoteJid;
            if (from === "status@broadcast") {
                if (config.AUTO_STATUS_VIEW) { try { await current.readMessages([msg.key]); } catch {} }
                if (config.AUTO_STATUS_REACT) {
                    try { await current.sendMessage(from, { react: { text: config.STATUS_REACT_EMOJI, key: msg.key } }, { statusJidList: [msg.key.participant] }); } catch {}
                }
                continue;
            }
            if (msg.key.fromMe) continue;
            const body = getMessageBody(msg);
            if (!body.startsWith(config.prefix)) continue;
            const isGroup = from.endsWith("@g.us");
            const sender = isGroup ? (msg.key.participant || msg.participant) : from;
            const parts = body.slice(config.prefix.length).trim().split(/\s+/).filter(Boolean);
            const commandName = (parts.shift() || "").toLowerCase();
            if (!commandName) continue;
            const command = commands.get(commandName);
            if (!command) continue;
            // Admin commands are still reachable in private mode; all other commands follow the selected bot mode.
            if (!modeAllows(config.mode, from, sender) && !(isAdmin(sender) && ["mode", "reload", "menu", "alive", "ping"].includes(commandName))) continue;
            const reply = async text => {
                try { return await current.sendMessage(from, { text: String(text) }, { quoted: msg }); }
                catch { return current.sendMessage(from, { text: String(text) }); }
            };
            try {
                await command.execute({ sock: current, msg, from, sender, isGroup, args: parts, text: parts.join(" "), reply, config, reloadCommands: loadCommands });
            } catch (error) {
                console.error(`Erreur [${commandName}] :`, error.message);
                await reply("❌ Erreur pendant le traitement de la commande.");
            }
        }
    });

    if (phoneNumber && !state.creds.registered) {
        await delay(1500);
        return current.requestPairingCode(phoneNumber);
    }
    return null;
}

function validPairingToken(req) {
    const expected = Buffer.from(config.pairingToken || "");
    const supplied = Buffer.from(String(req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    return expected.length >= 24 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function allowPairAttempt(ip) {
    const now = Date.now();
    const old = pairAttempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000, last: 0 };
    if (now > old.reset) { old.count = 0; old.reset = now + 15 * 60 * 1000; }
    if (old.count >= 5 || now - old.last < 10000) { pairAttempts.set(ip, old); return false; }
    old.count++;
    old.last = now;
    pairAttempts.set(ip, old);
    return true;
}

app.get("/health", (req, res) => res.json({ ok: true, connected: Boolean(sock?.user), bot: config.botName }));
app.get("/", (req, res) => {
    res.type("html").send(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${config.botName} — Pairing</title><style>body{font:16px system-ui;background:#08111f;color:#eef;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(420px,90vw);padding:28px;border:1px solid #27616b;border-radius:20px;background:#111d2b}input,button{box-sizing:border-box;width:100%;padding:13px;margin:8px 0;border-radius:9px;border:1px solid #456;background:#08111f;color:#fff}button{background:#087e8b;cursor:pointer}code{overflow-wrap:anywhere}</style><main class="card"><h1>${config.botName}</h1><p>Association multi-appareils WhatsApp</p><label>Numéro avec indicatif pays<input id="phone" autocomplete="tel" placeholder="50946387298"></label><label>Jeton de pairing configuré sur le serveur<input id="token" type="password" autocomplete="off"></label><button id="button" onclick="pair()">Générer le code</button><p id="result" aria-live="polite"></p><p>Dans WhatsApp : Appareils connectés → Connecter un appareil → Associer avec un numéro.</p><small>Ne partagez jamais le code d’association ni le jeton.</small></main><script>async function pair(){const b=document.getElementById('button'),r=document.getElementById('result');b.disabled=true;r.textContent='Génération…';try{const res=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+document.getElementById('token').value},body:JSON.stringify({phone:document.getElementById('phone').value})});const data=await res.json();r.textContent=data.code?'Code : '+data.code:(data.error||'Échec');}catch(e){r.textContent='Erreur réseau.'}finally{b.disabled=false}}</script></html>`);
});
app.post("/api/pair", async (req, res) => {
    if (!validPairingToken(req)) return res.status(config.pairingToken.length >= 24 ? 401 : 503).json({ error: "Pairing sécurisé indisponible : configurez un PAIRING_TOKEN aléatoire d'au moins 24 caractères." });
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowPairAttempt(ip)) return res.status(429).json({ error: "Trop de tentatives. Réessayez plus tard." });
    if (pairingInProgress || sock?.user) return res.status(409).json({ error: "Un bot est déjà connecté ou un pairing est en cours." });
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    if (phone.length < 7 || phone.length > 15) return res.status(400).json({ error: "Numéro invalide. Utilisez 7 à 15 chiffres avec indicatif pays." });
    const credsPath = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) return res.status(409).json({ error: "Une session existe déjà. Ne l'effacez pas via le site; gérez-la explicitement sur l'hébergement." });
    pairingInProgress = true;
    try {
        const code = await initBot(phone);
        return res.json({ code });
    } catch (error) {
        sock = null;
        console.error("Pairing échoué :", error.message);
        return res.status(500).json({ error: "Impossible de générer le code. Vérifiez les logs du serveur." });
    } finally { pairingInProgress = false; }
});

app.listen(PORT, () => {
    console.log(`[KYROX-MD] Serveur HTTP sur le port ${PORT}.`);
    loadCommands();
    restoreSessionIfAvailable();
    const creds = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(creds)) initBot().catch(error => console.error("Démarrage WhatsApp impossible :", error.message));
    else console.log("Aucune session. Configurez PAIRING_TOKEN puis utilisez la page de pairing.");
});
