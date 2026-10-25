// Accès aux données — 2 implémentations avec la même interface
//   - cloud : Supabase (partagé entre colocs, temps réel)
//   - démo  : localStorage (pour essayer sans rien configurer)
import { CONFIG, SKIN_COLORS, HAIR_COLORS, MOVES, START_COINS, DAILY_COINS, WHEEL_MIN, WHEEL_MAX, XP_RULES as X } from './config.js';
import { rewardOf } from './challenges.js';
import { store, iso } from './util.js';

// Qui gagne ? renvoie 'c' (challenger), 'o' (opponent) ou null (égalité)
const duelWinner = (cm, om) => (cm === om ? null : MOVES[cm]?.beats === om ? 'c' : 'o');

export async function makeCloudApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  const ping = (body) => sb.functions.invoke('notify', { body }).then((r) => { if (r.error) console.warn('notify:', r.error); });
  return {
    mode: 'cloud',
    async members() { return check(await sb.from('members').select('*').order('id')); },
    async updateProfile(id, patch) { check(await sb.from('members').update(patch).eq('id', id)); },
    async ensureWeeks(rows) {
      // On n'ajoute que les lignes manquantes (ne dépend pas d'une contrainte unique côté base)
      if (!rows.length) return;
      const weeks = [...new Set(rows.map((r) => r.week))];
      const have = new Set(check(await sb.from('tasks').select('week,slot,assignee_id').in('week', weeks))
        .map((t) => `${t.week}|${t.slot}|${t.assignee_id}`));
      const missing = rows.filter((r) => !have.has(`${r.week}|${r.slot}|${r.assignee_id}`));
      if (missing.length) check(await sb.from('tasks').insert(missing));
    },
    async tasks(from, to) {
      return check(await sb.from('tasks').select('*').gte('week', from).lte('week', to)
        .order('week').order('day_index').order('slot').order('assignee_id'));
    },
    async scores() { return check(await sb.from('scores').select('*')); },
    async balances() { return check(await sb.from('balances').select('*')); },
    // Change le statut seulement si la tâche est encore dans l'état attendu (évite que 2 personnes valident en même temps)
    async setStatus(id, from, patch) {
      const data = check(await sb.from('tasks').update(patch).eq('id', id).eq('status', from).select('id'));
      return data.length > 0;
    },
    async products() { return check(await sb.from('products').select('*').order('id')); },
    async setProduct(id, out, memberId) {
      check(await sb.from('products').update({ out_of_stock: out, updated_by: memberId, updated_at: new Date().toISOString() }).eq('id', id));
      if (out) ping({ type: 'stock', productId: id }); // un échec ici ne doit pas annuler le signalement
    },
    async purchases() { return check(await sb.from('purchases').select('*')); },
    // --- v5 : XP, classement hebdomadaire, échange de tâches ---
    async xp() { return check(await sb.from('member_xp').select('*')); },
    async weekly() { return check(await sb.from('weekly_trophies').select('*')); },
    async requests() { return check(await sb.from('task_requests').select('*').order('id', { ascending: false }).limit(200)); },
    async createRequest(taskId, from, to) {
      const id = check(await sb.rpc('create_task_request', { p_task: taskId, p_from: from, p_to: to }));
      ping({ type: 'swap', event: 'request', requestId: id });
      return id;
    },
    async answerRequest(reqId, player, accept) {
      let r = check(await sb.rpc('answer_task_request', { p_req: reqId, p_player: player, p_accept: accept }));
      if (Array.isArray(r)) r = r[0];
      if (r?.status === 'accepted' || r?.status === 'declined') ping({ type: 'swap', event: 'answer', requestId: reqId });
      return r;
    },
    async duels() { return check(await sb.from('duels').select('*').order('id', { ascending: false }).limit(300)); },
    async createDuel(challenger, opponent, wager, move) {
      const id = check(await sb.rpc('create_duel', { p_challenger: challenger, p_opponent: opponent, p_wager: wager, p_move: move }));
      ping({ type: 'duel', event: 'challenge', duelId: id });
      return id;
    },
    async playDuel(duelId, player, move) {
      let d = check(await sb.rpc('play_duel', { p_duel: duelId, p_player: player, p_move: move }));
      if (Array.isArray(d)) d = d[0];
      ping({ type: 'duel', event: 'result', duelId });
      return d;
    },
    async cancelDuel(duelId, player) { check(await sb.rpc('cancel_duel', { p_duel: duelId, p_player: player })); },
    // --- v4 : stats, classement, récompenses, défis ---
    async stats() { return check(await sb.from('member_stats').select('*')); },
    async duelStats() { return check(await sb.from('duel_stats').select('*')); },
    async unlocks() { return check(await sb.from('unlocks').select('*')); },
    async views() { return check(await sb.from('profile_views').select('*')); },
    async viewProfile(viewer, viewed) {
      const { error } = await sb.from('profile_views').insert({ viewer_id: viewer, viewed_id: viewed });
      if (error && error.code !== '23505') throw error; // 23505 = déjà consulté
    },
    async claimDaily(id, day) { return check(await sb.rpc('claim_daily', { p_member: id, p_day: day })); },
    async spinWheel(id) { return check(await sb.rpc('spin_wheel', { p_member: id })); },
    async reportGame(id, game, score) {
      let r = check(await sb.rpc('report_game', { p_member: id, p_game: game, p_score: Math.floor(score) }));
      if (Array.isArray(r)) r = r[0];
      return r;
    },
    async claimChallenge(id, key) { return check(await sb.rpc('claim_challenge', { p_member: id, p_key: key })); },
    async questStep(id, step) { return check(await sb.rpc('quest_step', { p_member: id, p_step: step })); },
    onChange(cb) {
      let ch = sb.channel('coloc');
      for (const table of ['tasks', 'products', 'members', 'purchases', 'duels', 'member_stats', 'coin_ledger', 'unlocks', 'task_requests', 'xp_log']) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
      }
      ch.subscribe();
    },
    async saveSub(memberId, sub) {
      const row = { endpoint: sub.endpoint, member_id: memberId, sub };
      const up = await sb.from('push_subs').update({ member_id: memberId, sub }).eq('endpoint', sub.endpoint).select('endpoint');
      if (up.error) throw up.error;
      if (!up.data.length) check(await sb.from('push_subs').insert(row));
    },
  };
}

export function makeDemoApi() {
  const KEY = 'coloc-demo-v2';
  const today = () => iso(new Date());
  const base = ['Anthony', 'Mathilde', 'Lily', 'Victor', 'Zakaria', 'Etienne'].map((name, i) => ({ id: i + 1, name, kind: name === 'Etienne' ? 'copain' : 'coloc' }));
  const PRODUCTS = ['Papier toilette', 'Sopalin', 'Produit toilettes', 'Cumin', 'Curcuma', 'Paprika', 'Poivre', 'Sel',
    'Liquide vaisselle', 'Désinfectant spray', 'Vinaigre blanc', "Huile d'olive", 'Huile de tournesol'];
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  if (!db) db = { tasks: [], nextId: 1, products: PRODUCTS.map((name, i) => ({ id: i + 1, name, out_of_stock: false, updated_by: null })) };
  db.profiles ??= {}; db.purchases ??= []; db.duels ??= []; db.nextDuel ??= 1;
  db.ledger ??= []; db.stats ??= {}; db.unlocks ??= []; db.views ??= []; db.xp ??= []; db.requests ??= []; db.nextReq ??= 1;
  const save = () => store.set(KEY, JSON.stringify(db));

  // Mêmes règles de calcul que la base de données (voir schema.sql)
  const taskCoins = (id) => db.tasks.filter((t) => t.status !== 'todo' && t.actor_id === id).reduce((a, t) => a + t.coins, 0);
  const addXp = (id, amount, reason) => { if (amount) db.xp.push({ member_id: id, amount, reason, at: new Date().toISOString() }); };
  const duelNet = (id) => db.duels
    .filter((d) => d.status === 'done' && d.winner_id && (d.challenger_id === id || d.opponent_id === id))
    .reduce((a, d) => a + (d.winner_id === id ? d.wager : -d.wager), 0);
  const ledgerSum = (id) => db.ledger.filter((l) => l.member_id === id).reduce((a, l) => a + l.amount, 0);
  const balance = (id) => START_COINS + taskCoins(id) + duelNet(id) + ledgerSum(id);
  const emptyStats = () => ({ flappy_best: 0, flappy_total: 0, raid_best: 0, sudoku_best: null, sudoku_done: 0,
    login_days: 0, streak: 0, last_login: null, wheel_ready: false, quest_mask: 0 });
  const statsOf = (id) => (db.stats[id] ??= emptyStats());
  const dayShift = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const pending = (id) => db.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
  const available = (id) => balance(id) - pending(id);
  const fail = (msg) => { throw new Error(msg); };
  const publicDuel = ({ _move, ...d }) => ({ ...d });

  return {
    mode: 'demo',
    async members() {
      return base.map((m) => ({ gender: 'homme', skin: SKIN_COLORS[2].c, hair: HAIR_COLORS[1].c, outfit: 'none', bg: '#e6ebf1', title: null, ...m, ...(db.profiles[m.id] ?? {}) }));
    },
    async updateProfile(id, patch) { db.profiles[id] = { ...(db.profiles[id] ?? {}), ...patch }; save(); },
    async ensureWeeks(rows) {
      for (const r of rows) {
        if (!db.tasks.some((t) => t.week === r.week && t.slot === r.slot && t.assignee_id === r.assignee_id)) {
          db.tasks.push({ ...r, id: db.nextId++, status: 'todo', actor_id: null, coins: 0, acted_at: null });
        }
      }
      save();
    },
    async tasks(from, to) {
      return db.tasks.filter((t) => t.week >= from && t.week <= to)
        .sort((a, b) => a.week.localeCompare(b.week) || a.day_index - b.day_index || a.slot - b.slot || a.assignee_id - b.assignee_id)
        .map((t) => ({ ...t }));
    },
    async scores() {
      const m = {};
      for (const t of db.tasks) {
        if (t.status === 'todo' || !t.actor_id) continue;
        m[t.actor_id] ??= { member_id: t.actor_id, coins: 0, done_count: 0 };
        m[t.actor_id].coins += t.coins;
        if (t.status === 'done') m[t.actor_id].done_count++;
      }
      return Object.values(m);
    },
    async balances() { return base.map((m) => ({ member_id: m.id, coins: balance(m.id) })); },
    async setStatus(id, from, patch) {
      const t = db.tasks.find((x) => x.id === id);
      if (!t || t.status !== from) return false;
      if (patch.status === 'done' && t.status !== 'done') addXp(patch.actor_id, patch.coins * X.taskPerTrophy, 'task');
      if (t.status === 'done' && patch.status !== 'done') addXp(t.actor_id, -t.coins * X.taskPerTrophy, 'task-undo');
      Object.assign(t, patch); save(); return true;
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
      if (!(wager >= 0)) fail('Mise invalide.');
      if (challenger === opponent) fail('Tu ne peux pas te défier toi-même.');
      if (available(challenger) < wager) fail("Tu n'as pas assez de trophées.");
      if (balance(opponent) < wager) fail("Ton adversaire n'a pas assez de trophées.");
      const d = { id: db.nextDuel++, challenger_id: challenger, opponent_id: opponent, wager, status: 'pending',
        challenger_move: null, opponent_move: null, winner_id: null, created_at: new Date().toISOString(), played_at: null, _move: move };
      db.duels.push(d); save(); return d.id;
    },
    async playDuel(duelId, player, move) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!MOVES[move]) fail('Coup invalide.');
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.opponent_id !== player) fail("Ce défi ne t'est pas adressé.");
      if (balance(d.challenger_id) < d.wager || balance(d.opponent_id) < d.wager) fail("Il n'y a plus assez de trophées pour ce duel.");
      const w = duelWinner(d._move, move);
      Object.assign(d, { status: 'done', challenger_move: d._move, opponent_move: move, played_at: new Date().toISOString(),
        winner_id: w === 'c' ? d.challenger_id : w === 'o' ? d.opponent_id : null });
      delete d._move;
      addXp(d.challenger_id, X.duelPlay, 'duel'); addXp(d.opponent_id, X.duelPlay, 'duel');
      if (d.winner_id) addXp(d.winner_id, X.duelWin, 'duel-win');
      save();
      return publicDuel(d);
    },
    async cancelDuel(duelId, player) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.challenger_id !== player && d.opponent_id !== player) fail("Ce défi ne te concerne pas.");
      d.status = 'cancelled'; delete d._move; save();
    },
    // --- v4 : mêmes règles que migration-v4.sql ---
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
      if (!(step >= 1 && step <= 4)) fail('Étape inconnue.');
      const s = statsOf(id); s.quest_mask = (s.quest_mask | (1 << (step - 1))) & 15; save(); return s.quest_mask;
    },
    async claimDaily(id, day) {
      const s = statsOf(id);
      if (s.last_login === day) fail("Récompense déjà récupérée aujourd'hui.");
      const streak = s.last_login === dayShift(day, -1) && s.streak < 7 ? s.streak + 1 : 1;
      const coins = streak === 7 ? 0 : DAILY_COINS[streak - 1];
      Object.assign(s, { streak, last_login: day, login_days: s.login_days + 1, wheel_ready: s.wheel_ready || streak === 7 });
      if (coins) db.ledger.push({ member_id: id, amount: coins, reason: 'daily', at: new Date().toISOString() });
      addXp(id, X.daily, 'daily');
      save();
      return { streak, coins, wheel: streak === 7 };
    },
    async spinWheel(id) {
      const s = statsOf(id);
      if (!s.wheel_ready) fail("La roue n'est pas débloquée.");
      const amount = WHEEL_MIN + Math.floor(Math.random() * (WHEEL_MAX - WHEEL_MIN + 1));
      s.wheel_ready = false; db.ledger.push({ member_id: id, amount, reason: 'wheel', at: new Date().toISOString() }); addXp(id, X.wheel, 'wheel'); save();
      return amount;
    },
    async reportGame(id, game, score) {
      const s = statsOf(id);
      if (!(score >= 0)) fail('Score invalide.');
      if (game === 'flappy') { s.flappy_best = Math.max(s.flappy_best, Math.min(score, 5000)); s.flappy_total += Math.min(score, 5000); addXp(id, Math.min(score * X.flappyPerObstacle, X.gameCap), 'game:flappy'); }
      else if (game === 'raid') { s.raid_best = Math.max(s.raid_best, Math.min(score, 1000000)); addXp(id, Math.min(Math.floor(score / 50) * X.raidPer50m, X.gameCap), 'game:raid'); }
      else if (game === 'sudoku') {
        if (score < 20) fail('Temps invalide.');
        s.sudoku_done++; s.sudoku_best = Math.min(s.sudoku_best ?? score, score); addXp(id, X.sudoku, 'game:sudoku');
      } else fail('Jeu inconnu.');
      save(); return { member_id: id, ...s };
    },
    async claimChallenge(id, key) {
      if (db.unlocks.some((u) => u.member_id === id && u.key === key)) return null;
      const r = rewardOf(key);
      db.unlocks.push({ member_id: id, key }); addXp(id, X.challenge, `challenge:${key}`);
      if (r.coins) db.ledger.push({ member_id: id, amount: r.coins, reason: `challenge:${key}`, at: new Date().toISOString() });
      if (r.skin && !db.purchases.some((p) => p.member_id === id && p.item === r.skin)) {
        db.purchases.push({ id: db.purchases.length + 1, member_id: id, item: r.skin, price: 0 });
      }
      save(); return { key, ...r };
    },
    // --- v5 : XP, classement hebdomadaire, échange de tâches ---
    async xp() { return base.map((m) => ({ member_id: m.id, xp: db.xp.filter((x) => x.member_id === m.id).reduce((a, x) => a + x.amount, 0) })); },
    async weekly() {
      const monday = (iso8) => { const d = new Date(iso8); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return iso(x); };
      const acc = {};
      const add = (id, week, n) => { const k = `${id}|${week}`; acc[k] = (acc[k] ?? 0) + n; };
      for (const t of db.tasks) if (t.status === 'done' && t.actor_id && t.acted_at) add(t.actor_id, monday(t.acted_at), t.coins);
      for (const l of db.ledger) add(l.member_id, monday(l.at ?? new Date().toISOString()), l.amount);
      return Object.entries(acc).map(([k, trophies]) => { const [id, week] = k.split('|'); return { member_id: Number(id), week, trophies }; });
    },
    async requests() { return [...db.requests].sort((a, b) => b.id - a.id).map((r) => ({ ...r })); },
    async createRequest(taskId, from, to) {
      const t = db.tasks.find((x) => x.id === taskId);
      if (!t || t.status !== 'todo') fail("Cette tâche n'est plus à faire.");
      if (t.assignee_id !== from) fail("Cette tâche n'est pas la tienne.");
      if (base.find((m) => m.id === to)?.kind !== 'coloc') fail("Tu ne peux proposer une tâche qu'à un colocataire.");
      if (db.tasks.some((x) => x.week === t.week && x.slot === t.slot && x.assignee_id === to)) fail('Cette personne a déjà cette tâche.');
      db.requests.forEach((r) => { if (r.task_id === taskId && r.status === 'pending') r.status = 'cancelled'; });
      const r = { id: db.nextReq++, task_id: taskId, from_id: from, to_id: to, status: 'pending', created_at: new Date().toISOString() };
      db.requests.push(r); save(); return r.id;
    },
    async answerRequest(reqId, player, accept) {
      const r = db.requests.find((x) => x.id === reqId);
      if (!r || r.status !== 'pending') fail("Cette demande n'est plus disponible.");
      if (player !== r.from_id && player !== r.to_id) fail('Cette demande ne te concerne pas.');
      if (accept) {
        if (player !== r.to_id) fail('Seul le destinataire peut accepter.');
        const t = db.tasks.find((x) => x.id === r.task_id);
        if (!t || t.status !== 'todo' || t.assignee_id !== r.from_id) { r.status = 'cancelled'; save(); fail('Cette tâche a changé entre-temps.'); }
        if (db.tasks.some((x) => x.week === t.week && x.slot === t.slot && x.assignee_id === r.to_id)) fail('Tu as déjà cette tâche.');
        t.assignee_id = r.to_id; r.status = 'accepted';
      } else r.status = player === r.from_id ? 'cancelled' : 'declined';
      save(); return { ...r };
    },
    onChange() {},
    async saveSub() {},
  };
}