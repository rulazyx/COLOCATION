// ============================================================
//  RÉGLAGES de l'appli (tâches, niveaux, apparences…). Tes clés sont dans keys.js
// ============================================================

// Tes clés Supabase / notifications sont dans keys.js
export { CONFIG } from './keys.js';

// ---------- XP, niveaux, trophées, savons ----------
// 🧼 Savons : gagnés en faisant les tâches ménagères (selon la pénibilité, voir TASK_KINDS).
// 🏆 Trophées : gagnés avec les jeux (chifoumi, blackjack).   ⭐ XP : gagnée par toutes les actions → niveaux (infinis).
// ⚠️ Après un changement ici : node tools/build-sql.mjs puis relancer supabase/migration-v7.sql dans Supabase.
export const XP_RULES = {
  introXp: 50, firstGameXp: 50,   // niveau 2 = introduction + récompense du jour (50) + premier jeu lancé
  taskPerSoap: 25,    // une tâche validée rapporte (savons × 25) XP à celui qui l'a faite
  validate: 10,       // XP pour celui qui confirme la tâche d'un autre
  daily: 0,           // (la récompense quotidienne a sa propre table : DAILY_XP)
  duelPlay: 15, duelWin: 25,        // chifoumi : jouer / gagner
  duelWinTrophies: 0, duelTrophyCapPerDay: 25, duelStake: 10, // chifoumi : mise de 10 🪙 (le gagnant prend 10 🪙 au perdant) + 5 🏆 pour le gagnant (plafonné par jour)
  flappyPerObstacle: 3, raidPer50m: 2, gameCap: 300, // par partie, plafonné
  sudoku: 150, stock: 10,           // grille terminée / produit signalé (1 fois par jour et par produit)
  bjPlay: 10, bjWin: 15, bjBlackjack: 30,           // blackjack : main jouée / gagnée / blackjack naturel (les trophées, eux, sont les mises)
};
// Paliers de score : XP offerte UNE fois quand on franchit chaque palier (at = seuils, xp = récompenses)
export const MILESTONES = {
  flappy: { at: [10, 25, 50, 100, 250, 500, 1000], xp: [50, 100, 150, 250, 400, 600, 1000] },
  raid:   { at: [500, 1000, 3070, 6000, 10000, 20000], xp: [50, 100, 200, 300, 500, 800] },
  sudoku: { at: [900, 600, 420, 300, 240], xp: [50, 100, 200, 400, 700], low: true }, // temps en secondes : plus petit = mieux
};
// Niveau L (≥ 2) atteint à LEVEL_BASE + LEVEL_K × L × (L − 1) XP. Le niveau 2 (150 XP) = introduction (50) + récompense du jour (50) + premier lancement d'un jeu (50).
export const LEVEL_K = 25, LEVEL_BASE = 100;
export const xpForLevel = (l) => (l <= 1 ? 0 : LEVEL_BASE + LEVEL_K * l * (l - 1));
export const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + (Math.max(xp - LEVEL_BASE, 0) * 4) / LEVEL_K)) / 2);
export const levelProgress = (xp) => {
  const l = levelOf(xp), lo = xpForLevel(l), hi = xpForLevel(l + 1);
  return { level: l, into: xp - lo, need: hi - lo, pct: Math.min(100, ((xp - lo) / (hi - lo)) * 100) };
};

// ---------- Personnage, jeux ----------
export const SKIN_COLORS = [
  { c: '#fde0cc', name: 'Très clair' }, { c: '#f5c9a0', name: 'Clair' }, { c: '#e0a878', name: 'Hâlé' },
  { c: '#c68642', name: 'Mat' }, { c: '#8d5524', name: 'Brun' }, { c: '#5c3a21', name: 'Foncé' },
];
export const HAIR_COLORS = [
  { c: '#1f1a17', name: 'Noir' }, { c: '#5b3a29', name: 'Brun' }, { c: '#9a6a3a', name: 'Châtain' },
  { c: '#e6c068', name: 'Blond' }, { c: '#c4571f', name: 'Roux' }, { c: '#b8bcc4', name: 'Gris' },
  { c: '#ec4899', name: 'Rose' }, { c: '#3b82f6', name: 'Bleu' },
];
// Apparences. Deux façons de les débloquer (plus de boutique) :
//   level: 4            → débloquée en atteignant ce niveau
//   challenge: 'cle'    → gagnée en réussissant un défi (voir challenges.js)
// hidesHair / hidesSkin : la tenue cache cheveux / peau. nameF : nom au féminin (facultatif)
export const OUTFITS = {
  none:         { name: 'Tenue de base' },
  // — à la boutique : 100 colocoins (dino 200) —
  singe:        { name: 'Singe',        price: 100, hidesHair: true, hidesSkin: true },
  tortue:       { name: 'Tortue',       price: 100, hidesHair: true, hidesSkin: true },
  lion:         { name: 'Lion',         nameF: 'Lionne', price: 100, hidesHair: true, hidesSkin: true },
  dino:         { name: 'Dino',         price: 200, hidesHair: true, hidesSkin: true },
  // — dans la boutique (colocoins) —
  pirate:       { name: 'Pirate',       price: 400 },
  ninja:        { name: 'Ninja',        price: 500, hidesHair: true },
  astronaute:   { name: 'Astronaute',   price: 800 },
  fee:          { name: 'Fée',          price: 600 },
  creole:       { name: 'Créole',       price: 500 },
  docteur:      { name: 'Docteur',      nameF: 'Docteure', price: 600 },
  chevalier:    { name: 'Chevalier',    nameF: 'Chevalière', price: 1000, hidesHair: true },
  // — par défi —
  zippo:        { name: 'Zippo',        challenge: 'noob', hidesHair: true, hidesSkin: true },   // copie du singe : à redessiner dans avatar.js
  sorcier:      { name: 'Sorcier',      nameF: 'Sorcière',   challenge: 'mentaliste' },
  roi:          { name: 'Roi',          nameF: 'Reine',      challenge: 'dollars_1000' },
  poussin:      { name: 'Poussin',      challenge: 'maitre_poussin', hidesHair: true, hidesSkin: true },
  detective:    { name: 'Détective',    nameF: 'Détective',  challenge: 'inspecteur' },
  fermier:      { name: 'Fermier',      nameF: 'Fermière',   challenge: 'maraicher' },
  zeus:         { name: 'Zeus',         nameF: 'Héra',       challenge: 'dollars_10000' },
  nickel:       { name: 'Monsieur Nickel', nameF: 'Madame Nickel', challenge: 'nickel' },
  pterodactyl:  { name: 'Ptérodactyle', challenge: 'sauteur_pro', hidesHair: true, hidesSkin: true },
  papangue:     { name: 'Papangue',    challenge: 'legende_airs', hidesHair: true },
  clochard:     { name: 'Clochard',     nameF: 'Clocharde',  challenge: 'clochard' },
};

// Introduction au premier lancement : on invite à toucher chaque onglet (une étape = un bit de member_stats.quest_mask)
export const INTRO_STEPS = [
  { n: 1, tab: 'tasks', title: 'Tâches', text: "Choisis la tâche ménagère que tu viens de faire : un autre coloc la confirme et tu gagnes des savons 🧼 et de l'XP. Dans cet onglet, trois parties : Tâches, Plateau (un jeu de l'oie où les savons achètent des dés) et Stocks (signale ce qui manque)." },
  { n: 2, tab: 'defis', title: 'Quêtes', text: "Chaque jour, récupère tout en haut 50 colocoins et 50 XP. En dessous, la liste des défis, classés par type : chaque défi réussi rapporte de l'XP, un titre et parfois un nouveau personnage." },
  { n: 3, tab: 'games', title: 'Jeux', text: "Touche un jeu pour voir sa règle, puis « Jouer ». Chifoumi te fait défier un coloc (mise de 10 🪙), le blackjack se joue avec tes colocoins 🪙, et les autres jeux rapportent de l'XP." },
  { n: 4, tab: 'rank', title: 'Classement', text: "Qui a le plus de colocoins 🪙 ? Qui a le meilleur niveau ? Compare-toi aux autres colocs et copains. Dans chaque jeu, la fenêtre de règle montre aussi le classement des records." },
  { n: 6, tab: 'heads', title: 'Ton profil', text: "Touche ta tête en haut à gauche : c'est un raccourci vers ton profil (garde-robe, titres, badges, réglages). Pour voir le profil d'un autre, touche-le dans le classement." },
  { n: 5, tab: 'me', title: 'Perso', text: "Ici tu personnalises ton personnage : garde-robe, titres, badges, cadres et réglages (genre, couleurs, notifications). Le caddie 🛒 en haut ouvre la boutique : cadres, effets de pseudo et looks de l'oiseau de Jumpy Cardinal." },
];
// Récompense quotidienne (en XP) : jours 1 à 6, le jour 7 débloque la roue de la fortune (XP aussi)
export const DAILY_XP = [30, 40, 50, 60, 80, 100];
export const WHEEL_MIN = 100, WHEEL_MAX = 1000;
export const BG_COLORS = ['#e6ebf1', '#fde68a', '#fecaca', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8', '#fed7aa', '#334155', '#14532d'];
// Chifoumi : chaque coup bat celui indiqué dans "beats"
export const MOVES = {
  pierre:  { emoji: '✊', label: 'Pierre',  beats: 'ciseaux' },
  feuille: { emoji: '✋', label: 'Feuille', beats: 'pierre' },
  ciseaux: { emoji: '✌️', label: 'Ciseaux', beats: 'feuille' },
};

// ---------- Les tâches ménagères ----------
// Chacun peut faire une tâche quand il veut : il la choisit dans la liste, un autre coloc confirme.
// soap : savons 🧼 gagnés (selon la pénibilité) · cooldownH : une fois faite, la tâche redevient disponible après ce délai (en heures)
const LEGACY_KINDS = {  // anciennes tâches : cachées de la liste mais gardées pour l'historique
  cuisine:   { label: 'Nettoyage cuisine',              short: 'Cuisine',    emoji: '🍳', color: '#f59e0b', soap: 4, cooldownH: 12, legacy: true,
               detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles' },
  poubelles: { label: 'Sortir les poubelles',           short: 'Poubelles',  emoji: '🗑️', color: '#10b981', soap: 2, cooldownH: 12, legacy: true,
               detail: 'Tri sélectif, compost, ménagère + sacs propres' },
  wc:        { label: 'Nettoyage WC',                   short: 'WC',         emoji: '🚽', color: '#3b82f6', soap: 5, cooldownH: 72, legacy: true,
               detail: 'Cuvette, lunette, balayette, papier' },
  aspijour:  { label: 'Aspi & serpillière (zone jour)', short: 'Aspi jour',  emoji: '🧹', color: '#8b5cf6', soap: 4, cooldownH: 24, legacy: true,
               detail: 'Salon, salle à manger, cuisine, couloirs' },
  sdb:       { label: 'Nettoyage salle de bain',        short: 'Salle de b.', emoji: '🛁', color: '#06b6d4', soap: 6, cooldownH: 72, legacy: true,
               detail: 'Douche/baignoire, lavabo, miroir, désinfection' },
  aspieau:   { label: 'Aspi & serpillière (zone eau)',  short: 'Aspi eau',   emoji: '🚿', color: '#ec4899', soap: 3, cooldownH: 24, legacy: true,
               detail: 'Sols de la salle de bain et des WC' },
};
// Tâches regroupées par catégorie. soap = savons gagnés · cooldownH = délai avant que la tâche redevienne disponible (en heures)
export const TASK_GROUPS = [
  { key: 'net',  label: 'Nettoyage',  emoji: '🧽', color: '#f59e0b' },
  { key: 'asp',  label: 'Aspirateur', emoji: '🧹', color: '#8b5cf6' },
  { key: 'ser',  label: 'Serpillère', emoji: '🪣', color: '#06b6d4' },
  { key: 'poub', label: 'Poubelles',  emoji: '🗑️', color: '#10b981' },
  { key: 'cuis', label: 'Cuisiner',   emoji: '🍳', color: '#ec4899' },
];
const ROOMS = [['cuisine', 'Cuisine', '🍳', 24, 48], ['salon', 'Salon', '🛋️', 48, 24], ['sdb', 'Salle de bain', '🛁', 72, 48], ['wc', 'WC', '🚽', 72, 48]];
const roomKinds = (g, verb, details, cdFn, houseCd) => Object.fromEntries([
  ...ROOMS.map(([r, name, emoji], i) => [`${g}_${r}`, { group: g, room: name, label: `${verb} · ${name}`, short: `${verb} ${name.toLowerCase()}`, emoji, soap: 2, cooldownH: cdFn(i), detail: details[i] }]),
  [`${g}_maison`, { group: g, room: 'Toute la maison', label: `${verb} · Toute la maison`, short: `${verb} toute la maison`, emoji: '🏠', soap: 10, cooldownH: houseCd, detail: 'Toutes les pièces d\'un coup' }],
]);
export const TASK_KINDS = {
  ...roomKinds('net', 'Nettoyage', ['Évier, plaques, micro-ondes, table', 'Meubles, table, rangement', 'Douche, lavabo, miroir', 'Cuvette, lunette, balayette'], (i) => [24, 48, 72, 72][i], 168),
  ...roomKinds('asp', 'Aspirateur', ['Sol de la cuisine', 'Sol du salon', 'Sol de la salle de bain', 'Sol des WC'], (i) => [24, 24, 48, 48][i], 72),
  ...roomKinds('ser', 'Serpillère', ['Sol de la cuisine', 'Sol du salon', 'Sol de la salle de bain', 'Sol des WC'], (i) => [48, 48, 72, 72][i], 168),
  poub_verte:     { group: 'poub', room: 'Poubelle verte',  label: 'Jeter la poubelle verte',  short: 'Poubelle verte',  emoji: '🟢', soap: 1, cooldownH: 12, detail: 'La vider dans le bac' },
  poub_jaune:     { group: 'poub', room: 'Poubelle jaune',  label: 'Jeter la poubelle jaune',  short: 'Poubelle jaune',  emoji: '🟡', soap: 1, cooldownH: 12, detail: 'Tri sélectif' },
  poub_portail:   { group: 'poub', room: 'Devant le portail', label: 'Mettre la poubelle devant le portail', short: 'Poubelle au portail', emoji: '🚪', soap: 1, cooldownH: 12, detail: 'Pour le passage des éboueurs' },
  poub_remplace:  { group: 'poub', room: 'Remplacer le sac', label: 'Remplacer la poubelle', short: 'Sac remplacé', emoji: '🛍️', soap: 1, cooldownH: 12, detail: 'Mettre un sac propre' },
  cuis_patisserie: { group: 'cuis', room: 'Pâtisseries', label: 'Pâtisseries pour tout le monde', short: 'Pâtisseries', emoji: '🧁', soap: 4, cooldownH: 24, detail: 'Gâteau, cookies… pour toute la coloc' },
  cuis_repas:      { group: 'cuis', room: 'Repas', label: 'Cuisiner pour tout le monde', short: 'Repas pour tous', emoji: '🍲', soap: 8, cooldownH: 24, detail: 'Un vrai repas pour toute la coloc' },
  cuis_vaisselle:  { group: 'cuis', room: 'Vaisselle', label: 'Vaisselle pour tout le monde', short: 'Vaisselle pour tous', emoji: '🍽️', soap: 2, cooldownH: 12, detail: 'La vaisselle de toute la coloc' },
  courses:         { group: 'courses', label: 'Achat demandé', short: 'Achat pour un coloc', emoji: '🛒', soap: 2, cooldownH: 0, detail: 'Acheter ce qu\'un coloc a demandé' },
  ...LEGACY_KINDS,
};
Object.values(TASK_KINDS).forEach((K) => { K.color ??= TASK_GROUPS.find((g) => g.key === K.group)?.color; });


// ---------- Plateau : jeu de l'oie (remis à zéro chaque lundi) ----------
// Un lancer de dé coûte des savons : 1 le premier de la journée, puis +1 à chaque achat (le prix repart de 1 à minuit).
// Cases : xp / chips (colocoins) = gain · back = recule de n cases · goose = avance de nouveau du même nombre. L'arrivée donne un gros bonus (une fois par semaine).
export const GOOSE = {
  size: 30,
  cells: {
    3: { chips: 20 }, 5: { xp: 30 }, 7: { back: 1 }, 9: { goose: true }, 10: { xp: 40 }, 13: { chips: 20 }, 15: { xp: 50 },
    17: { back: 1 }, 18: { goose: true }, 20: { xp: 60 }, 23: { chips: 40 }, 25: { xp: 80 }, 27: { back: 1 },
  },
  finish: { xp: 200, trophy: 0 },
  weekWin: 1000,   // colocoins pour le(s) coloc(s) qui ont gagné le plus de savons la semaine passée (au moins 1)
};
// Palier de niveau : tous les 10 niveaux, des colocoins offerts
export const LEVEL_BONUS = { every: 10, chips: 100 };
// Prix du dé selon le nombre de lancers déjà faits aujourd'hui (le 6e et les suivants coûtent le dernier prix)
export const DICE_PRICES = [0, 1, 3, 5, 10, 20]; // le 1er dé du jour est gratuit ; les suivants demandent d'avoir gagné ce nombre de savons CETTE SEMAINE (ils ne sont pas dépensés)
export const DICE_MAX_DAY = 8;                      // nombre maximum de dés par jour
// Récompense immatérielle de l'arrivée : change chaque semaine (tourne dans cet ordre). confirm = les autres colocs doivent confirmer qu'ils ont tenu parole.
export const PERKS = [
  { key: 'biere', title: 'Tout le monde vous doit une bière !', short: 'Une bière offerte par chaque coloc', confirm: true },
  { key: 'course', title: 'Mini cadeau pendant les prochaines courses…', short: 'Un mini cadeau offert par chaque coloc pendant les courses', confirm: true },
  { key: 'vacances', title: 'Prenez une semaine de vacances !', short: 'Une semaine sans tâche ménagère', confirm: false, days: 7 },
];
export const perkOfWeek = (monday) => PERKS[((Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2024, 0, 1)) / 86400000) / 7) % PERKS.length + PERKS.length) % PERKS.length];
// Colocoins (monnaie du blackjack) : récompense du jour = 50 colocoins + 50 XP
export const DAILY = { chips: 50, xp: 50 };
// Blackjack : on mise des colocoins. Au-dessus de 500 colocoins, les mises passent à l'échelle supérieure.
// 3 paliers : 5-10-25-50, puis 25-50-100-200 (au-delà de 200), puis 100-200-300-500 (au-delà de 500)
export const BJ_BETS = { low: [5, 10, 25, 50], mid: [25, 50, 100, 200], high: [100, 200, 300, 500], midThreshold: 200, threshold: 500 };
export const betsFor = (chips) => (chips > BJ_BETS.threshold ? BJ_BETS.high : chips > BJ_BETS.midThreshold ? BJ_BETS.mid : BJ_BETS.low);
// Paliers de colocoins qui débloquent un défi
export const CHIP_GOALS = [500, 1000, 10000];
export const MESSAGE_MAX = 140; // longueur d'un message court

// ---------- Boutique (colocoins) : cadres de profil, effets de pseudo, looks de l'oiseau de Jumpy Cardinal ----------
// Les clés sont stockées dans purchases.item sous la forme 'frame:bronze', 'namefx:or', 'bird:bleu'
export const SHOP = {
  frame: [
    { key: 'bronze',   name: 'Bronze',        price: 150 },
    { key: 'argent',   name: 'Argent',        price: 300 },
    { key: 'or',       name: 'Or',            price: 600 },
    { key: 'rubis',    name: 'Rubis',         price: 500 },
    { key: 'neon',     name: 'Néon',          price: 800 },
    { key: 'arcenciel', name: 'Arc-en-ciel',  price: 1000 },
    { key: 'flammes',  name: 'Flammes',       price: 1500 },
    { key: 'glace',    name: 'Glace',         price: 1500 },
    { key: 'royal',    name: 'Royal',         price: 2500 },
  ],
  namefx: [
    { key: 'rouge',    name: 'Rouge',         price: 100 },
    { key: 'bleu',     name: 'Bleu',          price: 100 },
    { key: 'vert',     name: 'Vert',          price: 100 },
    { key: 'violet',   name: 'Violet',        price: 100 },
    { key: 'rose',     name: 'Rose',          price: 100 },
    { key: 'dore',     name: 'Doré',          price: 300 },
    { key: 'neon',     name: 'Néon',          price: 400 },
    { key: 'arcenciel', name: 'Arc-en-ciel',  price: 500 },
    { key: 'feu',      name: 'Feu',           price: 600 },
  ],
  // Oiseaux : plus d'achat direct. On les gagne dans les caisses (BIRD_CRATE) ; w = poids de tirage (plus c'est grand, plus c'est fréquent)
  bird: [
    { key: 'bleu',     name: 'Oiseau bleu',   w: 20,  body: '#3b82f6', belly: '#bfdbfe', wing: '#1d4ed8' },
    { key: 'vert',     name: 'Perroquet',     w: 20,  body: '#22c55e', belly: '#bbf7d0', wing: '#15803d' },
    { key: 'rose',     name: 'Flamant',       w: 20,  body: '#f472b6', belly: '#fbcfe8', wing: '#db2777' },
    { key: 'jaune',    name: 'Canari',        w: 20,  body: '#facc15', belly: '#fef9c3', wing: '#ca8a04' },
    { key: 'pigeon',   name: 'Pigeon',        w: 12,  body: '#9aa3ad', belly: '#c8ced5', wing: '#6b7480', acc: 'pigeon' },
    { key: 'canard',   name: 'Canard',        w: 12,  body: '#ffd23f', belly: '#fff1b0', wing: '#e0a800', acc: 'duck' },
    { key: 'lunettes', name: 'Cool',          w: 8,   body: '#ef4444', belly: '#fecaca', wing: '#b91c1c', acc: 'shades' },
    { key: 'clodo',    name: 'Oiseau clodo',  w: 8,   body: '#8a8478', belly: '#b9b2a3', wing: '#5f5a50', acc: 'clodo' },
    { key: 'ptero',    name: 'Ptérodactyl',   w: 5,   body: '#6f8a4a', belly: '#c9d39a', wing: '#4a5f2f', acc: 'ptero' },
    { key: 'ninja',    name: 'Ninja',         w: 2,   body: '#1f2937', belly: '#6b7280', wing: '#111827', acc: 'band' },
    { key: 'chevalier', name: 'Oiseau chevalier', w: 1.5, body: '#8f99a4', belly: '#d7dde3', wing: '#5b6470', acc: 'knight' },
    { key: 'or',       name: 'Oiseau doré',   w: 1,   body: '#fbbf24', belly: '#fef3c7', wing: '#b45309', acc: 'crown' },
    { key: 'arcenciel', name: 'Arc-en-ciel',  w: 1,   body: '#ef4444', belly: '#fff', wing: '#8b5cf6', rainbow: true },
    { key: 'tenebres', name: 'Oiseau des ténèbres', w: 1, body: '#15121c', belly: '#2c2638', wing: '#0b0910', eye: '#ef1d1d', eyeBg: '#1a0000', acc: 'dark' },
  ],
};
export const BIRD_CRATE = { price: 150 };
export const birdRarity = (w) => (w >= 12 ? 'Commun' : w >= 5 ? 'Rare' : w >= 2 ? 'Épique' : 'Légendaire');
// Apparences vendues (voir OUTFITS : price). Stockées dans purchases.item sous le nom simple (ex. 'pirate')
SHOP.outfit = Object.entries(OUTFITS).filter(([, o]) => o.price).map(([key, o]) => ({ key, name: o.name, price: o.price }));
export const SHOP_SLOTS = [['outfit', 'Apparence'], ['frame', 'Cadres'], ['namefx', 'Pseudo'], ['bird', 'Oiseau']];
export const shopItem = (slot, key) => SHOP[slot]?.find((i) => i.key === key) ?? null;

// Échange de savons contre des colocoins (offres fixes)
export const SOAP_EXCHANGE = [{ soap: 1, coins: 100 }, { soap: 10, coins: 1200 }];

// ---------- Colo-Ferme : mini tycoon, les cultures poussent en temps réel ----------
// Les récoltes sont plafonnées par jour (capPerDay) pour ne pas casser l'économie. Non récolté 24 h après maturité = fané.
export const FARM = {
  // level = niveau requis (une nouvelle culture tous les 3 niveaux) · sell = prix de vente d'une unité à la grange
  crops: [
    { key: 'curcuma', name: 'Curcuma',         hours: 1,  cost: 0,  sell: 3,  level: 1 },
    { key: 'tomate',  name: 'Tomate',          hours: 2,  cost: 0,  sell: 6,  level: 3 },
    { key: 'letchi',  name: 'Letchi',          hours: 4,  cost: 0, sell: 9,  level: 6 },
    { key: 'passion', name: 'Fruit de la passion', hours: 6,  cost: 0, sell: 13, level: 9 },
    { key: 'papaye',  name: 'Papaye',          hours: 8,  cost: 0, sell: 18, level: 12 },
    { key: 'ananas',  name: 'Ananas Victoria', hours: 12,  cost: 0, sell: 23, level: 15 },
    { key: 'avocat',  name: 'Avocat',          hours: 16,  cost: 0, sell: 28, level: 18 },
    { key: 'vanille', name: 'Vanille',         hours: 24,  cost: 0, sell: 33, level: 21 },
  ],
  yield: 3,                               // unités récoltées par parcelle
  baseSlots: 1,
  slotCosts: [0, 100, 200, 400, 700, 1000],   // prix de chaque parcelle : on commence avec 1, les 5 autres s'achètent
  capPerDay: 200,                         // colocoins maximum gagnés par jour en vendant ses récoltes à la grange
  witherH: 24,
  waterCut: 0.2,                          // arroser la parcelle d'un autre : -20 % du temps restant
  waterReward: 5, waterRewardMaxPerDay: 4, // 5 🪙 par arrosage, 4 fois par jour au maximum
  taskBoost: 0.5,                         // une tâche ménagère validée : -50 % du temps restant sur tes cultures
  // Domaine : au début, seule la grange existe. On construit avec des fruits et légumes (cost = unités de récolte).
  spots: { b: 5, d: 0 },                  // emplacements de bâtiments (b0…)
  perks: { wellCut: 0.10, stallBonus: 0.15, siloCap: 50, greenhouseUnits: 1 },
  items: [
    { key: 'puits',       kind: 'b', name: 'Puits',          cost: { curcuma: 6, tomate: 4 },    perk: 'Les cultures poussent 10 % plus vite' },
    { key: 'etal',        kind: 'b', name: 'Étal de marché', cost: { letchi: 6, passion: 4 },    perk: 'Tes ventes rapportent 15 % de plus' },
    { key: 'serre',       kind: 'b', name: 'Serre',          cost: { papaye: 6, ananas: 5 },     perk: '+1 unité à chaque récolte' },
    { key: 'silo',        kind: 'b', name: 'Silo',           cost: { avocat: 6, ananas: 6 },     perk: '+50 pièces de plafond de vente par jour' },
    { key: 'poulailler',  kind: 'b', name: 'Poulailler',     cost: { tomate: 8, letchi: 4 },     perk: 'Des poules se promènent dans ta ferme' },
  ],
};


// Quêtes journalières par jeu : visibles seulement dans le jeu. mode 'add' = on cumule, 'max' = on garde le meilleur chiffre du jour.
export const GAME_QUESTS = {
  flappy: [
    { key: 'fl_games', label: 'Lance 3 parties', target: 3, reward: 20, mode: 'add' },
    { key: 'fl_score', label: 'Atteins 20', target: 20, reward: 40, mode: 'max' },
    { key: 'fl_jumps', label: 'Saute 100 fois', target: 100, reward: 30, mode: 'add' },
  ],
  ferme: [
    { key: 'fe_plant', label: 'Plante du curcuma', target: 1, reward: 20, mode: 'add' },
    { key: 'fe_visit', label: "Regarde la ferme d'un autre joueur", target: 1, reward: 20, mode: 'add' },
    { key: 'fe_barn', label: 'Clique sur ta grange', target: 1, reward: 20, mode: 'add' },
  ],
  blackjack: [
    { key: 'bj_bj', label: 'Fais un blackjack', target: 1, reward: 40, mode: 'add' },
    { key: 'bj_streak', label: 'Gagne 2 parties d\'affilée', target: 2, reward: 30, mode: 'max' },
    { key: 'bj_low', label: 'Gagne une main avec 16 ou moins', target: 1, reward: 30, mode: 'add' },
  ],
};
export const ALL_QUESTS = Object.entries(GAME_QUESTS).flatMap(([game, l]) => l.map((q) => ({ ...q, game })));

// Demander à un coloc d'acheter quelque chose : récompense en savons pour celui qui l'achète (confirmé par le demandeur)
export const SHOP_REQ = { soap: 2, maxOpen: 5, itemMax: 80 };
