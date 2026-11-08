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
const http = require("http");
const config = require("./config");

// Table contenant toutes les commandes chargées
const commands = new Map();

// 1. Décodage du SESSION_ID et restauration du fichier creds.json
function restoreSession() {
    let sId = process.env.SESSION_ID || config.sessionId;
    if (!sId) {
        console.log("ℹ️ Aucun SESSION_ID fourni. Le bot attendra un scan QR.");
        return;
    }

    // Nettoyage des guillemets et espaces accidentels
    sId = sId.trim().replace(/^["']|["']$/g, "");

    const credsPath = path.join(config.sessionDir, "creds.json");
    if (!fs.existsSync(credsPath)) {
        try {
            fs.mkdirSync(config.sessionDir, { recursive: true });
            const cleanBase64 = sId.startsWith("Kyrox~") ? sId.replace("Kyrox~", "") : sId;
            const data = Buffer.from(cleanBase64, "base64").toString("utf-8");
            
            // Validation que le contenu est bien du JSON
            JSON.parse(data);
            fs.writeFileSync(credsPath, data, "utf-8");
            console.log("🔑 [Kyrox-MD] Session restaurée avec succès depuis SESSION_ID !");
        } catch (err) {
            console.error("❌ Erreur critique lors de la lecture du SESSION_ID :", err.message);
        }
    }
}

// 2. Chargement automatique de tous les modules de commandes
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
                if (cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
            }
        } catch (e) {
            console.error(`❌ Erreur dans le fichier commands/${file} :`, e.message);
        }
    }
    console.log(`📦 [Kyrox-MD] ${commands.size} commande(s) initialisée(s).`);
}

// 3. Fonction principale de connexion WhatsApp
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

    // Sauvegarde des identifiants à chaque mise à jour de Baileys
    sock.ev.on("creds.update", saveCreds);

    // Surveillance de l'état de la connexion
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnexion automatique au serveur WhatsApp...");
                startBot();
            } else {
                console.log("❌ Déconnecté : la session a été révoquée depuis le téléphone.");
            }
        } else if (connection === "open") {
            console.log(`\n========================================`);
            console.log(` ✅ ${config.botName} CONNECTÉ ET OPÉRATIONNEL`);
            console.log(` Préfixe actif : [ ${config.prefix} ]`);
            console.log(`========================================\n`);
        }
    });

    // Écoute et traitement des messages entrants
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;

        // 🌟 FEATURE XTREME-XMD : LECTURE ET RÉACTION AUTOMATIQUE AUX STATUTS
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

        // Ignorer les messages envoyés par le bot lui-même
        if (msg.key.fromMe) return;

        const isGroup = from.endsWith("@g.us");
        const sender = isGroup ? (msg.key.participant || msg.participant) : from;

        // Extraction du texte quel que soit le format du message
        const m = msg.message;
        const body = m.conversation || 
                     m.extendedTextMessage?.text || 
                     m.imageMessage?.caption || 
                     m.videoMessage?.caption || "";

        // Vérification de la commande
        if (!body.startsWith(config.prefix)) return;

        const args = body.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const fullText = args.join(" ");

        const command = commands.get(commandName);
        if (command) {
            // Raccourci pour répondre au message
            const reply = (txt) => sock.sendMessage(from, { text: txt }, { quoted: msg });
            
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
                console.error(`Erreur d'exécution pour la commande .${commandName} :`, err);
                reply("❌ Une erreur s'est produite lors de l'exécution de cette commande.");
            }
        }
    });
}

// 4. Lancement du bot WhatsApp
startBot();

// 5. Serveur HTTP requis par Render pour valider le Web Service (Health Check)
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: #0284c7;">⚡ ${config.botName} est en ligne !</h1>
            <p>Le bot WhatsApp fonctionne parfaitement sur Render 24h/24.</p>
        </div>
    `);
}).listen(PORT, () => {
    console.log(`🌐 [Render Web] Port d'écoute ouvert sur le port ${PORT}`);
});
