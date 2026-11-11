const envBool = (name, fallback = false) => {
    const value = process.env[name];
    if (value === undefined) return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const ownerNumber = process.env.OWNER_NUMBER || "50946387298";

module.exports = {
    botName: process.env.BOT_NAME || "KYROX-MD",
    ownerName: process.env.OWNER_NAME || "Kyrox-dev",
    ownerNumber,
    prefix: process.env.PREFIX || ".",
    mode: (process.env.MODE || "public").toLowerCase(),
    sessionId: process.env.SESSION_ID || "",
    sessionDir: process.env.SESSION_DIR || "./session",
    pairingToken: process.env.PAIRING_TOKEN || "",
    monitoredDiscussions: (process.env.MONITORED_DISCUSSIONS || "").split(",").map(v => v.trim()).filter(Boolean),
    adminNumbers: (process.env.ADMIN_NUMBERS || ownerNumber).split(",").map(v => v.trim()).filter(Boolean),
    AUTO_STATUS_VIEW: envBool("AUTO_STATUS_VIEW", true),
    AUTO_STATUS_REACT: envBool("AUTO_STATUS_REACT", true),
    STATUS_REACT_EMOJI: process.env.STATUS_REACT_EMOJI || "❤️",
    DEFAULT_WELCOME: envBool("WELCOME", false),
    DEFAULT_ANTI_LINK: envBool("ANTI_LINK", false),
    DEFAULT_AUTO_REACT: envBool("AUTO_REACT", false),
    DEFAULT_READ_ALL: envBool("READ_MESSAGE", false),
    CUSTOM_REACT_EMOJIS: (process.env.CUSTOM_REACT_EMOJIS || "💝,💖,💗,❤️,💙").split(",").map(v => v.trim()).filter(Boolean)
};
