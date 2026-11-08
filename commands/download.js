const axios = require("axios");

module.exports = [
    {
        name: "tiktok",
        async execute({ sock, text, from, reply, msg }) {
            if (!text || !text.includes("tiktok.com")) {
                return await reply("⚠️ Lien invalide. Exemple : *.tiktok https://vt.tiktok.com/...*");
            }

            try {
                await reply("⏳ Récupération de la vidéo TikTok...");
                const res = await axios.get(`https://api.giftedtech.web.id/api/download/tiktok?apikey=gifted&url=${encodeURIComponent(text)}`);
                const videoUrl = res.data?.result?.video;

                if (!videoUrl) return await reply("❌ Impossible de trouver la vidéo.");

                await sock.sendMessage(from, {
                    video: { url: videoUrl },
                    caption: "📥 Téléchargé avec *Kyrox-MD*"
                }, { quoted: msg });
            } catch {
                await reply("❌ Erreur de téléchargement TikTok.");
            }
        }
    }
];
