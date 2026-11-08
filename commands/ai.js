const axios = require("axios");

module.exports = [
    {
        name: "ai",
        async execute({ text, reply }) {
            if (!text) return await reply("Posez une question, ex : *.ai Qu'est-ce que la lune ?*");

            try {
                await reply("🤔 Traitement de votre demande...");
                const res = await axios.get(`https://api.giftedtech.web.id/api/ai/gpt?apikey=gifted&q=${encodeURIComponent(text)}`);
                const answer = res.data?.result || res.data?.message || "Je n'ai pas pu générer de réponse.";
                await reply(answer);
            } catch {
                await reply("❌ L'API IA ne répond pas pour le moment.");
            }
        }
    }
];
