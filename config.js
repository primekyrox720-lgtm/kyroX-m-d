module.exports = {
    botName: "KYROX-MD",
    ownerName: "VotreNom",
    ownerNumber: "509XXXXXXXX",
    prefix: ".",
    sessionId: process.env.SESSION_ID || "",
    sessionDir: "./session",
    logRenderActions: true,
    monitoredDiscussions: (process.env.MONITORED_DISCUSSIONS || "").split(",").map(v => v.trim()).filter(Boolean),
    adminNumbers: (process.env.ADMIN_NUMBERS || "509XXXXXXXX").split(",").map(v => v.trim()).filter(Boolean),
    AUTO_STATUS_VIEW: true,
    AUTO_STATUS_REACT: true,
    STATUS_REACT_EMOJI: "❤️"
};
