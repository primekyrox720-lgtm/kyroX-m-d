const automations = require("../bot/automations");

function numberOf(jid) {
    return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isOwner(sender, config) {
    const allowed = [config.ownerNumber, ...(config.adminNumbers || [])].map(numberOf).filter(Boolean);
    return allowed.includes(numberOf(sender));
}

function mentionedTargets(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentions = context?.mentionedJid || [];
    const quoted = context?.participant;
    return [...new Set([...mentions, ...(quoted ? [quoted] : [])])];
}

async function requireGroupAdmin({ sock, from, sender, reply }) {
    if (!from?.endsWith("@g.us")) {
        await reply("Cette commande fonctionne uniquement dans un groupe.");
        return null;
    }
    const metadata = await sock.groupMetadata(from);
    const senderNumber = numberOf(sender);
    const botNumber = numberOf(sock.user?.id);
    const senderMember = metadata.participants.find(member => numberOf(member.id) === senderNumber);
    const botMember = metadata.participants.find(member => numberOf(member.id) === botNumber);
    if (!senderMember?.admin) {
        await reply("⛔ Réservé aux administrateurs du groupe.");
        return null;
    }
    if (!botMember?.admin) {
        await reply("⛔ Le bot doit être administrateur du groupe pour effectuer cette action.");
        return null;
    }
    return metadata;
}

const commands = [
    {
        name: "menu",
        async execute({ reply, config }) {
            await reply(`╭─「 *${config.botName}* 」\n│ ${config.prefix}menu — commandes\n│ ${config.prefix}ping — latence\n│ ${config.prefix}alive — état du bot\n│ ${config.prefix}owner — propriétaire\n│ ${config.prefix}mode public|private — accès\n│ ${config.prefix}welcome on|off — accueil du groupe\n│ ${config.prefix}antilink on|off — liens d’invitation\n│ ${config.prefix}autoreact on|off — réactions\n│ ${config.prefix}readall on|off — accusés de lecture\n│ ${config.prefix}tagall [texte] — mentionner le groupe\n│ ${config.prefix}kick @membre\n│ ${config.prefix}promote @membre\n│ ${config.prefix}demote @membre\n│ ${config.prefix}quiz — question de culture générale\n╰────────────────`);
        }
    },
    {
        name: "ping",
        async execute({ reply, msg }) {
            const sentAt = Number(msg?.messageTimestamp || 0) * 1000;
            const elapsed = sentAt ? Math.max(0, Date.now() - sentAt) : 0;
            await reply(`🏓 Pong${elapsed ? ` — ${elapsed} ms` : ""}`);
        }
    },
    {
        name: "alive",
        async execute({ reply, config, sock }) {
            await reply(`✅ ${config.botName} est ${sock?.user ? "connecté" : "en cours de connexion"}.`);
        }
    },
    {
        name: "owner",
        async execute({ reply, config }) {
            await reply(`👑 ${config.ownerName}\nWhatsApp : ${config.ownerNumber}`);
        }
    },
    {
        name: "mode",
        async execute({ args, reply, sender, config }) {
            if (!isOwner(sender, config)) return reply("⛔ Commande réservée au propriétaire/administrateur configuré.");
            const mode = String(args[0] || "").toLowerCase();
            if (!["public", "private"].includes(mode)) return reply(`Utilisation : ${config.prefix}mode public|private`);
            config.mode = mode;
            await reply(`✅ Mode ${mode} activé (jusqu’au prochain redémarrage).`);
        }
    },
    ...["welcome", "antilink", "autoreact", "readall"].map(name => ({
        name,
        async execute(context) {
            const { args, from, isGroup, reply, sender, config } = context;
            if (!isOwner(sender, config)) return reply("⛔ Commande réservée au propriétaire/administrateur configuré.");
            if (["welcome", "antilink"].includes(name) && !isGroup) return reply(`Utilisez ${config.prefix}${name} dans le groupe à configurer.`);
            const action = String(args[0] || "").toLowerCase();
            if (!["on", "off"].includes(action)) return reply(`Utilisation : ${config.prefix}${name} on|off`);
            const enabled = action === "on";
            await automations.setFeature(name, enabled, ["welcome", "antilink"].includes(name) ? from : "global");
            await reply(`✅ ${name} ${enabled ? "activé" : "désactivé"}${["welcome", "antilink"].includes(name) ? " pour ce groupe" : ""}.`);
        }
    })),
    {
        name: "tagall",
        async execute({ sock, from, sender, args, reply }) {
            const metadata = await requireGroupAdmin({ sock, from, sender, reply });
            if (!metadata) return;
            const mentions = metadata.participants.map(member => member.id);
            const message = args.join(" ").trim();
            await sock.sendMessage(from, { text: `${message ? `${message}\n` : ""}${mentions.map(jid => `@${jid.split("@")[0]}`).join(" ")}`, mentions });
        }
    },
    {
        name: "kick",
        async execute({ sock, msg, from, sender, reply }) {
            if (!await requireGroupAdmin({ sock, from, sender, reply })) return;
            const targets = mentionedTargets(msg);
            if (!targets.length) return reply("Mentionnez le membre à retirer.");
            await sock.groupParticipantsUpdate(from, targets, "remove");
            await reply("✅ Action effectuée.");
        }
    },
    ...["promote", "demote"].map(action => ({
        name: action,
        async execute({ sock, msg, from, sender, reply }) {
            if (!await requireGroupAdmin({ sock, from, sender, reply })) return;
            const targets = mentionedTargets(msg);
            if (!targets.length) return reply("Mentionnez le membre concerné.");
            await sock.groupParticipantsUpdate(from, targets, action);
            await reply("✅ Action effectuée.");
        }
    })),
    {
        name: "quiz",
        async execute({ from, reply }) {
            const questions = [
                { q: "Quelle est la capitale du Japon ?", a: "tokyo" },
                { q: "Combien font 9 × 7 ?", a: "63" },
                { q: "Quelle planète est surnommée la planète rouge ?", a: "mars" },
                { q: "Quel est le plus grand océan ?", a: "pacifique" }
            ];
            const item = questions[Math.floor(Math.random() * questions.length)];
            automations.setQuizAnswer(from, item.a);
            await reply(`🎮 Quiz : ${item.q}\nRépondez avec ${automations.getPrefix()}answer <réponse>.`);
        }
    },
    {
        name: "answer",
        async execute({ from, text, reply }) {
            const result = automations.checkQuizAnswer(from, String(text || "").trim());
            if (result === null) return reply("Aucun quiz en cours. Lancez .quiz.");
            await reply(result ? "🎉 Bonne réponse !" : "❌ Ce n’est pas la bonne réponse. Vous pouvez relancer .quiz.");
        }
    }
];

module.exports = commands;
