const { downloadMediaMessage } = require("@whiskeysockets/baileys");

module.exports = [
    {
        name: "s",
        async execute({ sock, msg, from, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted ? { message: quoted } : msg;
            const isMedia = target.message?.imageMessage || target.message?.videoMessage;

            if (!isMedia) {
                return await reply("⚠️ Répondez à une image ou une vidéo courte avec *.s*");
            }

            try {
                await reply("⏳ Création du sticker...");
                const buffer = await downloadMediaMessage(target, "buffer", {});
                await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
            } catch (e) {
                await reply("❌ Impossible de convertir ce média.");
            }
        }
    },
    {
        name: "vv",
        async execute({ sock, msg, from, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const viewOnce = quoted?.viewOnceMessageV2?.message || quoted?.viewOnceMessage?.message;

            if (!viewOnce) {
                return await reply("⚠️ Répondez à un message à vue unique avec *.vv*");
            }

            try {
                const isImage = Boolean(viewOnce.imageMessage);
                const buffer = await downloadMediaMessage({ message: viewOnce }, "buffer", {});

                if (isImage) {
                    await sock.sendMessage(from, { image: buffer, caption: "🔓 Déverrouillé par Kyrox-MD" }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { video: buffer, caption: "🔓 Déverrouillé par Kyrox-MD" }, { quoted: msg });
                }
            } catch (e) {
                await reply("❌ Échec lors du déverrouillage de la vue unique.");
            }
        }
    }
];
