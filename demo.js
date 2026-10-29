// Mode démo : même interface que le cloud, avec localStorage (chargé seulement si aucune clé Supabase n'est configurée)
import { SKIN_COLORS, HAIR_COLORS, MOVES, WHEEL_MIN, WHEEL_MAX, XP_RULES as X, MILESTONES, TASK_KINDS, GOOSE, BJ_BETS, BIRD_CRATE, MESSAGE_MAX, DICE, PERKS, perkOfWeek, DAILY, SHOP, SOAP_EXCHANGE, LEVEL_BONUS, levelOf, FARM } from './config.js';
import { rewardOf } from './challenges.js';
import { store, iso } from './util.js';
const reunionDay = () => new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);   // jour à La Réunion (UTC+4), comme la base

// Qui gagne ? renvoie 'c' (challenger), 'o' (opponent) ou null (égalité)
const weekStart = (dt) => { const x = new Date(dt); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const duelWinner = (cm, om) => (cm === om ? null : MOVES[cm]?.beats === om ? 'c' : 'o');
// XP offerte en franchissant des paliers (mêmes règles que migration-v7.sql)
function milestoneXp(game, oldV, newV) {
  const m = MILESTONES[game]; if (!m) return 0;
  let t = 0;
  m.at.forEach((at, i) => {
    const hit = m.low ? newV <= at && (oldV == null || oldV > at) : newV >= at && (oldV ?? 0) < at;
    if (hit) t += m.xp[i];
  });
  return t;
}

export function makeDemoApi() {
  const KEY = 'coloc-demo-v3';
  const base = ['Anthony', 'Mathilde', 'Lily', 'Victor', 'Zak', 'Etienne'].map((name, i) => ({ id: i + 1, name, kind: name === 'Etienne' ? 'copain' : 'coloc' }));
  const PRODUCTS = ['Papier toilette', 'Sopalin', 'Produit toilettes', 'Cumin', 'Curcuma', 'Paprika', 'Poivre', 'Sel',
    'Liquide vaisselle', 'Désinfectant spray', 'Vinaigre blanc', "Huile d'olive", 'Huile de tournesol'];
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  if (!db) db = { products: PRODUCTS.map((name, i) => ({ id: i + 1, name, out_of_stock: false, updated_by: null })) };
  db.profiles ??= {}; db.purchases ??= []; db.duels ??= []; db.nextDuel ??= 1; db.logs ??= []; db.nextLog ??= 1; db.pins ??= {};
  db.ledger ??= []; db.stats ??= {}; db.unlocks ??= []; db.views ??= []; db.xp ??= []; db.dice ??= []; db.nextDice ??= 1; db.msgs ??= []; db.nextMsg ??= 1; db.perks ??= []; db.nextPerk ??= 1; db.pconf ??= []; db.chips ??= []; db.pweeks ??= []; db.farm ??= []; db.farmSt ??= {}; db.fstock ??= {}; db.fbuilds ??= [];
  const save = () => store.set(KEY, JSON.stringify(db));
  const now = () => new Date().toISOString();
  const HOUR_MS = 3600000;
  const hasItem = (m, key) => db.fbuilds.some((b) => b.member_id === m && b.item === key);

  // Mêmes règles de calcul que la base de données (voir migration-v7.sql)
  const addChips0 = (id, amount, reason) => { if (amount) db.chips.push({ member_id: id, amount, reason, at: now() }); };
  const addXp = (id, amount, reason) => {
    if (!amount) return;
    db.xp.push({ member_id: id, amount, reason, at: now() });
    const lvl = levelOf(db.xp.filter((x) => x.member_id === id).reduce((a, x) => a + x.amount, 0));
    for (let n = LEVEL_BONUS.every; n <= lvl; n += LEVEL_BONUS.every) {
      if (!db.chips.some((c) => c.member_id === id && c.reason === `level:${n}`)) addChips0(id, LEVEL_BONUS.chips, `level:${n}`);
    }
  };
  const addTrophies = (id, amount, reason) => { if (amount) db.ledger.push({ member_id: id, amount, reason, at: now() }); };
  const todaySum = (id, reason) => db.ledger.filter((l) => l.member_id === id && l.reason === reason && l.at.slice(0, 10) === now().slice(0, 10)).reduce((a, l) => a + l.amount, 0);
  const addChips = (id, amount, reason) => { if (amount) db.chips.push({ member_id: id, amount, reason, at: now() }); };
  const chipsOf = (id) => db.chips.filter((l) => l.member_id === id).reduce((a, l) => a + l.amount, 0);
  const balance = (id) => db.ledger.filter((l) => l.member_id === id).reduce((a, l) => a + l.amount, 0);
  const emptyStats = () => ({ flappy_best: 0, flappy_total: 0, raid_best: 0, farm_harvests: 0, farm_coins: 0, farm_waters: 0, farm_builds: 0, farm_slots: FARM.baseSlots, sudoku_best: null, sudoku_done: 0, sudoku_easy: 0, sudoku_mid: 0, sudoku_hard: 0, blackjack_played: 0, blackjack_wins: 0,
    login_days: 0, streak: 0, last_login: null, wheel_ready: false, quest_mask: 0 });
  const statsOf = (id) => (db.stats[id] ??= emptyStats());
  const dayShift = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const fail = (msg) => { throw new Error(msg); };
  const publicDuel = ({ _move, ...d }) => ({ ...d });
  const isColoc = (id) => base.find((m) => m.id === id)?.kind === 'coloc';

  return {
    mode: 'demo',
    async members() {
      return base.map((m) => ({ gender: 'homme', skin: SKIN_COLORS[2].c, hair: HAIR_COLORS[1].c, outfit: 'none', bg: '#e6ebf1', title: null, ...m, ...(db.profiles[m.id] ?? {}), has_pin: !!db.pins[m.id] }));
    },
    async updateProfile(id, patch) { db.profiles[id] = { ...(db.profiles[id] ?? {}), ...patch }; save(); },
    async setPin(id, pin) {
      if (!/^\d{4}$/.test(pin)) fail('Le code doit avoir 4 chiffres.');
      if (db.pins[id]) fail('Un code existe déjà pour ce joueur.');
      db.pins[id] = pin; save(); return true;
    },
    async checkPin(id, pin) { return { ok: db.pins[id] === pin, locked_s: 0 }; },
    async scores() {
      const m = {};
      for (const l of db.logs) {
        if (l.status !== 'validated') continue;
        m[l.doer_id] ??= { member_id: l.doer_id, coins: 0, done_count: 0 };
        m[l.doer_id].coins += l.soap; m[l.doer_id].done_count++;
      }
      return Object.values(m);
    },
    async balances() { return base.map((m) => ({ member_id: m.id, coins: balance(m.id) })); },
    // --- Tâches : on choisit une tâche, un autre coloc confirme ---
    async taskLogs() { return [...db.logs].sort((a, b) => b.id - a.id).map((l) => ({ ...l })); },
    async submitTask(member, kind) {
      const K = TASK_KINDS[kind];
      if (!K) fail('Tâche inconnue.');
      if (!isColoc(member)) fail('Seuls les colocataires font les tâches.');
      if (db.logs.some((l) => l.kind === kind && l.status === 'pending')) fail('Cette tâche est déjà en attente de confirmation.');
      const last = db.logs.filter((l) => l.kind === kind && l.status === 'validated').sort((a, b) => b.id - a.id)[0];
      if (last && Date.now() - Date.parse(last.answered_at) < K.cooldownH * 3600000) fail('Cette tâche vient déjà d\'être faite.');
      const l = { id: db.nextLog++, kind, doer_id: member, status: 'pending', soap: K.soap, validator_id: null, created_at: now(), answered_at: null };
      db.logs.push(l); save(); return l.id;
    },
    async answerTask(logId, member, ok) {
      const l = db.logs.find((x) => x.id === logId);
      if (!l || l.status !== 'pending') fail("Cette tâche n'est plus en attente.");
      if (member === l.doer_id) {
        if (ok) fail('Il faut qu\'un autre coloc confirme ta tâche.');
        l.status = 'cancelled'; l.answered_at = now(); save(); return { ...l };
      }
      if (!isColoc(member)) fail('Seuls les colocataires peuvent confirmer.');
      l.validator_id = member; l.answered_at = now();
      if (ok) {
        l.status = 'validated'; addXp(l.doer_id, l.soap * X.taskPerSoap, 'task'); addXp(member, X.validate, 'validate');
        db.farm.filter((p) => p.member_id === l.doer_id && Date.parse(p.ready_at) > Date.now()).forEach((p) => { p.ready_at = new Date(Date.now() + (Date.parse(p.ready_at) - Date.now()) * (1 - FARM.taskBoost)).toISOString(); });
      }
      else l.status = 'rejected';
      save(); return { ...l };
    },
    async products() { return db.products.map((p) => ({ ...p })); },
    async setProduct(id, out, memberId) {
      const p = db.products.find((x) => x.id === id);
      p.out_of_stock = out; p.updated_by = memberId;
      const day = Date.now() - 86400000;
      if (out && !db.xp.some((x) => x.member_id === memberId && x.reason === `stock:${id}` && Date.parse(x.at) > day)) addXp(memberId, X.stock, `stock:${id}`);
      save();
      if (out && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((r) => r.showNotification('🛒 Rupture de stock', { body: `${p.name} est en rupture`, icon: './icon-192.png' }));
      }
    },
    async purchases() { return db.purchases.map((p) => ({ ...p })); },
    async duels() { return [...db.duels].sort((a, b) => b.id - a.id).map(publicDuel); },
    async createDuel(challenger, opponent, wager, move) {
      if (!MOVES[move]) fail('Coup invalide.');
      if (challenger === opponent) fail('Tu ne peux pas te défier toi-même.');
      if (chipsOf(challenger) < X.duelStake) fail(`Il te faut au moins ${X.duelStake} colocoins pour défier.`);
      if (db.duels.some((x) => x.status === 'pending' && ((x.challenger_id === challenger && x.opponent_id === opponent) || (x.challenger_id === opponent && x.opponent_id === challenger)))) fail('Un défi est déjà en attente avec ce joueur.');
      const d = { id: db.nextDuel++, challenger_id: challenger, opponent_id: opponent, wager: X.duelStake, status: 'pending',
        challenger_move: null, opponent_move: null, winner_id: null, created_at: now(), played_at: null, _move: move };
      db.duels.push(d); save(); return d.id;
    },
    async playDuel(duelId, player, move) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!MOVES[move]) fail('Coup invalide.');
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.opponent_id !== player) fail("Ce défi ne t'est pas adressé.");
      if (chipsOf(player) < d.wager) fail(`Il te faut au moins ${d.wager} colocoins pour relever ce défi.`);
      const w = duelWinner(d._move, move);
      Object.assign(d, { status: 'done', challenger_move: d._move, opponent_move: move, played_at: now(),
        winner_id: w === 'c' ? d.challenger_id : w === 'o' ? d.opponent_id : null });
      delete d._move;
      addXp(d.challenger_id, X.duelPlay, 'duel'); addXp(d.opponent_id, X.duelPlay, 'duel');
      if (d.winner_id) {
        const loser = d.winner_id === d.challenger_id ? d.opponent_id : d.challenger_id;
        addXp(d.winner_id, X.duelWin, 'duel-win');
        addTrophies(d.winner_id, Math.max(0, Math.min(X.duelWinTrophies, X.duelTrophyCapPerDay - todaySum(d.winner_id, 'duel-win'))), 'duel-win');
        const stake = Math.min(d.wager, Math.max(chipsOf(loser), 0));
        addChips(loser, -stake, 'duel-loss'); addChips(d.winner_id, stake, 'duel-win');
      }
      save();
      return publicDuel(d);
    },
    async cancelDuel(duelId, player) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.challenger_id !== player && d.opponent_id !== player) fail("Ce défi ne te concerne pas.");
      d.status = 'cancelled'; delete d._move; save();
    },
    async stats() { return base.map((m) => ({ member_id: m.id, ...statsOf(m.id) })); },
    async duelStats() {
      return base.map((m) => {
        const done = db.duels.filter((d) => d.status === 'done' && (d.challenger_id === m.id || d.opponent_id === m.id));
        return { member_id: m.id, wins: done.filter((d) => d.winner_id === m.id).length, played: done.length };
      });
    },
    async unlocks() { return db.unlocks.map((u) => ({ ...u })); },
    async views() { return db.views.map((v) => ({ ...v })); },
    async viewProfile(viewer, viewed) {
      if (!db.views.some((v) => v.viewer_id === viewer && v.viewed_id === viewed)) { db.views.push({ viewer_id: viewer, viewed_id: viewed }); save(); }
    },
    async questStep(id, step) {
      if (!(step >= 1 && step <= 6)) fail('Étape inconnue.');
      const s = statsOf(id), old = s.quest_mask; s.quest_mask = (s.quest_mask | (1 << (step - 1))) & 63;
      if (s.quest_mask === 63 && old !== 63 && !db.xp.some((x) => x.member_id === id && x.reason === 'intro')) addXp(id, X.introXp, 'intro');
      save(); return s.quest_mask;
    },
    async expenses() { return (db.exp ?? []).slice().sort((x, y) => y.spent_on.localeCompare(x.spent_on) || y.id - x.id).map((e) => ({ ...e })); },
    async expenseShares() { return (db.expsh ?? []).map((s) => ({ ...s })); },
    ...(() => {
      const chk = (m, payer, parts, title, cents) => {
        if (!isColoc(m)) fail('Le budget est réservé aux colocs.');
        if (!isColoc(payer)) fail('Payeur invalide.');
        if (!parts?.length) fail('Choisis au moins une personne concernée.');
        if (!parts.every(isColoc)) fail('Participants invalides.');
        if (title !== null) { const t = String(title ?? '').trim(); if (!t) fail('Donne un nom à la dépense.'); if (t.length > 60) fail('Nom trop long (60 caractères maximum).'); }
        if (!Number.isInteger(cents) || cents < 1 || cents > 10000000) fail('Montant invalide.');
      };
      const put = (id, parts) => { db.expsh = (db.expsh ?? []).filter((s) => s.expense_id !== id).concat([...new Set(parts)].map((member_id) => ({ expense_id: id, member_id }))); };
      return {
        async addExpense(m, title, cents, payer, day, parts) {
          chk(m, payer, parts, title, cents); db.exp ??= []; db.nextExp ??= 1; const id = db.nextExp++;
          db.exp.push({ id, creator_id: m, payer_id: payer, title: String(title).trim(), amount_cents: cents, spent_on: day || iso(new Date()), kind: 'expense', created_at: now() }); put(id, parts); save(); return id;
        },
        async updateExpense(m, id, title, cents, payer, day, parts) {
          chk(m, payer, parts, title, cents); const e = (db.exp ?? []).find((x) => x.id === id && x.kind === 'expense'); if (!e) fail('Dépense introuvable.');
          Object.assign(e, { title: String(title).trim(), amount_cents: cents, payer_id: payer, spent_on: day || e.spent_on }); put(id, parts); save();
        },
        async deleteExpense(m, id) { if (!isColoc(m)) fail('Le budget est réservé aux colocs.'); db.exp = (db.exp ?? []).filter((x) => x.id !== id); db.expsh = (db.expsh ?? []).filter((s) => s.expense_id !== id); save(); },
        async addTransfer(m, from, to, cents) {
          chk(m, from, [to], null, cents); if (from === to) fail('Choisis deux personnes différentes.'); db.exp ??= []; db.nextExp ??= 1; const id = db.nextExp++;
          db.exp.push({ id, creator_id: m, payer_id: from, title: 'Remboursement', amount_cents: cents, spent_on: iso(new Date()), kind: 'transfer', created_at: now() }); put(id, [to]); save(); return id;
        },
      };
    })(),
    async shopRequests() { return (db.shopreq ?? []).slice().sort((a, b) => b.id - a.id).map((r) => ({ ...r })); },
    async addShopRequest(m, item) {
      const t = String(item ?? '').trim(); if (t.length < 2) fail('Écris ce qu\'il faut acheter.'); if (t.length > 80) fail('Trop long (80 caractères maximum).');
      db.shopreq ??= []; db.nextShop ??= 1;
      if (db.shopreq.filter((r) => r.requester_id === m && ['open', 'bought'].includes(r.status)).length >= 5) fail('Déjà 5 demandes en cours.');
      db.shopreq.push({ id: db.nextShop++, requester_id: m, item: t, reward: 2, status: 'open', buyer_id: null, created_at: now(), bought_at: null }); save(); return db.nextShop - 1;
    },
    async shopRequestBought(m, id) {
      const r = (db.shopreq ?? []).find((x) => x.id === id); if (!r || r.status !== 'open') fail('Cette demande n\'est plus disponible.');
      if (r.requester_id === m) fail('Tu ne peux pas acheter ta propre demande.');
      r.status = 'bought'; r.buyer_id = m; r.bought_at = now(); save();
    },
    async answerShopRequest(m, id, ok) {
      const r = (db.shopreq ?? []).find((x) => x.id === id); if (!r || r.status !== 'bought' || r.requester_id !== m) fail('Rien à confirmer.');
      if (ok) { r.status = 'done'; db.logs.push({ id: db.nextLog++, kind: 'courses', doer_id: r.buyer_id, status: 'validated', soap: r.reward, validator_id: m, created_at: now(), answered_at: now() }); }
      else { r.status = 'open'; r.buyer_id = null; r.bought_at = null; }
      save();
    },
    async cancelShopRequest(m, id) {
      const r = (db.shopreq ?? []).find((x) => x.id === id); if (!r || r.requester_id !== m || r.status === 'done') fail('Impossible d\'annuler.');
      r.status = 'cancelled'; save();
    },
    async runRecurring() {
      db.recur ??= [{ id: 1, title: 'Internet', amount_cents: 2999, payer_id: 5, start_on: '2026-11-01' }]; db.recruns ??= []; db.exp ??= []; db.nextExp ??= 1;
      const today = reunionDay(); let n = 0;
      for (const r of db.recur) {
        let [y, mo] = r.start_on.split('-').map(Number);
        for (;;) {
          const m = `${y}-${String(mo).padStart(2, '0')}-01`; if (m > today) break;
          if (!db.recruns.some((x) => x.rec_id === r.id && x.month === m)) {
            db.recruns.push({ rec_id: r.id, month: m }); const id = db.nextExp++;
            db.exp.push({ id, creator_id: r.payer_id, payer_id: r.payer_id, title: r.title, amount_cents: r.amount_cents, spent_on: m, kind: 'expense', recurring_id: r.id, created_at: now() });
            db.expsh = (db.expsh ?? []).concat(base.filter((b) => b.kind === 'coloc').map((b) => ({ expense_id: id, member_id: b.id }))); n++;
          }
          if (++mo > 12) { mo = 1; y++; }
        }
      }
      if (n) save(); return n;
    },
    async popups(id) { db.popups ??= []; return db.popups.filter((p) => p.to_id === id && !p.seen_at).map((p) => ({ ...p })); },
    async popupSeen(id, popup) { const p = (db.popups ?? []).find((x) => x.id === popup && x.to_id === id); if (p) { p.seen_at = now(); save(); } },
    async launchGame(id) {
      if (db.xp.some((x) => x.member_id === id && x.reason === 'first_game')) return 0;
      addXp(id, X.firstGameXp, 'first_game'); save(); return X.firstGameXp;
    },
    async claimDaily(id, day) {
      const s = statsOf(id);
      if (s.last_login === day) fail("Récompense déjà récupérée aujourd'hui.");
      const streak = s.last_login === dayShift(day, -1) && s.streak < 7 ? s.streak + 1 : 1;
      Object.assign(s, { streak, last_login: day, login_days: s.login_days + 1 });
      addXp(id, DAILY.xp, 'daily'); addChips(id, DAILY.chips, 'daily');
      save();
      return { streak, xp: DAILY.xp, chips: DAILY.chips, wheel: false };
    },
    async spinWheel(id) {
      const s = statsOf(id);
      if (!s.wheel_ready) fail("La roue n'est pas débloquée.");
      const amount = WHEEL_MIN + Math.floor(Math.random() * (WHEEL_MAX - WHEEL_MIN + 1));
      s.wheel_ready = false; addXp(id, amount, 'wheel'); save();
      return amount;
    },
    async reportGame(id, game, score) {
      const s = statsOf(id);
      if (!(score >= 0)) fail('Score invalide.');
      if (game === 'flappy') {
        const v = Math.min(score, 5000);
        addXp(id, Math.min(score * X.flappyPerObstacle, X.gameCap) + milestoneXp('flappy', s.flappy_best, v), 'game:flappy');
        s.flappy_best = Math.max(s.flappy_best, v);
      } else if (game === 'raid') {
        const v = Math.min(score, 1000000);
        addXp(id, Math.min(Math.floor(score / 50) * X.raidPer50m, X.gameCap) + milestoneXp('raid', s.raid_best, v), 'game:raid');
        s.raid_best = Math.max(s.raid_best, v);
      } else if (game === 'sudoku') {
        if (score < 20) fail('Temps invalide.');
        addXp(id, X.sudoku + milestoneXp('sudoku', s.sudoku_best, score), 'game:sudoku');
        s.sudoku_done++; s.sudoku_best = Math.min(s.sudoku_best ?? score, score);
      } else fail('Jeu inconnu.');
      const want = game === 'flappy' ? Math.min(Math.floor(Math.min(score, 5000) / 10), 3) : 0, cap = 15;
      if (want && isColoc(id)) {
        const today = db.chips.filter((c) => c.member_id === id && c.reason === `jeu:${game}` && String(c.at).slice(0, 10) === now().slice(0, 10)).reduce((t, c) => t + c.amount, 0);
        addChips(id, Math.max(0, Math.min(want, cap - today)), `jeu:${game}`);
      }
      save(); return { member_id: id, ...s };
    },
    async sudokuWeek(week) { return (db.sudokuw ?? []).filter((r) => r.week === week).sort((a, b) => a.seconds - b.seconds).map((r) => ({ member_id: r.member_id, seconds: r.seconds })); },
    async reportSudoku(id, mode, seconds) {
      if (!['week', 'easy', 'mid', 'hard'].includes(mode)) fail('Mode inconnu.');
      if (!(seconds >= 20)) fail('Temps invalide.');
      db.sudokuw ??= []; const s = statsOf(id); let xp = 0, coins = 0, record = false;
      if (mode === 'week') {
        const week = (() => { const t = new Date(); return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7))); })(), cur = db.sudokuw.find((r) => r.member_id === id && r.week === week);
        if (!cur) { xp = X.sudoku + milestoneXp('sudoku', s.sudoku_best, seconds); record = true; db.sudokuw.push({ member_id: id, week, seconds }); }
        else if (seconds < cur.seconds) { record = true; cur.seconds = seconds; }
        s.sudoku_done++; s.sudoku_best = Math.min(s.sudoku_best ?? seconds, seconds); s.sudoku_easy = (s.sudoku_easy ?? 0) + 1;
      } else {
        xp = { easy: 10, mid: 25, hard: 50 }[mode]; coins = { easy: 1, mid: 2, hard: 4 }[mode]; s.sudoku_done++; s['sudoku_' + mode] = (s['sudoku_' + mode] ?? 0) + 1;
        if (isColoc(id)) {
          const today = db.chips.filter((c) => c.member_id === id && String(c.reason).startsWith('sudoku:') && String(c.at).slice(0, 10) === now().slice(0, 10)).reduce((t, c) => t + c.amount, 0);
          coins = Math.max(0, Math.min(coins, 12 - today)); if (coins) addChips(id, coins, `sudoku:${mode}`);
        } else coins = 0;
      }
      if (xp) addXp(id, xp, 'game:sudoku'); save(); return { xp, coins, record, mode };
    },
    async reportFlappy(id, score) {
      const x0 = (db.xp.filter((r) => r.member_id === id).reduce((t, r) => t + r.amount, 0)), c0 = db.chips.filter((c) => c.member_id === id).reduce((t, c) => t + c.amount, 0);
      await this.reportGame(id, 'flappy', score);
      const x1 = db.xp.filter((r) => r.member_id === id).reduce((t, r) => t + r.amount, 0), c1 = db.chips.filter((c) => c.member_id === id).reduce((t, c) => t + c.amount, 0);
      return { xp: x1 - x0, coins: c1 - c0 };
    },
    async claimChallenge(id, key) {
      if (db.unlocks.some((u) => u.member_id === id && u.key === key)) return null;
      const r = rewardOf(key);
      db.unlocks.push({ member_id: id, key }); addXp(id, r.xp, `challenge:${key}`);
      if (r.skin && !db.purchases.some((p) => p.member_id === id && p.item === r.skin)) {
        db.purchases.push({ id: db.purchases.length + 1, member_id: id, item: r.skin, price: 0 });
      }
      save(); return { key, ...r };
    },
    async xp() { return base.map((m) => ({ member_id: m.id, xp: db.xp.filter((x) => x.member_id === m.id).reduce((a, x) => a + x.amount, 0) })); },
    async weekly() {
      const monday = (iso8) => { const d = new Date(iso8); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return iso(x); };
      const acc = {};
      for (const l of db.ledger) { const k = `${l.member_id}|${monday(l.at)}`; acc[k] = (acc[k] ?? 0) + l.amount; }
      return Object.entries(acc).map(([k, trophies]) => { const [id, week] = k.split('|'); return { member_id: Number(id), week, trophies }; });
    },
    // --- v8 : plateau, messages, blackjack (mêmes règles que migration-v8.sql) ---
    async soapSpent() { return base.map((m) => ({ member_id: m.id, spent: db.dice.filter((r) => r.member_id === m.id).reduce((a, r) => a + r.cost, 0) + (db.exch ?? []).filter((r) => r.member_id === m.id).reduce((a, r) => a + r.soap, 0) })); },
    async diceRolls() { return [...db.dice].sort((a, b) => b.id - a.id).map((r) => ({ ...r })); },
    async diceClock() { return Object.entries(db.dclk ?? {}).map(([id, t]) => ({ member_id: Number(id), t: new Date(t).toISOString() })); },
    async rollDice(member) {
      if (!isColoc(member)) fail('Seuls les colocataires jouent à la course aux pièces.');
      const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
      const week = mondayOf(Date.now());
      const H = DICE.everyH * 3600000;
      const t = Math.max((db.dclk ??= {})[member] ?? 0, Date.now() - DICE.max * H);   // horloge des dés : un dé par tranche de 3 h écoulée, 3 au plus
      if (Date.now() - t < H) fail(`Pas encore de dé : le prochain arrive dans ${Math.ceil((t + H - Date.now()) / 60000)} min.`);
      db.dclk[member] = t + H;
      const mine = db.dice.filter((r) => r.member_id === member).sort((x, y) => y.id - x.id);
      const from = mine.length ? mine[0].to_pos : 0;                       // position cumulée : les tours sont infinis
      const laps = mine.reduce((m, r) => Math.max(m, Math.floor(r.to_pos / GOOSE.size)), 0);
      const roll = 1 + Math.floor(Math.random() * 6);
      let to = from + roll;
      let xp = 0, tr = 0, ch = 0, note = '';
      for (let depth = 0; depth < 3; depth++) {
        const c = GOOSE.cells[to > 0 ? ((to - 1) % GOOSE.size) + 1 : 0]; if (!c) break;
        if (c.xp) { xp += c.xp; note += ` +${c.xp} XP`; break; }
        if (c.chips) { ch += c.chips; note += ` +${c.chips} colocoins`; break; }
        if (c.back) { to = Math.max(to - c.back, 0); note += ` piège : recule de ${c.back}`; }
        else if (c.goose) { to += roll; note += ` oie : avance encore de ${roll}`; }
      }
      let perk = null;
      if (Math.floor(to / GOOSE.size) > laps) {
        xp += GOOSE.finish.xp; tr += GOOSE.finish.trophy; note += ` TOUR TERMINÉ ! +${GOOSE.finish.xp} XP, +${GOOSE.finish.trophy} trophées`;
      }
      db.dice.push({ id: db.nextDice++, member_id: member, week, cost: 0, roll, from_pos: from, to_pos: to, note: note.trim() || null, created_at: now() });
      addXp(member, xp, 'plateau'); addTrophies(member, tr, 'plateau'); addChips(member, ch, 'plateau'); save();
      return { perk, roll, from, to, cost: 0, xp, trophies: tr, chips: ch, note: note.trim() };
    },
    async chips() { return base.map((m) => ({ member_id: m.id, chips: chipsOf(m.id), earned: db.chips.filter((l) => l.member_id === m.id && l.amount > 0).reduce((a, l) => a + l.amount, 0) })); },
    async farm() { return db.farm.map((p) => ({ ...p })); },
    async farmState() { return Object.entries(db.farmSt).map(([id, slots]) => ({ member_id: Number(id), slots })); },
    async farmDay() {
      const day = iso(new Date()), out = {};
      db.chips.filter((l) => l.reason === 'ferme:vente' && l.at.slice(0, 10) === day).forEach((l) => { out[l.member_id] = (out[l.member_id] ?? 0) + l.amount; });
      return Object.entries(out).map(([id, got]) => ({ member_id: Number(id), got }));
    },
    async farmPlant(m, slot, crop) {
      if (!isColoc(m)) fail('Seuls les colocataires ont une ferme.');
      const c = FARM.crops.find((x) => x.key === crop); if (!c) fail('Culture inconnue.');
      if (slot < 0 || slot >= (db.farmSt[m] ?? FARM.baseSlots)) fail('Parcelle verrouillée.');
      if (levelOf(db.xp.filter((x) => x.member_id === m).reduce((a, x) => a + x.amount, 0)) < c.level) fail(`Cette culture se débloque au niveau ${c.level}.`);
      const o = db.farm.find((p) => p.member_id === m && p.slot === slot);
      if (o) { if (Date.parse(o.ready_at) + FARM.witherH * HOUR_MS < Date.now()) db.farm = db.farm.filter((p) => p !== o); else fail('Cette parcelle est occupée.'); }
      db.farm.push({ member_id: m, slot, crop, planted_at: now(), ready_at: new Date(Date.now() + c.hours * HOUR_MS * (hasItem(m, 'puits') ? 1 - FARM.perks.wellCut : 1)).toISOString(), watered_by: [] }); save();
    },
    async farmHarvest(m, slot) {
      const p = db.farm.find((x) => x.member_id === m && x.slot === slot);
      if (!p) fail('Rien à récolter ici.');
      if (Date.parse(p.ready_at) > Date.now()) fail("Ce n'est pas encore mûr.");
      db.farm = db.farm.filter((x) => x !== p);
      if (Date.parse(p.ready_at) + FARM.witherH * HOUR_MS < Date.now()) { save(); return { crop: p.crop, qty: 0, withered: true }; }
      const qty = FARM.yield + (hasItem(m, 'serre') ? FARM.perks.greenhouseUnits : 0);
      const stock = (db.fstock[m] ??= {}); stock[p.crop] = (stock[p.crop] ?? 0) + qty;
      statsOf(m).farm_harvests = (statsOf(m).farm_harvests ?? 0) + 1;
      save(); return { crop: p.crop, qty, withered: false };
    },
    async farmStock() { return Object.entries(db.fstock).flatMap(([id, st]) => Object.entries(st).map(([crop, qty]) => ({ member_id: Number(id), crop, qty }))); },
    async farmBuilds() { return db.fbuilds.map((b) => ({ ...b })); },
    async farmSell(m, crop, qty) {
      const c = FARM.crops.find((x) => x.key === crop); if (!c) fail('Culture inconnue.');
      const have = db.fstock[m]?.[crop] ?? 0; if (have <= 0 || qty <= 0) fail("Tu n'as rien à vendre.");
      const unit = Math.round(c.sell * (hasItem(m, 'etal') ? 1 + FARM.perks.stallBonus : 1));
      const cap = FARM.capPerDay + (hasItem(m, 'silo') ? FARM.perks.siloCap : 0);
      const got = (await this.farmDay()).find((d) => d.member_id === m)?.got ?? 0;
      const n = Math.min(qty, have, Math.floor(Math.max(cap - got, 0) / unit));
      if (n <= 0) fail(`Plafond de vente du jour atteint (${cap} 🪙). Reviens demain !`);
      db.fstock[m][crop] -= n; addChips(m, n * unit, 'ferme:vente');
      statsOf(m).farm_coins = (statsOf(m).farm_coins ?? 0) + n * unit; save();
      return { sold: n, coins: n * unit, cap };
    },
    async farmBuild(m, spot, item) {
      if (!isColoc(m)) fail('Seuls les colocataires ont une ferme.');
      const it = FARM.items.find((x) => x.key === item); if (!it) fail('Construction inconnue.');
      if (!/^[bd]\d+$/.test(spot) || spot[0] !== it.kind || Number(spot.slice(1)) >= FARM.spots[it.kind]) fail('Mauvais emplacement.');
      if (db.fbuilds.some((b) => b.member_id === m && (b.spot === spot || b.item === item))) fail('Déjà construit.');
      const st = (db.fstock[m] ??= {});
      for (const [k, v] of Object.entries(it.cost)) if ((st[k] ?? 0) < v) fail(`Il te manque des fruits et légumes (${k}).`);
      for (const [k, v] of Object.entries(it.cost)) st[k] -= v;
      db.fbuilds.push({ member_id: m, spot, item, built_at: now() });
      if (item === 'poulailler' && !db.purchases.some((p) => p.member_id === m && p.item === 'poussin')) db.purchases.push({ id: db.purchases.length + 1, member_id: m, item: 'poussin', price: 0 });
      statsOf(m).farm_builds = (statsOf(m).farm_builds ?? 0) + 1; save();
    },
    async farmWater(w, o, slot) {
      if (!isColoc(w)) fail('Seuls les colocataires arrosent.');
      if (w === o) fail('Tu ne peux arroser que les parcelles des autres.');
      const p = db.farm.find((x) => x.member_id === o && x.slot === slot);
      if (!p) fail('Rien à arroser ici.');
      if (Date.parse(p.ready_at) <= Date.now()) fail("C'est déjà mûr.");
      if (p.watered_by.includes(w)) fail('Tu as déjà arrosé cette parcelle.');
      p.ready_at = new Date(Date.now() + (Date.parse(p.ready_at) - Date.now()) * (1 - FARM.waterCut)).toISOString(); p.watered_by.push(w);
      const sw = statsOf(w); sw.farm_waters = (sw.farm_waters ?? 0) + 1;
      const day = iso(new Date());
      let reward = 0;
      if (db.chips.filter((l) => l.member_id === w && l.reason === 'ferme:arrose' && l.at.slice(0, 10) === day).length < FARM.waterRewardMaxPerDay) { addChips(w, FARM.waterReward, 'ferme:arrose'); reward = FARM.waterReward; }
      save(); return { reward };
    },
    async farmUnlock(m) {
      const n = db.farmSt[m] ?? FARM.baseSlots;
      if (n >= FARM.slotCosts.length) fail('Toutes les parcelles sont débloquées.');
      const cost = FARM.slotCosts[n];
      if (chipsOf(m) < cost) fail(`Il te faut ${cost} colocoins pour cette parcelle.`);
      if (cost > 0) addChips(m, -cost, 'ferme:parcelle');
      db.farmSt[m] = n + 1; statsOf(m).farm_slots = n + 1; save();
    },
    async plateauWeeks() { return db.pweeks.map((w) => ({ ...w })).reverse(); },
    async settlePlateau() {
      const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - 7);
      const prev = iso(x);
      if (db.pweeks.some((w) => w.week === prev)) return;
      const laps = {};   // savons validés la semaine passée
      db.logs.filter((l) => l.status === 'validated' && l.answered_at && iso(weekStart(new Date(l.answered_at))) === prev).forEach((l) => { laps[l.doer_id] = (laps[l.doer_id] ?? 0) + l.soap; });
      const max = Math.max(0, ...Object.values(laps));
      const winners = max >= 1 ? Object.keys(laps).filter((k) => laps[k] === max).map(Number) : [];
      winners.forEach((id) => addChips(id, GOOSE.weekWin, `plateau-week:${prev}`));
      db.pweeks.push({ week: prev, winners, laps: max }); save();
    },
    async exchangeSoap(member, soap) {
      const o = SOAP_EXCHANGE.find((x) => x.soap === soap);
      if (!o) fail('Échange invalide.');
      const earned = db.logs.filter((l) => l.doer_id === member && l.status === 'validated').reduce((a, l) => a + l.soap, 0);
      const spent = db.dice.filter((r) => r.member_id === member).reduce((a, r) => a + r.cost, 0) + (db.exch ??= []).filter((r) => r.member_id === member).reduce((a, r) => a + r.soap, 0);
      if (earned - spent < soap) fail(`Il te faut ${soap} savons.`);
      db.exch.push({ member_id: member, soap, coins: o.coins }); addChips(member, o.coins, 'echange'); save();
      return { soap, coins: o.coins };
    },
    async openBirdCrate(member) {
      const have = new Set(db.purchases.filter((p) => p.member_id === member).map((p) => p.item));
      const pool = SHOP.bird.filter((b) => !have.has('bird:' + b.key));
      if (!pool.length) fail('Tu as déjà tous les oiseaux !');
      if (chipsOf(member) < BIRD_CRATE.price) fail(`Il te faut ${BIRD_CRATE.price} colocoins pour une caisse.`);
      let r = Math.random() * pool.reduce((a, b) => a + b.w, 0), pick = pool[pool.length - 1];
      for (const b of pool) { r -= b.w; if (r <= 0) { pick = b; break; } }
      addChips(member, -BIRD_CRATE.price, 'caisse');
      db.purchases.push({ id: db.purchases.length + 1, member_id: member, item: 'bird:' + pick.key, price: 0 }); save();
      return pick.key;
    },
    async buyShop(member, item) {
      const [slot, key] = item.split(':'), it = slot === 'bird' ? null : SHOP[slot]?.find((i) => i.key === key);
      if (!it) fail('Article inconnu.');
      const store = slot === 'outfit' ? key : item;
      if (db.purchases.some((p) => p.member_id === member && p.item === store)) fail('Tu possèdes déjà cet article.');
      if (chipsOf(member) < it.price) fail(`Il te faut ${it.price} colocoins.`);
      addChips(member, -it.price, 'shop');
      db.purchases.push({ id: db.purchases.length + 1, member_id: member, item: store, price: 0 }); save();
      return { item, price: it.price };
    },
    async ledger(member) { return db.ledger.filter((l) => l.member_id === member && l.amount).map((l) => ({ ...l, created_at: l.at })).reverse(); },
    async perks() { return [...db.perks].reverse().map((p) => ({ ...p })); },
    async perkConfirms() { return db.pconf.map((c) => ({ ...c })); },
    async confirmPerk(perk, member) {
      const p = db.perks.find((x) => x.id === perk); if (!p) fail('Récompense introuvable.');
      if (!PERKS.find((k) => k.key === p.kind)?.confirm) fail('Rien à confirmer ici.');
      if (member === p.member_id || !isColoc(member)) fail('Seuls les autres colocs confirment.');
      if (!db.pconf.some((c) => c.perk_id === perk && c.member_id === member)) db.pconf.push({ perk_id: perk, member_id: member, created_at: now() }); save();
    },
    async messages(member) { return db.msgs.filter((m) => m.to_id === member).sort((a, b) => b.id - a.id).slice(0, 30).map((m) => ({ ...m })); },
    async sendMessage(from, to, body) {
      const t = String(body ?? '').trim();
      if (!t) fail('Écris un message.');
      if (t.length > MESSAGE_MAX) fail(`Message trop long (${MESSAGE_MAX} caractères maximum).`);
      if (from === to) fail("Tu ne peux pas t'écrire à toi-même.");
      db.msgs.push({ id: db.nextMsg++, from_id: from, to_id: to, body: t, created_at: now(), read_at: null }); save(); return db.nextMsg - 1;
    },
    async events() { return (db.events ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((e) => ({ ...e })); },
    async eventVotes() { return (db.evvotes ?? []).map((v) => ({ ...v })); },
    async createEvent(m, title, place, startsAt, invitees = null) {
      const t = String(title ?? '').trim();
      if (t.length < 2) fail("Donne un titre à l'activité.");
      if (t.length > 60) fail('Titre trop long (60 caractères maximum).');
      const d = new Date(startsAt); if (isNaN(d) || d.getTime() < Date.now() - 864e5) fail('Date invalide.');
      db.events ??= []; db.evvotes ??= []; db.nextEv ??= 1;
      const id = db.nextEv++;
      db.events.push({ id, creator_id: m, title: t, place: String(place ?? '').trim().slice(0, 60) || null, starts_at: d.toISOString(), invitees: invitees?.length ? invitees : null, created_at: now() });
      db.evvotes.push({ event_id: id, member_id: m, vote: 'yes', updated_at: now() }); save(); return id;
    },
    async voteEvent(m, ev, vote) {
      if (!['yes', 'no', 'maybe'].includes(vote)) fail('Réponse invalide.');
      if (!(db.events ?? []).some((e) => e.id === ev)) fail('Activité introuvable.');
      db.evvotes ??= [];
      const v = db.evvotes.find((x) => x.event_id === ev && x.member_id === m);
      if (v) { v.vote = vote; v.updated_at = now(); } else db.evvotes.push({ event_id: ev, member_id: m, vote, updated_at: now() });
      save();
    },
    async deleteEvent(m, ev) {
      const e = (db.events ?? []).find((x) => x.id === ev);
      if (!e || e.creator_id !== m) fail("Seul l'organisateur peut supprimer cette activité.");
      db.events = db.events.filter((x) => x !== e); db.evvotes = (db.evvotes ?? []).filter((v) => v.event_id !== ev); save();
    },
    async sendSuggestion(member, body) {
      const t = String(body ?? '').trim();
      if (t.length < 3) fail('Écris ta suggestion.');
      if (t.length > 1000) fail('Suggestion trop longue (1000 caractères maximum).');
      db.sugg ??= []; db.sugg.push({ id: db.sugg.length + 1, member_id: member, body: t, created_at: now() }); save(); return db.sugg.length;
    },
    async readMessages(member) { db.msgs.forEach((m) => { if (m.to_id === member && !m.read_at) m.read_at = now(); }); save(); },
    async reportBlackjack(id, bet, net, hands, wins, blackjack) {
      if (![...BJ_BETS.low, ...BJ_BETS.high].includes(bet)) fail('Mise invalide.');
      if (!(hands >= 1 && hands <= 2) || wins < 0 || wins > hands || Math.abs(net) > 4 * bet) fail('Résultat invalide.');
      const s = statsOf(id);
      const v = net < 0 ? -Math.min(-net, Math.max(chipsOf(id), 0)) : net;
      addChips(id, v, 'blackjack');
      addXp(id, hands * X.bjPlay + wins * X.bjWin + (blackjack ? X.bjBlackjack : 0), 'game:blackjack');
      s.blackjack_played += hands; s.blackjack_wins += wins; save();
      return { member_id: id, ...s };
    },
    onChange() {},
    async saveSub() {},
  };
}
