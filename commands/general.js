module.exports = [
    {
        name: "ping",
        async execute({ reply }) {
            const start = Date.now();
            await reply("⚡ Mesure de latence...");
            const latency = Date.now() - start;
            await reply(`🚀 *Kyrox-MD* : \`${latency}ms\``);
        }
    },
    {
        name: "alive",
        async execute({ reply, config }) {
            await reply(`👋 *${config.botName}* est en pleine forme !\n👑 Dev : ${config.ownerName}\n⚙️ Préfixe : [ ${config.prefix} ]`);
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
├ • ${config.prefix}ping
├ • ${config.prefix}alive
└ • ${config.prefix}menu

🤖 *INTELLIGENCE ARTIFICIELLE*
└ • ${config.prefix}ai <texte> : Discuter avec l'IA

📥 *TÉLÉCHARGEMENT*
└ • ${config.prefix}tiktok <lien> : Télécharger vidéo TikTok

🎨 *MÉDIAS*
├ • ${config.prefix}s : Créer un sticker (répondre à une image)
└ • ${config.prefix}vv : Ouvrir une photo/vidéo à vue unique

👥 *GROUPES*
├ • ${config.prefix}tagall <texte> : Mentionner tout le monde
├ • ${config.prefix}hidetag <texte> : Tag invisible
├ • ${config.prefix}mute : Fermer le groupe
└ • ${config.prefix}unmute : Ouvrir le groupe
`;
            await reply(text.trim());
        }
    }
];
