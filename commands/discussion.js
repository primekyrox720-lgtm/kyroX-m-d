const fs = require("fs");
const path = require("path");
const config = require("../config");

const logPath = path.join(__dirname, "..", "logs", "bot-audit.jsonl");
const listeners = new WeakSet();
const monitoredChats = new Set(config.monitoredDiscussions || []);
const MAX_LOG_BYTES = 5 * 1024 * 1024;

function audit(action, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        action,
        ...details
    };
    const line = JSON.stringify(entry);

    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
            fs.renameSync(logPath, `${logPath}.${Date.now()}.bak`);
        }
        fs.appendFileSync(logPath, `${line}\n`, { mode: 0o600 });
    } catch (error) {
        console.error("[AUDIT] Échec écriture fichier:", error.message);
    }

    // Render collecte stdout/stderr : ces lignes sont consultables dans les logs du service.
    console.log(`[AUDIT] ${line}`);
}

function messageText(msg) {
    let content = msg?.message;
    if (!content) return "";
    for (const wrapper of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
        if (content[wrapper]?.message) content = content[wrapper].message;
    }
    return content.conversation || content.extendedTextMessage?.text ||
        content.imageMessage?.caption || content.videoMessage?.caption ||
        content.documentMessage?.caption || content.audioMessage?.caption || "[message non textuel]";
}

function normaliseNumber(value) {
    return String(value || "").replace(/\D/g, "");
}

function isAdmin(sender, sock) {
    const senderNumber = normaliseNumber(sender?.split("@")[0]?.split(":")[0]);
    const botNumber = normaliseNumber(sock?.user?.id?.split("@")[0]?.split(":")[0]);
    const admins = (config.adminNumbers || []).filter(n => n && !n.includes("X")).map(normaliseNumber);
    return Boolean(senderNumber && (senderNumber === botNumber || admins.includes(senderNumber)));
}

function bindAudit(sock) {
    if (listeners.has(sock)) return;
    listeners.add(sock);
    sock.ev.on("messages.upsert", ({ messages, type }) => {
        for (const msg of messages || []) {
            const chat = msg?.key?.remoteJid;
            if (!chat || !monitoredChats.has(chat)) continue;
            audit(msg.key.fromMe ? "bot_message" : "message_read_by_bot", {
                chat,
                sender: msg.key.participant || (msg.key.fromMe ? "bot" : chat),
                messageId: msg.key.id,
                eventType: type,
                text: messageText(msg)
            });
        }
    });
}

module.exports = [
    {
        name: "up",
        async execute({ sock, from, sender, isGroup, args, reply }) {
            if (!isAdmin(sender, sock)) {
                audit("unauthorized_monitor_request", { chat: from, sender });
                return reply("⛔ Cette commande est réservée à l’administrateur du bot.");
            }
            const target = args[0] || (isGroup ? from : "");
            if (!target || target === "off") {
                if (target === "off") {
                    monitoredChats.delete(from);
                    audit("monitor_disabled", { chat: from, admin: sender });
                    return reply("🛑 Surveillance désactivée pour cette discussion.");
                }
                return reply("Utilisation : *.up <JID_du_groupe>* (ex. 123456789-123456@g.us), *.up* dans un groupe, ou *.up off* dans la discussion surveillée.");
            }
            if (!target.endsWith("@g.us")) {
                return reply("Indiquez le JID WhatsApp du groupe (format ...@g.us), pas un simple numéro de participant.");
            }
            monitoredChats.add(target);
            bindAudit(sock);
            audit("monitor_enabled", { chat: target, admin: sender });
            return reply(`✅ Surveillance activée pour ${target}. Les messages que le bot reçoit dans ce groupe et ses propres messages seront consignés dans les logs Render. Les logs sont réservés aux administrateurs.`);
        }
    },
    {
        name: "logs",
        async execute({ sock, sender, args, reply }) {
            if (!isAdmin(sender, sock)) {
                audit("unauthorized_log_read", { sender });
                return reply("⛔ Consultation réservée à l’administrateur du bot.");
            }
            const count = Math.min(Math.max(parseInt(args[0], 10) || 10, 1), 30);
            let lines = [];
            try {
                if (fs.existsSync(logPath)) lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).slice(-count);
            } catch (error) {
                audit("log_read_error", { admin: sender, error: error.message });
            }
            audit("audit_log_viewed", { admin: sender, requestedEntries: count });
            if (!lines.length) return reply("Aucun événement enregistré pour le moment. Les entrées apparaissent aussi dans les logs Render.");
            const output = lines.map(line => {
                try {
                    const entry = JSON.parse(line);
                    return `${entry.timestamp} | ${entry.action} | ${entry.chat || ""} | ${entry.sender || entry.admin || ""} | ${entry.text || ""}`;
                } catch { return line; }
            }).join("\n");
            return reply(`🧾 *Derniers événements (max ${count})*\n${output}`);
        }
    }
];
