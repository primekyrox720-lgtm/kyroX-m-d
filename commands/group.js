module.exports = [
    {
        name: "tagall",
        async execute({ sock, from, isGroup, args, reply }) {
            if (!isGroup) return await reply("Commande utilisable uniquement en groupe.");

            const meta = await sock.groupMetadata(from);
            const message = args.join(" ") || "Notification Générale";
            let txt = `📢 *TAG ALL*\nMessage : *${message}*\n\n`;
            const mentions = [];

            for (const p of meta.participants) {
                txt += `🔹 @${p.id.split("@")[0]}\n`;
                mentions.push(p.id);
            }
            await sock.sendMessage(from, { text: txt, mentions });
        }
    },
    {
        name: "hidetag",
        async execute({ sock, from, isGroup, args, reply }) {
            if (!isGroup) return await reply("Réservé aux groupes.");

            const meta = await sock.groupMetadata(from);
            const message = args.join(" ") || "Attention tout le monde !";
            const mentions = meta.participants.map(p => p.id);

            await sock.sendMessage(from, { text: message, mentions });
        }
    },
    {
        name: "mute",
        async execute({ sock, from, isGroup, reply }) {
            if (!isGroup) return;
            try {
                await sock.groupSettingUpdate(from, "announcement");
                await reply("🔒 *Groupe fermé.* Seuls les admins peuvent écrire.");
            } catch {
                await reply("❌ Le bot doit être administrateur du groupe pour faire ça.");
            }
        }
    },
    {
        name: "unmute",
        async execute({ sock, from, isGroup, reply }) {
            if (!isGroup) return;
            try {
                await sock.groupSettingUpdate(from, "not_announcement");
                await reply("🔓 *Groupe ouvert.*");
            } catch {
                await reply("❌ Le bot doit être administrateur du groupe.");
            }
        }
    }
];
