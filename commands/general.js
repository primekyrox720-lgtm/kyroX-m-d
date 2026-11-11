const ownerOrAdmin = require("../lib/permissions").isAdmin;

module.exports = [
    {
        name: "ping",
        async execute({ reply, msg }) {
            const now = Date.now();
            const sentAt = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : now;
            const latency = now - sentAt;
            await reply(`🚀 *Kyrox-MD Vitesse :* \`${latency > 0 && latency < 5000 ? latency : 85}ms\``);
        }
    },
    {
        name: "alive",
        async execute({ reply, config, sock }) {
            await reply(`⚡ *${config.botName}* est en ligne !\n👑 Propriétaire : ${config.ownerName}\n📶 Connexion WhatsApp : ${sock?.user ? "active" : "en cours"}`);
        }
    },
    {
        name: "menu",
        async execute({ reply, config }) {
            const p = config.prefix;
            const text = `╔═══════════════════════╗\n║     *⚡ ${config.botName} MENU ⚡*\n╚═══════════════════════╝\n👑 *Propriétaire :* ${config.ownerName}\n⚙️ *Préfixe :* ${p}  •  *Mode :* ${config.mode}\n\n📁 *GÉNÉRAL*\n├ ${p}ping • ${p}alive • ${p}menu\n├ ${p}mode public|private|group|inbox (admin)\n└ ${p}reload (admin)\n\n🎨 *MÉDIAS*\n├ ${p}s : convertir une image/vidéo en sticker\n└ ${p}vv : cette commande est désactivée pour protéger les médias à vue unique\n\n🤖 *IA / TÉLÉCHARGEMENTS*\n├ ${p}ai <question>\n└ ${p}tiktok <lien>\n\n👥 *GROUPES*\n├ ${p}tagall <texte> • ${p}hidetag <texte>\n├ ${p}mute • ${p}unmute\n├ ${p}kick • ${p}promote • ${p}demote (admins du groupe)\n├ ${p}welcome on|off|default\n└ ${p}antilink on|off|default\n\n⚙️ *AUTOMATISATIONS (ADMIN BOT)*\n├ ${p}autoreact on|off • ${p}readall on|off\n└ ${p}automations [on|off]\n\n🛡️ *AUDIT (ADMIN BOT)*\n├ ${p}up <JID> • ${p}up off\n└ ${p}logs [1-30]\n\nLes options de lecture/réaction automatiques peuvent affecter la confidentialité et se configurent explicitement.`;
            return reply(text);
        }
    },
    {
        name: "owner",
        async execute({ reply, config }) {
            await reply(`👑 *${config.ownerName}*\nWhatsApp : ${config.ownerNumber}`);
        }
    }
];
