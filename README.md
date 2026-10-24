# 🏠 Coloc — tâches ménagères & ruptures de stock

- 🧹 **Tâches** : tableau de la semaine (7 colonnes = les jours, 1 ligne par type de tâche, une couleur par tâche). La lettre dans une case = le responsable. On touche une case pour la valider : une fenêtre de **confirmation** s'ouvre, et la tâche rapporte des **pièces** 🪙 à la personne qui l'a faite. On peut aussi **sauter** une tâche ou **annuler** une validation. Semaine en cours + 4 suivantes, et 2 semaines passées à revoir.
- 👥 **Tâches pour tous / exceptions** : une tâche peut être à faire par tout le monde (une case par personne) et certaines personnes peuvent en être exclues (ex. Victor). Voir « Personnaliser ».
- 🛒 **Stocks** : 13 produits sous forme de cartes. 1 clic = rouge « en rupture », 2e clic = réapprovisionné. Chaque rupture envoie une notification à **tous** les colocs.
- 👤 **Toi** : tes pièces, le classement de la coloc, tes prochaines tâches (avec « Fait » et « Sauter »).
- 🔔 **Rappel chaque soir à 20h** (heure de La Réunion) à ceux dont la tâche du jour n'est ni faite ni sautée.

## Personnaliser

- **Tâches faites par tous / personnes exclues** : dans `config.js` → `TASK_TEMPLATES`, ajoute une option à la ligne de la tâche :
  - `{ kind: 'aspijour', day: 5, everyone: true }` → tout le monde doit la faire (une case par personne, « 2/5 » dans le tableau) ;
  - `{ kind: 'wc', day: 1, exclude: ['Victor'] }` → Victor n'est pas concerné (la rotation se fait entre les autres) ;
  - `fewer: { Victor: 2 }` → Victor est moins souvent concerné (1 semaine sur 2 ; `3` = 1 semaine sur 3) ;
  - `only: ['Anthony', 'Lily']` → seulement ces personnes. Les options se combinent. La règle complète est la fonction `participants()` en bas du fichier.
- **Pièces** : `config.js` → `TASK_KINDS` (champ `coins` de chaque tâche), `SKIP_PENALTY` (pièces perdues quand on saute une tâche, 0 par défaut) et `ALLOW_EARLY_VALIDATION` (valider une tâche avant son jour, interdit par défaut).
- **Jour des poubelles, tâches, couleurs** : `config.js` (`day` : 0 = lundi … 6 = dimanche). Ne s'applique qu'aux semaines pas encore créées.
- **Prénoms / produits** : `supabase/schema.sql` avant de le lancer, ou plus tard dans Supabase → *Table Editor*.
- **Autre fuseau horaire** : change l'heure UTC dans `cron.sql` et ajoute le secret `TZ_NAME` (ex. `Europe/Paris`).
