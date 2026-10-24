# 🏠 Coloc — tâches ménagères & ruptures de stock

Appli web installable (PWA) pour iPhone **et** Android. **100 % gratuit** : GitHub Pages (hébergement) + Supabase (données partagées et notifications). Aucune carte bancaire.

Ce que fait l'appli :
- 🧹 **Tâches** : planning de la semaine en cours + 4 suivantes, case à cocher, tâche barrée une fois faite, prénom du responsable. Les tâches tournent automatiquement entre vous 5 (sur 5 semaines, chacun fait exactement 9 tâches).
- 🛒 **Stocks** : 13 produits sous forme de cartes. 1 clic = rouge « en rupture », 2e clic = réapprovisionné. Chaque rupture envoie une notification à **tous** les colocs.
- 🔔 **Rappel chaque soir à 20h** (heure de La Réunion) à ceux dont la tâche du jour n'est pas cochée.

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

- **Jour des poubelles, tâches, fréquences** : `config.js` → `TASK_TEMPLATES` (`day` : 0 = lundi … 6 = dimanche). Ne s'applique qu'aux semaines pas encore créées.
- **Prénoms / produits** : `supabase/schema.sql` avant de le lancer, ou plus tard dans Supabase → *Table Editor*.
- **Autre fuseau horaire** : change l'heure UTC dans `cron.sql` et ajoute le secret `TZ_NAME` (ex. `Europe/Paris`).

## À savoir

- **Pas de mot de passe** : chacun choisit son prénom, et n'importe qui connaissant l'adresse de l'appli peut cocher une tâche ou signaler une rupture. Pour un usage entre colocs c'est suffisant ; on peut ajouter un code d'accès si besoin.
- La clé « anon » dans `config.js` est faite pour être publique. Les secrets (clé privée VAPID, code du cron) restent dans Supabase.
- Les notifications iPhone sont parfois un peu en retard : c'est iOS, pas l'appli.
- Supabase gratuit met un projet en pause après ~1 semaine sans aucune activité ; une coloc qui l'utilise tous les jours n'est pas concernée. Si ça arrive : bouton *Restore* dans Supabase.
- Les semaines à venir sont créées quand quelqu'un ouvre l'appli (au moins une fois par semaine).
