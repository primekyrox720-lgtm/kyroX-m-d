# KYROX-MD

Bot WhatsApp JavaScript/Node.js basé sur Baileys, avec pairing web, commandes modulaires, fonctions de groupe et automatisations configurables. Cette version rassemble les fonctions déjà présentes dans KYROX-MD et des idées de fonctionnalités publiquement décrites par XTREME-XMD, avec une implémentation adaptée à ce dépôt.

## Pairing web

La page reprend le design de pairing KYROX-MD sans champ ni jeton supplémentaire. Le pairing est ouvert, avec une limite de fréquence, un seul pairing à la fois et une vérification qui empêche d'écraser une session déjà présente. Un code de pairing ne doit être demandé que pour un numéro dont vous êtes autorisé à associer le compte. Ne partagez jamais le code reçu.

## Fonctionnalités

- Connexion multi-appareils Baileys, reconnexion avec délai progressif, restauration locale ou via `SESSION_ID`.
- Interface de pairing web et endpoint de santé `/health`.
- Chargement dynamique des commandes depuis `commands/`; `.reload` (administrateur) recharge les modules sans redémarrage.
- Modes `.mode public|private|group|inbox` (administrateur); réglage en mémoire jusqu'au redémarrage.
- `.ping`, `.alive`, `.owner`, `.menu`.
- `.ai <question>` et `.tiktok <lien>` utilisent un service tiers.
- `.s` transforme une image/vidéo en sticker (FFmpeg requis). `.vv` est désactivée afin de ne pas extraire ou redistribuer des médias à vue unique.
- Groupe : `.tagall`, `.hidetag`, `.mute`, `.unmute`, `.kick`, `.promote`, `.demote`. Les opérations de modération requièrent un administrateur du groupe et que le bot soit administrateur.
- Automatisations admin : `.welcome on|off|default` et `.antilink on|off|default` s'appliquent au groupe courant; `.autoreact on|off`, `.readall on|off` et `.automations [on|off]` sont globales.
- Statuts configurables avec `AUTO_STATUS_VIEW`, `AUTO_STATUS_REACT` et `STATUS_REACT_EMOJI`.
- Audit explicite des groupes avec `.up` et `.logs [1-30]`. Les messages suivis sont conservés en texte brut dans `logs/bot-audit.jsonl` et dans les logs du fournisseur. Informez les membres avant activation.

## Configuration

Valeurs par défaut du propriétaire : `Kyrox-dev` / `50946387298`. Principales variables : `OWNER_NAME`, `OWNER_NUMBER`, `ADMIN_NUMBERS`, `BOT_NAME`, `PREFIX`, `MODE`, `SESSION_ID`, `SESSION_DIR`, `WELCOME`, `ANTI_LINK`, `AUTO_REACT`, `READ_MESSAGE`, `AUTO_STATUS_VIEW`, `AUTO_STATUS_REACT`, `STATUS_REACT_EMOJI`, `CUSTOM_REACT_EMOJIS` et `MONITORED_DISCUSSIONS`.

## Crédits et licences

Développement et personnalisation de KYROX-MD : **Kyrox-dev**. L'inspiration fonctionnelle publique XTREME-XMD est créditée ici : https://github.com/PrinceXtremeX/XTREME-XMD. Cette mention ne transfère pas ses droits d'auteur à KYROX-MD. Toute réutilisation future de code du dépôt source doit se conformer à Apache License 2.0 et préserver les avis et notices applicables. Les dépendances tierces conservent leurs licences respectives.
