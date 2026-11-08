// 1. Filtrage des erreurs de chiffrement secondaires pour alléger la console et le CPU
const originalConsoleError = console.error;
console.error = (...args) => {
    const text = args.map(a => (typeof a === "object" ? a?.message || JSON.stringify(a) : String(a))).join(" ");
    if (text.includes("Bad MAC") || text.includes("Failed to decrypt") || text.includes("Session error")) {
        return;
    }
    originalConsoleError(...args);
};

// Protection Anti-Crash globale
process.on("uncaughtException", (err) => {
    if (!err.message?.includes("Bad MAC")) console.error("⚠️ [Erreur interceptée] :", err.message);
});
process.on("unhandledRejection", (reason) => {
    const msg = reason?.message || String(reason);
    if (!msg.includes("Bad MAC")) console.error("⚠️ [Rejet intercepté] :", msg);
});

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    delay
} = require("@whiskeysockets/baileys");

const express = require("express");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const commands = new Map();
let sock = null;
let isConnected = false;

// 2. Décodage de secours SESSION_ID si configuré dans Render
function restoreSessionIfAvailable() {
    let sId = process.env.SESSION_ID || config.sessionId;
    if (!sId) return;

    sId = sId.trim().replace(/^["']|["']$/g, "");
    const credsPath = path.join(config.sessionDir, "creds.json");

    if (!fs.existsSync(credsPath)) {
        try {
            fs.mkdirSync(config.sessionDir, { recursive: true });
            const cleanBase64 = sId.startsWith("Kyrox~") ? sId.replace("Kyrox~", "") : sId;
            const data = Buffer.from(cleanBase64, "base64").toString("utf-8");
            JSON.parse(data);
            fs.writeFileSync(credsPath, data, "utf-8");
            console.log("🔑 [Kyrox-MD] Session restaurée depuis la variable SESSION_ID !");
        } catch (e) {
            console.error("❌ SESSION_ID invalide :", e.message);
        }
    }
}

// 3. Chargement dynamique des commandes
function loadCommands() {
    const dir = path.join(__dirname, "commands");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    commands.clear();

    for (const file of files) {
        try {
            const filePath = path.join(dir, file);
            delete require.cache[require.resolve(filePath)];
            const mod = require(filePath);
            const list = Array.isArray(mod) ? mod : [mod];
            for (const cmd of list) {
                if (cmd.name) commands.set(cmd.name.toLowerCase().trim(), cmd);
            }
        } catch (e) {
            console.error(`❌ Erreur commands/${file} :`, e.message);
        }
    }
    console.log(`📦 [Kyrox-MD] ${commands.size} commandes chargées.`);
}

// 4. Extraction universelle du message (Déballage des conteneurs WhatsApp)
function getMessageBody(msg) {
    if (!msg || !msg.message) return "";
    let m = msg.message;

    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        ""
    ).trim();
}

// 5. Initialisation Haute Performance (Réception Instantanée)
async function initKyroxBot(phoneNumber = null) {
    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.end(undefined);
        } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: Browsers.macOS("Safari"),
        
        // ⚡ OPTIMISATIONS POUR FORCER LA LIVRAISON INSTANTANÉE ⚡
        markOnlineOnConnect: true, // Annonce le bot comme connecté immédiatement aux serveurs
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false, // Coupe la file d'attente d'historique lourd
        shouldIgnoreJid: (jid) => jid?.endsWith("@newsletter"),
        getMessage: async () => undefined,
        
        // Garde le tunnel WebSocket actif en continu
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (connection === "close") {
            isConnected = false;
            console.log(`[WhatsApp] Déconnecté (Code HTTP : ${statusCode})`);

            if (statusCode === DisconnectReason.restartRequired || statusCode === 515 || statusCode !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion rapide...");
                initKyroxBot();
            } else {
                console.log("❌ Session fermée.");
                if (fs.existsSync(config.sessionDir)) {
                    fs.rmSync(config.sessionDir, { recursive: true, force: true });
                }
            }
        } else if (connection === "open") {
            isConnected = true;
            console.log(`\n========================================`);
            console.log(` ✅ ${config.botName} EN LIGNE - RÉPONSE INSTANTANÉE !`);
            console.log(`========================================\n`);

            // ⚡ Forcer la présence en ligne pour que WhatsApp route les messages sans délai
            try {
                await sock.sendPresenceUpdate("available");
            } catch (e) {}

            setTimeout(async () => {
                try {
                    const hostJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    let backupSession = "";
                    const credsPath = path.join(config.sessionDir, "creds.json");
                    if (fs.existsSync(credsPath)) {
                        const raw = fs.readFileSync(credsPath, "utf-8");
                        backupSession = "Kyrox~" + Buffer.from(raw).toString("base64");
                    }

                    await sock.sendMessage(hostJid, {
                        text: `╔═══════════════════════╗\n` +
                              `║   ⚡ *${config.botName} EST ACTIF* ⚡   \n` +
                              `╚═══════════════════════╝\n\n` +
                              `✅ *Connexion validée !*\n` +
                              `Le flux de réception instantanée est activé.\n\n` +
                              `👉 Tapez *${config.prefix}ping* ou *${config.prefix}menu*.\n\n` +
                              `🔑 *SESSION_ID de secours (pour Render) :*\n\`\`\`${backupSession}\`\`\``
                    });
                } catch (e) {}
            }, 2500);
        }
    });

    // Écoute des messages
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const from = msg.key.remoteJid;

        // Auto-vue des statuts
        if (from === "status@broadcast") {
            if (config.AUTO_STATUS_VIEW) await sock.readMessages([msg.key]);
            if (config.AUTO_STATUS_REACT) {
                await sock.sendMessage(from, {
                    react: { text: config.STATUS_REACT_EMOJI, key: msg.key }
                }, { statusJidList: [msg.key.participant] });
            }
            return;
        }

        const body = getMessageBody(msg);
        if (!body) return;

        const prefix = config.prefix || ".";
        if (!body.startsWith(prefix)) return;

        console.log(`📩 [Commande reçue] : "${body}" de ${from}`);

        const isGroup = from.endsWith("@g.us");
        const sender = isGroup ? (msg.key.participant || msg.participant) : from;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase().trim();
        const fullText = args.join(" ");

        const command = commands.get(commandName);
        if (!command) return;

        const isLid = from.endsWith("@lid");
        const isSelf = msg.key.fromMe;

        // Réponse immédiate
        const reply = async (txt) => {
            try {
                if (isLid || isSelf) {
                    const destination = (isLid && isSelf && sock.user) 
                        ? (sock.user.id.split(":")[0] + "@s.whatsapp.net") 
                        : from;
                    return await sock.sendMessage(destination, { text: txt });
                }
                return await sock.sendMessage(from, { text: txt }, { quoted: msg });
            } catch (err) {
                return await sock.sendMessage(from, { text: txt });
            }
        };

        try {
            await command.execute({ 
                sock, 
                msg, 
                from, 
                sender, 
                isGroup, 
                args, 
                text: fullText, 
                reply, 
                config 
            });
            console.log(`⚡ [${commandName}] exécuté immédiatement.`);
        } catch (err) {
            console.error(`❌ Erreur [${commandName}] :`, err.message);
            await reply("❌ Erreur pendant le traitement.");
        }
    });

    if (phoneNumber && !sock.authState.creds.registered) {
        await delay(2500);
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`[Pairing] Code pour ${phoneNumber} : ${code}`);
        return code;
    }

    return null;
}

// 6. Interface Web Xtreme-XMD
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
            .card { position: relative; z-index: 10; width: 100%; max-width: 440px; background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 24px; padding: 35px 25px; text-align: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6); }
            .badge { display: inline-flex; align-items: center; gap: 7px; background: rgba(0,242,254,0.1); border: 1px solid rgba(0,242,254,0.3); padding: 5px 14px; border-radius: 30px; font-size: 0.8rem; font-weight: 700; color: var(--primary); letter-spacing: 1.5px; margin-bottom: 15px; }
            .pulse-dot { width: 8px; height: 8px; background: #00ff88; border-radius: 50%; box-shadow: 0 0 10px #00ff88; animation: pulse 1.5s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            h1 { font-family: 'Orbitron', sans-serif; font-size: 2.1rem; font-weight: 900; background: linear-gradient(135deg, #fff 20%, var(--primary) 70%, var(--secondary) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .sub { color: #8b9bb4; font-size: 1rem; font-weight: 600; margin-bottom: 25px; }
            .input-group { position: relative; margin-bottom: 18px; }
            .input-group i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #4a5d78; }
            input { width: 100%; padding: 15px 16px 15px 48px; background: rgba(8, 12, 24, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; color: #fff; font-size: 1.1rem; font-weight: 600; outline: none; }
            input:focus { border-color: var(--primary); box-shadow: 0 0 15px rgba(0,242,254,0.3); }
            .btn-submit { width: 100%; padding: 16px; background: linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #7928ca 100%); border: none; border-radius: 14px; color: #fff; font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
            .result-container { display: none; margin-top: 25px; padding: 20px; background: rgba(6, 10, 22, 0.9); border: 1px dashed var(--primary); border-radius: 16px; }
            .code-display { font-family: 'Orbitron', monospace; font-size: 2.2rem; font-weight: 900; letter-spacing: 6px; color: #fff; text-shadow: 0 0 15px var(--primary); margin: 12px 0; }
            .btn-copy { background: rgba(0,242,254,0.15); border: 1px solid var(--primary); color: var(--primary); padding: 8px 18px; border-radius: 20px; font-weight: 700; cursor: pointer; }
            .steps { margin-top: 25px; text-align: left; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 15px; font-size: 0.85rem; color: #8b9bb4; }
            .steps p { margin-bottom: 6px; }
            footer { margin-top: 25px; font-size: 0.8rem; color: #55657e; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="badge"><span class="pulse-dot"></span> MULTI-DEVICE ACTIF</div>
            <h1>${config.botName}</h1>
            <p class="sub">Connexion directe WhatsApp</p>
            <div class="input-group">
                <i class="fa-solid fa-phone"></i>
                <input type="text" id="phone" placeholder="Ex: 50946387298 (sans +)">
            </div>
            <button class="btn-submit" id="btn" onclick="submitPair()">
                <i class="fa-solid fa-bolt"></i> OBTENIR MON CODE
            </button>
            <div class="result-container" id="resultBox">
                <p style="color:#8b9bb4; font-size:0.85rem;">Saisissez ce code dans WhatsApp</p>
                <div class="code-display" id="codeText">--------</div>
                <button class="btn-copy" onclick="copyCode()"><i class="fa-regular fa-copy"></i> Copier</button>
            </div>
            <div class="steps">
                <p>1. Ouvrez <b>WhatsApp</b> > <b>Appareils connectés</b> > <b>Connecter</b>.</p>
                <p>2. Choisissez <b>« Associer avec un numéro »</b> et collez le code.</p>
            </div>
            <footer>Propulsé par <b>${config.ownerName}</b> • ${config.botName}</footer>
        </div>
        <script>
            async function submitPair() {
                const phone = document.getElementById("phone").value.trim().replace(/[^0-9]/g, "");
                if (!phone) return alert("Veuillez entrer un numéro valide.");
                const btn = document.getElementById("btn");
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GÉNÉRATION...';
                btn.disabled = true;
                try {
                    const res = await fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
                    const data = await res.json();
                    if (data.code) {
                        document.getElementById("resultBox").style.display = "block";
                        document.getElementById("codeText").innerText = data.code;
                    } else { alert("❌ " + (data.error || "Erreur")); }
                } catch(e) { alert("Erreur réseau"); }
                finally { btn.innerHTML = '<i class="fa-solid fa-bolt"></i> OBTENIR MON CODE'; btn.disabled = false; }
            }
            function copyCode() {
                navigator.clipboard.writeText(document.getElementById("codeText").innerText);
                alert("✅ Code copié !");
            }
        </script>
    </body>
    </html>
    `);
});

// 7. API de pairing
app.post("/api/pair", async (req, res) => {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Numéro requis" });
    phone = phone.replace(/[^0-9]/g, "");

    if (fs.existsSync(config.sessionDir)) {
        try { fs.rmSync(config.sessionDir, { recursive: true, force: true }); } catch (e) {}
    }

    try {
        const code = await initKyroxBot(phone);
        res.json({ code });
    } catch (e) {
        res.status(500).json({ error: "Échec génération code" });
    }
});

// 8. Démarrage du serveur et détection de session
app.listen(PORT, async () => {
    console.log(`🌐 Serveur actif sur le port ${PORT}`);
    loadCommands();
    restoreSessionIfAvailable();

    const credsPath = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) {
        console.log("📂 Session existante. Démarrage immédiat...");
        initKyroxBot();
    } else {
        console.log("ℹ️ Aucune session active. Ouvrez l'URL pour associer votre compte.");
    }
});
