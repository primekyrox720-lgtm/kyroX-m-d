const enabled = new WeakMap();
const listeners = new WeakSet();

function isAdmin(sender, config) {
    const number = String(sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const allowed = [config.ownerNumber, ...(config.adminNumbers || [])]
        .filter(Boolean)
        .map(value => String(value).replace(/\D/g, ""));
    return Boolean(number && allowed.includes(number));
}

function stateFor(sock, config) {
    if (!enabled.has(sock)) {
        enabled.set(sock, {
            welcome: Boolean(config.DEFAULT_WELCOME),
            antilink: Boolean(config.DEFAULT_ANTI_LINK),
            autoreact: Boolean(config.DEFAULT_AUTO_REACT),
            readall: Boolean(config.DEFAULT_READ_ALL)
        });
    }
    return enabled.get(sock);
}

function bind(sock, config) {
    if (listeners.has(sock)) return;
    listeners.add(sock);

    sock.ev.on("group-participants.update", async update => {
        const state = stateFor(sock, config);
        if (!state.welcome || !["add", "remove"].includes(update.action)) return;
        const members = (update.participants || []).map(jid => `@${jid.split("@")[0]}`).join(", ");
        const greeting = update.action === "add" ? "Bienvenue" : "Au revoir";
        try {
            await sock.sendMessage(update.id, {
                text: `👋 ${greeting} ${members} !\n— ${config.botName}`,
                mentions: update.participants || []
            });
        } catch (error) {
            console.error("[AUTOMATIONS] Impossible d'envoyer le message de groupe :", error.message);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const state = stateFor(sock, config);
        for (const msg of messages || []) {
            if (!msg?.message || msg.key?.fromMe) continue;
            const chat = msg.key.remoteJid;
            if (!chat || chat === "status@broadcast") continue;

            if (state.readall) {
                try { await sock.readMessages([msg.key]); } catch {}
            }
            if (state.autoreact) {
                const emojis = config.CUSTOM_REACT_EMOJIS || ["❤️"];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)] || "❤️";
                try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
            }

            if (!state.antilink || !chat.endsWith("@g.us")) continue;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
            if (!/(?:https?:\/\/)?chat\.whatsapp\.com\/[\w-]+/i.test(text)) continue;

            try {
                const metadata = await sock.groupMetadata(chat);
                const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
                const bot = metadata.participants.find(participant => participant.id === botJid);
                if (bot?.admin) await sock.sendMessage(chat, { delete: msg.key });
            } catch (error) {
                console.error("[AUTOMATIONS] Suppression du lien impossible :", error.message);
            }
        }
    });
}

const FEATURES = ["welcome", "antilink", "autoreact", "readall"];

module.exports = [
    {
        name: "automations",
        async execute({ sock, sender, args, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Commande réservée au propriétaire et aux administrateurs configurés.");
            bind(sock, config);
            const state = stateFor(sock, config);
            if (args[0] === "on") FEATURES.forEach(feature => { state[feature] = true; });
            else if (args[0] === "off") FEATURES.forEach(feature => { state[feature] = false; });
            const status = FEATURES.map(feature => `${feature}: ${state[feature] ? "ON" : "OFF"}`).join("\n");
            return reply(`⚙️ *Automatisations Kyrox-MD*\n${status}\n\nUtilisez .welcome, .antilink, .autoreact ou .readall avec on/off.`);
        }
    },
    ...FEATURES.map(feature => ({
        name: feature,
        async execute({ sock, sender, args, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Commande réservée au propriétaire et aux administrateurs configurés.");
            bind(sock, config);
            const state = stateFor(sock, config);
            const value = String(args[0] || "").toLowerCase();
            if (!["on", "off"].includes(value)) {
                return reply(`Utilisation : .${feature} on|off (actuellement ${state[feature] ? "ON" : "OFF"})`);
            }
            state[feature] = value === "on";
            return reply(`✅ ${feature} ${state[feature] ? "activé" : "désactivé"}.`);
        }
    }))
];
