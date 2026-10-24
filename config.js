// ============================================================
//  CONFIGURATION — le seul fichier que tu dois modifier
// ============================================================

export const CONFIG = {
  // Laisse vide pour tester en "mode démo" (données stockées sur ton téléphone uniquement).
  // Renseigne les 3 valeurs pour activer le partage entre colocataires + les notifications.
  SUPABASE_URL: 'https://eycnuihgitlqvittyppj.supabase.co',        // ex : 'https://eycnuihgitlqvittyppj.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_VkyT4OtTmcTX794nI4ed4A_W_84jlld',   // clé "anon" / "publishable" (publique, elle peut rester dans GitHub)
  VAPID_PUBLIC_KEY: 'BAYsAhsOsPicmgqqPzVFva0aypmWw4X3n334traZcZlyFwhcVsIFWgHkcnrXvU4wO33TuCSpAan4X3KHoOVm8Pw',    // clé publique générée avec tools/vapid.html
};

// ---------- Pièces ----------
export const SKIP_PENALTY = 100;              // pièces perdues quand on saute une tâche (0 = aucune pénalité)
export const ALLOW_EARLY_VALIDATION = false; // true = on peut valider une tâche avant son jour

// ---------- Les 6 types de tâches ----------
// color : couleur de la ligne dans le tableau · coins : pièces gagnées quand la tâche est faite
export const TASK_KINDS = {
  cuisine:   { label: 'Nettoyage cuisine',              short: 'Cuisine',    emoji: '🍳', color: '#f59e0b', coins: 100,
               detail: 'Évier, plaques, micro-ondes (int./ext.), table et meubles' },
  poubelles: { label: 'Sortir la poubelle verte',           short: 'Pb verte',  emoji: '🗑️', color: '#10b981', coins: 30,
               detail: 'Ménager' },
  tri: { label: 'Sortir la poubelle jaune',           short: 'Pb jaune',  emoji: '♻️', color: '#FFFF00', coins: 30,
               detail: 'Tri sélectif' },
  wc:        { label: 'Nettoyage WC',                   short: 'WC',         emoji: '🚽', color: '#3b82f6', coins: 50,
               detail: 'Cuvette, lunette, balayette, papier' },
  aspijour:  { label: 'Aspi & serpillière (zone jour)', short: 'Salon',  emoji: '🧹', color: '#8b5cf6', coins: 100,
               detail: 'Salon, salle à manger, cuisine, couloirs' },
  sdb:       { label: 'Nettoyage salle de bain',        short: 'Salle de b.', emoji: '🛁', color: '#06b6d4', coins: 100,
               detail: 'Douche/baignoire, lavabo, miroir, désinfection' },
  balais:   { label: 'Balais sur la terrasse',  short: 'Terrasse',   emoji: '🍃', color: '#ec4899', coins: 80,
               detail: 'Passage du balais sur la terrasse' },
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
  { kind: 'poubelles', day: 0 },
  { kind: 'tri', day: 1 },
  { kind: 'wc',        day: 1, exclude: ['Victor'] },          // Victor ne nettoie pas les toilettes
  { kind: 'aspijour',  day: 1, fewer: { Victor: 2 } },         // salon : Victor moins souvent
  { kind: 'wc',        day: 4, exclude: ['Victor'] },
  { kind: 'sdb',       day: 5, exclude: ['Victor'] },         // salle de bain : Victor moins souvent
  { kind: 'aspijour',  day: 4, fewer: { Victor: 2 } },
  { kind: 'balais',   day: 6 },
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
