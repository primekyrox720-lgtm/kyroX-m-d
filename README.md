# KYROX-MD

Bot WhatsApp JavaScript/Node.js basé sur Baileys, avec pairing web, commandes modulaires, fonctions de groupe et automatisations configurables. Cette version rassemble les fonctions déjà présentes dans KYROX-MD et des idées de fonctionnalités publiquement décrites par XTREME-XMD, avec une implémentation adaptée à ce dépôt.

## Fonctionnalités

- Connexion multi-appareils Baileys, reconnexion avec délai progressif, restauration locale ou via `SESSION_ID`.
- Interface de pairing web protégée par `PAIRING_TOKEN`; endpoint de santé `/health`.
- Chargement dynamique des commandes depuis `commands/`; `.reload` (administrateur) recharge les modules sans redémarrage.
- Modes `.mode public|private|group|inbox` (administrateur); réglage en mémoire jusqu'au redémarrage.
- `.ping`, `.alive`, `.owner`, `.menu`.
- `.ai <question>` et `.tiktok <lien>` utilisent un service tiers.
- `.s` transforme une image/vidéo en sticker (FFmpeg requis). `.vv` est désactivée afin de ne pas extraire ou redistribuer des médias à vue unique.
- Groupe : `.tagall`, `.hidetag`, `.mute`, `.unmute`, `.kick`, `.promote`, `.demote`. Les opérations de modération requièrent un administrateur du groupe et que le bot soit administrateur.
- Automatisations admin : `.welcome on|off|default` et `.antilink on|off|default` s'appliquent au groupe courant; `.autoreact on|off`, `.readall on|off` et `.automations [on|off]` sont globales. Ces choix de commande sont en mémoire et reviennent aux valeurs configurées après redémarrage.
- Vue/réaction des statuts configurables avec `AUTO_STATUS_VIEW`, `AUTO_STATUS_REACT` et `STATUS_REACT_EMOJI`.
- Audit de groupe explicite : `.up` active l'enregistrement dans une discussion de groupe, `.up off` le désactive dans la discussion courante, `.logs [1-30]` consulte les derniers événements. Les messages des groupes surveillés sont conservés en texte brut dans `logs/bot-audit.jsonl` et dans les logs du fournisseur. Informez les membres avant activation et respectez les règles locales de confidentialité.

## Mise en route

1. Installez Node.js et FFmpeg, puis lancez `npm install` et `npm start`.
2. Définissez `PAIRING_TOKEN` comme secret aléatoire d'au moins 24 caractères (recommandé : 32+). Sans ce secret, le pairing web est désactivé. Ouvrez ensuite la page `/`, saisissez le numéro au format international et ce secret.
3. Gardez `SESSION_ID` et les fichiers du dossier `session/` privés. Le bot ne renvoie ni n'affiche de sauvegarde de session. Le pairing ne supprime jamais une session existante.

Variables principales : `OWNER_NAME` (défaut `Kyrox-dev`), `OWNER_NUMBER` (défaut `50946387298`), `ADMIN_NUMBERS` (liste séparée par virgules), `BOT_NAME`, `PREFIX`, `MODE`, `SESSION_ID`, `SESSION_DIR`, `PAIRING_TOKEN`, `WELCOME`, `ANTI_LINK`, `AUTO_REACT`, `READ_MESSAGE`, `AUTO_STATUS_VIEW`, `AUTO_STATUS_REACT`, `STATUS_REACT_EMOJI`, `CUSTOM_REACT_EMOJIS`, `MONITORED_DISCUSSIONS`.

`MODE=public` autorise les commandes à tous; `private` réserve les commandes aux admins; `group` limite les commandes aux groupes; `inbox` aux discussions privées. Les changements via `.mode` ne sont pas persistés après redémarrage. Les commandes de changement de mode et rechargement restent accessibles aux admins.

## Crédits et licences

Développement et personnalisation de KYROX-MD : **Kyrox-dev**. L'inspiration fonctionnelle publique XTREME-XMD est créditée ici : https://github.com/PrinceXtremeX/XTREME-XMD. Cette mention ne transfère pas ses droits d'auteur à KYROX-MD. Aucun code XTREME-XMD n'est inclus dans cette intégration. Toute réutilisation future de code du dépôt source doit se conformer à Apache License 2.0 et préserver les avis de copyright, la licence et les notices applicables. Les dépendances tierces conservent leurs licences respectives.
