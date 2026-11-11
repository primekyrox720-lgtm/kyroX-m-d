const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

function fastImageToWebp(mediaBuffer) {
    return new Promise((resolve, reject) => {
        const id = `${process.pid}_${Date.now()}`;
        const tmpInput = path.join(__dirname, `../in_${id}.jpg`);
        const tmpOutput = path.join(__dirname, `../out_${id}.webp`);
        fs.writeFileSync(tmpInput, mediaBuffer);
        ffmpeg(tmpInput)
            .outputOptions(["-vcodec", "libwebp", "-vf", "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000", "-lossless", "0", "-compression_level", "2", "-q:v", "50", "-preset", "picture", "-an", "-vsync", "0"])
            .toFormat("webp").save(tmpOutput)
            .on("end", () => {
                try { const result = fs.readFileSync(tmpOutput); fs.unlinkSync(tmpInput); fs.unlinkSync(tmpOutput); resolve(result); }
                catch (error) { reject(error); }
            })
            .on("error", error => {
                try { if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput); if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch {}
                reject(error);
            });
    });
}

module.exports = [
    {
        name: "s",
        async execute({ sock, msg, from, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted ? { message: quoted } : msg;
            if (!target.message?.imageMessage && !target.message?.videoMessage) return reply("⚠️ Répondez à une image ou vidéo avec *.s*.");
            try {
                const rawBuffer = await downloadMediaMessage(target, "buffer", {});
                const sticker = await fastImageToWebp(rawBuffer);
                await sock.sendMessage(from, { sticker }, { quoted: msg });
            } catch (error) { console.error("Erreur sticker :", error.message); await reply("❌ Erreur de conversion. Vérifiez que FFmpeg est installé."); }
        }
    },
    {
        name: "vv",
        async execute({ reply }) {
            return reply("🔒 Cette commande est désactivée : les médias à vue unique sont conçus pour disparaître et ne sont pas extraits ni redistribués par KYROX-MD.");
        }
    }
];
