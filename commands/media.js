const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

function fastImageToWebp(mediaBuffer) {
    return new Promise((resolve, reject) => {
        const id = Date.now();
        const tmpInput = path.join(__dirname, `../in_${id}.jpg`);
        const tmpOutput = path.join(__dirname, `../out_${id}.webp`);

        fs.writeFileSync(tmpInput, mediaBuffer);

        ffmpeg(tmpInput)
            .outputOptions([
                "-vcodec", "libwebp",
                "-vf", "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000",
                "-lossless", "0",
                "-compression_level", "2",
                "-q:v", "50",
                "-preset", "picture",
                "-an",
                "-vsync", "0"
            ])
            .toFormat("webp")
            .save(tmpOutput)
            .on("end", () => {
                const webpBuffer = fs.readFileSync(tmpOutput);
                try {
                    fs.unlinkSync(tmpInput);
                    fs.unlinkSync(tmpOutput);
                } catch (e) {}
                resolve(webpBuffer);
            })
            .on("error", (err) => {
                try {
                    if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
                    if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
                } catch (e) {}
                reject(err);
            });
    });
}

module.exports = [
    {
        name: "s",
        async execute({ sock, msg, from, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted ? { message: quoted } : msg;
            const isMedia = target.message?.imageMessage || target.message?.videoMessage;

            if (!isMedia) {
                return await reply("⚠️ Répondez à une image avec *.s*");
            }

            try {
                // Téléchargement et conversion directe en parallèle
                const rawBuffer = await downloadMediaMessage(target, "buffer", {});
                const stickerWebp = await fastImageToWebp(rawBuffer);

                await sock.sendMessage(from, { sticker: stickerWebp }, { quoted: msg });
            } catch (e) {
                console.error("Erreur sticker rapide :", e);
                await reply("❌ Erreur de conversion.");
            }
        }
    },
    {
        name: "vv",
        async execute({ sock, msg, from, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const viewOnce = quoted?.viewOnceMessageV2?.message || quoted?.viewOnceMessage?.message;

            if (!viewOnce) {
                return await reply("⚠️ Répondez à une vue unique avec *.vv*");
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
                await reply("❌ Échec lors du déverrouillage.");
            }
        }
    }
];
