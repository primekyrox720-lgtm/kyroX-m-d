function numberFromJid(value) {
    return String(value || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isAdmin(sender, config) {
    const number = numberFromJid(sender);
    return Boolean(number && [config.ownerNumber, ...(config.adminNumbers || [])].some(n => numberFromJid(n) === number));
}

module.exports = { numberFromJid, isAdmin };
