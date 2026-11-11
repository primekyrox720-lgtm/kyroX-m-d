const { isAdmin } = require("../lib/permissions");

module.exports = [
    {
        name: "mode",
        async execute({ sender, args, reply, config }) {
            if (!isAdmin(sender, config)) return reply("⛔ Seul le propriétaire ou un administrateur peut changer le mode.");
            const mode = String(args[0] || "").toLowerCase();
            if (!["public", "private", "group", "inbox"].includes(mode)) {
                return reply(`Mode actuel : *${config.mode}*\nUtilisation : .mode public|private|group|inbox`);
            }
            config.mode = mode;
            return reply(`✅ Mode du bot réglé sur *${mode}*. (Le réglage est en mémoire jusqu'au redémarrage.)`);
        }
    },
    {
        name: "reload",
        async execute({ sender, reply, config, reloadCommands }) {
            if (!isAdmin(sender, config)) return reply("⛔ Seul le propriétaire ou un administrateur peut recharger les commandes.");
            const count = reloadCommands();
            return reply(`✅ ${count} commandes rechargées depuis le dossier commands/.`);
        }
    }
];
