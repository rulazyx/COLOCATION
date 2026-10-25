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
  taskPerSoap: 25,    // une tâche validée rapporte (savons × 25) XP à celui qui l'a faite
  validate: 10,       // XP pour celui qui confirme la tâche d'un autre
  daily: 0,           // (la récompense quotidienne a sa propre table : DAILY_XP)
  duelPlay: 15, duelWin: 25,        // chifoumi : jouer / gagner
  duelWinTrophies: 2, duelTrophyCapPerDay: 10, // trophées par victoire au chifoumi (plafond par jour)
  flappyPerObstacle: 3, raidPer50m: 2, gameCap: 300, // par partie, plafonné
  sudoku: 150, stock: 10,           // grille terminée / produit signalé (1 fois par jour et par produit)
  bjPlay: 10, bjWin: 15, bjBlackjack: 30,           // blackjack : main jouée / gagnée / blackjack naturel
  bjTrophyWin: 1, bjTrophyBlackjack: 2, bjTrophyCapPerDay: 6, // trophées blackjack (plafond par jour)
};
// Paliers de score : XP offerte UNE fois quand on franchit chaque palier (at = seuils, xp = récompenses)
export const MILESTONES = {
  flappy: { at: [10, 25, 50, 100, 250, 500, 1000], xp: [50, 100, 150, 250, 400, 600, 1000] },
  raid:   { at: [500, 1000, 3070, 6000, 10000, 20000], xp: [50, 100, 200, 300, 500, 800] },
  sudoku: { at: [900, 600, 420, 300, 240], xp: [50, 100, 200, 400, 700], low: true }, // temps en secondes : plus petit = mieux
};
// Niveau L atteint à LEVEL_K × L × (L − 1) XP : niveau 10 ≈ 630, 50 ≈ 17 000, 100 ≈ 69 000… et ça continue sans limite
export const LEVEL_K = 7;
export const xpForLevel = (l) => LEVEL_K * l * (l - 1);
export const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + (Math.max(xp, 0) * 4) / LEVEL_K)) / 2);
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
  singe:        { name: 'Singe',        level: 3,  hidesHair: true, hidesSkin: true },
  pirate:       { name: 'Pirate',       level: 5 },
  ninja:        { name: 'Ninja',        level: 8,  hidesHair: true },
  astronaute:   { name: 'Astronaute',   level: 10 },
  zippo:        { name: 'Zippo',        challenge: 'noob', hidesHair: true, hidesSkin: true },   // copie du singe : à redessiner dans avatar.js
  chevalier:    { name: 'Chevalier',    nameF: 'Chevalière', challenge: 'pilier',            hidesHair: true },
  sorcier:      { name: 'Sorcier',      nameF: 'Sorcière',   challenge: 'mentaliste' },
  roi:          { name: 'Roi',          nameF: 'Reine',      challenge: 'roi_coloc' },
  poussin:      { name: 'Poussin',      challenge: 'maitre_poussin', hidesHair: true, hidesSkin: true },
  detective:    { name: 'Détective',    nameF: 'Détective',  challenge: 'inspecteur' },
  hugodeck:     { name: 'Hugo Deck',    challenge: 'diagonale', hidesHair: true },       // copie du chevalier : à redessiner dans avatar.js
  zeus:         { name: 'Zeus',         nameF: 'Héra',       challenge: 'dieu_coloc' },
  nickel:       { name: 'Monsieur Nickel', nameF: 'Madame Nickel', challenge: 'nickel' },
  papangue:     { name: 'Papangue',    challenge: 'legende_airs', hidesHair: true },
  clochard:     { name: 'Clochard',     nameF: 'Clocharde',  challenge: 'clochard' },
};

// Quête principale « Découverte de l'application » : une étape = un bit de member_stats.quest_mask
export const MAIN_QUEST = {
  title: "Découverte de l'application", emoji: '🧭',
  steps: [
    { n: 1, text: 'Personnalise ton personnage', emoji: '🎭', tab: 'me' },
    { n: 2, text: 'Consulte les différents classements', emoji: '🥇', tab: 'rank' },
    { n: 3, text: 'Lance une partie de jeu', emoji: '🎮', tab: 'games' },
    { n: 4, text: 'Clique sur une tâche ménagère', emoji: '🧹', tab: 'tasks' },
  ],
};
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
export const TASK_KINDS = {
  cuisine:   { label: 'Nettoyage cuisine',              short: 'Cuisine',    emoji: '🍳', color: '#f59e0b', soap: 4, cooldownH: 12,
               detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles' },
  poubelles: { label: 'Sortir les poubelles',           short: 'Poubelles',  emoji: '🗑️', color: '#10b981', soap: 2, cooldownH: 12,
               detail: 'Tri sélectif, compost, ménagère + sacs propres' },
  wc:        { label: 'Nettoyage WC',                   short: 'WC',         emoji: '🚽', color: '#3b82f6', soap: 5, cooldownH: 72,
               detail: 'Cuvette, lunette, balayette, papier' },
  aspijour:  { label: 'Aspi & serpillière (zone jour)', short: 'Aspi jour',  emoji: '🧹', color: '#8b5cf6', soap: 4, cooldownH: 24,
               detail: 'Salon, salle à manger, cuisine, couloirs' },
  sdb:       { label: 'Nettoyage salle de bain',        short: 'Salle de b.', emoji: '🛁', color: '#06b6d4', soap: 6, cooldownH: 72,
               detail: 'Douche/baignoire, lavabo, miroir, désinfection' },
  aspieau:   { label: 'Aspi & serpillière (zone eau)',  short: 'Aspi eau',   emoji: '🚿', color: '#ec4899', soap: 3, cooldownH: 24,
               detail: 'Sols de la salle de bain et des WC' },
};
