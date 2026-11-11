const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const warningsPath = path.join(dataDir, "group-warnings.json");
let warnings = {};
const games = new Map();
const boardLines = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

try {
    warnings = JSON.parse(fs.readFileSync(warningsPath, "utf8"));
} catch (error) {
    if (error.code !== "ENOENT") console.error("[WARNINGS] Fichier illisible; démarrage avec un registre vide.");
}

function persistWarnings() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${warningsPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(warnings, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, warningsPath);
}

function phone(jid) { return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, ""); }

async function getGroupAdmin({ sock, from, sender, reply }) {
    if (!from?.endsWith("@g.us")) {
        await reply("Cette commande est réservée aux groupes.");
        return null;
    }
    const metadata = await sock.groupMetadata(from);
    const senderNumber = phone(sender);
    const senderMember = metadata.participants.find(member => phone(member.id) === senderNumber);
    if (!senderMember?.admin) {
        await reply("⛔ Seuls les administrateurs du groupe peuvent gérer les avertissements.");
        return null;
    }
    return metadata;
}

function targetsFromMessage(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.participant;
    return [...new Set([...(context?.mentionedJid || []), ...(quoted ? [quoted] : [])])];
}

function gameBoard(game) {
    return game.board.map((cell, index) => cell || boardLines[index]).reduce((rows, item, index) => {
        if (index % 3 === 0) rows.push([]);
        rows[rows.length - 1].push(item);
        return rows;
    }, []).map(row => row.join(" │ ")).join("\n──────────\n");
}

function winner(board) {
    for (const [a, b, c] of wins) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    return null;
}

module.exports = [
    {
        name: "warn",
        async execute({ sock, msg, from, sender, args, reply, config }) {
            const metadata = await getGroupAdmin({ sock, from, sender, reply });
            if (!metadata) return;
            const targets = targetsFromMessage(msg);
            if (targets.length !== 1) return reply(`Mentionnez un membre ou répondez à son message.\nExemple : ${config.prefix}warn @membre raison`);
            if (phone(targets[0]) === phone(sock.user?.id)) return reply("Le bot ne peut pas s’avertir lui-même.");
            const target = metadata.participants.find(member => phone(member.id) === phone(targets[0]));
            if (!target) return reply("Membre introuvable dans ce groupe.");
            if (target.admin) return reply("Les avertissements ne peuvent pas viser un administrateur du groupe.");
            const group = warnings[from] ||= {};
            const key = target.id;
            const record = group[key] ||= { count: 0, reasons: [] };
            record.count += 1;
            const reason = args.slice(1).join(" ").trim().slice(0, 200);
            if (reason) record.reasons.push({ reason, by: sender, at: new Date().toISOString() });
            record.reasons = record.reasons.slice(-10);
            persistWarnings();
            await sock.sendMessage(from, { text: `⚠️ @${target.id.split("@")[0]} reçoit un avertissement (${record.count}).${reason ? `\nMotif : ${reason}` : ""}\nAucun retrait automatique n’est effectué.`, mentions: [target.id] });
        }
    },
    {
        name: "warnings",
        async execute({ sock, msg, from, sender, reply }) {
            const metadata = await getGroupAdmin({ sock, from, sender, reply });
            if (!metadata) return;
            const targetJids = targetsFromMessage(msg);
            const target = targetJids[0] || sender;
            const member = metadata.participants.find(item => phone(item.id) === phone(target));
            if (!member) return reply("Membre introuvable dans ce groupe.");
            const record = warnings[from]?.[member.id];
            if (!record?.count) return reply(`✅ @${member.id.split("@")[0]} n’a aucun avertissement enregistré.`);
            await sock.sendMessage(from, { text: `⚠️ @${member.id.split("@")[0]} : ${record.count} avertissement(s).\n${record.reasons.map((item, index) => `${index + 1}. ${item.reason}`).join("\n") || "Aucun motif enregistré."}`, mentions: [member.id] });
        }
    },
    {
        name: "resetwarns",
        async execute({ sock, msg, from, sender, reply }) {
            const metadata = await getGroupAdmin({ sock, from, sender, reply });
            if (!metadata) return;
            const targets = targetsFromMessage(msg);
            if (targets.length !== 1) return reply("Mentionnez le membre ou répondez à son message.");
            const member = metadata.participants.find(item => phone(item.id) === phone(targets[0]));
            if (!member) return reply("Membre introuvable dans ce groupe.");
            if (warnings[from]) delete warnings[from][member.id];
            persistWarnings();
            await reply("✅ Avertissements réinitialisés.");
        }
    },
    {
        name: "ttt",
        async execute({ from, sender, args, reply, config }) {
            if (!from?.endsWith("@g.us")) return reply("Le morpion se joue dans un groupe.");
            const action = String(args[0] || "").toLowerCase();
            if (action === "stop") {
                const game = games.get(from);
                if (!game) return reply("Aucune partie en cours.");
                if (![game.x, game.o].includes(sender)) return reply("Seuls les joueurs peuvent arrêter la partie.");
                games.delete(from);
                return reply("Partie terminée.");
            }
            if (games.has(from)) return reply(`Une partie est déjà en cours. Jouez avec ${config.prefix}move 1-9.`);
            const opponent = targetsFromMessage({ message: { extendedTextMessage: { contextInfo: { mentionedJid: args[0]?.includes("@") ? [args[0]] : [] } } } })[0];
            if (!opponent || opponent === sender) return reply(`Pour commencer, répondez à un message ou mentionnez un adversaire : ${config.prefix}ttt @membre`);
            games.set(from, { x: sender, o: opponent, turn: sender, board: Array(9).fill(null) });
            await reply(`🎮 Morpion lancé ! X commence.\n${gameBoard(games.get(from))}\n${config.prefix}move 1-9 pour jouer.`);
        }
    },
    {
        name: "move",
        async execute({ from, sender, args, reply, config }) {
            const game = games.get(from);
            if (!game) return reply(`Aucune partie en cours. Démarrez avec ${config.prefix}ttt @membre.`);
            if (sender !== game.x && sender !== game.o) return reply("Vous ne participez pas à cette partie.");
            if (sender !== game.turn) return reply("Ce n’est pas votre tour.");
            const position = Number(args[0]) - 1;
            if (!Number.isInteger(position) || position < 0 || position > 8 || game.board[position]) return reply(`Position invalide ou occupée. Choisissez une case 1-9.\n${gameBoard(game)}`);
            game.board[position] = sender === game.x ? "❌" : "⭕";
            const won = winner(game.board);
            const draw = !won && game.board.every(Boolean);
            if (won || draw) games.delete(from);
            else game.turn = sender === game.x ? game.o : game.x;
            await reply(`${gameBoard(game)}\n${won ? `🏆 ${won} gagne !` : draw ? "🤝 Match nul." : `Tour de @${game.turn.split("@")[0]} (${game.turn === game.x ? "❌" : "⭕"}).`}`);
        }
    },
    {
        name: "tts",
        async execute({ sock, from, text, reply, config }) {
            const input = String(text || "").trim();
            if (!input) return reply(`Utilisation : ${config.prefix}tts texte (maximum 200 caractères).`);
            if (input.length > 200) return reply("Le texte est limité à 200 caractères.");
            const tts = require("google-tts-api");
            const audioUrl = tts.getAudioUrl(input, { lang: "fr", slow: false, host: "https://translate.google.com" });
            const axios = require("axios");
            const response = await axios.get(audioUrl, { responseType: "arraybuffer", timeout: 15000, maxContentLength: 2 * 1024 * 1024 });
            await sock.sendMessage(from, { audio: Buffer.from(response.data), mimetype: "audio/mpeg", ptt: true });
        }
    }
];
