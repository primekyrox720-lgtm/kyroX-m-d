const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
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

// 1. Chargement dynamique de toutes les commandes
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
            console.error(`❌ Erreur chargement commands/${file} :`, e.message);
        }
    }
    console.log(`📦 [Kyrox-MD] ${commands.size} commande(s) initialisée(s) : [ ${Array.from(commands.keys()).join(", ")} ]`);
}

// 2. Extraction universelle du message (Déballage des conteneurs WhatsApp)
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

// 3. Initialisation Baileys optimisée en mode Haute Performance
async function initKyroxBot(phoneNumber = null) {
    // Évite l'erreur Bad MAC en fermant proprement l'ancien socket s'il existe
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
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
        },
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false, // ⚡ Turbo : Évite la synchro de présence lente
        fireInitQueries: false,      // ⚡ Turbo : Démarrage direct sans requêtes d'attente
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 15000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on("creds.update", saveCreds);

    // Surveillance de l'état de la connexion
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (connection === "close") {
            isConnected = false;
            console.log(`[WhatsApp] Connexion fermée (Code HTTP : ${statusCode})`);

            // Reconnexion automatique sur Code 515 (restartRequired) ou coupures réseau
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 Reconnexion au serveur WhatsApp en cours...");
                initKyroxBot();
            } else {
                console.log("❌ Session révoquée. Veuillez vous reconnecter via la page web.");
                if (fs.existsSync(config.sessionDir)) {
                    fs.rmSync(config.sessionDir, { recursive: true, force: true });
                }
            }
        } else if (connection === "open") {
            isConnected = true;
            console.log(`\n========================================`);
            console.log(` ✅ ${config.botName} CONNECTÉ ET ACTIF (< 1s) !`);
            console.log(` Préfixe actif : [ ${config.prefix} ]`);
            console.log(`========================================\n`);

            // Message de confirmation automatique envoyé à votre numéro
            setTimeout(async () => {
                try {
                    const hostNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                    await sock.sendMessage(hostNumber, {
                        text: `╔═══════════════════════╗\n` +
                              `║   ⚡ *${config.botName} EST ACTIF* ⚡   \n` +
                              `╚═══════════════════════╝\n\n` +
                              `✅ *Connexion validée avec succès !*\n` +
                              `Le bot répond désormais en moins d'une seconde.\n\n` +
                              `👉 Tapez *${config.prefix}ping* ou *${config.prefix}menu* pour tester !`
                    });
                    console.log("📩 Message de confirmation envoyé au propriétaire !");
                } catch (e) {
                    console.error("Erreur confirmation :", e.message);
                }
            }, 2500);
        }
    });

    // Écoute ultra-rapide des statuts et messages
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const from = msg.key.remoteJid;

        // Auto-vue et réaction aux statuts
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

        // Détection de la commande
        if (!body.startsWith(prefix)) return;

        console.log(`📩 [Commande] De: ${from} | Message: "${body}"`);

        const isGroup = from.endsWith("@g.us");
        const sender = isGroup ? (msg.key.participant || msg.participant) : from;

        const args = body.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase().trim();
        const fullText = args.join(" ");

        const command = commands.get(commandName);
        if (!command) return;

        // Fonction de réponse rapide avec fallback
        const reply = async (txt) => {
            try {
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
        } catch (err) {
            console.error(`❌ Erreur [${commandName}] :`, err);
            await reply("❌ Erreur pendant l'exécution de la commande.");
        }
    });

    // Demande du Pair Code
    if (phoneNumber && !sock.authState.creds.registered) {
        await delay(2500);
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`[Pairing] Code généré pour ${phoneNumber} : ${code}`);
        return code;
    }

    return null;
}

// 4. Interface Web Xtreme-XMD
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
            :root {
                --primary: #00f2fe;
                --secondary: #4facfe;
                --bg: #070913;
                --card-bg: rgba(16, 21, 38, 0.75);
                --border: rgba(0, 242, 254, 0.25);
            }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Rajdhani', sans-serif; }
            body {
                background: var(--bg);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                position: relative;
                overflow-x: hidden;
            }
            body::before, body::after {
                content: '';
                position: absolute;
                width: 320px;
                height: 320px;
                border-radius: 50%;
                filter: blur(120px);
                z-index: 0;
                opacity: 0.4;
                animation: float 8s ease-in-out infinite alternate;
            }
            body::before { background: #00f2fe; top: 10%; left: 10%; }
            body::after { background: #7928ca; bottom: 10%; right: 10%; animation-delay: -4s; }
            @keyframes float {
                0% { transform: translateY(0px) scale(1); }
                100% { transform: translateY(35px) scale(1.1); }
            }
            .card {
                position: relative;
                z-index: 10;
                width: 100%;
                max-width: 440px;
                background: var(--card-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--border);
                border-radius: 24px;
                padding: 35px 25px;
                text-align: center;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(0, 242, 254, 0.15);
            }
            .badge {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                background: rgba(0, 242, 254, 0.1);
                border: 1px solid rgba(0, 242, 254, 0.3);
                padding: 5px 14px;
                border-radius: 30px;
                font-size: 0.8rem;
                font-weight: 700;
                color: var(--primary);
                letter-spacing: 1.5px;
                margin-bottom: 15px;
                text-transform: uppercase;
            }
            .pulse-dot {
                width: 8px;
                height: 8px;
                background: #00ff88;
                border-radius: 50%;
                box-shadow: 0 0 10px #00ff88;
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
            h1 {
                font-family: 'Orbitron', sans-serif;
                font-size: 2.1rem;
                font-weight: 900;
                background: linear-gradient(135deg, #ffffff 20%, var(--primary) 70%, var(--secondary) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: 2px;
                margin-bottom: 5px;
            }
            .sub { color: #8b9bb4; font-size: 1rem; font-weight: 600; margin-bottom: 25px; }
            .input-group { position: relative; margin-bottom: 18px; }
            .input-group i {
                position: absolute; left: 16px; top: 50%;
                transform: translateY(-50%); color: #4a5d78; font-size: 1.1rem;
            }
            input {
                width: 100%; padding: 15px 16px 15px 48px;
                background: rgba(8, 12, 24, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px; color: #ffffff;
                font-size: 1.1rem; font-weight: 600;
                outline: none; transition: 0.3s;
            }
            input:focus { border-color: var(--primary); box-shadow: 0 0 15px rgba(0, 242, 254, 0.3); }
            .btn-submit {
                width: 100%; padding: 16px;
                background: linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #7928ca 100%);
                border: none; border-radius: 14px; color: #ffffff;
                font-family: 'Orbitron', sans-serif; font-size: 1rem; font-weight: 800;
                letter-spacing: 1.5px; cursor: pointer; transition: 0.3s;
                display: flex; align-items: center; justify-content: center; gap: 10px;
                box-shadow: 0 5px 25px rgba(0, 242, 254, 0.4);
            }
            .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0, 242, 254, 0.6); }
            .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
            .result-container {
                display: none; margin-top: 25px; padding: 20px;
                background: rgba(6, 10, 22, 0.9);
                border: 1px dashed var(--primary); border-radius: 16px;
            }
            .code-label { color: #8b9bb4; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }
            .code-display {
                font-family: 'Orbitron', monospace; font-size: 2.2rem;
                font-weight: 900; letter-spacing: 6px; color: #ffffff;
                text-shadow: 0 0 15px var(--primary); margin: 12px 0;
            }
            .btn-copy {
                background: rgba(0, 242, 254, 0.15); border: 1px solid var(--primary);
                color: var(--primary); padding: 8px 18px; border-radius: 20px;
                font-size: 0.9rem; font-weight: 700; cursor: pointer;
            }
            .btn-copy:hover { background: var(--primary); color: #000; }
            .steps {
                margin-top: 25px; text-align: left; background: rgba(255, 255, 255, 0.03);
                border-radius: 12px; padding: 15px; font-size: 0.85rem; color: #8b9bb4;
            }
            .steps p { margin-bottom: 6px; }
            .steps i { color: var(--primary); margin-right: 6px; }
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
                <p class="code-label">Saisissez ce code dans WhatsApp</p>
                <div class="code-display" id="codeText">--------</div>
                <button class="btn-copy" onclick="copyCode()">
                    <i class="fa-regular fa-copy"></i> Copier
                </button>
            </div>

            <div class="steps">
                <p><i class="fa-solid fa-1"></i> Ouvrez <b>WhatsApp</b> sur votre téléphone.</p>
                <p><i class="fa-solid fa-2"></i> Allez dans <b>Appareils connectés</b> > <b>Connecter</b>.</p>
                <p><i class="fa-solid fa-3"></i> Choisissez <b>« Associer avec un numéro »</b> et collez le code.</p>
            </div>

            <footer>Propulsé par <b>${config.ownerName}</b> • ${config.botName} v1.0</footer>
        </div>

        <script>
            async function submitPair() {
                const phoneInput = document.getElementById("phone");
                const btn = document.getElementById("btn");
                const resultBox = document.getElementById("resultBox");
                const codeText = document.getElementById("codeText");

                let phone = phoneInput.value.trim().replace(/[^0-9]/g, "");
                if (!phone) {
                    alert("⚠️ Veuillez entrer un numéro avec indicatif.");
                    return;
                }

                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GÉNÉRATION...';
                btn.disabled = true;

                try {
                    const res = await fetch("/api/pair", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();

                    if (data.code) {
                        resultBox.style.display = "block";
                        codeText.innerText = data.code;
                    } else {
                        alert("❌ " + (data.error || "Impossible de générer le code."));
                    }
                } catch (e) {
                    alert("❌ Erreur de communication avec le serveur.");
                } finally {
                    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> OBTENIR MON CODE';
                    btn.disabled = false;
                }
            }

            function copyCode() {
                const code = document.getElementById("codeText").innerText;
                if (!code || code === "--------") return;
                navigator.clipboard.writeText(code);
                alert("✅ Code copié !");
            }
        </script>
    </body>
    </html>
    `);
});

// 5. API de génération du Pair Code
app.post("/api/pair", async (req, res) => {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Numéro requis" });
    phone = phone.replace(/[^0-9]/g, "");

    if (fs.existsSync(config.sessionDir)) {
        try {
            fs.rmSync(config.sessionDir, { recursive: true, force: true });
        } catch (e) {}
    }

    try {
        const code = await initKyroxBot(phone);
        res.json({ code });
    } catch (e) {
        console.error("Erreur API Pair :", e);
        res.status(500).json({ error: "Échec de génération du code." });
    }
});

// 6. Lancement du serveur Web et reconnexion automatique
app.listen(PORT, async () => {
    console.log(`🌐 Serveur Kyrox-MD actif sur le port ${PORT}`);
    loadCommands();

    const credsPath = path.join(config.sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) {
        console.log("📂 Session existante détectée. Reconnexion automatique...");
        initKyroxBot();
    } else {
        console.log("ℹ️ Aucune session active. Ouvrez l'URL pour associer votre compte.");
    }
});
