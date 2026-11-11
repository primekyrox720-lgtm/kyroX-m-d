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
            console.error("Session WhatsApp déconnectée. Gérez la session explicitement sur l'hébergement avant de refaire le pairing.");
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
    const supplied = Buffer.from(String(req.get("authorization") || "").replace(/^Bearer\\s+/i, ""));
    return expected.length > 0 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
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

// Page de pairing d'origine : le jeton est demandé au clic, sans champ visible sur la page.
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${config.botName} • PAIR CODE</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root { --primary: #00f2fe; --secondary: #4facfe; --bg: #070913; --card-bg: rgba(16, 21, 38, 0.75); --border: rgba(0, 242, 254, 0.25); }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Rajdhani', sans-serif; }
            body { background: var(--bg); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow-x: hidden; }
            body::before, body::after { content: ''; position: absolute; width: 320px; height: 320px; border-radius: 50%; filter: blur(120px); z-index: 0; opacity: 0.4; animation: float 8s ease-in-out infinite alternate; }
            body::before { background: #00f2fe; top: 10%; left: 10%; }
            body::after { background: #7928ca; bottom: 10%; right: 10%; animation-delay: -4s; }
            @keyframes float { 0% { transform: translateY(0px) scale(1); } 100% { transform: translateY(35px) scale(1.1); } }
            .card { position: relative; z-index: 10; width: 100%; max-width: 440px; background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 24px; padding: 35px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
            .badge { display: inline-flex; align-items: center; gap: 7px; background: rgba(0,242,254,0.1); border: 1px solid rgba(0,242,254,0.3); padding: 5px 14px; border-radius: 30px; font-size: .75rem; color: var(--primary); letter-spacing: 1px; }
            .pulse-dot { width: 8px; height: 8px; background: #00ff88; border-radius: 50%; box-shadow: 0 0 10px #00ff88; animation: pulse 1.5s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
            h1 { font-family: 'Orbitron', sans-serif; font-size: 2.1rem; font-weight: 900; background: linear-gradient(135deg,#fff 20%,var(--primary) 70%,var(--secondary) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 18px 0 8px; }
            .sub { color: #8b9bb4; font-size: 1rem; font-weight: 600; margin-bottom: 25px; }
            .input-group { position: relative; margin-bottom: 18px; }
            .input-group i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #4a5d78; }
            input { width: 100%; padding: 15px 16px 15px 48px; background: rgba(8,12,24,.85); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; color: #fff; font-size: 1.1rem; outline: none; }
            input:focus { border-color: var(--primary); box-shadow: 0 0 15px rgba(0,242,254,.3); }
            .btn-submit { width: 100%; padding: 16px; background: linear-gradient(135deg,#00f2fe 0%,#4facfe 50%,#7928ca 100%); border: none; border-radius: 14px; color: #fff; font-family: 'Orbitron', sans-serif; font-weight: 800; cursor: pointer; }
            .btn-submit:disabled { opacity: .6; cursor: wait; }
            .result-container { display: none; margin-top: 25px; padding: 20px; background: rgba(6,10,22,.9); border: 1px dashed var(--primary); border-radius: 16px; }
            .code-display { font-family: 'Orbitron', monospace; font-size: 2.2rem; font-weight: 900; letter-spacing: 6px; color: #fff; text-shadow: 0 0 15px var(--primary); margin: 12px 0; }
            .btn-copy { background: rgba(0,242,254,.15); border: 1px solid var(--primary); color: var(--primary); padding: 8px 18px; border-radius: 20px; font-weight: 700; cursor: pointer; }
            .steps { margin-top: 25px; text-align: left; background: rgba(255,255,255,.03); border-radius: 12px; padding: 15px; font-size: .85rem; color: #8b9bb4; }
            .steps p { margin-bottom: 6px; }
            footer { margin-top: 25px; font-size: .8rem; color: #55657e; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="badge"><span class="pulse-dot"></span> MULTI-DEVICE ACTIF</div>
            <h1>${config.botName}</h1>
            <p class="sub">Connexion directe WhatsApp</p>
            <div class="input-group"><i class="fa-solid fa-phone"></i><input type="text" id="phone" placeholder="Ex: 50946387298 (sans +)" autocomplete="tel"></div>
            <button class="btn-submit" id="btn" onclick="submitPair()"><i class="fa-solid fa-bolt"></i> OBTENIR MON CODE</button>
            <div class="result-container" id="resultBox"><p style="color:#8b9bb4;font-size:.85rem">Saisissez ce code dans WhatsApp</p><div class="code-display" id="codeText">--------</div><button class="btn-copy" onclick="copyCode()"><i class="fa-regular fa-copy"></i> Copier</button></div>
            <div class="steps"><p>1. Ouvrez <b>WhatsApp</b> &gt; <b>Appareils connectés</b> &gt; <b>Connecter</b>.</p><p>2. Choisissez <b>« Associer avec un numéro »</b> et collez le code.</p></div>
            <footer>Propulsé par <b>${config.ownerName}</b> • ${config.botName}</footer>
        </div>
        <script>
            async function submitPair() {
                const phone = document.getElementById("phone").value.trim().replace(/[^0-9]/g, "");
                if (!phone) return alert("Veuillez entrer un numéro valide.");
                const token = prompt("Entrez le jeton de pairing configuré par le propriétaire du bot :");
                if (!token) return;
                const btn = document.getElementById("btn");
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GÉNÉRATION...'; btn.disabled = true;
                try {
                    const res = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ phone }) });
                    const data = await res.json();
                    if (data.code) { document.getElementById("resultBox").style.display = "block"; document.getElementById("codeText").innerText = data.code; }
                    else alert("❌ " + (data.error || "Erreur"));
                } catch (e) { alert("Erreur réseau"); }
                finally { btn.innerHTML = '<i class="fa-solid fa-bolt"></i> OBTENIR MON CODE'; btn.disabled = false; }
            }
            function copyCode() { navigator.clipboard.writeText(document.getElementById("codeText").innerText); alert("✅ Code copié !"); }
        </script>
    </body>
    </html>`);
});

app.post("/api/pair", async (req, res) => {
    if (!config.pairingToken) return res.status(503).json({ error: "Pairing désactivé : le propriétaire doit configurer un jeton dans PAIRING_TOKEN." });
    if (!validPairingToken(req)) return res.status(401).json({ error: "Jeton invalide." });
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowPairAttempt(ip)) return res.status(429).json({ error: "Trop de tentatives. Réessayez plus tard." });
    if (pairingInProgress || sock?.user) return res.status(409).json({ error: "Un bot est déjà connecté ou un pairing est en cours." });
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    if (phone.length < 7 || phone.length > 15) return res.status(400).json({ error: "Numéro invalide. Utilisez 7 à 15 chiffres avec indicatif pays." });
    const credsPath = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) return res.status(409).json({ error: "Une session existe déjà. Gérez-la explicitement sur l'hébergement." });
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
