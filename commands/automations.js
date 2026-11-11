const enabled = new WeakMap();
const listeners = new WeakSet();

function isAdmin(sender, config) {
    const number = String(sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const allowed = [config.ownerNumber, ...(config.adminNumbers || [])]
        .filter(Boolean).map(value => String(value).replace(/\D/g, ""));
    return Boolean(number && allowed.includes(number));
}

function stateFor(sock, config) {
    if (!enabled.has(sock)) {
        enabled.set(sock, {
            welcomeDefault: Boolean(config.DEFAULT_WELCOME),
            antilinkDefault: Boolean(config.DEFAULT_ANTI_LINK),
            autoreact: Boolean(config.DEFAULT_AUTO_REACT),
            readall: Boolean(config.DEFAULT_READ_ALL),
            welcomeGroups: new Map(),
            antilinkGroups: new Map()
        });
    }
    return enabled.get(sock);
}

function bind(sock, config) {
    if (listeners.has(sock)) return;
    listeners.add(sock);
    sock.ev.on("group-participants.update", async update => {
        const state = stateFor(sock, config);
        const active = state.welcomeGroups.has(update.id) ? state.welcomeGroups.get(update.id) : state.welcomeDefault;
        if (!active || !["add", "remove"].includes(update.action)) return;
        const members = (update.participants || []).map(jid => `@${jid.split("@")[0]}`).join(", ");
        const greeting = update.action === "add" ? "Bienvenue" : "Au revoir";
        try {
            await sock.sendMessage(update.id, { text: `👋 ${greeting} ${members} !\n— ${config.botName}`, mentions: update.participants || [] });
        } catch (error) { console.error("[AUTOMATIONS] Message de groupe impossible :", error.message); }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const state = stateFor(sock, config);
        for (const msg of messages || []) {
            if (!msg?.message || msg.key?.fromMe) continue;
            const chat = msg.key.remoteJid;
            if (!chat || chat === "status@broadcast") continue;
            if (state.readall) { try { await sock.readMessages([msg.key]); } catch {} }
            if (state.autoreact) {
                const emojis = config.CUSTOM_REACT_EMOJIS || ["❤️"];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)] || "❤️";
                try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
            }
            if (!chat.endsWith("@g.us")) continue;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
            const antiLink = state.antilinkGroups.has(chat) ? state.antilinkGroups.get(chat) : state.antilinkDefault;
            if (!antiLink || !/(?:https?:\/\/)?chat\.whatsapp\.com\/[\w-]+/i.test(text)) continue;
            try {
                const metadata = await sock.groupMetadata(chat);
                const sender = msg.key.participant;
                const senderMember = metadata.participants.find(p => p.id === sender);
                const botNumber = sock.user?.id?.split(":")[0];
                const botMember = metadata.participants.find(p => p.id.split("@")[0].split(":")[0] === botNumber);
                // Leave group admins' posts untouched; deleting messages requires the bot to be an admin.
                if (!senderMember?.admin && botMember?.admin) await sock.sendMessage(chat, { delete: msg.key });
            } catch (error) { console.error("[AUTOMATIONS] Suppression du lien impossible :", error.message); }
        }
    });
}

const GROUP_FEATURES = ["welcome", "antilink"];
const GLOBAL_FEATURES = ["autoreact", "readall"];

module.exports = [
    {
        name: "automations",
        async execute({ sock, sender, args, isGroup, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Commande réservée au propriétaire et aux administrateurs configurés.");
            bind(sock, config);
            const state = stateFor(sock, config);
            const action = String(args[0] || "").toLowerCase();
            if (["on", "off"].includes(action)) {
                const value = action === "on";
                state.autoreact = value;
                state.readall = value;
                state.welcomeDefault = value;
                state.antilinkDefault = value;
                return reply(`✅ Automatisations globales ${value ? "activées" : "désactivées"}. Les réglages de groupe spécifiques peuvent être changés avec .welcome/.antilink.`);
            }
            const status = [
                `welcome (défaut): ${state.welcomeDefault ? "ON" : "OFF"}`,
                `antilink (défaut): ${state.antilinkDefault ? "ON" : "OFF"}`,
                `autoreact: ${state.autoreact ? "ON" : "OFF"}`,
                `readall: ${state.readall ? "ON" : "OFF"}`
            ].join("\n");
            return reply(`⚙️ *Automatisations Kyrox-MD*\n${status}\n${isGroup ? "Les réglages welcome/antilink peuvent être définis pour ce groupe." : "Dans un groupe, utilisez .welcome/.antilink on|off pour un réglage local."}`);
        }
    },
    ...GROUP_FEATURES.map(feature => ({
        name: feature,
        async execute({ sock, sender, args, from, isGroup, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Commande réservée au propriétaire et aux administrateurs configurés.");
            if (!isGroup) return reply(`Utilisez .${feature} dans le groupe à configurer.`);
            bind(sock, config);
            const value = String(args[0] || "").toLowerCase();
            if (!["on", "off", "default"].includes(value)) return reply(`Utilisation : .${feature} on|off|default`);
            const state = stateFor(sock, config);
            const map = feature === "welcome" ? state.welcomeGroups : state.antilinkGroups;
            if (value === "default") map.delete(from);
            else map.set(from, value === "on");
            const active = value === "default" ? (feature === "welcome" ? state.welcomeDefault : state.antilinkDefault) : value === "on";
            return reply(`✅ ${feature} ${value === "default" ? `réglé sur le défaut (${active ? "ON" : "OFF"})` : active ? "activé" : "désactivé"} pour ce groupe.`);
        }
    })),
    ...GLOBAL_FEATURES.map(feature => ({
        name: feature,
        async execute({ sock, sender, args, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Commande réservée au propriétaire et aux administrateurs configurés.");
            bind(sock, config);
            const value = String(args[0] || "").toLowerCase();
            if (!["on", "off"].includes(value)) return reply(`Utilisation : .${feature} on|off`);
            const state = stateFor(sock, config);
            state[feature] = value === "on";
            return reply(`✅ ${feature} ${state[feature] ? "activé" : "désactivé"}.`);
        }
    }))
];
