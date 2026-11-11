const axios = require("axios");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const automations = require("../bot/automations");

function numberOf(jid) {
    return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isOwner(sender, config) {
    const allowed = [config.ownerNumber, ...(config.adminNumbers || [])].map(numberOf).filter(Boolean);
    return allowed.includes(numberOf(sender));
}

function mentionedTargets(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const mentions = context?.mentionedJid || [];
    const quoted = context?.participant;
    return [...new Set([...mentions, ...(quoted ? [quoted] : [])])];
}

async function requireGroupAdmin({ sock, from, sender, reply }) {
    if (!from?.endsWith("@g.us")) {
        await reply("Cette commande fonctionne uniquement dans un groupe.");
        return null;
    }
    const metadata = await sock.groupMetadata(from);
    const senderNumber = numberOf(sender);
    const botNumber = numberOf(sock.user?.id);
    const senderMember = metadata.participants.find(member => numberOf(member.id) === senderNumber);
    const botMember = metadata.participants.find(member => numberOf(member.id) === botNumber);
    if (!senderMember?.admin) {
        await reply("⛔ Réservé aux administrateurs du groupe.");
        return null;
    }
    if (!botMember?.admin) {
        await reply("⛔ Le bot doit être administrateur du groupe pour effectuer cette action.");
        return null;
    }
    return metadata;
}

function mediaMessage(msg) {
    const message = msg?.message || {};
    return Boolean(message.imageMessage || message.videoMessage);
}

const commands = [
    {
        name: "menu",
        async execute({ sock, reply, config }) {
            automations.attach(sock, config);
            const p = config.prefix;
            await reply(`╭─「 *${config.botName}* 」\n│ ${p}menu — commandes\n│ ${p}ping — latence\n│ ${p}alive — état du bot\n│ ${p}owner — propriétaire\n│ ${p}mode public|private — accès\n│ ${p}ai <question> — assistant IA\n│ ${p}translate <texte> — traduire en français\n│ ${p}sticker — sticker depuis image/vidéo\n│ ${p}download <lien> — lien média (API configurée)\n│ ${p}welcome on|off — accueil du groupe\n│ ${p}antilink on|off — liens d’invitation\n│ ${p}autoreact on|off — réactions\n│ ${p}readall on|off — accusés de lecture\n│ ${p}tagall [texte] — mentionner le groupe\n│ ${p}kick @membre | ${p}promote @membre | ${p}demote @membre\n│ ${p}mute | ${p}unmute — réglage du groupe\n│ ${p}quiz / ${p}answer — jeu-questionnaire\n╰────────────────`);
        }
    },
    {
        name: "ping",
        async execute({ sock, reply, msg, config }) {
            automations.attach(sock, config);
            const sentAt = Number(msg?.messageTimestamp || 0) * 1000;
            const elapsed = sentAt ? Math.max(0, Date.now() - sentAt) : 0;
            await reply(`🏓 Pong${elapsed ? ` — ${elapsed} ms` : ""}`);
        }
    },
    {
        name: "alive",
        async execute({ sock, reply, config }) {
            automations.attach(sock, config);
            await reply(`✅ ${config.botName} est ${sock?.user ? "connecté" : "en cours de connexion"}.`);
        }
    },
    {
        name: "owner",
        async execute({ sock, reply, config }) {
            automations.attach(sock, config);
            await reply(`👑 ${config.ownerName}\nWhatsApp : ${config.ownerNumber}`);
        }
    },
    {
        name: "mode",
        async execute({ sock, args, reply, sender, config }) {
            automations.attach(sock, config);
            if (!isOwner(sender, config)) return reply("⛔ Commande réservée au propriétaire/administrateur configuré.");
            const mode = String(args[0] || "").toLowerCase();
            if (!["public", "private"].includes(mode)) return reply(`Utilisation : ${config.prefix}mode public|private`);
            config.mode = mode;
            await reply(`✅ Mode ${mode} activé (jusqu’au prochain redémarrage).`);
        }
    },
    ...["welcome", "antilink", "autoreact", "readall"].map(name => ({
        name,
        async execute(context) {
            const { sock, args, from, isGroup, reply, sender, config } = context;
            automations.attach(sock, config);
            if (!isOwner(sender, config)) return reply("⛔ Commande réservée au propriétaire/administrateur configuré.");
            if (["welcome", "antilink"].includes(name) && !isGroup) return reply(`Utilisez ${config.prefix}${name} dans le groupe à configurer.`);
            const action = String(args[0] || "").toLowerCase();
            if (!["on", "off"].includes(action)) return reply(`Utilisation : ${config.prefix}${name} on|off`);
            const enabled = action === "on";
            await automations.setFeature(name, enabled, ["welcome", "antilink"].includes(name) ? from : "global");
            await reply(`✅ ${name} ${enabled ? "activé" : "désactivé"}${["welcome", "antilink"].includes(name) ? " pour ce groupe" : ""}.`);
        }
    })),
    {
        name: "tagall",
        async execute({ sock, from, sender, args, reply, config }) {
            automations.attach(sock, config);
            const metadata = await requireGroupAdmin({ sock, from, sender, reply });
            if (!metadata) return;
            const mentions = metadata.participants.map(member => member.id);
            const message = args.join(" ").trim();
            await sock.sendMessage(from, { text: `${message ? `${message}\n` : ""}${mentions.map(jid => `@${jid.split("@")[0]}`).join(" ")}`, mentions });
        }
    },
    ...["kick", "promote", "demote"].map(action => ({
        name: action,
        async execute({ sock, msg, from, sender, reply, config }) {
            automations.attach(sock, config);
            if (!await requireGroupAdmin({ sock, from, sender, reply })) return;
            const targets = mentionedTargets(msg);
            if (!targets.length) return reply("Mentionnez le membre concerné ou répondez à son message.");
            await sock.groupParticipantsUpdate(from, targets, action === "kick" ? "remove" : action);
            await reply("✅ Action effectuée.");
        }
    })),
    {
        name: "mute",
        async execute({ sock, from, sender, reply, config }) {
            automations.attach(sock, config);
            if (!await requireGroupAdmin({ sock, from, sender, reply })) return;
            await sock.groupSettingUpdate(from, "announcement");
            await reply("🔒 Groupe réservé aux administrateurs.");
        }
    },
    {
        name: "unmute",
        async execute({ sock, from, sender, reply, config }) {
            automations.attach(sock, config);
            if (!await requireGroupAdmin({ sock, from, sender, reply })) return;
            await sock.groupSettingUpdate(from, "not_announcement");
            await reply("🔓 Tous les membres peuvent envoyer des messages.");
        }
    },
    {
        name: "sticker",
        aliases: ["s"],
        async execute({ sock, msg, reply, config }) {
            automations.attach(sock, config);
            if (!mediaMessage(msg)) return reply("Envoyez une image ou une vidéo courte avec la légende .sticker.");
            const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: require("pino")({ level: "silent" }), reuploadRequest: sock.updateMediaMessage });
            if (!Buffer.isBuffer(buffer) || buffer.length > 10 * 1024 * 1024) return reply("Le média est trop volumineux (limite 10 Mo).");
            const sticker = new Sticker(buffer, { pack: config.botName, author: config.ownerName, type: StickerTypes.FULL, quality: 70, background: "#00000000" });
            await sock.sendMessage(msg.key.remoteJid, await sticker.toMessage(), { quoted: msg });
        }
    },
    {
        name: "ai",
        async execute({ sock, text, reply, config }) {
            automations.attach(sock, config);
            const prompt = String(text || "").trim();
            if (!prompt) return reply(`Utilisation : ${config.prefix}ai votre question`);
            if (!process.env.AI_API_KEY || !process.env.AI_API_URL) return reply("L’IA n’est pas configurée. Définissez AI_API_URL et AI_API_KEY sur l’hébergement.");
            const response = await axios.post(process.env.AI_API_URL, {
                model: process.env.AI_MODEL || "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 700
            }, { timeout: 30000, maxContentLength: 1024 * 1024, headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" } });
            const answer = response.data?.choices?.[0]?.message?.content || response.data?.answer;
            if (!answer) throw new Error("Réponse IA vide");
            await reply(String(answer).slice(0, 3500));
        }
    },
    {
        name: "translate",
        async execute({ sock, text, reply, config }) {
            automations.attach(sock, config);
            if (!text) return reply(`Utilisation : ${config.prefix}translate le texte à traduire`);
            const endpoint = process.env.TRANSLATE_API_URL;
            if (!endpoint) return reply("Traduction non configurée. Définissez TRANSLATE_API_URL.");
            const response = await axios.post(endpoint, { text, target: "fr" }, { timeout: 20000, maxContentLength: 256 * 1024 });
            const translated = response.data?.translation || response.data?.translatedText;
            if (!translated) throw new Error("Réponse de traduction invalide");
            await reply(String(translated).slice(0, 3500));
        }
    },
    {
        name: "download",
        async execute({ sock, args, reply, config }) {
            automations.attach(sock, config);
            const input = args[0];
            if (!input) return reply(`Utilisation : ${config.prefix}download https://... (service MEDIA_API_URL requis)`);
            let url;
            try { url = new URL(input); } catch { return reply("Lien invalide."); }
            const allowedHosts = ["youtube.com", "youtu.be", "tiktok.com", "instagram.com", "facebook.com", "fb.watch"];
            if (url.protocol !== "https:" || !allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return reply("Seuls les liens HTTPS YouTube, TikTok, Instagram et Facebook sont acceptés.");
            if (!process.env.MEDIA_API_URL) return reply("Téléchargement non configuré. Définissez MEDIA_API_URL vers votre service autorisé.");
            const response = await axios.post(process.env.MEDIA_API_URL, { url: url.toString() }, { timeout: 30000, maxContentLength: 256 * 1024 });
            const result = response.data?.url;
            if (!result) throw new Error("Le service média n’a pas renvoyé de lien");
            await reply(`Lien fourni par le service média : ${String(result).slice(0, 1500)}`);
        }
    },
    {
        name: "quiz",
        async execute({ sock, from, reply, config }) {
            automations.attach(sock, config);
            const questions = [
                { q: "Quelle est la capitale du Japon ?", a: "tokyo" },
                { q: "Combien font 9 × 7 ?", a: "63" },
                { q: "Quelle planète est surnommée la planète rouge ?", a: "mars" },
                { q: "Quel est le plus grand océan ?", a: "pacifique" }
            ];
            const item = questions[Math.floor(Math.random() * questions.length)];
            automations.setQuizAnswer(from, item.a);
            await reply(`🎮 Quiz : ${item.q}\nRépondez avec ${config.prefix}answer <réponse>.`);
        }
    },
    {
        name: "answer",
        async execute({ sock, from, text, reply, config }) {
            automations.attach(sock, config);
            const result = automations.checkQuizAnswer(from, String(text || "").trim());
            if (result === null) return reply(`Aucun quiz en cours. Lancez ${config.prefix}quiz.`);
            await reply(result ? "🎉 Bonne réponse !" : "❌ Ce n’est pas la bonne réponse. Vous pouvez relancer le quiz.");
        }
    }
];

module.exports = commands;
