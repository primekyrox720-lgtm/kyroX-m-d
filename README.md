# KYROX-MD — bot WhatsApp personnalisé

Base personnalisée en Node.js/Baileys avec page web de pairing préservée. La base comprend des commandes inspirées des catégories publiquement documentées par Knightbot-MD, sans reprendre son code source.

## Commandes disponibles

- Général : `.menu`, `.ping`, `.alive`, `.owner`, `.mode public|private`.
- IA / utilitaires : `.ai <question>`, `.translate <texte>`, `.tts <texte>` (TTS limité à 200 caractères, service externe).
- Média : `.sticker` avec image/vidéo en légende; `.download <URL>` via un service média configuré.
- Groupes : `.tagall`, `.kick`, `.promote`, `.demote`, `.mute`, `.unmute`.
- Modération : `.welcome on|off`, `.antilink on|off`, `.warn @membre [motif]`, `.warnings [@membre]`, `.resetwarns @membre`.
- Jeux : `.quiz` / `.answer`; morpion à deux joueurs `.ttt @membre` puis `.move 1-9`, `.ttt stop` pour terminer.
- Automatisations : `.autoreact on|off`, `.readall on|off`; réglages persistés dans `data/bot-settings.json`. Les avertissements sont conservés dans `data/group-warnings.json`.

Les opérations d'administration de groupe vérifient les permissions et requièrent un bot administrateur lorsque l'action modifie les membres ou la configuration du groupe. Les avertissements n'entraînent jamais d'expulsion automatique.

## Configuration

Variables utiles : `BOT_NAME`, `OWNER_NAME`, `OWNER_NUMBER`, `ADMIN_NUMBERS`, `PREFIX`, `SESSION_DIR`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, `TRANSLATE_API_URL`, `MEDIA_API_URL`, `WELCOME`, `ANTI_LINK`, `AUTO_REACT`, `READ_MESSAGE`.

L'IA, la traduction et le téléchargement dépendent des services externes configurés par l'administrateur. N'envoyez pas de secrets ou de données personnelles à des tiers sans en connaître le traitement. Les fonctions TTS envoient le texte au service de synthèse externe; n'y soumettez pas de contenu privé.

## Vie privée et limites

Le pairing web est conservé. La récupération automatique des messages supprimés, l'extraction de médias à vue unique et l'archivage caché de conversations ne sont pas inclus. Baileys est un client non officiel; respectez les règles WhatsApp, le consentement des membres et les droits d'auteur.

## Démarrage

```sh
npm install
npm start
```

Configurez un stockage persistant pour `SESSION_DIR`, une instance par session, et ne partagez jamais les codes ou fichiers d'authentification.
