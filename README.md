# 🏠 Coloc — tâches ménagères & ruptures de stock

Appli web installable (PWA) pour iPhone **et** Android. **100 % gratuit** : GitHub Pages (hébergement) + Supabase (données partagées et notifications). Aucune carte bancaire.

Ce que fait l'appli :
- 🧹 **Tâches** : tableau de la semaine (7 colonnes = les jours, 1 ligne par type de tâche, une couleur par tâche). La lettre dans une case = le responsable. On touche une case pour la valider : une fenêtre de **confirmation** s'ouvre, et la tâche rapporte des **pièces** 🪙 à la personne qui l'a faite. On peut aussi **sauter** une tâche ou **annuler** une validation. Semaine en cours + 4 suivantes, et 2 semaines passées à revoir.
- 👥 **Tâches pour tous / exceptions** : une tâche peut être à faire par tout le monde (une case par personne) et certaines personnes peuvent en être exclues (ex. Victor). Voir « Personnaliser ».
- 🛒 **Stocks** : 13 produits sous forme de cartes. 1 clic = rouge « en rupture », 2e clic = réapprovisionné. Chaque rupture envoie une notification à **tous** les colocs.
- 👤 **Toi** : tes pièces 🪙, le classement du ménage, tes prochaines tâches (avec « Fait » et « Sauter »), ton **personnage** (homme/femme, couleur de peau, couleur de cheveux) et la **boutique** de tenues (singe, chevalier/chevalière, pirate, ninja, astronaute, sorcier/sorcière, roi/reine), achetées avec tes pièces.
- 🎮 **Jeux** : **chifoumi** (pierre-feuille-ciseaux). Tu défies un colocataire en misant des pièces et en choisissant ton coup en secret ; il relève le défi quand il veut. Le gagnant empoche la mise, égalité = rien ne bouge. Chacun est prévenu par notification.
- 🔔 **Rappel chaque soir à 20h** (heure de La Réunion) à ceux dont la tâche du jour n'est ni faite ni sautée.

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
   - *base de la toute première version : lance d'abord `supabase/migration-v2.sql` (remplace la table des tâches), puis `supabase/migration-v3.sql` ;*
   - *base déjà en version 2 (tableau + pièces) : lance seulement `supabase/migration-v3.sql` (ajoute personnage, boutique et duels, sans rien effacer).*

   *Puis redéploie la fonction `notify` à l'étape 4.)*
4. Menu **Project Settings → API** : copie l'**URL du projet** et la clé **anon / publishable**. Dans `config.js` (sur GitHub : ouvre le fichier → ✏️), colle-les dans `SUPABASE_URL` et `SUPABASE_ANON_KEY`.

## Étape 3 — Générer les clés de notification

1. Ouvre `https://TON-PSEUDO.github.io/coloc/tools/vapid.html` → **Générer mes clés**.
2. Colle la **clé publique** dans `config.js` → `VAPID_PUBLIC_KEY`, puis commit.
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
- **Boutique et jeux** : `config.js` → `OUTFITS` (prix des tenues), `SKIN_COLORS` / `HAIR_COLORS` (palettes), `DUEL_WAGERS` (mises proposées en un clic). Les personnages sont dessinés dans `avatar.js`.
- **Pièces** : `config.js` → `TASK_KINDS` (champ `coins` de chaque tâche), `SKIP_PENALTY` (pièces perdues quand on saute une tâche, 0 par défaut) et `ALLOW_EARLY_VALIDATION` (valider une tâche avant son jour, interdit par défaut).
- **Jour des poubelles, tâches, couleurs** : `config.js` (`day` : 0 = lundi … 6 = dimanche). Ne s'applique qu'aux semaines pas encore créées.
- **Prénoms / produits** : `supabase/schema.sql` avant de le lancer, ou plus tard dans Supabase → *Table Editor*.
- **Autre fuseau horaire** : change l'heure UTC dans `cron.sql` et ajoute le secret `TZ_NAME` (ex. `Europe/Paris`).

## À savoir

- **Comment marchent les pièces** : ton solde = pièces gagnées au ménage − achats ± duels. Le **classement** ne compte que les pièces gagnées au ménage : dépenser ou perdre au chifoumi ne te fait pas descendre. Une mise est bloquée tant que ton défi est en attente.
- **Triche** : le coup de celui qui lance un défi est stocké dans une table que personne ne peut lire avec la clé publique, et les duels et achats ne passent que par des fonctions de la base (vérifiées côté serveur). En revanche, comme il n'y a pas de mot de passe, rien n'empêche techniquement quelqu'un de jouer « à la place » d'un autre prénom.
- **Pas de mot de passe** : chacun choisit son prénom, et n'importe qui connaissant l'adresse de l'appli peut cocher une tâche ou signaler une rupture. Pour un usage entre colocs c'est suffisant ; on peut ajouter un code d'accès si besoin.
- La clé « anon » dans `config.js` est faite pour être publique. Les secrets (clé privée VAPID, code du cron) restent dans Supabase.
- Les notifications iPhone sont parfois un peu en retard : c'est iOS, pas l'appli.
- Supabase gratuit met un projet en pause après ~1 semaine sans aucune activité ; une coloc qui l'utilise tous les jours n'est pas concernée. Si ça arrive : bouton *Restore* dans Supabase.
- Les semaines à venir sont créées quand quelqu'un ouvre l'appli (au moins une fois par semaine).
