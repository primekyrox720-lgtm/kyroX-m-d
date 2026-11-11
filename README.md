# kyroX-m-d

## Surveillance de discussion et journal d'audit

- Dans une discussion de groupe, l'administrateur du bot peut envoyer `.up` pour surveiller ce groupe, ou `.up <JID_du_groupe>` depuis une autre discussion.
- `.up off` arrête la surveillance dans le groupe concerné.
- `.logs [nombre]` affiche les dernières entrées à l'administrateur dans WhatsApp.
- Les événements (messages reçus dans les discussions surveillées, messages du bot, activation/désactivation et consultations) sont écrits dans `logs/bot-audit.jsonl` et sur stdout. Render collecte stdout dans les logs du service.
- Définir `ADMIN_NUMBERS` sur Render avec les numéros autorisés séparés par des virgules. Le numéro du compte WhatsApp utilisé par le bot reste également autorisé.
- `MONITORED_DISCUSSIONS` peut être défini sur Render avec des JID de groupes séparés par des virgules pour activer la surveillance au démarrage.

Les messages surveillés sont consignés en texte brut. Informez les membres du groupe et respectez les règles de confidentialité applicables avant d'activer la surveillance. Le stockage local Render peut être éphémère ; stdout est disponible dans les logs Render selon la rétention du service.
