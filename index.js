const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const commands = new Map();

// 1. Décodage du SESSION_ID reçu depuis votre serveur de pairing
function restoreSession() {
    let sId = process.env.SESSION_ID || config.sessionId;
    if (!sId) return;

    // Nettoyage des guillemets ou espaces indésirables
    sId = sId.trim().replace(/^["']|["']$/g, "");

    const credsPath = path.join(config.sessionDir, "creds.json");
    if (!fs.existsSync(credsPath)) {
        try {
            fs.mkdirSync(config.sessionDir, { recursive: true });
            const cleanBase64 = sId.startsWith("Kyrox~") ? sId.replace("Kyrox~", "") : sId;
            const data = Buffer.from(cleanBase64, "base64").toString("utf-8");
            
            // Validation que les données sont bien du JSON valide
            JSON.parse(data);
            fs.writeFileSync(credsPath, data, "utf-8");
            console.log("🔑 [Kyrox-MD] Session restaurée avec succès depuis SESSION_ID.");
        } catch (err) {
            console.error("❌ Erreur de décodage du SESSION_ID : clé invalide.");
        }
    }
}

// 2. Chargement de toutes les commandes
function loadCommands() {
    const dir = path.join(__dirname, "commands");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    commands.clear();

    for (const file of files) {
        try {
            const mod = require(path.join(dir, file));
            const list = Array.isArray(mod) ? mod : [mod];
            for (const cmd of list) {
                if (cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
            }
        } catch (e) {
            console.error(`❌ Erreur dans le fichier commands/${file} :`, e.message);
        }
    }
    console.log(`📦 [Kyrox-MD] ${commands.size} commande(s) active(s).`);
}

// 3. Boucle principale
async function startBot() {
    restoreSession();
    loadCommands();

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: !fs.existsSync(path.join(config.sessionDir, "creds.json")),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
        },
        browser: Browsers.macOS("Safari"),
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion du bot...");
                startBot();
            } else {
                console.log("❌ Déconnecté de WhatsApp : la session a expiré.");
            }
        } else if (connection === "open") {
            console.log(`\n========================================`);
            console.log(` ✅ ${config.botName} CONNECTÉ ET OPÉRATIONNEL`);
            console.log(`========================================\n`);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;

        // Auto-vue et réaction aux statuts
        if (from === "status@broadcast") {
            if (config.AUTO_STATUS_VIEW) {
                await sock.readMessages([msg.key]);
            }
            if (config.AUTO_STATUS_REACT) {
                await sock.sendMessage(from, {
                    react: { text: config.STATUS_REACT_EMOJI, key: msg.key }
                }, { statusJidList: [msg.key.participant] });
            }
            return;
        }

        if (msg.key.fromMe) return;

        const isGroup = from.endsWith("@g.us");
        const sender = isGroup ? (msg.key.participant || msg.participant) : from;

        // Lecture du message
        const m = msg.message;
        const body = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";

        if (!body.startsWith(config.prefix)) return;

        const args = body.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const fullText = args.join(" ");

        const command = commands.get(commandName);
        if (command) {
            const reply = (txt) => sock.sendMessage(from, { text: txt }, { quoted: msg });
            try {
                await command.execute({ sock, msg, from, sender, isGroup, args, text: fullText, reply, config });
            } catch (err) {
                console.error(`Erreur .${commandName} :`, err);
                reply("❌ Une erreur s'est produite lors de l'exécution.");
            }
        }
    });
}

startBot();
