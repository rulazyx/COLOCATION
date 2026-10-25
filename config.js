// ============================================================
//  RÉGLAGES de l'appli (tâches, niveaux, apparences…). Tes clés sont dans keys.js
// ============================================================

// Tes clés Supabase / notifications sont dans keys.js
export { CONFIG } from './keys.js';

// ---------- Trophées et niveaux ----------
// Les trophées sont devenues des TROPHÉES : on les gagne, on ne les dépense plus.
export const ALLOW_EARLY_VALIDATION = false; // true = on peut valider une tâche avant son jour
// XP gagnée par action (⚠️ après un changement : node tools/build-sql.mjs puis relancer migration-v5.sql dans Supabase)
export const XP_RULES = {
  taskPerTrophy: 2,   // une tâche rapporte (trophées de la tâche × 2) XP
  daily: 10, wheel: 20, challenge: 50,
  duelPlay: 5, duelWin: 10,          // chifoumi : jouer / gagner
  flappyPerObstacle: 1, raidPer50m: 1, gameCap: 100, // par partie, plafonné
  sudoku: 40, stock: 5,              // grille terminée / produit signalé (1 fois par jour et par produit)
};
// Niveau L atteint à 50 × L × (L − 1) XP : niveau 2 = 100, 3 = 300, 4 = 600, 5 = 1000, 10 = 4500…
export const xpForLevel = (l) => 50 * l * (l - 1);
export const levelOf = (xp) => { let l = 1; while (xp >= xpForLevel(l + 1)) l++; return l; };
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
  singe:        { name: 'Singe',        level: 2,  hidesHair: true, hidesSkin: true },
  pirate:       { name: 'Pirate',       level: 4 },
  ninja:        { name: 'Ninja',        level: 6,  hidesHair: true },
  astronaute:   { name: 'Astronaute',   level: 8 },
  zippo:        { name: 'Zippo',        level: 10, hidesHair: true, hidesSkin: true },   // copie du singe : à redessiner dans avatar.js
  chevalier:    { name: 'Chevalier',    nameF: 'Chevalière', challenge: 'pilier',            hidesHair: true },
  sorcier:      { name: 'Sorcier',      nameF: 'Sorcière',   challenge: 'mentaliste' },
  roi:          { name: 'Roi',          nameF: 'Reine',      challenge: 'roi_coloc' },
  poussin:      { name: 'Poussin',      challenge: 'maitre_poussin', hidesHair: true, hidesSkin: true },
  detective:    { name: 'Détective',    nameF: 'Détective',  challenge: 'inspecteur' },
  hugodeck:     { name: 'Hugo Deck',    challenge: 'diagonale', hidesHair: true },       // copie du chevalier : à redessiner dans avatar.js
  zeus:         { name: 'Zeus',         nameF: 'Héra',       challenge: 'dieu_coloc' },
  nickel:       { name: 'Monsieur Nickel', nameF: 'Madame Nickel', challenge: 'nickel' },
  clochard:     { name: 'Clochard',     nameF: 'Clocharde',  challenge: 'clochard' },
};
export const START_COINS = 0;                // tout le monde commence à 0 trophée

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
// Récompense quotidienne : trophées des jours 1 à 6, le jour 7 débloque la roue de la fortune
export const DAILY_COINS = [10, 15, 20, 25, 30, 40];
export const WHEEL_MIN = 50, WHEEL_MAX = 1000;
// Les défis ne comptent que les tâches des semaines à partir de cette date (évite de punir le passé)
export const CHALLENGES_SINCE = '2026-10-26';
export const BG_COLORS = ['#e6ebf1', '#fde68a', '#fecaca', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8', '#fed7aa', '#334155', '#14532d'];
// Chifoumi : chaque coup bat celui indiqué dans "beats"
export const MOVES = {
  pierre:  { emoji: '✊', label: 'Pierre',  beats: 'ciseaux' },
  feuille: { emoji: '✋', label: 'Feuille', beats: 'pierre' },
  ciseaux: { emoji: '✌️', label: 'Ciseaux', beats: 'feuille' },
};

// ---------- Les 6 types de tâches ----------
// color : couleur de la ligne dans le tableau · coins : trophées gagnées quand la tâche est faite
export const TASK_KINDS = {
  cuisine:   { label: 'Nettoyage cuisine',              short: 'Cuisine',    emoji: '🍳', color: '#f59e0b', coins: 10,
               detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles' },
  poubelles: { label: 'Sortir les poubelles',           short: 'Poubelles',  emoji: '🗑️', color: '#10b981', coins: 8,
               detail: 'Tri sélectif, compost, ménagère + sacs propres' },
  wc:        { label: 'Nettoyage WC',                   short: 'WC',         emoji: '🚽', color: '#3b82f6', coins: 12,
               detail: 'Cuvette, lunette, balayette, papier' },
  aspijour:  { label: 'Aspi & serpillière (zone jour)', short: 'Aspi jour',  emoji: '🧹', color: '#8b5cf6', coins: 10,
               detail: 'Salon, salle à manger, cuisine, couloirs' },
  sdb:       { label: 'Nettoyage salle de bain',        short: 'Salle de b.', emoji: '🛁', color: '#06b6d4', coins: 15,
               detail: 'Douche/baignoire, lavabo, miroir, désinfection' },
  aspieau:   { label: 'Aspi & serpillière (zone eau)',  short: 'Aspi eau',   emoji: '🚿', color: '#ec4899', coins: 8,
               detail: 'Sols de la salle de bain et des WC' },
};

// ---------- Le planning type d'une semaine ----------
// day : 0 = lundi … 6 = dimanche   (⚠️ poubelles : mets le vrai jour de collecte)
//
// Par défaut, une tâche est confiée à UNE personne, qui change chaque semaine (rotation).
// Deux options pour les cas particuliers :
//   everyone: true            → la tâche doit être faite par TOUS (une case à valider par personne)
//   exclude: ['Victor']       → ces personnes ne sont pas concernées par cette tâche
//   only: ['Anthony', 'Lily'] → seules ces personnes sont concernées
// Les options se combinent. Exemples (à décommenter / adapter) :
//   { kind: 'aspijour', day: 5, everyone: true },
//   { kind: 'wc', day: 1, exclude: ['Victor'] },
//   fewer: { Victor: 2 }      → moins souvent : Victor n'est dans la rotation qu'1 semaine sur 2
//                               (Victor: 3 = 1 semaine sur 3, etc.)
export const TASK_TEMPLATES = [
  { kind: 'cuisine',   day: 0 },
  { kind: 'poubelles', day: 1 },
  { kind: 'wc',        day: 1, exclude: ['Victor'] },          // Victor ne nettoie pas les toilettes
  { kind: 'aspijour',  day: 2, fewer: { Victor: 2 } },         // salon : Victor moins souvent
  { kind: 'cuisine',   day: 3 },
  { kind: 'wc',        day: 4, exclude: ['Victor'] },
  { kind: 'sdb',       day: 5, fewer: { Victor: 2 } },         // salle de bain : Victor moins souvent
  { kind: 'aspijour',  day: 5, fewer: { Victor: 2 } },
  { kind: 'aspieau',   day: 6 },
];

// ---------- Rotation : qui fait la tâche cette semaine ? ----------
// On fait tourner la tâche sur TOUS les colocs. Si la personne désignée n'est pas concernée
// (exclue, ou "moins souvent"), la tâche passe à quelqu'un d'autre parmi les personnes concernées.
export function pickAssignee(template, members, slot, weekIdx) {
  const pool = participants(template, members, weekIdx);
  if (!pool.length) return null;
  const n = members.length;
  const base = members[(((slot + weekIdx) % n) + n) % n];
  if (pool.some((m) => m.id === base.id)) return base;
  return pool[(((slot + weekIdx) % pool.length) + pool.length) % pool.length];
}

// ---------- Fonction d'exception : qui est concerné par une tâche ? ----------
// Appelée pour chaque tâche à chaque génération de semaine. Modifie-la si tu veux une règle plus fine.
export function participants(template, members, weekIdx = 0) {
  const norm = (s) => String(s).trim().toLowerCase();
  let list = members;
  if (template.fewer) {
    // "fewer: { Victor: 2 }" → Victor n'est concerné que les semaines paires (1 semaine sur 2)
    list = list.filter((m) => {
      const entry = Object.entries(template.fewer).find(([name]) => norm(name) === norm(m.name));
      return !entry || weekIdx % entry[1] === 0;
    });
  }
  if (template.only) {
    const only = template.only.map(norm);
    list = list.filter((m) => only.includes(norm(m.name)));
  }
  if (template.exclude) {
    const excl = template.exclude.map(norm);
    list = list.filter((m) => !excl.includes(norm(m.name)));
  }
  return list;
}
