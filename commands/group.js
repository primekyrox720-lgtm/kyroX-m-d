const { numberFromJid, isAdmin } = require("../lib/permissions");

async function requireGroupAdmin({ sock, from, sender, config, reply }) {
    const metadata = await sock.groupMetadata(from);
    const requester = metadata.participants.find(p => numberFromJid(p.id) === numberFromJid(sender));
    if (!isAdmin(sender, config) && !requester?.admin) {
        await reply("⛔ Cette action est réservée aux administrateurs du groupe.");
        return null;
    }
    const botNumber = numberFromJid(sock.user?.id);
    const bot = metadata.participants.find(p => numberFromJid(p.id) === botNumber);
    if (!bot?.admin) {
        await reply("❌ Le bot doit être administrateur du groupe.");
        return null;
    }
    return metadata;
}

function targetsFromMessage(msg) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    if (context?.mentionedJid?.length) return context.mentionedJid;
    if (context?.participant) return [context.participant];
    return [];
}

module.exports = [
    {
        name: "tagall",
        async execute({ sock, from, isGroup, args, reply }) {
            if (!isGroup) return reply("Commande utilisable uniquement en groupe.");
            const meta = await sock.groupMetadata(from);
            const mentions = meta.participants.map(p => p.id);
            const lines = mentions.map(jid => `🔹 @${jid.split("@")[0]}`).join("\n");
            await sock.sendMessage(from, { text: `📢 *TAG ALL*\nMessage : *${args.join(" ") || "Notification générale"}*\n\n${lines}`, mentions });
        }
    },
    {
        name: "hidetag",
        async execute({ sock, from, isGroup, args, reply }) {
            if (!isGroup) return reply("Réservé aux groupes.");
            const meta = await sock.groupMetadata(from);
            await sock.sendMessage(from, { text: args.join(" ") || "Attention tout le monde !", mentions: meta.participants.map(p => p.id) });
        }
    },
    ...[["mute", "announcement", "🔒 Groupe fermé. Seuls les admins peuvent écrire."], ["unmute", "not_announcement", "🔓 Groupe ouvert."]].map(([name, setting, success]) => ({
        name,
        async execute({ sock, from, sender, isGroup, reply, config }) {
            if (!isGroup) return reply("Commande utilisable uniquement en groupe.");
            if (!await requireGroupAdmin({ sock, from, sender, config, reply })) return;
            try { await sock.groupSettingUpdate(from, setting); await reply(success); }
            catch { await reply("❌ Modification impossible pour ce groupe."); }
        }
    })),
    ...[["kick", "remove"], ["promote", "promote"], ["demote", "demote"]].map(([name, action]) => ({
        name,
        async execute({ sock, msg, from, sender, isGroup, reply, config }) {
            if (!isGroup) return reply("Commande utilisable uniquement en groupe.");
            const targets = targetsFromMessage(msg);
            if (!targets.length) return reply(`Répondez à un membre ou mentionnez-le avec .${name}.`);
            const metadata = await requireGroupAdmin({ sock, from, sender, config, reply });
            if (!metadata) return;
            if (action === "remove" && targets.some(target => numberFromJid(target) === numberFromJid(config.ownerNumber))) return reply("⛔ Le bot ne peut pas exclure son propriétaire.");
            try { await sock.groupParticipantsUpdate(from, targets, action); await reply(`✅ Action ${name} effectuée pour ${targets.length} membre(s).`); }
            catch { await reply("❌ Action impossible. Vérifiez les permissions du bot et le statut des membres ciblés."); }
        }
    }))
];
