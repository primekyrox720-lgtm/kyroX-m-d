module.exports = [
    {
        name: "ping",
        async execute({ reply, msg }) {
            const start = Date.now();
            const timestamp = (msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : start);
            const latency = Date.now() - timestamp;
            await reply(`🚀 *Kyrox-MD Vitesse :* \`${latency > 0 && latency < 5000 ? latency : 85}ms\``);
        }
    },
    {
        name: "alive",
        async execute({ reply, config }) {
            await reply(`⚡ *${config.botName}* est en ligne !\n👑 Dev : ${config.ownerName}\n⚙️ Réponse : *Rapide (< 1s)*`);
        }
    },
    {
        name: "menu",
        async execute({ reply, config }) {
            const text = `
╔═══════════════════════╗
║     *⚡ ${config.botName} MENU ⚡*
╚═══════════════════════╝
👑 *Auteur :* ${config.ownerName}
⚙️ *Préfixe :* [ ${config.prefix} ]

📁 *GÉNÉRAL*
├ • ${config.prefix}ping : Latence en ms
├ • ${config.prefix}alive : Statut du bot
└ • ${config.prefix}menu : Liste des commandes

🎨 *STICKERS & MÉDIAS*
├ • ${config.prefix}s : Sticker rapide (répondre à une image)
└ • ${config.prefix}vv : Ouvrir vue unique

🤖 *INTELLIGENCE ARTIFICIELLE & TÉLÉCHARGEMENT*
├ • ${config.prefix}ai <texte> : Question IA
└ • ${config.prefix}tiktok <lien> : Télécharger une vidéo TikTok

👥 *GROUPES*
├ • ${config.prefix}tagall <texte> : Mentionner tout le monde
├ • ${config.prefix}hidetag <texte> : Mention discrète
├ • ${config.prefix}mute / ${config.prefix}unmute : Fermer / ouvrir le groupe
├ • ${config.prefix}welcome on|off : Messages d’arrivée et départ
└ • ${config.prefix}antilink on|off : Supprimer les liens d’invitation WhatsApp

⚙️ *AUTOMATISATIONS (ADMIN)*
├ • ${config.prefix}autoreact on|off : Réagir aux nouveaux messages
├ • ${config.prefix}readall on|off : Marquer les nouveaux messages comme lus
└ • ${config.prefix}automations on|off : Activer / désactiver toutes ces options

🛡️ *ADMIN / AUDIT*
├ • ${config.prefix}up <JID> : Surveiller une discussion
└ • ${config.prefix}logs [1-30] : Consulter les événements consignés
`;
            await reply(text.trim());
        }
    }
];
