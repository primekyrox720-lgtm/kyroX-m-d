# KYROX-MD — bot WhatsApp personnalisé

Bot Node.js/Baileys avec page web de pairing conservée. Le moteur de commandes est désormais reparti sur une base personnalisée, indépendante des modules historiques.

## Fonctions actuellement disponibles

- Pairing web et endpoint de santé `/health` (la page et le serveur HTTP existants restent en place).
- Commandes `.menu`, `.ping`, `.alive`, `.owner` et `.mode public|private`.
- Modération de groupe `.tagall`, `.kick`, `.promote`, `.demote` avec vérification des permissions de l'utilisateur et du bot.
- Automatisations `.welcome on|off`, `.antilink on|off` (par groupe), `.autoreact on|off` et `.readall on|off`; réglages persistés dans `data/bot-settings.json`.
- Jeu de questions `.quiz` / `.answer`.

Les commandes historiques sont désactivées afin d'éviter de charger d'anciens modules. Les nouveaux modules sont écrits séparément et la page de pairing n'est pas modifiée.

## Sécurité et vie privée

- N'utilisez que des comptes/appareils que vous êtes autorisé à connecter.
- Les automatisations sont désactivées par défaut et doivent être activées explicitement.
- L'anti-lien ne modère que les liens d'invitation WhatsApp, et seulement si le bot est administrateur du groupe.
- La récupération de messages supprimés, l'extraction de médias à vue unique et l'archivage silencieux de conversations ne sont pas inclus dans cette base. Toute fonctionnalité de conservation devra être transparente, explicitement activée et limitée.
- Ne publiez jamais de codes de pairing ou de fichiers de session; protégez le stockage persistant et ne faites tourner qu'une instance par session.

## Déploiement

```sh
npm install
npm start
```

Configurez notamment `BOT_NAME`, `OWNER_NAME`, `OWNER_NUMBER`, `ADMIN_NUMBERS`, `PREFIX` et `SESSION_DIR`. Le répertoire de session doit être persistant sur l'hébergeur.

## Référence fonctionnelle

Le périmètre a été inspiré par les catégories publiquement décrites par [KHAN-MD](https://github.com/mrprincesys/KHAN-MD), sans reprendre son code. Cette première base n'implémente pas encore les intégrations IA/téléchargement ni les outils média avancés; elles nécessitent de définir leurs services et dépendances avant activation.
