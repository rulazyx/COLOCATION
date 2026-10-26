# 🏠 Coloc — tâches ménagères & ruptures de stock

Appli web installable (PWA) pour iPhone **et** Android. **100 % gratuit** : GitHub Pages (hébergement) + Supabase (données partagées et notifications). Aucune carte bancaire.

Ce que fait l'appli :
- 🔐 **Code secret** : au premier lancement, chacun crée un code à 4 chiffres, demandé à chaque connexion. Code oublié ? Dans Supabase (SQL Editor) : `delete from member_pins where member_id = (select id from members where name = 'Prénom'); update members set has_pin = false where name = 'Prénom';` — la personne en recrée un.
- 🧼 **Tâches** : une liste de tâches réalisables (cuisine, poubelles, WC…). On touche celle qu'on a faite, on confirme, puis **un autre coloc doit confirmer** (il est prévenu par notification). La tâche rapporte des **savons** 🧼 selon sa pénibilité (`TASK_KINDS` dans `config.js`) et de l'XP. Une fois faite, la tâche redevient disponible après un délai (`cooldownH`).
- 🛒 **Stocks** : 13 produits en cartes. 1 clic = rouge « en rupture », 2e clic = réapprovisionné.
- 🧭 **Quêtes** : la quête principale « Découverte de l'application », la quête secondaire « Monter le Piton des Neiges » (3 070 m au Grand Raid) et, dans le second onglet, les **22 défis** (chacun donne de l'XP, certains une apparence).
- 🎮 **Jeux** : **chifoumi**, **Jumpy Cardinal**, **Le Grand Raid**, **Sudoku**, **Blackjack**. Les jeux donnent de l'XP (et des paliers de score) ; chifoumi et blackjack donnent aussi des **trophées** 🏆 (plafonnés par jour).
- 🥇 **Classement** : résumé, classement de la semaine (trophées, 👑 pour le champion) et un classement par catégorie.
- 👤 **Toi** : niveau (infini) et barre d'XP, badges bois → platine, personnalisation, notifications.
- ⭐ **Niveaux** : toute action rapporte de l'XP. Niveau L à 7 × L × (L−1) XP (≈ niveau 50 à 17 000 XP).
- 🎭 **Apparences** : par niveau (Singe 3, Pirate 5, Ninja 8, Astronaute 10) ou par défi (Roi, Sorcier, Chevalier, Zeus, Poussin, Détective, Hugo Deck, Monsieur Nickel, Clochard, Zippo « Le noob », Papangue « Légende des Airs »).
- 🤝 **Copains** : joueurs hors coloc (Etienne) : ils jouent et gagnent des niveaux mais ne font pas les tâches.
- 🔔 Rappel chaque soir à 20h aux colocs qui ont des tâches à confirmer.

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
   - ***base en version 7 (appli déjà en ligne) : lance seulement `supabase/migration-v8.sql`** (aucune remise à zéro) ;*
   - *base en version 6 : `migration-v7.sql` (⚠️ remise à zéro) puis `migration-v8.sql` ;*
   - *base en version 5 : `migration-v6.sql` puis `migration-v7.sql` ; base en version 4 : `migration-v5.sql`, `migration-v6.sql`, `migration-v7.sql`.)*
   - *base en version 3 : `migration-v4.sql` à `migration-v7.sql`, dans l'ordre.*

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
- **Défis, XP, niveaux, savons** : `challenges.js` (défis et leur XP), `config.js` (`XP_RULES`, `MILESTONES`, `DAILY_XP`, `TASK_KINDS`). ⚠️ Après un changement, relance `node tools/build-sql.mjs` (génère `supabase/migration-v8.sql`) puis exécute-le de nouveau dans Supabase : la base verse l'XP et les trophées (la remise à zéro n'est pas refaite).
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


## Mise à jour v7 (savons, code secret, remise à zéro)
1. Supabase → SQL Editor → lance `supabase/migration-v7.sql`. ⚠️ Il **remet à zéro** XP, trophées, défis, stats et apparences gagnées (une seule fois : relancé plus tard, il ne ré-efface rien).
2. Redéploie la fonction `notify` (`supabase/functions/notify/index.ts`) : elle gère les notifications de confirmation de tâche.
3. Remplace les fichiers de l'appli sur GitHub, sauf `keys.js`.


## Mise à jour v11 (migration-v8.sql)
1. Supabase → SQL Editor → lance `supabase/migration-v8.sql` (**aucune remise à zéro** ; tu peux le relancer sans risque).
2. Redéploie la fonction `notify` (`supabase/functions/notify/index.ts`) pour recevoir les notifications de messages.
3. Remplace les fichiers du dépôt GitHub **sauf `keys.js`**, puis rouvre l'appli (ferme-la complètement une fois).

Nouveautés : header avec ta tête (touche-la pour voir tous les colocs et copains), onglets Tâches / Défis / Jeux / Classement / Profil, introduction au premier lancement, récompense du jour en haut de Défis, plateau (jeu de l'oie, remis à zéro chaque lundi, dé = savons), historique des tâches et des lancers, classement hebdomadaire unique (prince / roi / dieu), messages courts (140 caractères), chifoumi +5 / −4 trophées, blackjack avec mises, doubler et séparer, sudoku à 3 vies.
Réglages : `config.js` (`GOOSE` = cases du plateau, `LEVEL_K` = difficulté des niveaux, `BJ_BETS`, `XP_RULES`).

Ajouts : historique des trophées et des savons (touche les chips en haut à droite), récompense d'arrivée du plateau qui change chaque semaine (bière, mini cadeau aux courses, semaine de vacances ; réglable dans `PERKS`), prix du dé `DICE_PRICES` (1, 3, 5, 10, 20), plus d'essai au blackjack, nouvelle icône soleil. La migration `migration-v8.sql` contient tout : si tu l'as déjà lancée, relance-la simplement.

Ajouts v11c : dollars 💵 (monnaie du blackjack, 50 offerts par jour avec 50 XP ; mises 10-20-30-50 puis 100-200-300-500 au-delà de 500 dollars ; défis à 500, 1 000 et 10 000 dollars), plateau sans trophées pendant la course (dollars, pièges −1), défis triés par type avec les terminés en bas, profil sans header, tuiles de jeux redessinées, nouvelle introduction (6 étapes dont les têtes). ⚠️ `migration-v8.sql` **remet les niveaux à zéro** (XP de tout le monde, une seule fois).

Ajouts v11d : `migration-v8.sql` **remet tout à zéro une fois** (XP, records, trophées, dollars, savons et historique des tâches, défis, apparences, duels, plateau ; l'introduction déjà vue n'est pas rejouée). Les jetons s'appellent maintenant dollars 💵. Onglet Profil > Colocs & copains, badge mis en avant sur son profil (colonne `members.badge`).

Ajouts v11e : tout le monde revoit l'introduction (une fois, via `migration-v8.sql`), couleurs et sexe cachés derrière « Changer de couleur » / « Changer de sexe », un seul défi chifoumi en attente à la fois avec un même joueur.

## v12
- Blackjack : distribution plus rapide (moins de suspense).
- En-tête : 💵 à droite avec 🧼 et 🏆.
- Pastille 💵 (jeu payant) sur les tuiles Chifoumi et Blackjack.
- Chifoumi : mise de 10 💵 (le gagnant prend 10 💵 au perdant, jamais sous 0) + 5 🏆 au gagnant (plafond 25/jour). Plus de perte de trophées. Il faut ≥ 10 💵 pour défier / relever.
- Mise à jour : exécuter `supabase/migration-v8.sql`, redéployer `notify`.

## v13
- Dollars → **colocoins** (pièce jaune trouée en SVG, le texte 🪙 est remplacé automatiquement).
- Nouveau classement « Colocoins » (onglet Classement : Trophées / Colocoins).
- Cadre doré animé + couronne sur l'avatar du·de la premier·ère de la semaine (trophées).
- Plateau : premier dé du jour gratuit (puis 1, 3, 5, 10, 20 🧼), tours infinis (200 XP + 5 🏆 par tour, récompense de la semaine au 1er tour), position = dernier lancer (les pièges font vraiment reculer), décor plage en 2D.
- Mise à jour : exécuter `supabase/migration-v8.sql`, redéployer `notify`.

## v14
- Boutique (caddie 🛒 à côté du personnage) : cadres de profil, effets de pseudo, looks de l'oiseau de Jumpy Cardinal, payés en colocoins (`buy_shop`, table `shop_items`, colonnes `members.frame/namefx/bird`).
- Popup d'un jeu : classement des records. Classement : Colocoins / Niveau / Savons.
- Blackjack : mises 5-10-25-50, puis 25-50-100-200 (> 200 🪙), puis 100-200-300-500 (> 500 🪙).
- Trophées supprimés de l'interface et des gains (à repenser). Défis prince/roi/dieu retirés ; les tenues Roi et Zeus se débloquent avec « Gros joueur » et « Roi du casino ».
- Onglets illustrés (TÂCHES, QUÊTES, JEUX, CLASSEMENT, PERSO). Perso : Garde-robe / Titres / Badges / Cadres / Réglages.
- Mise à jour : exécuter `supabase/migration-v8.sql`, redéployer `notify`.

## v15
- Barre d'onglets sombre : icônes blanches, jaunes sur l'onglet actif.
- Boutique : nouvel onglet Apparence (pirate, ninja, astronaute, fée, créole, docteur, chevalier). Singe/tortue/lion/dino : niveaux 5/10/20/30. Nouveaux dessins : fée, créole, docteur, tortue, lion, dino.
- Profil : Réglages = bouton engrenage en haut à gauche.
- Plateau animé : dé qui roule, pion qui avance de case en case, décor animé, cadre en bois.
- Monnaies : colocoins (pièce + mot jaune), savons (savon + mot bleu), EXP (pastille jaune-orangé) ; niveau coloré par palier. Plus d'étoile.
- Remise à zéro totale (clé `reset_v15`, une seule fois) : niveaux, XP, pièces, savons, records, achats, tâches, messages.
- Mise à jour : exécuter `supabase/migration-v8.sql`, redéployer `notify`.

## v15b
- Échange : toucher les colocoins du header → 1 savon = 100 colocoins, 10 savons = 1 200 colocoins (`exchange_soap`, table `soap_exchanges`).
- Icône Jeux (oiseau) redessinée ; étoile du podium retirée.

## v16
- Défi « Le noob » renommé « Le petit nouveau » : récompense = uniquement le skin Zippo (0 XP). L'ancien défi « petit nouveau » est supprimé.
- Niveau 2 = 150 XP = introduction terminée (50) + récompense du jour (50) + premier jeu lancé (50, `launch_game`). Formule : niveau L ≥ 2 à 100 + 25·L·(L−1) XP.
- Mise à jour : exécuter `supabase/migration-v8.sql`.

## v17
- Défis : Employé de la friterie = 50 obstacles ; nouveau « Sauteur professionnel » (500 obstacles) → apparence Ptérodactyle.
- Oiseau de Jumpy Cardinal : looks Chevalier (500 🪙) et Ténèbres (900 🪙, yeux rouges).
- Tous les 10 niveaux : +100 🪙 (`add_xp`, paliers uniques).
- La pastille 🧼 ouvre le plateau.
- Plateau en anneau (30 cases, la 30 rejoint la 1) ; classement des tours de la semaine ; `settle_plateau()` verse 500 🪙 au(x) meilleur(s) de la semaine passée (au moins 1 tour).
- Textes, onglets du bas et segments plus petits.

## v17b
- Synchro robuste : une requête en échec ne bloque plus les autres ; bandeau rouge « Données non à jour » + bouton Réessayer ; un canal temps réel par table.

## v18 — Colo-Ferme
- Jeux → onglet « Colo-Ferme » : 3 parcelles (jusqu'à 6), 4 cultures (curcuma 1 h, letchi 4 h, ananas 8 h, vanille 24 h), temps réel, fanent 24 h après maturité.
- Plafond de récolte : 100 🪙/jour. Arroser un voisin : −20 % de temps et +5 🪙 (4×/jour). Une tâche validée : −50 % sur tes cultures.
- Réglages dans `config.js` (FARM). SQL : tables farm_*, fonctions farm_plant/harvest/water/unlock, `answer_task` mis à jour.

## v19
- Colo-Ferme : 8 cultures (curcuma, tomate, letchi, fruit de la passion, papaye, ananas, avocat, vanille), une nouvelle tous les 3 niveaux ; 1 parcelle au départ, 5 à acheter (100/200/400/700/1000).
- Suppression du Grand Raid et du skin Hugo Deck. Blackjack remplace la tuile Raid ; grande tuile Colo-Ferme au-dessus des jeux.
- 6 défis « Ferme » ; « Maraîcher » donne le skin Fermier.

## v20 — Tâches par catégorie
- Nettoyage / Aspirateur / Serpillère (cuisine, salon, salle de bain, WC +2 🧼 ; toute la maison +10), Poubelles (4 × +1), Cuisiner (pâtisseries +4, repas +8). Délais de disponibilité réglables dans `config.js` (TASK_KINDS).
- Les anciennes tâches restent en base pour l'historique mais ne s'affichent plus dans la liste.

## v21
- Colo-Ferme devient un vrai jeu (games/ferme.js) : tuile → fiche → plein écran, parcelles et fruits dessinés/animés, visite des fermes voisines, arrosage animé. Plafond de récolte : 200 🪙/jour.
- Tâches : 5 catégories (Nettoyage, Aspirateur, Serpillère, Poubelles, Cuisiner) qui ouvrent leurs choix.
- RÉINITIALISATION GÉNÉRALE (`reset_v20`) incluse dans migration-v8.sql.

## v22
- Jeux : Colo-Ferme et Blackjack se lancent directement ; Chifoumi ouvre le choix de l'adversaire (têtes) puis du coup ; plus de classements de records pour ces trois jeux.
- Savons : onglet Tâches avec en-tête « savons cette semaine » (tête de chaque coloc) ; les dés ne consomment plus de savons : ils demandent un cumul de savons gagnés dans la semaine ; pastille 🎲 = dés restants.

## v23 — Colo-Ferme, le domaine
- 3 onglets dans le jeu : Domaine (grange, 5 bâtiments, 8 décorations à construire avec des fruits et légumes), Champs (la terre et ses 6 parcelles), Grange (stock, vente, bonus).
- Récolter donne des unités (3 par parcelle) rangées dans la grange ; on les vend (plafond 200 🪙/jour) ou on les garde pour construire.
- Bonus : puits −10 % de pousse, étal +15 % de vente, serre +1 unité, silo +50 de plafond.
- Nouveaux défis : Premier chantier, Grand bâtisseur.
