// Accès aux données — 2 implémentations avec la même interface
//   - cloud : Supabase (partagé entre colocs, temps réel)
//   - démo  : localStorage (pour essayer sans rien configurer)
import { CONFIG, SKIN_COLORS, HAIR_COLORS, MOVES, DAILY_XP, WHEEL_MIN, WHEEL_MAX, XP_RULES as X, MILESTONES, TASK_KINDS, GOOSE, BJ_BETS, MESSAGE_MAX, DICE_PRICES, PERKS, perkOfWeek, DAILY } from './config.js';
import { rewardOf } from './challenges.js';
import { store, iso } from './util.js';

// Qui gagne ? renvoie 'c' (challenger), 'o' (opponent) ou null (égalité)
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

export async function makeCloudApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  const ping = (body) => sb.functions.invoke('notify', { body }).then((r) => { if (r.error) console.warn('notify:', r.error); });
  return {
    mode: 'cloud',
    async members() { return check(await sb.from('members').select('*').order('id')); },
    async updateProfile(id, patch) { check(await sb.from('members').update(patch).eq('id', id)); },
    async taskLogs() { return check(await sb.from('task_logs').select('*').order('id', { ascending: false }).limit(200)); },
    async submitTask(member, kind) {
      const id = check(await sb.rpc('submit_task', { p_member: member, p_kind: kind }));
      ping({ type: 'task', event: 'submit', logId: id });
      return id;
    },
    async answerTask(logId, member, ok) {
      let r = check(await sb.rpc('answer_task', { p_log: logId, p_member: member, p_ok: ok }));
      if (Array.isArray(r)) r = r[0];
      if (r?.status === 'validated' || r?.status === 'rejected') ping({ type: 'task', event: 'answer', logId });
      return r;
    },
    // Code secret à 4 chiffres (jamais stocké en clair : la base ne garde qu'une empreinte)
    async setPin(id, pin) { return check(await sb.rpc('set_pin', { p_member: id, p_pin: pin })); },
    async checkPin(id, pin) { return check(await sb.rpc('check_pin', { p_member: id, p_pin: pin })); },
    async scores() { return check(await sb.from('scores').select('*')); },
    async balances() { return check(await sb.from('balances').select('*')); },
    async products() { return check(await sb.from('products').select('*').order('id')); },
    async setProduct(id, out, memberId) {
      check(await sb.from('products').update({ out_of_stock: out, updated_by: memberId, updated_at: new Date().toISOString() }).eq('id', id));
      if (out) ping({ type: 'stock', productId: id }); // un échec ici ne doit pas annuler le signalement
    },
    async purchases() { return check(await sb.from('purchases').select('*')); },
    // --- v5 : XP, classement hebdomadaire, échange de tâches ---
    async xp() { return check(await sb.from('member_xp').select('*')); },
    async weekly() { return check(await sb.from('weekly_trophies').select('*')); },
    // --- v8 : plateau, messages, blackjack ---
    async soapSpent() { return check(await sb.from('soap_spent').select('*')); },
    async diceRolls() { return check(await sb.from('dice_rolls').select('*').order('id', { ascending: false }).limit(300)); },
    async rollDice(member) { return check(await sb.rpc('roll_dice', { p_member: member })); },
    async chips() { return check(await sb.from('chip_balances').select('*')); },
    async ledger(member) { return check(await sb.from('coin_ledger').select('*').eq('member_id', member).neq('amount', 0).order('id', { ascending: false }).limit(100)); },
    async perks() { return check(await sb.from('perks').select('*').order('id', { ascending: false }).limit(100)); },
    async perkConfirms() { return check(await sb.from('perk_confirms').select('*')); },
    async confirmPerk(perk, member) { check(await sb.rpc('confirm_perk', { p_perk: perk, p_member: member })); },
    async messages(member) { return check(await sb.from('messages').select('*').eq('to_id', member).order('id', { ascending: false }).limit(30)); },
    async sendMessage(from, to, body) {
      const id = check(await sb.rpc('send_message', { p_from: from, p_to: to, p_body: body }));
      ping({ type: 'message', messageId: id });
      return id;
    },
    async readMessages(member) { check(await sb.rpc('read_messages', { p_member: member })); },
    async reportBlackjack(id, bet, net, hands, wins, blackjack) {
      let r = check(await sb.rpc('report_blackjack', { p_member: id, p_bet: bet, p_net: net, p_hands: hands, p_wins: wins, p_blackjack: !!blackjack }));
      if (Array.isArray(r)) r = r[0];
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
      for (const table of ['tasks', 'products', 'members', 'purchases', 'duels', 'member_stats', 'coin_ledger', 'unlocks', 'task_logs', 'xp_log', 'dice_rolls', 'messages', 'perks', 'perk_confirms', 'chip_ledger']) {
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
  const KEY = 'coloc-demo-v3';
  const base = ['Anthony', 'Mathilde', 'Lily', 'Victor', 'Zakaria', 'Etienne'].map((name, i) => ({ id: i + 1, name, kind: name === 'Etienne' ? 'copain' : 'coloc' }));
  const PRODUCTS = ['Papier toilette', 'Sopalin', 'Produit toilettes', 'Cumin', 'Curcuma', 'Paprika', 'Poivre', 'Sel',
    'Liquide vaisselle', 'Désinfectant spray', 'Vinaigre blanc', "Huile d'olive", 'Huile de tournesol'];
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  if (!db) db = { products: PRODUCTS.map((name, i) => ({ id: i + 1, name, out_of_stock: false, updated_by: null })) };
  db.profiles ??= {}; db.purchases ??= []; db.duels ??= []; db.nextDuel ??= 1; db.logs ??= []; db.nextLog ??= 1; db.pins ??= {};
  db.ledger ??= []; db.stats ??= {}; db.unlocks ??= []; db.views ??= []; db.xp ??= []; db.dice ??= []; db.nextDice ??= 1; db.msgs ??= []; db.nextMsg ??= 1; db.perks ??= []; db.nextPerk ??= 1; db.pconf ??= []; db.chips ??= [];
  const save = () => store.set(KEY, JSON.stringify(db));
  const now = () => new Date().toISOString();

  // Mêmes règles de calcul que la base de données (voir migration-v7.sql)
  const addXp = (id, amount, reason) => { if (amount) db.xp.push({ member_id: id, amount, reason, at: now() }); };
  const addTrophies = (id, amount, reason) => { if (amount) db.ledger.push({ member_id: id, amount, reason, at: now() }); };
  const todaySum = (id, reason) => db.ledger.filter((l) => l.member_id === id && l.reason === reason && l.at.slice(0, 10) === now().slice(0, 10)).reduce((a, l) => a + l.amount, 0);
  const addChips = (id, amount, reason) => { if (amount) db.chips.push({ member_id: id, amount, reason, at: now() }); };
  const chipsOf = (id) => db.chips.filter((l) => l.member_id === id).reduce((a, l) => a + l.amount, 0);
  const balance = (id) => db.ledger.filter((l) => l.member_id === id).reduce((a, l) => a + l.amount, 0);
  const emptyStats = () => ({ flappy_best: 0, flappy_total: 0, raid_best: 0, sudoku_best: null, sudoku_done: 0, blackjack_played: 0, blackjack_wins: 0,
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
      if (ok) { l.status = 'validated'; addXp(l.doer_id, l.soap * X.taskPerSoap, 'task'); addXp(member, X.validate, 'validate'); }
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
      const d = { id: db.nextDuel++, challenger_id: challenger, opponent_id: opponent, wager: 0, status: 'pending',
        challenger_move: null, opponent_move: null, winner_id: null, created_at: now(), played_at: null, _move: move };
      db.duels.push(d); save(); return d.id;
    },
    async playDuel(duelId, player, move) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!MOVES[move]) fail('Coup invalide.');
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.opponent_id !== player) fail("Ce défi ne t'est pas adressé.");
      const w = duelWinner(d._move, move);
      Object.assign(d, { status: 'done', challenger_move: d._move, opponent_move: move, played_at: now(),
        winner_id: w === 'c' ? d.challenger_id : w === 'o' ? d.opponent_id : null });
      delete d._move;
      addXp(d.challenger_id, X.duelPlay, 'duel'); addXp(d.opponent_id, X.duelPlay, 'duel');
      if (d.winner_id) {
        const loser = d.winner_id === d.challenger_id ? d.opponent_id : d.challenger_id;
        addXp(d.winner_id, X.duelWin, 'duel-win');
        addTrophies(d.winner_id, Math.max(0, Math.min(X.duelWinTrophies, X.duelTrophyCapPerDay - todaySum(d.winner_id, 'duel-win'))), 'duel-win');
        addTrophies(loser, -Math.min(X.duelLossTrophies, Math.max(balance(loser), 0)), 'duel-loss');
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
      const s = statsOf(id); s.quest_mask = (s.quest_mask | (1 << (step - 1))) & 63; save(); return s.quest_mask;
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
      save(); return { member_id: id, ...s };
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
    async soapSpent() { return base.map((m) => ({ member_id: m.id, spent: db.dice.filter((r) => r.member_id === m.id).reduce((a, r) => a + r.cost, 0) })); },
    async diceRolls() { return [...db.dice].sort((a, b) => b.id - a.id).map((r) => ({ ...r })); },
    async rollDice(member) {
      if (!isColoc(member)) fail('Seuls les colocataires jouent au plateau.');
      const dayOf = (t) => iso(new Date(t));
      const today = dayOf(Date.now());
      const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
      const week = mondayOf(Date.now());
      const cost = DICE_PRICES[Math.min(db.dice.filter((r) => r.member_id === member && dayOf(r.created_at) === today).length, DICE_PRICES.length - 1)];
      const earned = db.logs.filter((l) => l.doer_id === member && l.status === 'validated').reduce((a, l) => a + l.soap, 0);
      const spent = db.dice.filter((r) => r.member_id === member).reduce((a, r) => a + r.cost, 0);
      if (earned - spent < cost) fail(`Il te faut ${cost} savon${cost > 1 ? 's' : ''} pour ce dé.`);
      const mine = db.dice.filter((r) => r.member_id === member && r.week === week);
      const from = mine.reduce((m, r) => Math.max(m, r.to_pos), 0);
      if (from >= GOOSE.size) fail('Tu es déjà arrivé cette semaine ! Reviens lundi.');
      const finished = mine.some((r) => r.to_pos >= GOOSE.size);
      const roll = 1 + Math.floor(Math.random() * 6);
      let to = from + roll; if (to > GOOSE.size) to = GOOSE.size - (to - GOOSE.size);
      let xp = 0, tr = 0, ch = 0, note = '';
      for (let depth = 0; depth < 3; depth++) {
        const c = GOOSE.cells[to]; if (!c) break;
        if (c.xp) { xp += c.xp; note += ` +${c.xp} XP`; break; }
        if (c.chips) { ch += c.chips; note += ` +${c.chips} jetons`; break; }
        if (c.back) { to = Math.max(to - c.back, 0); note += ` piège : recule de ${c.back}`; }
        else if (c.goose) { to = Math.min(to + roll, GOOSE.size); note += ` oie : avance encore de ${roll}`; }
      }
      let perk = null;
      if (to >= GOOSE.size && !finished) { xp += GOOSE.finish.xp; tr += GOOSE.finish.trophy; note += ` ARRIVÉE ! +${GOOSE.finish.xp} XP, +${GOOSE.finish.trophy} trophées`; perk = perkOfWeek(new Date(week + 'T00:00:00')).key; db.perks.push({ id: db.nextPerk++, member_id: member, week, kind: perk, created_at: now() }); }
      db.dice.push({ id: db.nextDice++, member_id: member, week, cost, roll, from_pos: from, to_pos: to, note: note.trim() || null, created_at: now() });
      addXp(member, xp, 'plateau'); addTrophies(member, tr, 'plateau'); addChips(member, ch, 'plateau'); save();
      return { perk, roll, from, to, cost, xp, trophies: tr, chips: ch, note: note.trim() };
    },
    async chips() { return base.map((m) => ({ member_id: m.id, chips: chipsOf(m.id) })); },
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
