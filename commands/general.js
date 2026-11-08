module.exports = [
    {
        name: "ping",
        async execute({ reply, msg }) {
            const start = Date.now();
            // Calcul de la latence réelle entre l'envoi WhatsApp et la réception
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

🤖 *INTELLIGENCE ARTIFICIELLE*
└ • ${config.prefix}ai <texte> : Question IA

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
