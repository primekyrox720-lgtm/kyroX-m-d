module.exports = {
    botName: "KYROX-MD",
    ownerName: "VotreNom",
    ownerNumber: "509XXXXXXXX", 
    prefix: ".",
    // Si la variable d'environnement SESSION_ID n'existe pas, il utilisera cette valeur
    sessionId: process.env.SESSION_ID || "", 
    sessionDir: "./session",
    
    // Modules automatiques (comme dans Xtreme-XMD)
    AUTO_STATUS_VIEW: true,   // Vu automatique des statuts
    AUTO_STATUS_REACT: true,  // Réaction automatique aux statuts
    STATUS_REACT_EMOJI: "❤️"  // Emoji utilisé pour la réaction
};
