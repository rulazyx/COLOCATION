// Défis (titres à débloquer) et classements. Fonctions pures : elles ne touchent ni au DOM ni à la base.
// ⚠️ Les clés (key), les trophées et les apparences de récompense doivent rester identiques à la table
//    "challenges" de supabase/migration-v4.sql (c'est la base qui verse la récompense).
import { OUTFITS, CHALLENGES_SINCE, levelOf } from './config.js';

// ctx = { meId, members, stats:{id→ligne}, scores:{id→{coins,done_count}}, balances:{id→trophées}, wins:{id→n},
//         duels:[…], tasks:[…], owned:Set, viewed:Set, today:'AAAA-MM-JJ' }
const st = (c) => c.stats[c.meId] ?? {};
const chores = (c) => c.scores[c.meId]?.done_count ?? 0;
const num = (v) => Number(v) || 0;
// Badges (bois → platine). th = seuils bronze, argent, or, platine ; low = plus petit = mieux (sudoku)
export const TIER_NAMES = ['Bois', 'Bronze', 'Argent', 'Or', 'Platine'];
export const BADGES = {
  level:    { th: [3, 6, 10, 15] },
  coins:    { th: [50, 150, 400, 1000] },
  chores:   { th: [5, 20, 50, 100] },
  chifoumi: { th: [1, 5, 15, 30] },
  flappy:   { th: [5, 15, 30, 60] },
  raid:     { th: [1000, 3070, 6000, 10000] },
  sudoku:   { th: [900, 600, 420, 300], low: true },
  weeks:    { th: [1, 3, 6, 12] },
};
// Renvoie 0..4 (bois..platine), ou null s'il n'y a encore aucun résultat
export function tierOf(key, v) {
  const b = BADGES[key];
  if (v == null || (!b.low && !(v > 0) && key !== 'level')) return null;
  return b.th.filter((t) => (b.low ? v <= t : v >= t)).length;
}
// Quête secondaire : monter le Piton des Neiges (3 070 m) en une course du Grand Raid
export const PITON_M = 3070;
export const questDone = (mask) => (mask & 15) === 15;

// Séries de victoires au chifoumi (toutes parties terminées, dans l'ordre)
export function duelRuns(duels, meId) {
  const mine = duels.filter((d) => d.status === 'done' && (d.challenger_id === meId || d.opponent_id === meId))
    .sort((a, b) => String(a.played_at).localeCompare(String(b.played_at)) || a.id - b.id);
  let cur = 0, best = 0, rock = false;
  for (const d of mine) {
    if (d.winner_id === meId) {
      cur++; best = Math.max(best, cur);
      if ((d.challenger_id === meId ? d.challenger_move : d.opponent_move) === 'pierre') rock = true;
    } else cur = 0; // défaite ou égalité : la série s'arrête
  }
  return { best, rock };
}

// Tâches qui t'étaient confiées, dont le jour est passé, et qui n'ont pas été faites (oubliées ou sautées)
export function missedChores(tasks, meId, today) {
  return tasks.filter((t) => t.assignee_id === meId && t.week >= CHALLENGES_SINCE && t.status !== 'done'
    && dayOf(t) < today).length;
}
function dayOf(t) {
  const [y, m, d] = t.week.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + t.day_index));
  return x.toISOString().slice(0, 10);
}

/* ---------- Classements ---------- */
export const BOARDS = [
  { key: 'level',    emoji: '⭐', label: 'Niveau',            unit: '',    low: false },
  { key: 'coins',    emoji: '🏆', label: 'Trophées',          unit: ' 🏆', low: false },
  { key: 'chores',   emoji: '🧹', label: 'Tâches faites',     unit: '',    low: false },
  { key: 'chifoumi', emoji: '✊', label: 'Victoires chifoumi', unit: '',    low: false },
  { key: 'flappy',   emoji: '🐤', label: 'Flappy',            unit: '',    low: false },
  { key: 'raid',     emoji: '🏃', label: 'Le Grand Raid',     unit: ' m',  low: false },
  { key: 'sudoku',   emoji: '🔢', label: 'Sudoku (meilleur temps)', unit: '', low: true },
];
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const fmtValue = (board, v) => (v == null ? '—' : board.key === 'sudoku' ? fmtTime(v) : board.key === 'level' ? `Niv. ${Math.floor(v / 100000)}` : `${v}${board.unit}`);

export function boardValue(c, key, id) {
  const s = c.stats[id] ?? {};
  switch (key) {
    case 'level': return c.xp?.[id] != null ? levelOf(c.xp[id]) * 100000 + c.xp[id] % 100000 : 0; // niveau d'abord, puis XP
    case 'coins': return num(c.balances[id]);
    case 'chores': return c.scores[id]?.done_count ?? 0;
    case 'chifoumi': return c.wins[id] ?? 0;
    case 'flappy': return num(s.flappy_best);
    case 'raid': return num(s.raid_best);
    case 'sudoku': return s.sudoku_best ?? null;
    default: return null;
  }
}

// Liste triée : [{id, value, rank}]. Les ex æquo partagent le même rang. Sans score (null ou 0) : en bas, sans rang.
export function ranking(c, board) {
  const rows = c.members.map((m) => ({ id: m.id, name: m.name, value: boardValue(c, board.key, m.id) }));
  const has = (r) => r.value != null && (board.low || r.value > 0 || board.key === 'coins');
  rows.sort((a, b) => {
    if (has(a) !== has(b)) return has(a) ? -1 : 1;
    if (a.value !== b.value && has(a)) return board.low ? a.value - b.value : b.value - a.value;
    return a.name.localeCompare(b.name);
  });
  let rank = 0, prev;
  rows.forEach((r, i) => {
    if (!has(r)) { r.rank = null; return; }
    if (r.value !== prev) rank = i + 1;
    r.rank = rank; prev = r.value;
  });
  return rows;
}
// Premier d'un classement = seul en tête (pas d'ex æquo) avec un vrai score
export function leaderOf(c, board) {
  const r = ranking(c, board);
  return r[0]?.rank === 1 && r[1]?.rank !== 1 ? r[0].id : null;
}
export const firstPlaces = (c, id) => BOARDS.filter((b) => leaderOf(c, b) === id).length;

/* ---------- Défis ---------- */
const prog = (value, goal) => ({ value: Math.min(value, goal), goal, done: value >= goal });
const allOthers = (c) => c.members.filter((m) => m.id !== c.meId);
const skinsToCollect = Object.keys(OUTFITS).filter((k) => k !== 'none');

export const CHALLENGES = [
  // — Ménage —
  { key: 'clochard', title: 'Le clochard', emoji: '🥫', desc: 'Laisser 3 tâches de ménage non faites (oubliées ou sautées).', hint: 'Ça compte à partir du 26 octobre.',
    check: (c) => prog(missedChores(c.tasks, c.meId, c.today), 3) },
  { key: 'propre_soi', title: 'Le Propre sur soi', emoji: '🧼', desc: 'Faire 1 tâche de ménage.', check: (c) => prog(chores(c), 1) },
  { key: 'fee_logis', title: 'Fée du Logis', emoji: '🧚', desc: 'Faire 10 tâches de ménage.', check: (c) => prog(chores(c), 10) },
  { key: 'nickel', title: 'Monsieur Nickel', emoji: '🧽', desc: 'Faire 20 tâches de ménage.', check: (c) => prog(chores(c), 20) },
  // — Flappy —
  { key: 'premier_envol', title: 'Premier Envol', emoji: '🐣', desc: 'Passer 5 obstacles à Flappy (cumulés).', check: (c) => prog(num(st(c).flappy_total), 5) },
  { key: 'employe_friterie', title: 'Employé de la friterie', emoji: '🍗', desc: 'Passer 30 obstacles à Flappy (cumulés).', check: (c) => prog(num(st(c).flappy_total), 30) },
  { key: 'maitre_poussin', title: 'Maître poussin', emoji: '🐥', desc: 'Passer 100 obstacles à Flappy (cumulés).', check: (c) => prog(num(st(c).flappy_total), 100) },
  // — Le Grand Raid —
  { key: 'mascareigne', title: 'Finisher de la Mascareigne', emoji: '🌴', desc: 'Faire 1000 m au Grand Raid.', check: (c) => prog(num(st(c).raid_best), 1000) },
  { key: 'diagonale', title: 'Finisher de la Diagonale des Fous', emoji: '🌋', desc: 'Faire 10 000 m au Grand Raid.', check: (c) => prog(num(st(c).raid_best), 10000) },
  // — Chifoumi —
  { key: 'roc', title: 'Solide comme un roc', emoji: '🪨', desc: 'Gagner un chifoumi en jouant pierre.', check: (c) => prog(duelRuns(c.duels, c.meId).rock ? 1 : 0, 1) },
  { key: 'tailladeur', title: 'Le tailladeur', emoji: '✂️', desc: 'Gagner 3 duels de chifoumi d\'affilée.', check: (c) => prog(duelRuns(c.duels, c.meId).best, 3) },
  { key: 'mentaliste', title: 'Le mentaliste', emoji: '🔮', desc: 'Gagner 10 duels de chifoumi d\'affilée.', check: (c) => prog(duelRuns(c.duels, c.meId).best, 10) },
  // — Personnages —
  { key: 'petit_nouveau', title: 'Le petit nouveau', emoji: '🎒', desc: 'Débloquer ton premier personnage.', check: (c) => prog(skinsToCollect.filter((k) => c.owned.has(k)).length, 1) },
  { key: 'maitre_rh', title: 'Maître RH', emoji: '👔', desc: 'Débloquer tous les personnages.',
    check: (c) => prog(skinsToCollect.filter((k) => c.owned.has(k)).length, skinsToCollect.length) },
  // — Coloc —
  { key: 'pilier', title: 'Pilier de la coloc', emoji: '🏛️', desc: 'Te connecter 30 jours (cumulés).', check: (c) => prog(num(st(c).login_days), 30) },
  { key: 'prince', title: 'Le prince de la coloc', emoji: '🤴', desc: 'Être 1er dans un classement.', check: (c) => prog(firstPlaces(c, c.meId), 1) },
  { key: 'roi_coloc', title: 'Le roi de la coloc', emoji: '👑', desc: 'Être 1er dans deux classements.', check: (c) => prog(firstPlaces(c, c.meId), 2) },
  { key: 'dieu_coloc', title: 'Le dieu de la coloc', emoji: '⚡', desc: 'Être 1er dans tous les classements.', check: (c) => prog(firstPlaces(c, c.meId), BOARDS.length) },
  // — Divers —
  { key: 'noob', title: 'Le noob', emoji: '🐣', desc: 'Terminer ta première quête.', check: (c) => prog(questDone(num(st(c).quest_mask)) ? 1 : 0, 1) },
  { key: 'mathematicien', title: 'Mathématicien', emoji: '📐', desc: 'Terminer une grille de sudoku.', check: (c) => prog(num(st(c).sudoku_done), 1) },
  { key: 'inspecteur', title: 'Inspecteur', emoji: '🕵️', desc: 'Consulter le profil de tous les autres colocataires.',
    check: (c) => { const o = allOthers(c); return prog(o.filter((m) => c.viewed.has(m.id)).length, Math.max(o.length, 1)); } },
];
// Pièces versées au déblocage (les apparences viennent de config.js : OUTFITS[x].challenge)
export const REWARD_COINS = {
  propre_soi: 10, fee_logis: 100, nickel: 200, premier_envol: 10, employe_friterie: 30,
  maitre_poussin: 100, mentaliste: 50,
};
export const rewardOf = (key) => ({
  coins: REWARD_COINS[key] ?? 0,
  skin: Object.entries(OUTFITS).find(([, o]) => o.challenge === key)?.[0] ?? null,
});
export const challengeByKey = Object.fromEntries(CHALLENGES.map((x) => [x.key, x]));
export const titleOf = (key) => challengeByKey[key]?.title ?? null;

/* ---------- Classement hebdomadaire (trophées gagnés dans la semaine) ---------- */
// rows = [{member_id, week:'AAAA-MM-JJ' (lundi), trophies}]
export function weekRanking(members, rows, week) {
  const by = Object.fromEntries(rows.filter((r) => r.week === week).map((r) => [r.member_id, r.trophies]));
  const list = members.map((m) => ({ id: m.id, name: m.name, value: by[m.id] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  let rank = 0, prev;
  list.forEach((r, i) => { if (r.value !== prev) rank = i + 1; r.rank = r.value > 0 ? rank : null; prev = r.value; });
  return list;
}
// Gagnants des semaines passées (ex æquo : tous gagnent). Renvoie [{week, winners:[id], value}] du plus récent au plus ancien
export function weekWinners(members, rows, currentWeek) {
  const weeks = [...new Set(rows.map((r) => r.week))].filter((w) => w < currentWeek).sort().reverse();
  return weeks.map((w) => {
    const list = weekRanking(members, rows, w);
    return list[0]?.value > 0 ? { week: w, winners: list.filter((r) => r.rank === 1).map((r) => r.id), value: list[0].value } : null;
  }).filter(Boolean);
}
