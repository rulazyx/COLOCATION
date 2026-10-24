// ============================================================
//  CONFIGURATION — le seul fichier que tu dois modifier
// ============================================================

export const CONFIG = {
  // Laisse vide pour tester en "mode démo" (données stockées sur ton téléphone uniquement).
  // Renseigne les 3 valeurs pour activer le partage entre colocataires + les notifications.
  SUPABASE_URL: 'https://eycnuihgitlqvittyppj.supabase.co',        // ex : 'https://eycnuihgitlqvittyppj.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_VkyT4OtTmcTX794nI4ed4A_W_84jlld',   // clé "anon" / "publishable" (publique, elle peut rester dans GitHub)
  VAPID_PUBLIC_KEY: 'BKm3eYyeBmA19eVbwS2WXab8aSVwvbv3p8Y6-krTuSPYe4xPatQMxjOTq_PbI5p04QAYhb_1ulJUd0EVBUJ208o',    // clé publique générée avec tools/vapid.html
};

// ---------- Pièces ----------
export const SKIP_PENALTY = 0;              // pièces perdues quand on saute une tâche (0 = aucune pénalité)
export const ALLOW_EARLY_VALIDATION = false; // true = on peut valider une tâche avant son jour

// ---------- Personnage, boutique, jeux ----------
export const SKIN_COLORS = [
  { c: '#fde0cc', name: 'Très clair' }, { c: '#f5c9a0', name: 'Clair' }, { c: '#e0a878', name: 'Hâlé' },
  { c: '#c68642', name: 'Mat' }, { c: '#8d5524', name: 'Brun' }, { c: '#5c3a21', name: 'Foncé' },
];
export const HAIR_COLORS = [
  { c: '#1f1a17', name: 'Noir' }, { c: '#5b3a29', name: 'Brun' }, { c: '#9a6a3a', name: 'Châtain' },
  { c: '#e6c068', name: 'Blond' }, { c: '#c4571f', name: 'Roux' }, { c: '#b8bcc4', name: 'Gris' },
  { c: '#ec4899', name: 'Rose' }, { c: '#3b82f6', name: 'Bleu' },
];

export const OUTFITS = {
  none:       { name: 'Tenue de base', price: 0 },
  singe:      { name: 'Singe',        price: 500,  hidesHair: true, hidesSkin: true },
  chevalier:  { name: 'Chevalier',    nameF: 'Chevalière', price: 800, hidesHair: true },
  pirate:     { name: 'Pirate',       price: 800 },
  ninja:      { name: 'Ninja',        price: 1000, hidesHair: true },
  astronaute: { name: 'Astronaute',   price: 1200 },
  sorcier:    { name: 'Sorcier',      nameF: 'Sorcière', price: 1500 },
  roi:        { name: 'Roi',          nameF: 'Reine', price: 5000 },
};
export const DUEL_WAGERS = [10, 25, 50, 100]; 

export const MOVES = {
  pierre:  { emoji: '✊', label: 'Pierre',  beats: 'ciseaux' },
  feuille: { emoji: '✋', label: 'Feuille', beats: 'pierre' },
  ciseaux: { emoji: '✌️', label: 'Ciseaux', beats: 'feuille' },
};

export const TASK_KINDS = {
  cuisine:   { label: 'Nettoyage cuisine',              short: 'Cuisine',    emoji: '🍳', color: '#f59e0b', coins: 100,
               detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles' },
  poubelles: { label: 'Sortir la poubelle verte',           short: 'Pb verte',  emoji: '🗑️', color: '#10b981', coins: 80,
               detail: 'Poubelle ménagère' },
  tri: { label: 'Sortir la poubelle de tri',           short: 'Pb jaune',  emoji: '♻️', color: '#10b981', coins: 80,
               detail: 'Tri sélectif' },
  wc:        { label: 'Nettoyage WC',                   short: 'WC',         emoji: '🚽', color: '#3b82f6', coins: 120,
               detail: 'Cuvette, lunette, balayette, papier' },
  aspijour:  { label: 'Aspi & serpillière (zone jour)', short: 'Aspi jour',  emoji: '🧹', color: '#8b5cf6', coins: 100,
               detail: 'Salon, salle à manger, cuisine, couloirs' },
  sdb:       { label: 'Nettoyage salle de bain',        short: 'Salle de b.', emoji: '🛁', color: '#06b6d4', coins: 150,
               detail: 'Douche/baignoire, lavabo, miroir, désinfection' },
  aspieau:   { label: 'Aspi & serpillière (zone eau)',  short: 'Aspi eau',   emoji: '🚿', color: '#ec4899', coins: 80,
               detail: 'Sols de la salle de bain et des WC' },
};

// jours 0 - lundi à 6 - dimanche
export const TASK_TEMPLATES = [
  { kind: 'cuisine',   day: 0 },
  { kind: 'poubelles', day: 0 },
  { kind: 'tri', day: 1 },
  { kind: 'wc',        day: 1, exclude: ['Victor'] },          
  { kind: 'aspijour',  day: 2, fewer: { Victor: 2 } },         
  { kind: 'cuisine',   day: 3 },
  { kind: 'wc',        day: 4, exclude: ['Victor'] },
  { kind: 'sdb',       day: 5, exclude: ['Victor']  },         
  { kind: 'aspijour',  day: 5, fewer: { Victor: 2 } },
  { kind: 'aspieau',   day: 6, exclude: ['Victor'] },
];

export function pickAssignee(template, members, slot, weekIdx) {
  const pool = participants(template, members, weekIdx);
  if (!pool.length) return null;
  const n = members.length;
  const base = members[(((slot + weekIdx) % n) + n) % n];
  if (pool.some((m) => m.id === base.id)) return base;
  return pool[(((slot + weekIdx) % pool.length) + pool.length) % pool.length];
}

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
