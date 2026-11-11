# KYROX-MD — bot WhatsApp personnalisé

Base personnalisée en Node.js/Baileys avec page web de pairing préservée. Les commandes historiques ont été désactivées et remplacées par une base modulaire développée pour ce projet, en s'inspirant des catégories de fonctionnalités publiquement annoncées par KHAN-MD, sans recopier son implémentation.

## Commandes

- Général : `.menu`, `.ping`, `.alive`, `.owner`, `.mode public|private`.
- IA : `.ai <question>` via une API compatible OpenAI configurée par variables d'environnement.
- Traduction : `.translate <texte>` via service configuré.
- Média : `.sticker` à envoyer en légende d'une image/vidéo, `.download <URL>` via service configuré et limité aux plateformes vidéo courantes.
- Groupes : `.tagall`, `.kick`, `.promote`, `.demote`, `.mute`, `.unmute`; les actions vérifient les permissions du demandeur et celles du bot.
- Automatisations : `.welcome on|off`, `.antilink on|off` (par groupe), `.autoreact on|off`, `.readall on|off`; réglages persistés dans `data/bot-settings.json`.
- Jeux : `.quiz` puis `.answer <réponse>`.

Les écouteurs d'automatisation s'attachent lors de l'utilisation d'une commande; lancez `.menu` après connexion pour les activer. Les automatisations sont désactivées par défaut sauf si leur variable d'environnement correspondante est activée.

## Configuration

Variables utiles : `BOT_NAME`, `OWNER_NAME`, `OWNER_NUMBER`, `ADMIN_NUMBERS`, `PREFIX`, `SESSION_DIR`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, `TRANSLATE_API_URL`, `MEDIA_API_URL`, `WELCOME`, `ANTI_LINK`, `AUTO_REACT`, `READ_MESSAGE`.

Les services IA, traduction et médias sont externes et doivent être configurés par l'administrateur. N'envoyez pas de clés API ni de données personnelles à un service tiers sans en connaître les conditions de traitement. `MEDIA_API_URL` doit être un service de confiance.

## Limites de confidentialité

La récupération automatique de messages supprimés, l'extraction de médias à vue unique, la collecte cachée de conversations et le blocage automatisé des appels ne sont pas inclus. Baileys est un client non officiel; l'utilisation doit respecter les règles WhatsApp et les droits des membres des groupes. Les téléchargements doivent respecter les droits d'auteur et les conditions des plateformes.

## Démarrage

```sh
npm install
npm start
```

Configurez un stockage persistant pour `SESSION_DIR`, utilisez une seule instance par session et ne partagez jamais les codes de pairing ou les fichiers d'identifiants.
