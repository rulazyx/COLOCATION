# 🏠 Coloc — tâches ménagères & ruptures de stock

Appli web installable (PWA) pour iPhone **et** Android. **100 % gratuit** : GitHub Pages (hébergement) + Supabase (données partagées et notifications). Aucune carte bancaire.

Ce que fait l'appli :
- 🧹 **Tâches** : le tableau de la semaine (une ligne par type de tâche, une couleur par tâche, la lettre = le responsable), la liste de **tes prochaines tâches** et les **stocks** (bouton « Stocks » en haut). On touche une case pour valider une tâche : confirmation, puis des **trophées** 🏆 et de l'**XP** ⭐. On ne peut plus sauter une tâche : on la **propose à un colocataire**, qui accepte ou refuse (il est prévenu par notification).
- 🛒 **Stocks** : 13 produits en cartes. 1 clic = rouge « en rupture », 2e clic = réapprovisionné. Chaque rupture prévient **tous** les colocs.
- 🧭 **Quêtes** (avec les 21 **défis** dans le second onglet) : la quête principale « Découverte de l'application » (4 étapes : personnaliser son personnage, consulter les classements, lancer un jeu, cliquer sur une tâche). La terminer débloque le défi « Le noob ». Quête secondaire : « Monter le Piton des Neiges » (3 070 m en une course du Grand Raid).
- 🎮 **Jeux** : **chifoumi** (liste déroulante pour choisir l'adversaire), **Coucou** (oiseau rouge, colonnes jaunes), **Le Grand Raid** (course sur la plage), **Sudoku** chronométré.
- 🥇 **Classement** : résumé, **classement de la semaine** (trophées gagnés du lundi au dimanche, 👑 pour le champion et palmarès) et 7 classements (niveau, trophées, tâches, chifoumi, Coucou, Grand Raid, sudoku).
- 👤 **Toi** (Profil avec badges bois → platine, Personnalisation) : niveau et barre d'XP, profil (couleur de fond, titre), personnage, 21 **défis**. On peut ouvrir le profil des autres.
- ⭐ **Niveaux** : toutes les actions rapportent de l'XP (tâche, récompense du jour, roue, défi, chifoumi, jeux, signalement de rupture…). Les apparences se débloquent avec les **niveaux** (Singe 3, Pirate 5, Ninja 8, Astronaute 10) ou avec des **défis** (Roi, Sorcier, Chevalier, Zeus, Poussin, Détective, Hugo Deck, Monsieur Nickel, Clochard, Zippo avec « Le noob »). Il n'y a plus de boutique.
- 🏆 **Trophées** : les anciennes pièces. On ne les dépense plus, elles servent aux classements. Tout le monde démarre à 0.
- 🎁 **Récompense quotidienne** (7 jours, le jour 7 débloque la roue de la fortune).
- 🤝 **Copains** : des joueurs qui ne sont pas en coloc (Etienne). Ils n'ont aucune tâche, mais jouent, gagnent des niveaux et apparaissent aux classements.
- 🔔 **Rappel chaque soir à 20h** (heure de La Réunion) à ceux dont la tâche du jour n'est pas faite.

> Tu peux déjà l'essayer sans rien configurer : sans les clés Supabase, l'appli tourne en **mode démo** (données stockées sur ton téléphone uniquement). Les étapes 1 à 5 activent le partage et les notifications.

---

## Étape 1 — Mettre le code sur GitHub (5 min)

1. Crée un compte sur github.com, puis **New repository** : nom `coloc`, **Public** (⚠️ GitHub Pages est gratuit uniquement pour les dépôts publics. Il n'y a aucun secret dans le dépôt, voir plus bas).
2. Dézippe ce dossier sur ton ordinateur, puis dans le dépôt : **Add file → Upload files**. Glisse **tout le contenu** du dossier (fichiers + dossiers `supabase` et `tools`), puis **Commit changes**.
3. **Settings → Pages** → *Build and deployment* → Source : **Deploy from a branch** → branche `main`, dossier `/ (root)` → **Save**.
4. Après 1-2 minutes, ton appli est en ligne sur `https://TON-PSEUDO.github.io/coloc/`.

## Étape 2 — Créer la base de données (Supabase, gratuit)

1. Va sur **supabase.com** → *Start your project* → connecte-toi avec GitHub.
2. **New project** : nom `coloc`, choisis un mot de passe (note-le), région proche (Europe), offre **Free**.
3. Menu **SQL Editor → New query** : colle le contenu de `supabase/schema.sql` → **Run**.
   *(Tu avais déjà lancé une ancienne version du schéma ? Ne relance pas `schema.sql` :*
   - *base de la toute première version : lance d'abord `supabase/migration-v2.sql`, puis `migration-v3.sql`, puis `migration-v4.sql` ;*
   - *base en version 2 : lance `migration-v3.sql` puis `migration-v4.sql` ;*
   - ***base en version 5 (appli déjà en ligne) : lance seulement `supabase/migration-v6.sql`** (remet les trophées de départ à 0, ajoute la quête et le défi « Le noob »). *Base en version 4 : `migration-v5.sql` puis `migration-v6.sql`.* ** Rien n'est effacé : trophées, niveau de départ (calculé d'après les tâches déjà faites) et apparences sont conservés ; Etienne est ajouté.*
   - *base en version 3 : `migration-v4.sql` puis `migration-v5.sql`.)*

   *Puis redéploie la fonction `notify` à l'étape 4.)*
4. Menu **Project Settings → API** : copie l'**URL du projet** et la clé **anon / publishable**. Dans **`keys.js`** (sur GitHub : ouvre le fichier → ✏️), colle-les dans `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Ce fichier ne contient que tes clés : les mises à jour ne le remplaceront plus.

## Étape 3 — Générer les clés de notification

1. Ouvre `https://TON-PSEUDO.github.io/coloc/tools/vapid.html` → **Générer mes clés**.
2. Colle la **clé publique** dans `keys.js` → `VAPID_PUBLIC_KEY`, puis commit.
3. Garde la page ouverte pour l'étape suivante (la clé privée ne va **jamais** sur GitHub).

## Étape 4 — Installer la fonction qui envoie les notifications

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**. Nom : `notify`. Colle le contenu de `supabase/functions/notify/index.ts`.
2. **Important** : dans les réglages de la fonction, désactive **Verify JWT** (sinon l'appli et le rappel du soir seront refusés), puis **Deploy**.
3. **Edge Functions → Secrets** (ou *Manage secrets*), ajoute :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | la clé publique de l'étape 3 |
| `VAPID_PRIVATE_KEY` | la clé privée de l'étape 3 |
| `VAPID_SUBJECT` | `mailto:ton-adresse@mail.com` |
| `CRON_SECRET` | un code secret de ton choix (long, au hasard) |

## Étape 5 — Programmer le rappel de 20h

1. Ouvre `supabase/cron.sql`, remplace `VOTRE-PROJET` (ton URL Supabase) et `VOTRE_CODE_SECRET` (le même `CRON_SECRET`).
2. **SQL Editor** → colle → **Run**. Le rappel part chaque soir à 16h UTC = **20h à La Réunion**.

## Étape 6 — Installer l'appli sur chaque téléphone

- **iPhone** (iOS 16.4 minimum) : ouvre le lien dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. Ouvre ensuite l'appli **depuis l'icône** (pas depuis Safari) : sans ça, iOS bloque les notifications.
- **Android** : ouvre le lien dans Chrome → menu ⋮ → **Installer l'application**.

Puis sur chaque téléphone : choisis ton prénom, appuie sur **Activer** dans le bandeau vert et accepte les notifications.

## Tester

- Signale un produit en rupture : tous les téléphones abonnés reçoivent la notification.
- Test du rappel sans attendre 20h : Supabase → Edge Functions → `notify` → Test avec le corps `{"type":"reminder"}` et l'en-tête `x-cron-secret: TON_CODE`.

---

## Personnaliser

- **Tâches faites par tous / personnes exclues** : dans `config.js` → `TASK_TEMPLATES`, ajoute une option à la ligne de la tâche :
  - `{ kind: 'aspijour', day: 5, everyone: true }` → tout le monde doit la faire (une case par personne, « 2/5 » dans le tableau) ;
  - `{ kind: 'wc', day: 1, exclude: ['Victor'] }` → Victor n'est pas concerné (la rotation se fait entre les autres) ;
  - `fewer: { Victor: 2 }` → Victor est moins souvent concerné (1 semaine sur 2 ; `3` = 1 semaine sur 3) ;
  - `only: ['Anthony', 'Lily']` → seulement ces personnes. Les options se combinent. La règle complète est la fonction `participants()` en bas du fichier.
- **Personnages** : `config.js` → `OUTFITS` (`level` = débloqué à ce niveau, `challenge` = gagné avec un défi), `SKIN_COLORS` / `HAIR_COLORS` / `BG_COLORS`. Les dessins sont dans `avatar.js` : « Hugo Deck » et « Zippo » sont des copies du chevalier et du singe, à la fin du fichier (`OUTFIT_DRAW.hugodeck = …`) : remplace-les par ton dessin.
- **Défis, récompenses, roue** : `challenges.js` (conditions), `config.js` (`DAILY_COINS`, `WHEEL_MIN/MAX`, `START_COINS`) · XP et niveaux : `config.js` → `XP_RULES`. ⚠️ Si tu changes un prix, une récompense ou un défi, relance `node tools/build-sql.mjs` (génère `supabase/migration-v5.sql`) puis exécute-le de nouveau dans Supabase : c'est la base qui verse les trophées et l'XP.
- **Trophées** : `config.js` → `TASK_KINDS` (champ `coins` = trophées de chaque tâche) et `ALLOW_EARLY_VALIDATION` (valider une tâche avant son jour, interdit par défaut).
- **Jour des poubelles, tâches, couleurs** : `config.js` (`day` : 0 = lundi … 6 = dimanche). Ne s'applique qu'aux semaines pas encore créées.
- **Prénoms / produits** : `supabase/schema.sql` avant de le lancer, ou plus tard dans Supabase → *Table Editor*.
- **Autre fuseau horaire** : change l'heure UTC dans `cron.sql` et ajoute le secret `TZ_NAME` (ex. `Europe/Paris`).

## Ajouter un copain

Supabase → SQL Editor :
```sql
insert into members (name, kind) values ('Prénom', 'copain');
```
Il démarre à 0 🏆, apparaît dans « Les copains » et dans les classements, et n'a aucune tâche.

## À savoir

- **Comment marchent les trophées** : ton total = trophées gagnés au ménage + récompenses (quotidienne, roue, défis) ± chifoumi. Rien ne se dépense plus. Le classement « Trophées » montre le total, le classement de la semaine ne compte que lundi→dimanche.
- **Triche** : le coup de celui qui lance un défi est stocké dans une table que personne ne peut lire avec la clé publique, et les duels et achats ne passent que par des fonctions de la base (vérifiées côté serveur). En revanche, comme il n'y a pas de mot de passe, rien n'empêche techniquement quelqu'un de jouer « à la place » d'un autre prénom. Les **scores de jeux sont envoyés par le téléphone** (un bidouilleur pourrait tricher), mais la base fixe les prix et les récompenses, tire la roue elle-même et refuse de porter une apparence non possédée.
- **Pas de mot de passe** : chacun choisit son prénom, et n'importe qui connaissant l'adresse de l'appli peut cocher une tâche ou signaler une rupture. Pour un usage entre colocs c'est suffisant ; on peut ajouter un code d'accès si besoin.
- La clé « anon » dans `config.js` est faite pour être publique. Les secrets (clé privée VAPID, code du cron) restent dans Supabase.
- Les notifications iPhone sont parfois un peu en retard : c'est iOS, pas l'appli.
- Supabase gratuit met un projet en pause après ~1 semaine sans aucune activité ; une coloc qui l'utilise tous les jours n'est pas concernée. Si ça arrive : bouton *Restore* dans Supabase.
- Les semaines à venir sont créées quand quelqu'un ouvre l'appli (au moins une fois par semaine).
