# KYROX-MD

Bot WhatsApp JavaScript/Node.js utilisant Baileys, avec interface web de pairing, commandes et automatisations configurables.

## Fonctionnalités

- Connexion multi-appareils Baileys, pairing web et restauration de session via `SESSION_ID`.
- Commandes `.ping`, `.alive` et `.menu`.
- `.ai <question>` via un service externe et `.tiktok <lien>` pour récupérer une vidéo TikTok via un service externe.
- Stickers avec `.s` (répondre à une image ou vidéo) et affichage d’un média à vue unique avec `.vv`.
- Outils de groupe : `.tagall`, `.hidetag`, `.mute`, `.unmute`.
- Automatisations à activer dans WhatsApp par le propriétaire ou un administrateur configuré : `.welcome on|off`, `.antilink on|off`, `.autoreact on|off`, `.readall on|off` et `.automations on|off`.
  - `.welcome` envoie un message lors des arrivées et départs.
  - `.antilink` supprime les liens d’invitation WhatsApp dans les groupes où le bot est administrateur. Elle ne retire pas les membres.
  - `.autoreact` réagit avec un emoji de la liste configurée.
  - `.readall` marque les nouveaux messages comme lus. Ces deux options sont désactivées par défaut.
- Surveillance/audit explicite des groupes avec `.up` et consultation des derniers événements avec `.logs`. Les administrateurs sont contrôlés par `ADMIN_NUMBERS` et le propriétaire.
- Chargement dynamique des fichiers de commandes JavaScript du dossier `commands/`.

Les options des commandes d’automatisation sont conservées en mémoire et reviennent aux valeurs par défaut au redémarrage. `WELCOME`, `ANTI_LINK`, `AUTO_REACT` et `READ_MESSAGE` peuvent définir leurs états initiaux via variables d’environnement (true/false). `OWNER_NAME`, `OWNER_NUMBER`, `BOT_NAME`, `PREFIX` et `ADMIN_NUMBERS` sont également configurables.

## Configuration

Valeurs par défaut du propriétaire : `Kyrox-dev` / `50946387298`. Configurez `ADMIN_NUMBERS` avec une liste de numéros séparés par des virgules pour ajouter des administrateurs.

Les messages de groupes surveillés sont journalisés en texte brut dans `logs/bot-audit.jsonl` et dans les logs du service. Prévenez les membres et respectez les règles de confidentialité applicables avant d’activer cette fonction. `MONITORED_DISCUSSIONS` accepte des JID séparés par des virgules pour une activation au démarrage.

## Inspirations et crédits

Les fonctions générales de ce bot combinent ses commandes existantes avec des idées de fonctionnalités publiquement décrites par [XTREME-XMD](https://github.com/PrinceXtremeX/XTREME-XMD). Cette intégration est une implémentation adaptée à KYROX-MD, et non une copie de leur dépôt. Le projet source XTREME-XMD est sous licence Apache-2.0 ; toute réutilisation future de son code devra conserver les avis de copyright et respecter cette licence.

Développement et personnalisation de cette version : **Kyrox-dev**. Cette mention ne transfère ni ne remplace les droits des auteurs des projets ou dépendances tiers.
