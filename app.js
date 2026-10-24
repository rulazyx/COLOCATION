import {
  CONFIG, TASK_KINDS, TASK_TEMPLATES, SKIP_PENALTY, ALLOW_EARLY_VALIDATION, participants, pickAssignee,
  SKIN_COLORS, HAIR_COLORS, OUTFITS, DUEL_WAGERS, MOVES,
} from './config.js';
import { avatarSVG } from './avatar.js';

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (s) => document.querySelector(s);
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKS_AHEAD = 4; // semaine en cours + 4 suivantes
const WEEKS_BACK = 2;  // on peut revoir les 2 semaines passées

const pad = (n) => String(n).padStart(2, '0');
// Date locale AAAA-MM-JJ (surtout pas toISOString : il décale d'un jour selon le fuseau)
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const mondayOf = (d = new Date()) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
// Numéro de semaine depuis le lundi 1er janvier 2024 (sert à faire tourner les tâches)
const weekIndex = (monday) =>
  Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2024, 0, 1)) / (7 * 86400000));
const taskDate = (t) => addDays(parseISO(t.week), t.day_index);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function toast(msg, ms = 3500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

function b64ToU8(b64) {
  const pad4 = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad4).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const fmtDay = (d) => `${DAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
function relDay(d) {
  const diff = Math.round((d - startOfToday()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  return fmtDay(d);
}
function fmtRange(monday) {
  const sun = addDays(monday, 6);
  return monday.getMonth() === sun.getMonth()
    ? `du ${monday.getDate()} au ${sun.getDate()} ${MONTHS[sun.getMonth()]}`
    : `du ${monday.getDate()} ${MONTHS[monday.getMonth()]} au ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
}
const outfitName = (id, gender) => { const o = OUTFITS[id] ?? OUTFITS.none; return gender === 'femme' && o.nameF ? o.nameF : o.name; };
const moveEmoji = (m) => MOVES[m]?.emoji ?? '❔';
// Qui gagne ? renvoie 'c' (challenger), 'o' (opponent) ou null (égalité)
const duelWinner = (cm, om) => (cm === om ? null : MOVES[cm]?.beats === om ? 'c' : 'o');

/* Génère les tâches d'une semaine.
   - tâche normale : UNE personne, par rotation parmi les personnes concernées (cf. config.js)
   - tâche "everyone" : une ligne par personne concernée */
function buildWeek(monday, members) {
  const wi = weekIndex(monday);
  const week = iso(monday);
  const rows = [];
  TASK_TEMPLATES.forEach((tpl, slot) => {
    const kind = TASK_KINDS[tpl.kind];
    const pool = participants(tpl, members, wi);
    if (!kind || !pool.length) return;
    const targets = tpl.everyone ? pool : [pickAssignee(tpl, members, slot, wi)];
    for (const m of targets) {
      rows.push({
        week, slot, kind: tpl.kind, label: kind.label, detail: kind.detail,
        day_index: tpl.day, reward: kind.coins, assignee_id: m.id,
      });
    }
  });
  return rows;
}

/* =========================================================
   Accès aux données — 2 implémentations avec la même interface
   - cloud : Supabase (partagé entre colocs, temps réel)
   - démo  : localStorage (pour essayer sans rien configurer)
   ========================================================= */
async function makeCloudApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const check = ({ data, error }) => { if (error) throw error; return data; };
  const ping = (body) => sb.functions.invoke('notify', { body }).then((r) => { if (r.error) console.warn('notify:', r.error); });
  return {
    mode: 'cloud',
    async members() { return check(await sb.from('members').select('*').order('id')); },
    async updateProfile(id, patch) { check(await sb.from('members').update(patch).eq('id', id)); },
    async ensureWeeks(rows) {
      check(await sb.from('tasks').upsert(rows, { onConflict: 'week,slot,assignee_id', ignoreDuplicates: true }));
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
    async buy(memberId, item, price) { check(await sb.rpc('buy_item', { p_member: memberId, p_item: item, p_price: price })); },
    async duels() { return check(await sb.from('duels').select('*').order('id', { ascending: false }).limit(100)); },
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
    onChange(cb) {
      let ch = sb.channel('coloc');
      for (const table of ['tasks', 'products', 'members', 'purchases', 'duels']) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
      }
      ch.subscribe();
    },
    async saveSub(memberId, sub) {
      check(await sb.from('push_subs').upsert({ endpoint: sub.endpoint, member_id: memberId, sub }, { onConflict: 'endpoint' }));
    },
  };
}

function makeDemoApi() {
  const KEY = 'coloc-demo-v2';
  const base = ['Anthony', 'Mathilde', 'Lily', 'Victor', 'Zakaria'].map((name, i) => ({ id: i + 1, name }));
  const PRODUCTS = ['Papier toilette', 'Sopalin', 'Produit toilettes', 'Cumin', 'Curcuma', 'Paprika', 'Poivre', 'Sel',
    'Liquide vaisselle', 'Désinfectant spray', 'Vinaigre blanc', "Huile d'olive", 'Huile de tournesol'];
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  if (!db) db = { tasks: [], nextId: 1, products: PRODUCTS.map((name, i) => ({ id: i + 1, name, out_of_stock: false, updated_by: null })) };
  db.profiles ??= {}; db.purchases ??= []; db.duels ??= []; db.nextDuel ??= 1;
  const save = () => store.set(KEY, JSON.stringify(db));

  // Mêmes règles de calcul que la base de données (voir schema.sql)
  const taskCoins = (id) => db.tasks.filter((t) => t.status !== 'todo' && t.actor_id === id).reduce((a, t) => a + t.coins, 0);
  const spent = (id) => db.purchases.filter((p) => p.member_id === id).reduce((a, p) => a + p.price, 0);
  const duelNet = (id) => db.duels
    .filter((d) => d.status === 'done' && d.winner_id && (d.challenger_id === id || d.opponent_id === id))
    .reduce((a, d) => a + (d.winner_id === id ? d.wager : -d.wager), 0);
  const balance = (id) => taskCoins(id) - spent(id) + duelNet(id);
  const pending = (id) => db.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
  const available = (id) => balance(id) - pending(id);
  const fail = (msg) => { throw new Error(msg); };
  const publicDuel = ({ _move, ...d }) => ({ ...d });

  return {
    mode: 'demo',
    async members() {
      return base.map((m) => ({ gender: 'homme', skin: SKIN_COLORS[2].c, hair: HAIR_COLORS[1].c, outfit: 'none', ...m, ...(db.profiles[m.id] ?? {}) }));
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
      Object.assign(t, patch); save(); return true;
    },
    async products() { return db.products.map((p) => ({ ...p })); },
    async setProduct(id, out, memberId) {
      const p = db.products.find((x) => x.id === id);
      p.out_of_stock = out; p.updated_by = memberId; save();
      if (out && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((r) => r.showNotification('🛒 Rupture de stock', { body: `${p.name} est en rupture`, icon: './icon-192.png' }));
      }
    },
    async purchases() { return db.purchases.map((p) => ({ ...p })); },
    async buy(memberId, item, price) {
      if (db.purchases.some((p) => p.member_id === memberId && p.item === item)) fail('Tu possèdes déjà cette tenue.');
      if (available(memberId) < price) fail("Tu n'as pas assez de pièces.");
      db.purchases.push({ id: db.purchases.length + 1, member_id: memberId, item, price }); save();
    },
    async duels() { return [...db.duels].sort((a, b) => b.id - a.id).map(publicDuel); },
    async createDuel(challenger, opponent, wager, move) {
      if (!MOVES[move]) fail('Coup invalide.');
      if (!(wager >= 1)) fail('Mise invalide.');
      if (challenger === opponent) fail('Tu ne peux pas te défier toi-même.');
      if (available(challenger) < wager) fail("Tu n'as pas assez de pièces.");
      if (balance(opponent) < wager) fail("Ton adversaire n'a pas assez de pièces.");
      const d = { id: db.nextDuel++, challenger_id: challenger, opponent_id: opponent, wager, status: 'pending',
        challenger_move: null, opponent_move: null, winner_id: null, created_at: new Date().toISOString(), played_at: null, _move: move };
      db.duels.push(d); save(); return d.id;
    },
    async playDuel(duelId, player, move) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!MOVES[move]) fail('Coup invalide.');
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.opponent_id !== player) fail("Ce défi ne t'est pas adressé.");
      if (balance(d.challenger_id) < d.wager || balance(d.opponent_id) < d.wager) fail("Il n'y a plus assez de pièces pour ce duel.");
      const w = duelWinner(d._move, move);
      Object.assign(d, { status: 'done', challenger_move: d._move, opponent_move: move, played_at: new Date().toISOString(),
        winner_id: w === 'c' ? d.challenger_id : w === 'o' ? d.opponent_id : null });
      delete d._move; save();
      return publicDuel(d);
    },
    async cancelDuel(duelId, player) {
      const d = db.duels.find((x) => x.id === duelId);
      if (!d || d.status !== 'pending') fail("Ce défi n'est plus disponible.");
      if (d.challenger_id !== player && d.opponent_id !== player) fail("Ce défi ne te concerne pas.");
      d.status = 'cancelled'; delete d._move; save();
    },
    onChange() {},
    async saveSub() {},
  };
}

/* =========================================================
   État + chargement
   ========================================================= */
const state = {
  api: null, members: [], me: null, tasks: [], products: [], scores: [], balances: [], purchases: [], duels: [],
  tab: 'tasks', weekOffset: 0, meSeg: 'resume', sheet: null, error: null, initials: {},
};
const memberById = (id) => state.members.find((m) => m.id === id);
const nameOf = (id) => memberById(id)?.name ?? '?';
const balanceOf = (id) => state.balances.find((b) => b.member_id === id)?.coins ?? 0;
const pendingWagerOf = (id) => state.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
const availableOf = (id) => balanceOf(id) - pendingWagerOf(id);
const ownedBy = (id) => new Set(['none', ...state.purchases.filter((p) => p.member_id === id).map((p) => p.item)]);
const av = (m, size) => avatarSVG(m ?? {}, size);

// Initiale la plus courte qui distingue tous les prénoms (A, M, L, V, Z… ou 2-3 lettres si doublon)
function computeInitials(members) {
  for (let k = 1; k <= 4; k++) {
    const set = new Set(members.map((m) => m.name.slice(0, k).toLowerCase()));
    if (set.size === members.length || k === 4) {
      return Object.fromEntries(members.map((m) => {
        const s = m.name.slice(0, k);
        return [m.id, s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()];
      }));
    }
  }
}

async function refresh() {
  const m0 = mondayOf();
  [state.members, state.tasks, state.scores, state.balances, state.products, state.purchases, state.duels] = await Promise.all([
    state.api.members(),
    state.api.tasks(iso(addDays(m0, -7 * WEEKS_BACK)), iso(addDays(m0, 7 * WEEKS_AHEAD))),
    state.api.scores(), state.api.balances(), state.api.products(), state.api.purchases(), state.api.duels(),
  ]);
  if (state.me) state.me = memberById(state.me.id) ?? null;
  state.initials = computeInitials(state.members);
  checkNewResults();
  render();
}

// Quand quelqu'un a répondu à NOTRE défi, on affiche le résultat une fois
function checkNewResults() {
  if (!state.me) return;
  const key = `coloc-seen-duels-${state.me.id}`;
  const mine = state.duels.filter((d) => d.status === 'done' && d.challenger_id === state.me.id);
  let seen = null;
  try { seen = JSON.parse(store.get(key) || 'null'); } catch { seen = null; }
  if (!seen) { store.set(key, JSON.stringify(mine.map((d) => d.id))); return; } // 1er lancement : on ne rejoue pas l'historique
  const fresh = mine.find((d) => !seen.includes(d.id));
  if (fresh && !state.sheet) {
    state.sheet = { type: 'duel-result', duel: fresh };
    store.set(key, JSON.stringify([...seen, fresh.id].slice(-300)));
  }
}

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  try {
    const cloud = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    state.api = cloud ? await makeCloudApi() : makeDemoApi();
    state.members = await state.api.members();
    state.initials = computeInitials(state.members);
    const meId = Number(store.get('coloc-me'));
    state.me = state.members.find((m) => m.id === meId) || null;
    const m0 = mondayOf();
    const rows = [];
    for (let i = 0; i <= WEEKS_AHEAD; i++) rows.push(...buildWeek(addDays(m0, 7 * i), state.members));
    await state.api.ensureWeeks(rows);
    await refresh();
    state.api.onChange(debounce(() => refresh().catch(() => {}), 250));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
    if (state.me) syncSub();
  } catch (e) {
    console.error(e);
    state.error = e.message || String(e);
    render();
  }
}

/* =========================================================
   Actions
   ========================================================= */
// Change le statut d'une tâche : 'done' (+pièces), 'skipped' (pénalité éventuelle) ou 'todo' (annulation)
async function act(task, newStatus) {
  const patch = newStatus === 'done'
    ? { status: 'done', actor_id: state.me.id, coins: task.reward, acted_at: new Date().toISOString() }
    : newStatus === 'skipped'
      ? { status: 'skipped', actor_id: state.me.id, coins: -SKIP_PENALTY, acted_at: new Date().toISOString() }
      : { status: 'todo', actor_id: null, coins: 0, acted_at: null };
  const prev = { ...task };
  Object.assign(task, patch);
  state.sheet = null;
  render();
  try {
    const ok = await state.api.setStatus(task.id, prev.status, patch);
    if (!ok) { Object.assign(task, prev); toast("Cette tâche vient d'être modifiée par quelqu'un d'autre."); }
    else if (newStatus === 'done') toast(`Bravo ! +${task.reward} 🪙`);
    else if (newStatus === 'skipped') toast(SKIP_PENALTY ? `Tâche sautée (−${SKIP_PENALTY} 🪙)` : 'Tâche sautée.');
    else toast('Validation annulée.');
  } catch (e) {
    console.error(e);
    Object.assign(task, prev);
    toast('Erreur réseau, réessaie.');
  }
  refresh().catch(() => {});
}

async function toggleProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const out = !p.out_of_stock;
  p.out_of_stock = out; p.updated_by = state.me.id;
  render();
  try {
    await state.api.setProduct(id, out, state.me.id);
    toast(out ? `${p.name} signalé en rupture, tout le monde est prévenu.` : `${p.name} réapprovisionné ✅`);
  } catch (e) {
    p.out_of_stock = !out; render(); toast('Erreur réseau, réessaie.');
  }
}

async function saveProfile(patch) {
  Object.assign(state.me, patch);
  render();
  try { await state.api.updateProfile(state.me.id, patch); }
  catch (e) { console.error(e); toast("Impossible d'enregistrer ton personnage."); }
  refresh().catch(() => {});
}

async function doBuy() {
  const item = state.sheet?.item; const o = OUTFITS[item];
  if (!o) return;
  try {
    await state.api.buy(state.me.id, item, o.price);
    await state.api.updateProfile(state.me.id, { outfit: item });
    state.sheet = null;
    toast(`Tenue « ${outfitName(item, state.me.gender)} » achetée et portée ! 🎉`);
    state.meSeg = 'perso';
    await refresh();
  } catch (e) { toast(e.message || 'Achat impossible.'); }
}

async function sendDuel() {
  const s = state.sheet;
  const max = Math.min(availableOf(state.me.id), balanceOf(s.opp));
  const wager = Math.floor(Number(s.wager));
  if (!s.move) return toast('Choisis ton coup.');
  if (!(wager >= 1) || wager > max) return toast(`La mise doit être entre 1 et ${max} 🪙.`);
  try {
    await state.api.createDuel(state.me.id, s.opp, wager, s.move);
    state.sheet = null;
    toast(`Défi envoyé à ${nameOf(s.opp)} ! Mise : ${wager} 🪙`);
    await refresh();
  } catch (e) { toast(e.message || 'Impossible de lancer le défi.'); }
}

async function playDuelNow() {
  const s = state.sheet;
  if (!s.move) return toast('Choisis ton coup.');
  try {
    const d = await state.api.playDuel(s.duelId, state.me.id, s.move);
    state.sheet = { type: 'duel-result', duel: d };
    await refresh();
  } catch (e) { state.sheet = null; toast(e.message || 'Impossible de jouer ce défi.'); refresh().catch(() => {}); }
}

async function cancelDuelNow(id) {
  try { await state.api.cancelDuel(id, state.me.id); toast('Défi retiré.'); await refresh(); }
  catch (e) { toast(e.message || 'Impossible.'); }
}

async function syncSub() {
  // Si les notifications sont déjà activées sur cet appareil, on (ré)associe l'appareil au prénom choisi.
  if (store.get('coloc-push') !== '1' || state.api.mode !== 'cloud' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await state.api.saveSub(state.me.id, sub.toJSON());
  } catch (e) { console.warn(e); }
}

async function enablePush() {
  if (isIOS && !isStandalone()) {
    toast("Sur iPhone : ouvre l'appli depuis l'icône de l'écran d'accueil (Partager → Sur l'écran d'accueil), puis réessaie.", 8000);
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    toast('Les notifications ne sont pas disponibles sur ce navigateur.', 6000);
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications refusées. Tu peux les réactiver dans les réglages de ton téléphone.', 6000); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    if (state.api.mode === 'cloud') {
      if (!CONFIG.VAPID_PUBLIC_KEY) { toast('Clé VAPID manquante dans config.js', 6000); return; }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
      await state.api.saveSub(state.me.id, sub.toJSON());
    }
    store.set('coloc-push', '1');
    reg.showNotification('Coloc', { body: 'Notifications activées ✅', icon: './icon-192.png' });
    render();
  } catch (e) {
    console.error(e);
    toast("Impossible d'activer les notifications : " + (e.message || e), 7000);
  }
}

/* =========================================================
   Rendu
   ========================================================= */
const pushOn = () => store.get('coloc-push') === '1' && 'Notification' in window && Notification.permission === 'granted';
const pendingForMe = () => state.duels.filter((d) => d.status === 'pending' && d.opponent_id === state.me.id);

function render() {
  const app = $('#app');
  if (state.error) {
    app.innerHTML = `<div class="pick"><h1>😕 Oups</h1><p>Impossible de charger les données.<br><small>${esc(state.error)}</small></p><button data-action="reload">Réessayer</button></div>`;
    return;
  }
  if (!state.api) { app.innerHTML = '<div class="pick"><p>Chargement…</p></div>'; return; }
  if (!state.me) {
    app.innerHTML = `<div class="pick"><h1>🏠 Coloc</h1><p>Qui es-tu ?</p>${
      state.members.map((m) => `<button data-action="pick" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div>`;
    return;
  }
  const outCount = state.products.filter((p) => p.out_of_stock).length;
  const todoMine = myUpcoming().length;
  const duelsForMe = pendingForMe().length;
  const tab = state.tab;
  const badge = (n, color) => (n ? `<span class="badge" ${color ? `style="background:${color}"` : ''}>${n}</span>` : '');
  app.innerHTML = `
    <header class="top">
      <h1>🏠 Coloc${state.api.mode === 'demo' ? ' <small style="font-weight:400;color:var(--muted)">(démo)</small>' : ''}</h1>
      <button class="chip" data-action="push" aria-label="Notifications">${pushOn() ? '🔔' : '🔕'}</button>
    </header>
    <main>
      ${pushOn() || store.get('coloc-push-dismiss') === '1' ? '' : `
        <div class="banner">
          <span>Active les notifications pour recevoir les rappels, les alertes de rupture et les défis.</span>
          <span style="display:flex;gap:4px;align-items:center"><button class="btn" style="background:var(--accent);color:#fff;padding:10px 14px;width:auto" data-action="push">Activer</button><button class="x" data-action="dismiss" aria-label="Fermer">✕</button></span>
        </div>`}
      ${tab === 'tasks' ? tasksHTML() : tab === 'stock' ? stockHTML() : tab === 'games' ? gamesHTML() : meHTML()}
    </main>
    <nav class="tabs">
      <button data-action="tab" data-tab="tasks" class="${tab === 'tasks' ? 'active' : ''}"><span class="ico">🧹</span>Tâches</button>
      <button data-action="tab" data-tab="stock" class="${tab === 'stock' ? 'active' : ''}"><span class="ico">🛒</span>Stocks${badge(outCount)}</button>
      <button data-action="tab" data-tab="games" class="${tab === 'games' ? 'active' : ''}"><span class="ico">🎮</span>Jeux${badge(duelsForMe)}</button>
      <button data-action="tab" data-tab="me" class="${tab === 'me' ? 'active' : ''}"><span class="ico">👤</span>Toi${badge(todoMine, 'var(--accent)')}</button>
    </nav>
    ${sheetHTML()}`;
}

/* ---------- Onglet 1 : tableau de la semaine ---------- */
function groupTasks(list, kind, day) { return list.filter((t) => t.kind === kind && t.day_index === day); }

function tasksHTML() {
  const off = state.weekOffset;
  const monday = addDays(mondayOf(), off * 7);
  const list = state.tasks.filter((t) => t.week === iso(monday));
  const today = iso(new Date());
  const doneN = list.filter((t) => t.status === 'done').length;
  const subtitle = off === 0 ? 'Cette semaine' : off === 1 ? 'Semaine prochaine' : off === -1 ? 'Semaine dernière' : off < 0 ? 'Semaine passée' : '';

  const kinds = Object.keys(TASK_KINDS).filter((k) => list.some((t) => t.kind === k));
  let cells = '<div></div>';
  for (let d = 0; d < 7; d++) {
    const date = addDays(monday, d);
    cells += `<div class="dh ${iso(date) === today ? 'today' : ''}"><b>${DAY_LETTERS[d]}</b><span>${date.getDate()}</span></div>`;
  }
  for (const k of kinds) {
    const K = TASK_KINDS[k];
    cells += `<div class="rl"><span>${K.emoji}</span><small>${esc(K.short)}</small></div>`;
    for (let d = 0; d < 7; d++) {
      const todayCol = iso(addDays(monday, d)) === today ? 'today-col' : '';
      const g = groupTasks(list, k, d);
      if (!g.length) { cells += `<div class="c empty ${todayCol}"></div>`; continue; }
      const mine = g.some((t) => t.assignee_id === state.me.id);
      let inner, st;
      if (g.length === 1) {
        const t = g[0];
        st = t.status;
        inner = t.status === 'done' ? '✓' : t.status === 'skipped' ? '↷' : esc(state.initials[t.assignee_id] ?? '?');
      } else {
        const n = g.filter((t) => t.status === 'done').length;
        st = n === g.length ? 'done' : 'todo';
        inner = st === 'done' ? '✓' : `${n}/${g.length}`;
      }
      cells += `<button class="c has st-${st} ${mine ? 'mine' : ''}" style="--c:${K.color}" data-action="cell" data-week="${iso(monday)}" data-kind="${k}" data-day="${d}"
        aria-label="${esc(K.label)}, ${DAYS[d]}"><span class="av ${g.length > 1 ? 'multi' : ''}">${inner}</span></button>`;
    }
  }
  return `
    <div class="weekbar">
      <button class="arrow" data-action="week" data-d="-1" ${off <= -WEEKS_BACK ? 'disabled' : ''} aria-label="Semaine précédente">‹</button>
      <div class="mid"><h2>Semaine ${fmtRange(monday)}</h2><small>${subtitle}</small></div>
      <button class="arrow" data-action="week" data-d="1" ${off >= WEEKS_AHEAD ? 'disabled' : ''} aria-label="Semaine suivante">›</button>
    </div>
    ${kinds.length ? `
      <div class="table">${cells}</div>
      <div class="legend">Touche une case pour la valider · lettre = responsable · ✓ faite · ↷ sautée</div>
      <div class="progress">${doneN} / ${list.length} faites<div class="bar"><i style="width:${list.length ? (doneN / list.length) * 100 : 0}%"></i></div></div>`
      : '<div class="empty-msg">Aucune tâche cette semaine.</div>'}`;
}

/* ---------- Feuilles (fenêtres du bas) ---------- */
function sheetWrap(inner, color = 'var(--accent)') {
  return `<div class="overlay" data-action="close"><div class="sheet" role="dialog" aria-modal="true" style="--c:${color}">${inner}</div></div>`;
}
const closeBtn = '<button class="close" data-action="close" aria-label="Fermer">✕</button>';

function sheetHTML() {
  const s = state.sheet;
  if (!s) return '';
  switch (s.type) {
    case 'task': return taskSheetHTML(s);
    case 'buy': return buySheetHTML(s);
    case 'duel-new': return duelNewHTML(s);
    case 'duel-play': return duelPlayHTML(s);
    case 'duel-result': return duelResultHTML(s);
    default: return '';
  }
}

// Validation d'une tâche (= la confirmation)
function taskSheetHTML(s) {
  const g = state.tasks.filter((t) => t.week === s.week && t.kind === s.kind && t.day_index === s.day);
  if (!g.length) return '';
  const t0 = g[0];
  const K = TASK_KINDS[s.kind] ?? { emoji: '🧹', color: '#888' };
  const date = taskDate(t0);
  const early = !ALLOW_EARLY_VALIDATION && date > startOfToday();
  const multi = g.length > 1;
  const title = s.mode === 'skip' ? 'Sauter cette tâche ?' : s.mode === 'done' ? 'Valider cette tâche ?' : esc(t0.label);

  const rows = g.map((t) => {
    const mine = t.assignee_id === state.me.id;
    let status = 'À faire';
    if (t.status === 'done') status = `✅ Faite par ${esc(t.actor_id === state.me.id ? 'toi' : nameOf(t.actor_id))} · +${t.coins} 🪙`;
    if (t.status === 'skipped') status = `↷ Sautée par ${esc(t.actor_id === state.me.id ? 'toi' : nameOf(t.actor_id))}${t.coins ? ` · ${t.coins} 🪙` : ''}`;

    let actions = '';
    if (t.status === 'todo' && (mine || !multi)) {
      const doneBtn = `<button class="btn primary" data-action="do" data-id="${t.id}" ${early ? 'disabled' : ''}>${
        early ? `Validable ${esc(relDay(date).toLowerCase())}` : mine ? `✅ C'est fait · +${t.reward} 🪙` : `✅ Je l'ai faite à sa place · +${t.reward} 🪙`}</button>`;
      const skipBtn = mine
        ? `<button class="btn ${s.mode === 'skip' ? 'warn' : ''}" data-action="skip" data-id="${t.id}">↷ Sauter${SKIP_PENALTY ? ` · −${SKIP_PENALTY} 🪙` : ' (pas de pièces)'}</button>` : '';
      actions = s.mode === 'skip' ? skipBtn + doneBtn : doneBtn + skipBtn;
    } else if (t.status !== 'todo' && t.actor_id === state.me.id) {
      actions = `<button class="btn" data-action="undo" data-id="${t.id}">Annuler (${t.coins > 0 ? 'retire' : 'rend'} les pièces)</button>`;
    }
    return `<div class="srow"><div class="swho"><b>${mine ? 'Toi' : esc(nameOf(t.assignee_id))}</b><small>${status}</small></div>${actions ? `<div class="sact">${actions}</div>` : ''}</div>`;
  }).join('');

  return sheetWrap(`
      <div class="sh"><div class="badge-k">${K.emoji}</div>
        <div><h2>${title}</h2><div class="when">${s.mode === 'auto' ? `${DAYS[t0.day_index]} ${date.getDate()} ${MONTHS[date.getMonth()]}` : `${esc(t0.label)} · ${relDay(date)}`}</div></div>
        ${closeBtn}</div>
      <div class="det">${esc(t0.detail)}</div>
      <div class="reward">Récompense : +${t0.reward} 🪙${multi ? ' par personne (tâche pour tous)' : ''}</div>
      ${rows}`, K.color);
}

function buySheetHTML(s) {
  const o = OUTFITS[s.item];
  if (!o) return '';
  const me = state.me;
  const after = availableOf(me.id) - o.price;
  return sheetWrap(`
    <div class="sh"><div><h2>Acheter « ${esc(outfitName(s.item, me.gender))} » ?</h2>
      <div class="when">Prix : ${o.price} 🪙 · il te restera ${Math.max(after, 0)} 🪙</div></div>${closeBtn}</div>
    <div class="center-av">${av({ ...me, outfit: s.item }, 150)}</div>
    ${o.hidesHair || o.hidesSkin ? `<div class="det" style="text-align:center">Cette tenue cache ${o.hidesSkin ? 'ta peau et tes cheveux' : 'tes cheveux'}.</div>` : ''}
    <div class="sact" style="margin-top:14px">
      <button class="btn primary" data-action="buy-confirm" ${after < 0 ? 'disabled' : ''}>🛒 Acheter pour ${o.price} 🪙</button>
      <button class="btn" data-action="close">Annuler</button></div>`);
}

function movePicker(selected) {
  return `<div class="moves">${Object.entries(MOVES).map(([k, m]) => `
    <button class="move ${selected === k ? 'sel' : ''}" data-action="pick-move" data-v="${k}" aria-pressed="${selected === k}"><span>${m.emoji}</span><small>${m.label}</small></button>`).join('')}</div>`;
}

function duelNewHTML(s) {
  const opp = memberById(s.opp);
  if (!opp) return '';
  const me = state.me;
  const max = Math.min(availableOf(me.id), balanceOf(opp.id));
  const chips = DUEL_WAGERS.filter((w) => w <= max);
  return sheetWrap(`
    <div class="sh"><div class="vs-av">${av(me, 54)}<b>⚔️</b>${av(opp, 54)}</div>
      <div><h2>Défier ${esc(opp.name)}</h2><div class="when">Chifoumi · le gagnant prend la mise</div></div>${closeBtn}</div>
    ${max < 1 ? `<div class="det">Pas assez de pièces : tu en as ${availableOf(me.id)} de disponibles, ${esc(opp.name)} en a ${balanceOf(opp.id)}.</div>` : `
    <div class="det">Mise (max ${max} 🪙, selon vos soldes)</div>
    <div class="chips">${chips.map((w) => `<button class="pill ${Number(s.wager) === w ? 'sel' : ''}" data-action="wager" data-v="${w}">${w} 🪙</button>`).join('')}
      <input class="num" type="number" inputmode="numeric" min="1" max="${max}" value="${esc(s.wager)}" data-input="wager" aria-label="Mise">
    </div>
    <div class="det">Choisis ton coup (ton adversaire ne le verra pas)</div>
    ${movePicker(s.move)}
    <div class="sact" style="margin-top:14px"><button class="btn primary" data-action="duel-send" ${s.move ? '' : 'disabled'}>⚔️ Lancer le défi</button></div>`}`);
}

function duelPlayHTML(s) {
  const d = state.duels.find((x) => x.id === s.duelId);
  if (!d || d.status !== 'pending') return '';
  const ch = memberById(d.challenger_id);
  return sheetWrap(`
    <div class="sh"><div class="vs-av">${av(ch, 54)}<b>⚔️</b>${av(state.me, 54)}</div>
      <div><h2>${esc(ch?.name)} te défie !</h2><div class="when">Mise : ${d.wager} 🪙 · si tu perds, −${d.wager} 🪙</div></div>${closeBtn}</div>
    <div class="det">Choisis ton coup</div>
    ${movePicker(s.move)}
    <div class="sact" style="margin-top:14px"><button class="btn primary" data-action="duel-play" ${s.move ? '' : 'disabled'}>✅ Jouer ce coup</button></div>`);
}

function duelResultHTML(s) {
  const d = s.duel;
  const me = state.me.id;
  const iAmC = d.challenger_id === me;
  const other = memberById(iAmC ? d.opponent_id : d.challenger_id);
  const myMove = iAmC ? d.challenger_move : d.opponent_move;
  const theirMove = iAmC ? d.opponent_move : d.challenger_move;
  const won = d.winner_id === me, tie = !d.winner_id;
  const headline = tie ? '🤝 Égalité !' : won ? '🏆 Victoire !' : '😅 Perdu…';
  const detail = tie ? 'Personne ne gagne ni ne perd de pièces.' : won ? `Tu gagnes +${d.wager} 🪙 contre ${esc(other?.name)}` : `Tu perds −${d.wager} 🪙 contre ${esc(other?.name)}`;
  return sheetWrap(`
    <div class="sh"><div><h2>${headline}</h2><div class="when">${detail}</div></div>${closeBtn}</div>
    <div class="reveal"><div>${av(state.me, 64)}<span>${moveEmoji(myMove)}</span><small>Toi</small></div><b>VS</b>
      <div>${av(other, 64)}<span>${moveEmoji(theirMove)}</span><small>${esc(other?.name)}</small></div></div>
    <div class="sact"><button class="btn primary" data-action="close">OK</button></div>`);
}

/* ---------- Onglet 2 : stocks ---------- */
function stockHTML() {
  const out = state.products.filter((p) => p.out_of_stock).length;
  return `
    <p class="summary">${out ? `<b>${out}</b> produit${out > 1 ? 's' : ''} en rupture.` : 'Tout est en stock 👌'} Touche un produit pour le signaler (re-touche pour dire qu'il est réapprovisionné).</p>
    <div class="grid">${state.products.map((p) => `
      <button class="card ${p.out_of_stock ? 'out' : ''}" data-action="product" data-id="${p.id}" aria-pressed="${p.out_of_stock}">
        <span class="name">${esc(p.name)}</span>
        <span class="state">${p.out_of_stock ? `En rupture${p.updated_by ? ` · ${esc(nameOf(p.updated_by))}` : ''}` : 'OK'}</span>
      </button>`).join('')}</div>`;
}

/* ---------- Onglet 3 : jeux (chifoumi) ---------- */
function gamesHTML() {
  const me = state.me;
  const received = pendingForMe();
  const sent = state.duels.filter((d) => d.status === 'pending' && d.challenger_id === me.id);
  const hist = state.duels.filter((d) => d.status === 'done').slice(0, 8);
  const others = state.members.filter((m) => m.id !== me.id);

  return `
    <section class="hero2">
      <div class="avwrap">${av(me, 72)}</div>
      <div><div class="coins"><span>🪙</span> ${availableOf(me.id)}</div>
      <div class="sub">disponibles${pendingWagerOf(me.id) ? ` · ${pendingWagerOf(me.id)} 🪙 misés sur des défis en attente` : ''}</div></div>
    </section>

    ${received.length ? `<h3 class="sec">Défis reçus</h3>${received.map((d) => {
      const ch = memberById(d.challenger_id);
      return `<div class="up"><div class="mini-av">${av(ch, 44)}</div>
        <div class="txt"><b>${esc(ch?.name)} te défie</b><small>Mise : ${d.wager} 🪙</small></div>
        <button class="mini ok" data-action="duel-open" data-id="${d.id}">Relever</button>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Refuser</button></div>`;
    }).join('')}` : ''}

    <h3 class="sec">Défier un colocataire · chifoumi ✊✋✌️</h3>
    ${others.map((m) => `
      <div class="up"><div class="mini-av">${av(m, 44)}</div>
        <div class="txt"><b>${esc(m.name)}</b><small>${balanceOf(m.id)} 🪙</small></div>
        <button class="mini ok" data-action="duel-new" data-id="${m.id}">⚔️ Défier</button></div>`).join('')}

    ${sent.length ? `<h3 class="sec">Mes défis en attente</h3>${sent.map((d) => `
      <div class="up"><div class="mini-av">${av(memberById(d.opponent_id), 44)}</div>
        <div class="txt"><b>En attente de ${esc(nameOf(d.opponent_id))}</b><small>Mise : ${d.wager} 🪙 · ton coup est secret</small></div>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Annuler</button></div>`).join('')}` : ''}

    <h3 class="sec">Derniers duels</h3>
    ${hist.length ? hist.map((d) => {
      const ch = memberById(d.challenger_id), op = memberById(d.opponent_id);
      const w = d.winner_id ? nameOf(d.winner_id) : null;
      const mineD = d.challenger_id === me.id || d.opponent_id === me.id;
      return `<div class="up hist ${mineD ? 'mine' : ''}"><div class="vs-av">${av(ch, 38)}${av(op, 38)}</div>
        <div class="txt"><b>${esc(ch?.name)} ${moveEmoji(d.challenger_move)} vs ${moveEmoji(d.opponent_move)} ${esc(op?.name)}</b>
        <small>${w ? `${esc(w)} gagne ${d.wager} 🪙` : 'Égalité, rien ne change'}</small></div></div>`;
    }).join('') : '<div class="empty-msg" style="padding:16px 0">Aucun duel pour l\'instant. Lance le premier !</div>'}`;
}

/* ---------- Onglet 4 : Toi ---------- */
function myUpcoming() {
  const limit = addDays(startOfToday(), -7);
  return state.tasks
    .filter((t) => t.assignee_id === state.me.id && t.status === 'todo' && taskDate(t) >= limit)
    .sort((a, b) => taskDate(a) - taskDate(b) || a.slot - b.slot);
}

function meHTML() {
  const me = state.me;
  const mine = state.scores.find((s) => s.member_id === me.id) ?? { coins: 0, done_count: 0 };
  const monday = iso(mondayOf());
  const weekCoins = state.tasks.filter((t) => t.week === monday && t.actor_id === me.id).reduce((a, t) => a + t.coins, 0);
  const seg = state.meSeg;
  return `
    <section class="hero2">
      <div class="avwrap">${av(me, 88)}</div>
      <div><div class="coins"><span>🪙</span> ${availableOf(me.id)}</div>
      <div class="sub">${mine.done_count} tâche${mine.done_count > 1 ? 's' : ''} faite${mine.done_count > 1 ? 's' : ''} · ${weekCoins >= 0 ? '+' : ''}${weekCoins} cette semaine${pendingWagerOf(me.id) ? ` · ${pendingWagerOf(me.id)} 🪙 en jeu` : ''}</div></div>
    </section>
    <div class="seg">${[['resume', 'Résumé'], ['perso', 'Personnage'], ['shop', 'Boutique']].map(([k, l]) =>
      `<button class="${seg === k ? 'on' : ''}" data-action="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    ${seg === 'perso' ? persoHTML() : seg === 'shop' ? shopHTML() : resumeHTML()}`;
}

function resumeHTML() {
  const me = state.me;
  const byId = Object.fromEntries(state.scores.map((s) => [s.member_id, s]));
  const ranking = state.members
    .map((m) => ({ ...m, earned: byId[m.id]?.coins ?? 0, done: byId[m.id]?.done_count ?? 0 }))
    .sort((a, b) => b.earned - a.earned || b.done - a.done || a.name.localeCompare(b.name));
  const medals = ['🥇', '🥈', '🥉'];
  const up = myUpcoming();
  const today = startOfToday();
  return `
    <h3 class="sec">Classement · pièces gagnées au ménage</h3>
    <ol class="rank">${ranking.map((m, i) => `
      <li class="${m.id === me.id ? 'me' : ''}"><span class="pos">${medals[i] ?? i + 1}</span><span class="rav">${av(m, 34)}</span><span class="nm">${esc(m.name)}${m.id === me.id ? ' (toi)' : ''}</span><span class="pts">${m.earned} 🪙</span></li>`).join('')}
    </ol>

    <h3 class="sec">Mes prochaines tâches</h3>
    ${up.length ? up.map((t) => {
      const K = TASK_KINDS[t.kind] ?? { emoji: '🧹', color: '#888' };
      const d = taskDate(t);
      const late = d < today;
      return `<div class="up" style="--c:${K.color}">
        <div class="dot">${K.emoji}</div>
        <div class="txt"><b>${esc(t.label)}</b><small class="${late ? 'late' : ''}">${late ? 'En retard · ' : ''}${relDay(d)}${relDay(d).includes(' ') ? '' : ' · ' + fmtDay(d)} · +${t.reward} 🪙</small></div>
        <button class="mini ok" data-action="open" data-id="${t.id}" data-mode="done">Fait</button>
        <button class="mini" data-action="open" data-id="${t.id}" data-mode="skip">Sauter</button>
      </div>`;
    }).join('') : '<div class="empty-msg" style="padding:20px 0">Rien à faire pour le moment 🎉</div>'}

    <button class="link" data-action="switch">Changer de prénom (actuellement ${esc(me.name)})</button>`;
}

function persoHTML() {
  const me = state.me;
  const owned = ownedBy(me.id);
  const cur = OUTFITS[me.outfit] ?? OUTFITS.none;
  const swatches = (list, field, current) => list.map((o) =>
    `<button class="sw ${current?.toLowerCase() === o.c ? 'sel' : ''}" style="background:${o.c}" data-action="${field}" data-v="${o.c}" aria-label="${esc(o.name)}" aria-pressed="${current?.toLowerCase() === o.c}"></button>`).join('');
  return `
    <div class="center-av">${av(me, 150)}</div>
    <h3 class="sec">Genre</h3>
    <div class="seg small">${[['homme', '👨 Homme'], ['femme', '👩 Femme']].map(([k, l]) =>
      `<button class="${me.gender === k ? 'on' : ''}" data-action="gender" data-v="${k}">${l}</button>`).join('')}</div>
    <h3 class="sec">Couleur de peau ${cur.hidesSkin ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
    <div class="swatches">${swatches(SKIN_COLORS, 'skin', me.skin)}</div>
    <h3 class="sec">Couleur de cheveux ${cur.hidesHair ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
    <div class="swatches">${swatches(HAIR_COLORS, 'hair', me.hair)}</div>
    <h3 class="sec">Ma garde-robe</h3>
    <div class="shop">${Object.entries(OUTFITS).filter(([id]) => owned.has(id)).map(([id]) => `
      <button class="item ${me.outfit === id || (!me.outfit && id === 'none') ? 'eq' : ''}" data-action="equip" data-id="${id}">
        ${av({ ...me, outfit: id }, 76)}<b>${esc(outfitName(id, me.gender))}</b><small>${(me.outfit ?? 'none') === id ? 'Portée' : 'Porter'}</small></button>`).join('')}</div>
    <button class="link" data-action="seg" data-seg="shop">Voir la boutique →</button>`;
}

function shopHTML() {
  const me = state.me;
  const owned = ownedBy(me.id);
  const avail = availableOf(me.id);
  return `
    <p class="summary">Dépense tes pièces 🪙 pour de nouvelles apparences. Tu as <b>${avail} 🪙</b> disponibles.</p>
    <div class="shop">${Object.entries(OUTFITS).filter(([id]) => id !== 'none').map(([id, o]) => {
      const have = owned.has(id), eq = me.outfit === id, afford = avail >= o.price;
      return `<div class="item ${eq ? 'eq' : ''}">
        ${av({ ...me, outfit: id }, 84)}<b>${esc(outfitName(id, me.gender))}</b>
        ${have ? (eq ? '<small class="ok">Portée ✓</small>' : `<button class="mini ok" data-action="equip" data-id="${id}">Porter</button>`)
          : `<button class="mini ${afford ? 'ok' : ''}" data-action="buy" data-id="${id}" ${afford ? '' : 'disabled'}>${o.price} 🪙</button>`}
      </div>`;
    }).join('')}</div>`;
}

/* =========================================================
   Événements (délégation)
   ========================================================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, tab, d, v, seg } = el.dataset;
  const task = id ? state.tasks.find((t) => t.id === Number(id)) : null;
  const s = state.sheet;
  switch (action) {
    case 'pick':
      state.me = state.members.find((m) => m.id === Number(id));
      store.set('coloc-me', String(state.me.id));
      render(); syncSub(); checkNewResults(); render(); break;
    case 'switch': state.me = null; state.tab = 'tasks'; state.sheet = null; render(); break;
    case 'tab': state.tab = tab; state.sheet = null; render(); window.scrollTo(0, 0); break;
    case 'week': state.weekOffset = Math.max(-WEEKS_BACK, Math.min(WEEKS_AHEAD, state.weekOffset + Number(d))); render(); break;
    case 'cell': state.sheet = { type: 'task', week: el.dataset.week, kind: el.dataset.kind, day: Number(el.dataset.day), mode: 'auto' }; render(); break;
    case 'open': if (task) { state.sheet = { type: 'task', week: task.week, kind: task.kind, day: task.day_index, mode: el.dataset.mode }; render(); } break;
    case 'close': if (e.target === el) { state.sheet = null; render(); } break;
    case 'do': if (task) act(task, 'done'); break;
    case 'skip': if (task) act(task, 'skipped'); break;
    case 'undo': if (task) act(task, 'todo'); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
    // --- Toi : personnage et boutique ---
    case 'seg': state.meSeg = seg; render(); break;
    case 'gender': saveProfile({ gender: v }); break;
    case 'skin': saveProfile({ skin: v }); break;
    case 'hair': saveProfile({ hair: v }); break;
    case 'equip': if (ownedBy(state.me.id).has(id)) saveProfile({ outfit: id }); break;
    case 'buy': if (OUTFITS[id]) { state.sheet = { type: 'buy', item: id }; render(); } break;
    case 'buy-confirm': doBuy(); break;
    // --- Jeux ---
    case 'duel-new': {
      const max = Math.min(availableOf(state.me.id), balanceOf(Number(id)));
      state.sheet = { type: 'duel-new', opp: Number(id), wager: Math.max(1, Math.min(10, max)), move: null }; render(); break;
    }
    case 'wager': if (s?.type === 'duel-new') { s.wager = Number(v); render(); } break;
    case 'pick-move': if (s) { s.move = v; render(); } break;
    case 'duel-send': sendDuel(); break;
    case 'duel-open': state.sheet = { type: 'duel-play', duelId: Number(id), move: null }; render(); break;
    case 'duel-play': playDuelNow(); break;
    case 'duel-cancel': cancelDuelNow(Number(id)); break;
  }
});
// Saisie libre de la mise (on ne redessine pas pour ne pas perdre le focus)
document.addEventListener('input', (e) => {
  if (e.target.dataset?.input === 'wager' && state.sheet?.type === 'duel-new') state.sheet.wager = e.target.value;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) { state.sheet = null; render(); } });

render();
init();
