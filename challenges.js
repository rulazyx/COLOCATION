// Défis (titres à débloquer) et classements. Fonctions pures : elles ne touchent ni au DOM ni à la base.
// ⚠️ Les clés (key), les trophées et les apparences de récompense doivent rester identiques à la table
//    "challenges" de supabase/migration-v4.sql (c'est la base qui verse la récompense).
import { OUTFITS, levelOf, CHIP_GOALS, intelOf, SHOP } from './config.js';

// ctx = { meId, members, stats:{id→ligne}, scores:{id→{coins=savons,done_count}}, balances:{id→trophées}, wins:{id→n},
//         duels:[…], owned:Set, viewed:Set, xp:{id→xp}, chips, earned (colocoins gagnés au cumul) }
const st = (c) => c.stats[c.meId] ?? {};
const chores = (c) => c.scores[c.meId]?.done_count ?? 0;
const num = (v) => Number(v) || 0;
// Badges (bois → platine). th = seuils bronze, argent, or, platine ; low = plus petit = mieux (sudoku)
export const TIER_NAMES = ['Bois', 'Bronze', 'Argent', 'Or', 'Platine'];
export const BADGES = {
  level:    { th: [10, 25, 50, 100] },
  coins:    { th: [10, 25, 50, 100] },
  chores:   { th: [10, 40, 120, 300] },   // savons
  chifoumi: { th: [3, 15, 40, 100] },
  flappy:   { th: [10, 40, 100, 300] },
  dollars:   { th: [100, 500, 1000, 10000] },
  blackjack: { th: [5, 25, 75, 200] },
};
// Renvoie 0..4 (bois..platine), ou null s'il n'y a encore aucun résultat
export function tierOf(key, v) {
  const b = BADGES[key];
  if (v == null || (!b.low && !(v > 0) && key !== 'level')) return null;
  return b.th.filter((t) => (b.low ? v <= t : v >= t)).length;
}
export const questDone = (mask) => (mask & 63) === 63; // introduction terminée

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

// Duels de chifoumi perdus (parties terminées, sans égalité)
export function duelLosses(duels, meId) {
  return duels.filter((d) => d.status === 'done' && d.winner_id && d.winner_id !== meId
    && (d.challenger_id === meId || d.opponent_id === meId)).length;
}

/* ---------- Classements ---------- */
export const BOARDS = [
  { key: 'level',    emoji: '⭐', label: 'Niveau',            unit: '',    low: false },
  { key: 'dollars',  emoji: '🪙', label: 'Colocoins',         unit: ' 🪙', low: false },
  { key: 'chores',   emoji: '🧼', label: 'Savons',            unit: ' 🧼', low: false },
  { key: 'chifoumi', emoji: '✊', label: 'Victoires chifoumi', unit: '',    low: false },
  { key: 'flappy',   emoji: '🐦', label: 'Jumpy Cardinal',    unit: '',    low: false },
  { key: 'sudoku',   emoji: '🔢', label: 'Sudoku (meilleur temps)', unit: '', low: true },
  { key: 'sudokulvl', emoji: '🧠', label: 'Niveau Sudoku', unit: '', low: false },
  { key: 'blackjack', emoji: '🃏', label: 'Victoires Blackjack', unit: '', low: false },
  { key: 'ferme',    emoji: '🌾', label: 'Récoltes (Colo-Ferme)', unit: '', low: false },
];
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const fmtValue = (board, v) => (v == null ? '—' : board.key === 'sudoku' ? fmtTime(v) : board.key === 'level' || board.key === 'sudokulvl' ? `Niv. ${Math.floor(v / 100000)}` : `${v}${board.unit}`);

export function boardValue(c, key, id) {
  const s = c.stats[id] ?? {};
  switch (key) {
    case 'level': return c.xp?.[id] != null ? levelOf(c.xp[id]) * 100000 + c.xp[id] % 100000 : 0; // niveau d'abord, puis XP
    case 'dollars': return num(c.chipsMap?.[id]);
    case 'chores': return c.scores[id]?.coins ?? 0;
    case 'blackjack': return num(s.blackjack_wins);
    case 'chifoumi': return c.wins[id] ?? 0;
    case 'flappy': return num(s.flappy_best);
    case 'ferme': return num(s.farm_harvests);
    case 'sudoku': return s.sudoku_best ?? null;
    case 'sudokulvl': { const { lvl, n } = intelOf(s); return lvl * 100000 + n.e + n.m + n.h; }   // niveau d'abord, puis grilles réussies
    default: return null;
  }
}

// Liste triée : [{id, value, rank}]. Les ex æquo partagent le même rang. Sans score (null ou 0) : en bas, sans rang.
export function ranking(c, board) {
  const rows = c.members.map((m) => ({ id: m.id, name: m.name, value: boardValue(c, board.key, m.id) }));
  const has = (r) => r.value != null && (board.low || r.value > 0);
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
// Semaines (lundis, du plus ancien au plus récent) terminées à la 1re place du classement des trophées
const weekWins = (c) => weekWinners(c.members, c.weekly ?? [], c.currentWeek)
  .filter((w) => w.winners.includes(c.meId)).map((w) => w.week).sort();
// Plus longue série de semaines consécutives
function longestRun(weeks) {
  let best = 0, cur = 0, prev = null;
  for (const w of weeks) {
    const gap = prev ? Math.round((Date.parse(w) - Date.parse(prev)) / (7 * 86400000)) : 0;
    cur = prev && gap === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = w;
  }
  return best;
}
const prog = (value, goal) => ({ value: Math.min(value, goal), goal, done: value >= goal });
const allOthers = (c) => c.members.filter((m) => m.id !== c.meId);
const skinsToCollect = Object.keys(OUTFITS).filter((k) => k !== 'none');
const skinsOwned = (c) => skinsToCollect.filter((k) => c.owned.has(k)).length;
const birdsOwned = (c) => SHOP.bird.filter((b) => c.owned.has(`bird:${b.key}`)).length;
const sudokuLvl = (c) => intelOf(st(c)).lvl;

export const CHALLENGES = [
  // — Ménage —
  { key: 'propre_soi', cat: 'Ménage', xp: 100, title: 'Le Propre sur soi', emoji: '🧼', desc: 'Faire 1 tâche de ménage (validée par un coloc).', check: (c) => prog(chores(c), 1) },
  { key: 'fee_logis', cat: 'Ménage', xp: 400, title: 'Fée du Logis', emoji: '🧚', desc: 'Faire 10 tâches de ménage.', check: (c) => prog(chores(c), 10) },
  { key: 'nickel', cat: 'Ménage', xp: 800, title: 'Monsieur Nickel', emoji: '🧽', desc: 'Faire 20 tâches de ménage.', check: (c) => prog(chores(c), 20) },
  // — Jumpy Cardinal (score atteint en UNE partie) —
  { key: 'premier_envol', cat: 'Jumpy Cardinal', xp: 100, title: 'Premier Envol', emoji: '🐣', desc: 'Passer 5 obstacles en une partie à Jumpy Cardinal.', check: (c) => prog(num(st(c).flappy_best), 5) },
  { key: 'employe_friterie', cat: 'Jumpy Cardinal', xp: 300, title: 'Employé de la friterie', emoji: '🍗', desc: 'Passer 50 obstacles en une partie à Jumpy Cardinal.', check: (c) => prog(num(st(c).flappy_best), 50) },
  { key: 'sauteur_pro', cat: 'Jumpy Cardinal', xp: 1200, title: 'Sauteur professionnel', emoji: '🦖', desc: 'Passer 500 obstacles en une partie à Jumpy Cardinal.', check: (c) => prog(num(st(c).flappy_best), 500) },
  { key: 'maitre_poussin', cat: 'Jumpy Cardinal', xp: 800, title: 'Maître cardinal', emoji: '🐦', desc: 'Passer 100 obstacles en une partie à Jumpy Cardinal (récompense : le skin Cardinal).', check: (c) => prog(num(st(c).flappy_best), 100) },
  { key: 'legende_airs', cat: 'Jumpy Cardinal', xp: 2000, title: 'Légende des Airs', emoji: '🦅', desc: 'Passer 1000 obstacles en une partie à Jumpy Cardinal.', check: (c) => prog(num(st(c).flappy_best), 1000) },
  // — Colo-Ferme —
  { key: 'premiere_recolte', cat: 'Colo-Ferme', xp: 100, title: 'Première récolte', emoji: '🌱', desc: 'Récolter une première culture à la Colo-Ferme.', check: (c) => prog(num(st(c).farm_harvests), 1) },
  { key: 'jardinier', cat: 'Colo-Ferme', xp: 400, title: 'Jardinier', emoji: '🧑‍🌾', desc: 'Faire 25 récoltes.', check: (c) => prog(num(st(c).farm_harvests), 25) },
  { key: 'maraicher', cat: 'Colo-Ferme', xp: 1000, title: 'Maraîcher', emoji: '🚜', desc: 'Faire 100 récoltes.', check: (c) => prog(num(st(c).farm_harvests), 100) },
  { key: 'bon_voisin', cat: 'Colo-Ferme', xp: 300, title: 'Bon voisin', emoji: '💧', desc: 'Arroser 20 fois les parcelles des autres colocs.', check: (c) => prog(num(st(c).farm_waters), 20) },
  { key: 'ferme_1000', cat: 'Colo-Ferme', xp: 600, title: 'Gros rendement', emoji: '💰', desc: 'Gagner 1 000 colocoins en vendant ta récolte à la grange.', check: (c) => prog(num(st(c).farm_coins), 1000) },
  { key: 'premier_bati', cat: 'Colo-Ferme', xp: 200, title: 'Premier chantier', emoji: '🔨', desc: 'Construire un premier bâtiment.', check: (c) => prog(num(st(c).farm_builds), 1) },
  { key: 'bati_10', cat: 'Colo-Ferme', xp: 700, title: 'Grand bâtisseur', emoji: '🏗️', desc: 'Construire les 5 bâtiments de ton domaine.', check: (c) => prog(num(st(c).farm_builds), 5) },
  { key: 'grand_domaine', cat: 'Colo-Ferme', xp: 500, title: 'Grand domaine', emoji: '🏡', desc: 'Débloquer les 6 parcelles.', check: (c) => prog(num(st(c).farm_slots), 6) },
  // — Chifoumi —
  { key: 'roc', cat: 'Chifoumi', xp: 100, title: 'Solide comme un roc', emoji: '🪨', desc: 'Gagner un chifoumi en jouant pierre.', check: (c) => prog(duelRuns(c.duels, c.meId).rock ? 1 : 0, 1) },
  { key: 'tailladeur', cat: 'Chifoumi', xp: 200, title: 'Le tailladeur', emoji: '✂️', desc: 'Gagner 3 duels de chifoumi d\'affilée.', check: (c) => prog(duelRuns(c.duels, c.meId).best, 3) },
  { key: 'mentaliste', cat: 'Chifoumi', xp: 600, title: 'Le mentaliste', emoji: '🔮', desc: 'Gagner 10 duels de chifoumi d\'affilée.', check: (c) => prog(duelRuns(c.duels, c.meId).best, 10) },
  { key: 'clochard', cat: 'Chifoumi', xp: 100, title: 'Le clochard', emoji: '🥫', desc: 'Perdre 5 duels de chifoumi.', check: (c) => prog(duelLosses(c.duels, c.meId), 5) },
  // — Personnages —
  { key: 'maitre_rh', cat: 'Personnages', xp: 1000, title: 'Maître RH', emoji: '👔', desc: 'Débloquer tous les personnages.',
    check: (c) => prog(skinsToCollect.filter((k) => c.owned.has(k)).length, skinsToCollect.length) },
  // — Coloc —
  { key: 'pilier', cat: 'Coloc', xp: 800, title: 'Pilier de la coloc', emoji: '🏛️', desc: 'Te connecter 30 jours (cumulés).', check: (c) => prog(num(st(c).login_days), 30) },
  // — Colocoins (blackjack, récompense du jour) —
  { key: 'dollars_500', cat: 'Colocoins', xp: 300, title: 'Petit joueur', emoji: '🪙', desc: 'Atteindre 500 colocoins.', check: (c) => prog(num(c.chips), CHIP_GOALS[0]) },
  { key: 'dollars_1000', cat: 'Colocoins', xp: 800, title: 'Gros joueur', emoji: '🎰', desc: 'Atteindre 1 000 colocoins.', check: (c) => prog(num(c.chips), CHIP_GOALS[1]) },
  { key: 'dollars_10000', cat: 'Colocoins', xp: 3000, title: 'Roi du casino', emoji: '💎', desc: 'Atteindre 10 000 colocoins.', check: (c) => prog(num(c.chips), CHIP_GOALS[2]) },
  // — Divers —
  { key: 'noob', cat: 'Coloc', xp: 0, title: 'Le petit nouveau', emoji: '🐣', desc: "Terminer l'introduction de l'application (récompense : le skin Zippo).", check: (c) => prog(questDone(num(st(c).quest_mask)) ? 1 : 0, 1) },
  { key: 'mathematicien', cat: 'Sudoku', xp: 200, title: 'Mathématicien', emoji: '📐', desc: 'Terminer une grille de sudoku.', check: (c) => prog(num(st(c).sudoku_done), 1) },
  { key: 'inspecteur', cat: 'Coloc', xp: 200, title: 'Inspecteur', emoji: '🕵️', desc: 'Consulter le profil de tous les autres colocataires.',
    check: (c) => { const o = allOthers(c); return prog(o.filter((m) => c.viewed.has(m.id)).length, Math.max(o.length, 1)); } },
  // — Personnages (nombre débloqués) —
  { key: 'perso_5', cat: 'Personnages', xp: 300, title: 'Collectionneur', emoji: '🧍', desc: 'Débloquer 5 personnages.', check: (c) => prog(skinsOwned(c), 5) },
  { key: 'perso_10', cat: 'Personnages', xp: 700, title: 'Garde-robe pleine', emoji: '👗', desc: 'Débloquer 10 personnages.', check: (c) => prog(skinsOwned(c), 10) },
  { key: 'perso_15', cat: 'Personnages', xp: 1200, title: 'Styliste', emoji: '🕴️', desc: 'Débloquer 15 personnages.', check: (c) => prog(skinsOwned(c), 15) },
  // — Oiseaux de Jumpy Cardinal —
  { key: 'oiseaux_2', cat: 'Jumpy Cardinal', xp: 200, title: 'Ornithologue en herbe', emoji: '🐦', desc: 'Collectionner 2 oiseaux (caisse mystère).', check: (c) => prog(birdsOwned(c), 2) },
  { key: 'oiseaux_5', cat: 'Jumpy Cardinal', xp: 600, title: 'Volière', emoji: '🪺', desc: 'Collectionner 5 oiseaux.', check: (c) => prog(birdsOwned(c), 5) },
  { key: 'oiseaux_tous', cat: 'Jumpy Cardinal', xp: 1500, title: 'Gardien des oiseaux', emoji: '🦜', desc: 'Collectionner tous les oiseaux.', check: (c) => prog(birdsOwned(c), SHOP.bird.length) },
  // — Sudoku —
  { key: 'sudoku_semaine', cat: 'Sudoku', xp: 300, title: 'Défi de la semaine', emoji: '📅', desc: 'Terminer une grille de la semaine.', check: (c) => prog(st(c).sudoku_best != null ? 1 : 0, 1) },
  { key: 'sudoku_niv3', cat: 'Sudoku', xp: 300, title: 'Esprit vif', emoji: '💡', desc: 'Atteindre le niveau 3 au Sudoku.', check: (c) => prog(sudokuLvl(c), 3) },
  { key: 'sudoku_niv5', cat: 'Sudoku', xp: 600, title: 'Cerveau', emoji: '🧠', desc: 'Atteindre le niveau 5 au Sudoku.', check: (c) => prog(sudokuLvl(c), 5) },
  { key: 'sudoku_niv10', cat: 'Sudoku', xp: 1500, title: 'Génie des grilles', emoji: '🎓', desc: 'Atteindre le niveau 10 au Sudoku.', check: (c) => prog(sudokuLvl(c), 10) },
  // — Blackjack (mains gagnées) —
  { key: 'bj_10', cat: 'Blackjack', xp: 200, title: 'Croupier du dimanche', emoji: '🃏', desc: 'Gagner 10 mains au Blackjack.', check: (c) => prog(num(st(c).blackjack_wins), 10) },
  { key: 'bj_50', cat: 'Blackjack', xp: 600, title: 'As du tapis', emoji: '♠️', desc: 'Gagner 50 mains au Blackjack.', check: (c) => prog(num(st(c).blackjack_wins), 50) },
  { key: 'bj_200', cat: 'Blackjack', xp: 1500, title: 'Requin des tables', emoji: '🦈', desc: 'Gagner 200 mains au Blackjack.', check: (c) => prog(num(st(c).blackjack_wins), 200) },
  // — Colocoins gagnés au cumul (tout ce qui est entré, dépenses non déduites) —
  { key: 'cumul_100', cat: 'Colocoins', xp: 100, title: 'Tirelire', emoji: '🐷', desc: 'Gagner 100 colocoins au cumul.', check: (c) => prog(num(c.earned), 100) },
  { key: 'cumul_1000', cat: 'Colocoins', xp: 400, title: 'Coffre-fort', emoji: '🔐', desc: 'Gagner 1 000 colocoins au cumul.', check: (c) => prog(num(c.earned), 1000) },
  { key: 'cumul_10000', cat: 'Colocoins', xp: 1500, title: 'Banquier', emoji: '🏦', desc: 'Gagner 10 000 colocoins au cumul.', check: (c) => prog(num(c.earned), 10000) },
  { key: 'cumul_100000', cat: 'Colocoins', xp: 5000, title: 'Magnat', emoji: '👑', desc: 'Gagner 100 000 colocoins au cumul.', check: (c) => prog(num(c.earned), 100000) },
];
// Récompense d'un défi : de l'XP (plus aucun trophée) et parfois une apparence (OUTFITS[x].challenge)
export const rewardOf = (key) => ({
  xp: CHALLENGES.find((x) => x.key === key)?.xp ?? 0,
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
