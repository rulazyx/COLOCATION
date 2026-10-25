import {
  CONFIG, TASK_KINDS, TASK_TEMPLATES, ALLOW_EARLY_VALIDATION, participants, pickAssignee, levelOf, levelProgress, XP_RULES,
  SKIN_COLORS, HAIR_COLORS, BG_COLORS, OUTFITS, MOVES, DAILY_COINS, WHEEL_MIN, WHEEL_MAX, MAIN_QUEST,
} from './config.js';
import { avatarSVG } from './avatar.js';
import { makeCloudApi, makeDemoApi } from './api.js';
import { CHALLENGES, challengeByKey, rewardOf, titleOf, BOARDS, ranking, leaderOf, firstPlaces, fmtValue, fmtTime, weekRanking, weekWinners } from './challenges.js';

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
   État + chargement
   ========================================================= */
const state = {
  api: null, members: [], me: null, tasks: [], products: [], scores: [], balances: [], purchases: [], duels: [],
  stats: [], duelStats: [], unlocks: [], views: [], xp: [], weekly: [], requests: [], tasksSeg: 'plan', levelUps: [],
  tab: 'tasks', weekOffset: 0, meSeg: 'profil', board: 'all', opp: null, sheet: null, error: null, initials: {},
  game: null, won: [], dailyDismissed: false, viewedNow: new Set(),
};
const memberById = (id) => state.members.find((m) => m.id === id);
const nameOf = (id) => memberById(id)?.name ?? '?';
const balanceOf = (id) => state.balances.find((b) => b.member_id === id)?.coins ?? 0;
const pendingWagerOf = (id) => state.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
const availableOf = (id) => balanceOf(id) - pendingWagerOf(id);
const xpOf = (id) => state.xp.find((x) => x.member_id === id)?.xp ?? 0;
const lvlOf = (id) => levelOf(xpOf(id));
const colocs = () => state.members.filter((m) => m.kind !== 'copain');
const copains = () => state.members.filter((m) => m.kind === 'copain');
// Apparences débloquées : celles gagnées par défi + celles dont le niveau est atteint
const ownedBy = (id) => new Set(['none',
  ...state.purchases.filter((p) => p.member_id === id).map((p) => p.item),
  ...Object.entries(OUTFITS).filter(([, o]) => o.level && o.level <= lvlOf(id)).map(([k]) => k)]);
const statsOf = (id) => state.stats.find((x) => x.member_id === id) ?? {};
const keyed = (arr, f = (x) => x) => Object.fromEntries(arr.map((x) => [x.member_id, f(x)]));
// Tout ce qu'il faut pour calculer classements et défis (voir challenges.js)
function makeCtx() {
  const me = state.me.id;
  return {
    meId: me, members: state.members, stats: keyed(state.stats), scores: keyed(state.scores),
    balances: keyed(state.balances, (b) => b.coins), wins: keyed(state.duelStats, (d) => d.wins), xp: keyed(state.xp, (x) => x.xp),
    duels: state.duels, tasks: state.tasks, owned: ownedBy(me),
    viewed: new Set(state.views.filter((v) => v.viewer_id === me).map((v) => v.viewed_id)),
    today: iso(new Date()),
  };
}
const currentWeek = () => iso(mondayOf());
const weeksWon = (id) => weekWinners(state.members, state.weekly, currentWeek()).filter((w) => w.winners.includes(id)).length;
const unlockedKeys = (id) => new Set(state.unlocks.filter((u) => u.member_id === id).map((u) => u.key));
const titleLabel = (m) => (m?.title ? titleOf(m.title) : null);
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

async function refresh(force = false) {
  // Pendant une partie, on ne redessine pas l'appli en dessous (ça fait ramer le jeu) : on rattrape à la fermeture
  if (state.game && !force) { state.pendingRefresh = true; return; }
  if (state.sheet?.type === 'wheel' && state.sheet.spinning && !state.sheet.revealed) { state.sheet.pending = true; return; }
  const m0 = mondayOf();
  [state.members, state.tasks, state.scores, state.balances, state.products, state.purchases, state.duels,
    state.stats, state.duelStats, state.unlocks, state.views, state.xp, state.weekly, state.requests] = await Promise.all([
    state.api.members(),
    state.api.tasks(iso(addDays(m0, -7 * WEEKS_BACK)), iso(addDays(m0, 7 * WEEKS_AHEAD))),
    state.api.scores(), state.api.balances(), state.api.products(), state.api.purchases(), state.api.duels(),
    state.api.stats(), state.api.duelStats(), state.api.unlocks(), state.api.views(), state.api.xp(), state.api.weekly(), state.api.requests(),
  ]);
  if (state.me) state.me = memberById(state.me.id) ?? null;
  state.initials = computeInitials(state.members);
  checkNewResults();
  checkLevelUp();
  render();
  autoClaim();
}

// Passage de niveau : on le fête une fois, avec les apparences débloquées
function checkLevelUp() {
  if (!state.me) return;
  const key = `coloc-level-${state.me.id}`, now = lvlOf(state.me.id);
  const seen = Number(store.get(key));
  if (!seen) { store.set(key, String(now)); return; }
  if (now > seen) {
    const skins = Object.entries(OUTFITS).filter(([, o]) => o.level && o.level > seen && o.level <= now).map(([k]) => k);
    state.levelUps.push({ level: now, skins });
    store.set(key, String(now));
  }
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
  let step = 'démarrage';
  const sp = (p) => window.splashProgress?.(p);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  try {
    const cloud = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    step = 'connexion'; sp(0.15);
    state.api = cloud ? await makeCloudApi() : makeDemoApi();
    state.members = await state.api.members(); sp(0.4);
    state.initials = computeInitials(state.members);
    const meId = Number(store.get('coloc-me'));
    state.me = state.members.find((m) => m.id === meId) || null;
    step = 'création des semaines (tasks)';
    const m0 = mondayOf();
    const rows = [];
    for (let i = 0; i <= WEEKS_AHEAD; i++) rows.push(...buildWeek(addDays(m0, 7 * i), state.members.filter((m) => m.kind !== 'copain')));
    await state.api.ensureWeeks(rows); sp(0.65);
    step = 'lecture des données (stats, défis…)';
    await refresh(); sp(1); window.splashDone?.();
    state.api.onChange(debounce(() => refresh().catch(() => {}), 250));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
    if (state.me) syncSub();
  } catch (e) {
    console.error(e);
    state.error = `${e.message || String(e)} [étape : ${step} · v6]`;
    render(); window.splashDone?.();
  }
}

/* =========================================================
   Actions
   ========================================================= */
// Change le statut d'une tâche : 'done' (+trophées, +XP) ou 'todo' (annulation). On ne saute plus : on propose à quelqu'un.
async function act(task, newStatus) {
  const patch = newStatus === 'done'
    ? { status: 'done', actor_id: state.me.id, coins: task.reward, acted_at: new Date().toISOString() }
    : { status: 'todo', actor_id: null, coins: 0, acted_at: null };
  const prev = { ...task };
  Object.assign(task, patch);
  state.sheet = null;
  render();
  try {
    const ok = await state.api.setStatus(task.id, prev.status, patch);
    if (!ok) { Object.assign(task, prev); toast("Cette tâche vient d'être modifiée par quelqu'un d'autre."); }
    else if (newStatus === 'done') toast(`Bravo ! +${task.reward} 🏆 · +${task.reward * XP_RULES.taskPerTrophy} XP`);
    else toast('Validation annulée.');
  } catch (e) {
    console.error(e);
    Object.assign(task, prev);
    toast('Erreur réseau, réessaie.');
  }
  refresh().catch(() => {});
}

// Proposer sa tâche à un colocataire (il peut accepter ou refuser)
async function proposeTo(taskId, to) {
  try {
    await state.api.createRequest(taskId, state.me.id, to);
    state.sheet = null;
    toast(`Demande envoyée à ${nameOf(to)}.`);
    await refresh();
  } catch (e) { toast(e.message || 'Impossible de proposer la tâche.'); }
}
async function answerRequest(id, accept, mineSent = false) {
  try {
    await state.api.answerRequest(id, state.me.id, accept);
    toast(mineSent ? 'Demande annulée.' : accept ? 'Tâche acceptée, elle est à toi !' : 'Demande refusée.');
    state.sheet = null;
    await refresh();
  } catch (e) { toast(e.message || 'Action impossible.'); refresh().catch(() => {}); }
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

async function questStep(n) {
  if (!state.me || (statsOf(state.me.id).quest_mask ?? 0) & (1 << (n - 1))) return;
  try { await state.api.questStep(state.me.id, n); await refresh(); } catch (e) { console.warn(e); }
}

async function saveProfile(patch) {
  questStep(1);
  Object.assign(state.me, patch);
  render();
  try { await state.api.updateProfile(state.me.id, patch); }
  catch (e) { console.error(e); toast("Impossible d'enregistrer ton personnage."); }
  refresh().catch(() => {});
}

async function sendDuel() {
  const s = state.sheet;
  if (!s.move) return toast('Choisis ton coup.');
  try {
    await state.api.createDuel(state.me.id, s.opp, 0, s.move); // chifoumi amical : toujours 0 trophée
    questStep(3);
    state.sheet = null;
    toast(`Défi envoyé à ${nameOf(s.opp)} !`);
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

/* ---------- Défis, récompense quotidienne, roue, jeux, profils ---------- */
let claiming = false;
// Vérifie les défis réussis et fait verser les récompenses par la base (une seule fois chacun)
async function autoClaim() {
  if (claiming || !state.me || !state.api) return;
  claiming = true;
  try {
    const have = unlockedKeys(state.me.id), ctx = makeCtx();
    const won = CHALLENGES.filter((c) => !have.has(c.key) && c.check(ctx).done);
    let got = 0;
    for (const c of won) {
      const r = await state.api.claimChallenge(state.me.id, c.key);
      if (r) { state.won.push(c.key); got++; }
    }
    if (got) { claiming = false; await refresh(); return; }
  } catch (e) { console.warn('défis :', e); }
  claiming = false;
}

const dailyDue = () => !!state.me && statsOf(state.me.id).last_login !== iso(new Date());
function nextStreak() {
  const s = statsOf(state.me.id);
  const y = iso(addDays(startOfToday(), -1));
  return s.last_login === y && s.streak < 7 ? s.streak + 1 : 1;
}
async function claimDailyNow() {
  try {
    const r = await state.api.claimDaily(state.me.id, iso(new Date()));
    state.sheet = { type: 'daily-done', ...r };
    await refresh();
  } catch (e) { state.sheet = null; toast(e.message || 'Impossible de récupérer la récompense.'); refresh().catch(() => {}); }
}
async function spinNow() {
  const s = state.sheet;
  if (!s || s.spinning) return;
  s.spinning = true; s.amount = null;
  try {
    const amount = await state.api.spinWheel(state.me.id);
    s.amount = amount;
    s.turns = (s.turns ?? 0) + 5 + Math.random();
    render();
    setTimeout(() => { s.revealed = true; if (state.sheet === s) render(); refresh().catch(() => {}); }, 4300);
  } catch (e) { s.spinning = false; toast(e.message || 'La roue est indisponible.'); render(); }
}

async function saveTitle(key) { await saveProfile({ title: key || null }); }

async function openProfile(id) {
  state.sheet = { type: 'profile', id };
  render();
  if (id !== state.me.id && !state.views.some((v) => v.viewer_id === state.me.id && v.viewed_id === id) && !state.viewedNow.has(id)) {
    state.viewedNow.add(id);
    try { await state.api.viewProfile(state.me.id, id); await refresh(); } catch (e) { console.warn(e); }
  }
}

// Les jeux vivent dans une couche à part (hors de #app) pour que les rafraîchissements ne les interrompent pas
const GAMES = {
  flappy: { name: 'Coucou', emoji: '🐤', mod: './games/flappy.js', board: 'flappy', blurb: 'Bats des ailes entre les colonnes' },
  raid:   { name: 'Le Grand Raid', emoji: '🏃', mod: './games/raid.js', board: 'raid', blurb: 'Course sans fin sur la plage' },
  sudoku: { name: 'Sudoku', emoji: '🔢', mod: './games/sudoku.js', board: 'sudoku', blurb: 'Contre la montre' },
};
let gameHandle = null;
async function openGame(id) {
  const G = GAMES[id];
  if (!G || state.game) return;
  questStep(3);
  state.game = id; state.sheet = null; render();
  const layer = document.createElement('div');
  layer.id = 'gamelayer'; layer.className = 'gamelayer';
  layer.innerHTML = `<div class="ghead"><button class="chip" data-gact="close" aria-label="Retour">‹</button><b>${G.emoji} ${esc(G.name)}</b><span class="gbest"></span></div><div class="gbody"></div>`;
  document.body.appendChild(layer);
  layer.addEventListener('click', (e) => { if (e.target.closest('[data-gact="close"]')) closeGame(); });
  const bestEl = layer.querySelector('.gbest');
  const showBest = () => {
    const st = statsOf(state.me.id);
    bestEl.textContent = id === 'sudoku' ? (st.sudoku_best ? `Record ${fmtTime(st.sudoku_best)}` : '')
      : id === 'raid' ? `Record ${st.raid_best || 0} m` : `Record ${st.flappy_best || 0}`;
  };
  showBest();
  try {
    const mod = await import(G.mod);
    gameHandle = mod.mount(layer.querySelector('.gbody'), {
      async onEnd({ score }) {
        try {
          await state.api.reportGame(state.me.id, id, score);
          await refresh(true); showBest();
        } catch (e) { console.error(e); toast("Score non enregistré : " + (e.message || 'erreur réseau')); }
      },
    });
  } catch (e) { console.error(e); toast('Impossible de charger ce jeu.'); closeGame(); }
}
function closeGame() {
  try { gameHandle?.destroy(); } catch { /* rien */ }
  gameHandle = null;
  document.getElementById('gamelayer')?.remove();
  state.game = null;
  if (state.pendingRefresh) { state.pendingRefresh = false; refresh().catch(() => {}); } else render();
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
    const btn = (m) => `<button data-action="pick" data-id="${m.id}">${esc(m.name)}</button>`;
    app.innerHTML = `<div class="pick"><h1>🏠 Coloc</h1><p>Qui es-tu ?</p>${colocs().map(btn).join('')}
      ${copains().length ? `<h3 class="sec" style="text-align:center">Copains</h3>${copains().map(btn).join('')}` : ''}</div>`;
    return;
  }
  const reqForMe = state.requests.filter((r) => r.status === 'pending' && r.to_id === state.me.id).length;
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
      ${tab === 'tasks' ? tasksHTML() : tab === 'quests' ? questsHTML() : tab === 'games' ? gamesHTML() : tab === 'rank' ? rankHTML() : meHTML()}
    </main>
    <nav class="tabs">
      <button data-action="tab" data-tab="tasks" class="${tab === 'tasks' ? 'active' : ''}"><span class="ico">🧹</span>Tâches${badge(reqForMe)}</button>
      <button data-action="tab" data-tab="quests" class="${tab === 'quests' ? 'active' : ''}"><span class="ico">🧭</span>Quêtes</button>
      <button data-action="tab" data-tab="games" class="${tab === 'games' ? 'active' : ''}"><span class="ico">🎮</span>Jeux${badge(duelsForMe)}</button>
      <button data-action="tab" data-tab="rank" class="${tab === 'rank' ? 'active' : ''}"><span class="ico">🥇</span>Classement</button>
      <button data-action="tab" data-tab="me" class="${tab === 'me' ? 'active' : ''}"><span class="ico">👤</span>Toi${badge(statsOf(state.me.id).wheel_ready ? 1 : 0, 'var(--accent)')}</button>
    </nav>
    ${sheetHTML()}`;
}

/* ---------- Onglet 1 : tâches (planning, mes prochaines tâches, stocks) ---------- */
function tasksHTML() {
  const out = state.products.filter((p) => p.out_of_stock).length;
  const seg = state.tasksSeg;
  return `<div class="seg" style="margin-bottom:12px">${[['plan', '📅 Planning'], ['stock', `🛒 Stocks${out ? ` (${out})` : ''}`]].map(([k, l]) =>
    `<button class="${seg === k ? 'on' : ''}" data-action="tseg" data-v="${k}">${l}</button>`).join('')}</div>
    ${seg === 'stock' ? stockHTML() : `${requestsHTML()}${planningHTML()}${upcomingHTML()}`}`;
}

// Demandes d'échange reçues : « X te propose cette tâche »
function requestsHTML() {
  const mine = state.requests.filter((r) => r.status === 'pending' && r.to_id === state.me.id);
  if (!mine.length) return '';
  return `<h3 class="sec" style="margin-top:0">🙋 Demandes reçues</h3>${mine.map((r) => {
    const t = state.tasks.find((x) => x.id === r.task_id);
    if (!t) return '';
    const K = TASK_KINDS[t.kind] ?? { emoji: '🧹', color: '#888' };
    return `<div class="up" style="--c:${K.color}"><div class="dot">${K.emoji}</div>
      <div class="txt"><b>${esc(nameOf(r.from_id))} te propose : ${esc(t.label)}</b><small>${relDay(taskDate(t))} · +${t.reward} 🏆</small></div>
      <button class="mini ok" data-action="req-accept" data-id="${r.id}">Accepter</button>
      <button class="mini" data-action="req-decline" data-id="${r.id}">Refuser</button></div>`;
  }).join('')}`;
}

// Mes prochaines tâches (avant dans « Toi »)
function myUpcoming() {
  const limit = addDays(startOfToday(), -7);
  return state.tasks
    .filter((t) => t.assignee_id === state.me.id && t.status === 'todo' && taskDate(t) >= limit)
    .sort((a, b) => taskDate(a) - taskDate(b) || a.slot - b.slot);
}
function upcomingHTML() {
  const up = myUpcoming();
  const today = startOfToday();
  const sentFor = (t) => state.requests.find((r) => r.task_id === t.id && r.status === 'pending' && r.from_id === state.me.id);
  return `<h3 class="sec">Mes prochaines tâches</h3>
    ${up.length ? up.map((t) => {
      const K = TASK_KINDS[t.kind] ?? { emoji: '🧹', color: '#888' };
      const d = taskDate(t);
      const late = d < today;
      const req = sentFor(t);
      return `<div class="up" style="--c:${K.color}">
        <div class="dot">${K.emoji}</div>
        <div class="txt"><b>${esc(t.label)}</b><small class="${late ? 'late' : ''}">${late ? 'En retard · ' : ''}${relDay(d)}${relDay(d).includes(' ') ? '' : ' · ' + fmtDay(d)} · +${t.reward} 🏆</small>
          ${req ? `<small>⏳ Proposée à ${esc(nameOf(req.to_id))}</small>` : ''}</div>
        <button class="mini ok" data-action="open" data-id="${t.id}" data-mode="done">Fait</button>
        ${req ? `<button class="mini" data-action="req-cancel" data-id="${req.id}">Annuler</button>`
          : `<button class="mini" data-action="propose" data-id="${t.id}">Proposer</button>`}
      </div>`;
    }).join('') : '<div class="empty-msg" style="padding:20px 0">Rien à faire pour le moment 🎉</div>'}`;
}

/* ---------- Onglet Quêtes (bientôt) ---------- */
function questsHTML() {
  const mask = statsOf(state.me.id).quest_mask ?? 0;
  const q = MAIN_QUEST, got = q.steps.filter((x) => mask & (1 << (x.n - 1))).length, done = got === q.steps.length;
  return `<div class="quest ${done ? 'done' : ''}">
    <div class="q-head"><span class="q-ico">${q.emoji}</span><div><small>Quête principale</small><h2>${esc(q.title)}</h2></div><b class="q-count">${got}/${q.steps.length}</b></div>
    <div class="lvlbar"><i style="width:${got / q.steps.length * 100}%"></i></div>
    <ol class="q-steps">${q.steps.map((x) => { const ok = mask & (1 << (x.n - 1));
      return `<li class="${ok ? 'ok' : ''}"><button data-action="tab" data-tab="${x.tab}" ${ok ? 'disabled' : ''}><span class="q-n">${ok ? '✓' : x.n}</span><span>Étape ${x.n} : ${esc(x.text)}</span><em>${x.emoji}</em></button></li>`; }).join('')}</ol>
    ${done ? '<p class="q-end">🎉 Quête terminée ! Le défi « Le noob » est à toi.</p>' : ''}
  </div>`;
}

/* ---------- Planning : tableau de la semaine ---------- */
function groupTasks(list, kind, day) { return list.filter((t) => t.kind === kind && t.day_index === day); }

function planningHTML() {
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

// Feuille affichée : celle ouverte à la main, sinon (hors jeu) les défis réussis, sinon la récompense du jour
function currentSheet() {
  if (state.sheet) return state.sheet;
  if (state.game || !state.me) return null;
  if (state.won.length) return { type: 'won' };
  if (state.levelUps.length) return { type: 'levelup' };
  if (dailyDue() && !state.dailyDismissed) return { type: 'daily' };
  return null;
}
function closeSheet() {
  if (state.sheet) state.sheet = null;
  else if (state.won.length) state.won = [];
  else if (state.levelUps.length) state.levelUps = [];
  else state.dailyDismissed = true;
  render();
}

function sheetHTML() {
  const s = currentSheet();
  if (!s) return '';
  switch (s.type) {
    case 'profile': return profileSheetHTML(s);
    case 'won': return wonSheetHTML();
    case 'daily': return dailySheetHTML();
    case 'daily-done': return dailyDoneHTML(s);
    case 'wheel': return wheelSheetHTML(s);
    case 'task': return taskSheetHTML(s);
    case 'propose': return proposeSheetHTML(s);
    case 'levelup': return levelUpSheetHTML();
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
  const title = s.mode === 'done' ? 'Valider cette tâche ?' : esc(t0.label);

  const rows = g.map((t) => {
    const mine = t.assignee_id === state.me.id;
    let status = 'À faire';
    if (t.status === 'done') status = `✅ Faite par ${esc(t.actor_id === state.me.id ? 'toi' : nameOf(t.actor_id))} · +${t.coins} 🏆`;
    if (t.status === 'skipped') status = `↷ Sautée par ${esc(t.actor_id === state.me.id ? 'toi' : nameOf(t.actor_id))}`;
    const pend = state.requests.find((r) => r.task_id === t.id && r.status === 'pending');
    if (pend && t.status === 'todo') status = `⏳ Proposée à ${esc(nameOf(pend.to_id))}`;

    let actions = '';
    if (t.status === 'todo' && (mine || !multi)) {
      const doneBtn = `<button class="btn primary" data-action="do" data-id="${t.id}" ${early ? 'disabled' : ''}>${
        early ? `Validable ${esc(relDay(date).toLowerCase())}` : mine ? `✅ C'est fait · +${t.reward} 🏆` : `✅ Je l'ai faite à sa place · +${t.reward} 🏆`}</button>`;
      const swapBtn = !mine ? '' : pend
        ? `<button class="btn" data-action="req-cancel" data-id="${pend.id}">Annuler la demande</button>`
        : `<button class="btn" data-action="propose" data-id="${t.id}">🙋 Proposer à quelqu'un d'autre</button>`;
      actions = doneBtn + swapBtn;
    } else if (t.status !== 'todo' && t.actor_id === state.me.id) {
      actions = `<button class="btn" data-action="undo" data-id="${t.id}">Annuler (retire les trophées et l'XP)</button>`;
    }
    return `<div class="srow"><div class="swho"><b>${mine ? 'Toi' : esc(nameOf(t.assignee_id))}</b><small>${status}</small></div>${actions ? `<div class="sact">${actions}</div>` : ''}</div>`;
  }).join('');

  return sheetWrap(`
      <div class="sh"><div class="badge-k">${K.emoji}</div>
        <div><h2>${title}</h2><div class="when">${s.mode === 'auto' ? `${DAYS[t0.day_index]} ${date.getDate()} ${MONTHS[date.getMonth()]}` : `${esc(t0.label)} · ${relDay(date)}`}</div></div>
        ${closeBtn}</div>
      <div class="det">${esc(t0.detail)}</div>
      <div class="reward">Récompense : +${t0.reward} 🏆 · +${t0.reward * XP_RULES.taskPerTrophy} XP${multi ? ' par personne (tâche pour tous)' : ''}</div>
      ${rows}`, K.color);
}

function proposeSheetHTML(s) {
  const t = state.tasks.find((x) => x.id === s.taskId);
  if (!t) return '';
  const K = TASK_KINDS[t.kind] ?? { emoji: '🧹', color: '#888' };
  const others = colocs().filter((m) => m.id !== state.me.id);
  const holds = (m) => state.tasks.some((x) => x.week === t.week && x.slot === t.slot && x.assignee_id === m.id);
  return sheetWrap(`
    <div class="sh"><div class="badge-k">${K.emoji}</div><div><h2>Proposer cette tâche</h2>
      <div class="when">${esc(t.label)} · ${relDay(taskDate(t))}</div></div>${closeBtn}</div>
    <div class="det">À qui veux-tu la proposer ? Elle ne change de main que s'il ou elle accepte.</div>
    ${others.map((m) => `<button class="up pickrow" data-action="propose-to" data-id="${t.id}" data-to="${m.id}" ${holds(m) ? 'disabled' : ''}>
      <span class="mini-av">${av(m, 44)}</span><span class="txt"><b>${esc(m.name)}</b><small>${holds(m) ? 'a déjà cette tâche' : `Niveau ${lvlOf(m.id)}`}</small></span></button>`).join('')}`, K.color);
}

function levelUpSheetHTML() {
  const l = state.levelUps[state.levelUps.length - 1];
  const p = levelProgress(xpOf(state.me.id));
  return sheetWrap(`
    <div class="sh"><div><h2>⭐ Niveau ${l.level} !</h2><div class="when">Bravo ${esc(state.me.name)}, tu montes en niveau</div></div>${closeBtn}</div>
    ${l.skins.length ? `<div class="det">Nouveau${l.skins.length > 1 ? 'x' : ''} personnage${l.skins.length > 1 ? 's' : ''} débloqué${l.skins.length > 1 ? 's' : ''} :</div>
      <div class="shop" style="margin-top:8px">${l.skins.map((k) => `<div class="item">${av({ ...state.me, outfit: k }, 84)}<b>${esc(outfitName(k, state.me.gender))}</b></div>`).join('')}</div>` : '<div class="det">Continue comme ça pour débloquer de nouveaux personnages.</div>'}
    <div class="det">Prochain niveau dans ${p.need - p.into} XP.</div>
    <div class="sact"><button class="btn primary" data-action="close">Super !</button></div>`, 'var(--gold)');
}

function movePicker(selected) {
  return `<div class="moves">${Object.entries(MOVES).map(([k, m]) => `
    <button class="move ${selected === k ? 'sel' : ''}" data-action="pick-move" data-v="${k}" aria-pressed="${selected === k}"><span>${m.emoji}</span><small>${m.label}</small></button>`).join('')}</div>`;
}

function duelNewHTML(s) {
  const opp = memberById(s.opp);
  if (!opp) return '';
  const me = state.me;
  return sheetWrap(`
    <div class="sh"><div class="vs-av">${av(me, 54)}<b>⚔️</b>${av(opp, 54)}</div>
      <div><h2>Défier ${esc(opp.name)}</h2><div class="when">Chifoumi · défi amical à 0 🏆</div></div>${closeBtn}</div>
    <div class="det">Choisis ton coup (ton adversaire ne le verra pas)</div>
    ${movePicker(s.move)}
    <div class="sact" style="margin-top:14px"><button class="btn primary" data-action="duel-send" ${s.move ? '' : 'disabled'}>⚔️ Lancer le défi</button></div>`);
}

function duelPlayHTML(s) {
  const d = state.duels.find((x) => x.id === s.duelId);
  if (!d || d.status !== 'pending') return '';
  const ch = memberById(d.challenger_id);
  return sheetWrap(`
    <div class="sh"><div class="vs-av">${av(ch, 54)}<b>⚔️</b>${av(state.me, 54)}</div>
      <div><h2>${esc(ch?.name)} te défie !</h2><div class="when">${d.wager ? `Mise : ${d.wager} 🏆 · si tu perds, −${d.wager} 🏆` : 'Défi amical · 0 🏆'}</div></div>${closeBtn}</div>
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
  const detail = tie ? (d.wager ? 'Personne ne gagne ni ne perd de trophées.' : 'Égalité, on recommence ?')
    : won ? (d.wager ? `Tu gagnes +${d.wager} 🏆 contre ${esc(other?.name)}` : `Tu bats ${esc(other?.name)} !`)
    : (d.wager ? `Tu perds −${d.wager} 🏆 contre ${esc(other?.name)}` : `${esc(other?.name)} gagne cette fois.`);
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

/* ---------- Onglet 3 : jeux ---------- */
function gamesHTML() {
  const me = state.me;
  const received = pendingForMe();
  const sent = state.duels.filter((d) => d.status === 'pending' && d.challenger_id === me.id);
  const hist = state.duels.filter((d) => d.status === 'done').slice(0, 8);
  const others = state.members.filter((m) => m.id !== me.id);
  if (!others.some((m) => m.id === state.opp)) state.opp = others[0]?.id ?? null;
  const st = statsOf(me.id);
  const wins = state.duelStats.find((d) => d.member_id === me.id)?.wins ?? 0;
  const best = { flappy: `Record : ${st.flappy_best || 0}`, raid: `Record : ${st.raid_best || 0} m`, sudoku: st.sudoku_best ? `Record : ${fmtTime(st.sudoku_best)}` : 'Pas encore terminé' };

  return `
    ${received.length ? `<h3 class="sec" style="margin-top:0">Défis reçus</h3>${received.map((d) => {
      const ch = memberById(d.challenger_id);
      return `<div class="up"><div class="mini-av">${av(ch, 44)}</div>
        <div class="txt"><b>${esc(ch?.name)} te défie</b><small>Chifoumi${d.wager ? ` · mise : ${d.wager} 🏆` : ' · amical'}</small></div>
        <button class="mini ok" data-action="duel-open" data-id="${d.id}">Relever</button>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Refuser</button></div>`;
    }).join('')}` : ''}

    <div class="tiles">
      <div class="tile chif">
        <div class="tico">✊✋✌️</div><b>Chifoumi</b>
        <small>Défi amical à 0 🏆 · ${wins} victoire${wins > 1 ? 's' : ''}</small>
        <select class="dd" data-input="opp" aria-label="Adversaire">${others.map((m) => `<option value="${m.id}" ${m.id === state.opp ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <button class="mini ok" data-action="duel-new" ${others.length ? '' : 'disabled'}>⚔️ Défier</button>
      </div>
      ${Object.entries(GAMES).map(([id, g]) => `
        <button class="tile" data-action="game" data-id="${id}">
          <div class="tico">${g.emoji}</div><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small><span class="rec">${best[id]}</span>
        </button>`).join('')}
    </div>

    ${sent.length ? `<h3 class="sec">Mes défis en attente</h3>${sent.map((d) => `
      <div class="up"><div class="mini-av">${av(memberById(d.opponent_id), 44)}</div>
        <div class="txt"><b>En attente de ${esc(nameOf(d.opponent_id))}</b><small>${d.wager ? `Mise : ${d.wager} 🏆 · ` : ''}ton coup est secret</small></div>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Annuler</button></div>`).join('')}` : ''}

    <h3 class="sec">Derniers duels</h3>
    ${hist.length ? hist.map((d) => {
      const ch = memberById(d.challenger_id), op = memberById(d.opponent_id);
      const w = d.winner_id ? nameOf(d.winner_id) : null;
      const mineD = d.challenger_id === me.id || d.opponent_id === me.id;
      return `<div class="up hist ${mineD ? 'mine' : ''}"><div class="vs-av">${av(ch, 38)}${av(op, 38)}</div>
        <div class="txt"><b>${esc(ch?.name)} ${moveEmoji(d.challenger_move)} vs ${moveEmoji(d.opponent_move)} ${esc(op?.name)}</b>
        <small>${w ? `${esc(w)} gagne${d.wager ? ` ${d.wager} 🏆` : ''}` : 'Égalité'}</small></div></div>`;
    }).join('') : '<div class="empty-msg" style="padding:16px 0">Aucun duel pour l\'instant. Lance le premier !</div>'}`;
}

/* ---------- Onglet Toi ---------- */
function meHTML() {
  const me = state.me;
  const seg = state.meSeg;
  const n = unlockedKeys(me.id).size;
  const p = levelProgress(xpOf(me.id));
  const mine = state.scores.find((s) => s.member_id === me.id) ?? { done_count: 0 };
  return `
    <section class="hero2">
      <div class="avwrap">${av(me, 88)}</div>
      <div class="hmain"><div class="lvl">⭐ Niveau ${p.level}</div>
        <div class="bar sm lvlbar"><i style="width:${p.pct}%"></i></div>
        <div class="sub">${xpOf(me.id)} XP · encore ${p.need - p.into} pour le niveau ${p.level + 1}</div>
        <div class="sub"><b>${balanceOf(me.id)} 🏆</b> trophées · ${mine.done_count} tâche${mine.done_count > 1 ? 's' : ''} faite${mine.done_count > 1 ? 's' : ''}</div></div>
    </section>
    <div class="seg">${[['profil', 'Profil'], ['perso', 'Perso'], ['defis', `Défis ${n}/${CHALLENGES.length}`]].map(([k, l]) =>
      `<button class="${seg === k ? 'on' : ''}" data-action="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    ${seg === 'perso' ? persoHTML() : seg === 'defis' ? defisHTML() : profilTabHTML()}`;
}

// Cases de statistiques d'un profil (le tien ou celui d'un autre)
function statGrid(m) {
  const st = statsOf(m.id);
  const chores = state.scores.find((x) => x.member_id === m.id)?.done_count ?? 0;
  const wins = state.duelStats.find((x) => x.member_id === m.id)?.wins ?? 0;
  const cells = [
    ['⭐', 'Niveau', lvlOf(m.id)], ['🏆', 'Trophées', balanceOf(m.id)], ['🧹', 'Tâches faites', chores], ['✊', 'Victoires chifoumi', wins],
    ['🐤', 'Coucou', st.flappy_best || 0], ['🏃', 'Grand Raid', `${st.raid_best || 0} m`],
    ['🔢', 'Sudoku', st.sudoku_best ? fmtTime(st.sudoku_best) : '—'],
    ['👑', 'Semaines gagnées', weeksWon(m.id)],
  ];
  return `<div class="stgrid">${cells.map(([e, l, v]) => `<div class="stc"><span>${e}</span><b>${esc(v)}</b><small>${l}</small></div>`).join('')}</div>`;
}

// Réglages du profil : couleur de fond, titre affiché
function profileEdit(m) {
  const unlocked = CHALLENGES.filter((c) => unlockedKeys(m.id).has(c.key));
  return `
    <h3 class="sec">Couleur de fond</h3>
    <div class="swatches">${BG_COLORS.map((c) => `<button class="sw ${(m.bg ?? BG_COLORS[0]).toLowerCase() === c ? 'sel' : ''}" style="background:${c}" data-action="bg" data-v="${c}" aria-label="Fond ${c}"></button>`).join('')}</div>
    <h3 class="sec">Titre affiché</h3>
    <select class="dd" data-input="title" aria-label="Titre affiché">
      <option value="">Aucun titre</option>
      ${unlocked.map((c) => `<option value="${c.key}" ${m.title === c.key ? 'selected' : ''}>${c.emoji} ${esc(c.title)}</option>`).join('')}
    </select>
    ${unlocked.length ? '' : '<div class="det">Réussis un défi pour débloquer ton premier titre.</div>'}`;
}

function profilTabHTML() {
  const me = state.me;
  const viewed = new Set(state.views.filter((v) => v.viewer_id === me.id).map((v) => v.viewed_id));
  const faces = (list) => `<div class="faces">${list.map((m) => `<button class="face" data-action="profile" data-id="${m.id}">${av(m, 56)}<small>${esc(m.name)}${viewed.has(m.id) ? '' : ' •'}</small></button>`).join('')}</div>`;
  const cl = colocs().filter((m) => m.id !== me.id), co = copains().filter((m) => m.id !== me.id);
  return `
    ${statsOf(me.id).wheel_ready ? `<button class="wheelban" data-action="wheel">🎡 Ta roue de la fortune est prête ! <b>Tourner</b></button>` : ''}
    <div class="center-av">${av(me, 120)}</div>
    <div class="pname"><b>${esc(me.name)}</b>${titleLabel(me) ? `<span class="ptitle">${esc(titleLabel(me))}</span>` : ''}${me.kind === 'copain' ? '<span class="ptitle">Copain</span>' : ''}</div>
    ${statGrid(me)}
    ${profileEdit(me)}
    <button class="btn" style="margin-top:14px" data-action="seg" data-seg="perso">🎭 Changer de personnage</button>

    <h3 class="sec">Les colocs</h3>${faces(cl)}
    ${co.length ? `<h3 class="sec">Les copains</h3>${faces(co)}` : ''}

    <button class="link" data-action="switch">Changer de prénom (actuellement ${esc(me.name)})</button>`;
}

function defisHTML() {
  const ctx = makeCtx();
  const have = unlockedKeys(state.me.id);
  const rows = CHALLENGES.map((c) => ({ c, p: c.check(ctx), done: have.has(c.key) }));
  rows.sort((a, b) => Number(b.done) - Number(a.done));
  const rewardTxt = (c) => {
    const r = rewardOf(c.key);
    return [r.coins ? `+${r.coins} 🏆` : '', r.skin ? `🎭 ${outfitName(r.skin, state.me.gender)}` : ''].filter(Boolean).join(' · ');
  };
  return `
    <p class="summary">Chaque défi réussi débloque un <b>titre</b> à afficher sur ton profil, parfois des trophées ou un personnage.</p>
    ${rows.map(({ c, p, done }) => `
      <div class="chal ${done ? 'done' : ''}">
        <div class="cemo">${done ? c.emoji : '🔒'}</div>
        <div class="ctxt"><b>${esc(c.title)}</b><small>${esc(c.desc)}${c.hint ? ` <i>${esc(c.hint)}</i>` : ''}</small>
          ${done ? '' : `<div class="bar sm"><i style="width:${(p.value / p.goal) * 100}%"></i></div><small class="cp">${p.value} / ${p.goal}</small>`}
          ${rewardTxt(c) ? `<span class="crew">${rewardTxt(c)}</span>` : ''}</div>
        ${done ? `<button class="mini ${state.me.title === c.key ? 'ok' : ''}" data-action="title" data-id="${c.key}">${state.me.title === c.key ? 'Affiché' : 'Afficher'}</button>` : ''}
      </div>`).join('')}`;
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
    <h3 class="sec">À débloquer</h3>
    <div class="shop">${Object.entries(OUTFITS).filter(([id]) => id !== 'none' && !owned.has(id)).map(([id, o]) => `
      <div class="item locked">
        ${av({ ...me, outfit: id }, 76)}<b>${esc(outfitName(id, me.gender))}</b><small>${o.level ? `Niveau ${o.level}` : `Défi : ${esc(titleOf(o.challenge) ?? '?')}`}</small></div>`).join('') || '<div class="det" style="grid-column:1/-1">Tu as tout débloqué 🎉</div>'}</div>`;
}

/* ---------- Onglet Classement ---------- */
const MEDALS = ['🥇', '🥈', '🥉'];
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
function rankHTML() {
  const ctx = makeCtx();
  const me = state.me;
  const sel = state.board;
  const chips = [['all', '📊', 'Résumé'], ['week', '📅', 'Semaine'], ...BOARDS.map((b) => [b.key, b.emoji, b.label.replace(' (meilleur temps)', '')])];
  const bar = `<div class="chipbar">${chips.map(([k, e, l]) => `<button class="pill ${sel === k ? 'sel' : ''}" data-action="board" data-v="${k}">${e} ${esc(l)}</button>`).join('')}</div>`;

  if (sel === 'week') return `${bar}${weekHTML()}`;
  if (sel === 'all') {
    const wk = weekRanking(state.members, state.weekly, currentWeek());
    const wtop = wk[0]?.rank === 1 ? wk[0] : null;
    return `${bar}
      <button class="bcard" data-action="board" data-v="week">
        <div class="bh"><span>📅</span><b>Classement de la semaine</b></div>
        ${wtop ? `<div class="bl"><span class="rav">${av(memberById(wtop.id), 38)}</span><span class="nm">👑 ${esc(wtop.name)}${wk[1]?.rank === 1 ? ' <small>(ex æquo)</small>' : ''}</span><span class="pts">${wtop.value} 🏆</span></div>`
          : '<div class="bl muted">Personne n\'a encore de trophée cette semaine</div>'}
        <small class="muted">Trophées gagnés du lundi au dimanche</small>
      </button>
      <p class="summary">Touche une carte pour voir le classement complet.</p>
      ${BOARDS.map((b) => {
        const r = ranking(ctx, b);
        const top = r[0]?.rank === 1 ? r[0] : null;
        const mine = r.find((x) => x.id === me.id);
        const m = top && memberById(top.id);
        return `<button class="bcard" data-action="board" data-v="${b.key}">
          <div class="bh"><span>${b.emoji}</span><b>${esc(b.label)}</b></div>
          ${top ? `<div class="bl"><span class="rav">${av(m, 38)}</span><span class="nm">${MEDALS[0]} ${esc(m.name)}${r[1]?.rank === 1 ? ' <small>(ex æquo)</small>' : ''}</span><span class="pts">${fmtValue(b, top.value)}</span></div>`
            : '<div class="bl muted">Personne n\'a encore de score</div>'}
          <small class="muted">${mine?.rank ? `Ta place : ${ordinal(mine.rank)} (${fmtValue(b, mine.value)})` : 'Tu n\'as pas encore de score'}</small>
        </button>`;
      }).join('')}`;
  }
  const b = BOARDS.find((x) => x.key === sel) ?? BOARDS[0];
  const r = ranking(ctx, b);
  return `${bar}
    <h3 class="sec">${b.emoji} ${esc(b.label)}</h3>
    <ol class="rank">${r.map((row) => {
      const m = memberById(row.id);
      const t = titleLabel(m);
      return `<li class="${row.id === me.id ? 'me' : ''}"><button class="rrow" data-action="profile" data-id="${row.id}">
        <span class="pos">${row.rank ? MEDALS[row.rank - 1] ?? row.rank : '–'}</span><span class="rav">${av(m, 38)}</span>
        <span class="nm">${esc(row.name)}${row.id === me.id ? ' (toi)' : ''}${t ? `<small class="ptitle">${esc(t)}</small>` : ''}</span>
        <span class="pts">${fmtValue(b, row.value)}</span></button></li>`;
    }).join('')}</ol>
    ${b.key === 'sudoku' ? '<p class="summary" style="margin-top:10px">Classé par meilleur temps (le plus court gagne).</p>' : ''}`;
}

// Classement hebdomadaire : trophées gagnés cette semaine + palmarès des semaines passées
function weekHTML() {
  const me = state.me;
  const monday = currentWeek();
  const rows = weekRanking(state.members, state.weekly, monday);
  const sunday = addDays(mondayOf(), 6);
  const winners = weekWinners(state.members, state.weekly, monday);
  const tally = state.members.map((m) => ({ m, n: winners.filter((w) => w.winners.includes(m.id)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  return `
    <h3 class="sec">📅 Cette semaine · du ${mondayOf().getDate()} au ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}</h3>
    <p class="summary">Chaque trophée gagné cette semaine compte (tâches, récompense du jour, roue, défis). Le·la champion·ne reçoit 👑 à la fin de la semaine.</p>
    <ol class="rank">${rows.map((row) => {
      const m = memberById(row.id);
      return `<li class="${row.id === me.id ? 'me' : ''}"><button class="rrow" data-action="profile" data-id="${row.id}">
        <span class="pos">${row.rank ? (row.rank === 1 ? '👑' : row.rank) : '–'}</span><span class="rav">${av(m, 38)}</span>
        <span class="nm">${esc(row.name)}${row.id === me.id ? ' (toi)' : ''}${m?.kind === 'copain' ? '<small class="ptitle">Copain</small>' : ''}</span>
        <span class="pts">${row.value} 🏆</span></button></li>`;
    }).join('')}</ol>
    <h3 class="sec">👑 Palmarès</h3>
    ${tally.length ? `<div class="tags">${tally.map(({ m, n }) => `<span class="tag">${esc(m.name)} · ${n} 👑</span>`).join('')}</div>
      <div style="margin-top:12px">${winners.slice(0, 8).map((w) => {
        const d = parseISO(w.week);
        return `<div class="up hist"><div class="txt"><b>Semaine du ${d.getDate()} ${MONTHS[d.getMonth()]}</b>
          <small>${w.winners.map((id) => esc(nameOf(id))).join(' & ')} · ${w.value} 🏆</small></div><span style="font-size:22px">👑</span></div>`;
      }).join('')}</div>`
      : '<div class="empty-msg" style="padding:16px 0">Pas encore de semaine terminée. Le premier palmarès arrivera dimanche soir !</div>'}`;
}

/* ---------- Feuilles : profil, défis réussis, récompense du jour, roue ---------- */
function profileSheetHTML(s) {
  const m = memberById(s.id);
  if (!m) return '';
  const mine = m.id === state.me.id;
  const t = titleLabel(m);
  const unlocked = CHALLENGES.filter((c) => unlockedKeys(m.id).has(c.key));
  return sheetWrap(`
    <div class="sh"><div><h2>${mine ? 'Mon profil' : esc(m.name)}</h2><div class="when">${t ? esc(t) : 'Aucun titre affiché'}</div></div>${closeBtn}</div>
    <div class="center-av">${av(m, 130)}</div>
    <div class="pname"><b>${esc(m.name)}</b></div>
    ${statGrid(m)}
    ${unlocked.length ? `<h3 class="sec">Titres débloqués</h3><div class="tags">${unlocked.map((c) => `<span class="tag">${c.emoji} ${esc(c.title)}</span>`).join('')}</div>` : ''}
    ${mine ? `<div class="sact"><button class="btn primary" data-action="goprofile">Modifier mon profil</button></div>` : ''}`);
}

function wonSheetHTML() {
  const list = state.won.map((k) => challengeByKey[k]).filter(Boolean);
  return sheetWrap(`
    <div class="sh"><div><h2>🏆 Défi${list.length > 1 ? 's' : ''} réussi${list.length > 1 ? 's' : ''} !</h2><div class="when">Bravo ${esc(state.me.name)}</div></div>${closeBtn}</div>
    ${list.map((c) => {
      const r = rewardOf(c.key);
      const parts = [r.coins ? `+${r.coins} 🏆` : '', r.skin ? `🎭 Nouveau personnage : ${esc(outfitName(r.skin, state.me.gender))}` : ''].filter(Boolean).join(' · ');
      return `<div class="srow"><div class="swho"><b>${c.emoji} ${esc(c.title)}</b></div><small>${esc(c.desc)}</small>
        <div class="reward" style="margin:6px 0 0">Titre débloqué${parts ? ` · ${parts}` : ''}</div>
        ${r.skin ? `<div class="center-av" style="margin:8px 0 0">${av({ ...state.me, outfit: r.skin }, 84)}</div>` : ''}</div>`;
    }).join('')}
    <div class="sact"><button class="btn primary" data-action="close">Super !</button></div>`, 'var(--gold)');
}

function dailySheetHTML() {
  const next = nextStreak();
  const tiles = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1, got = day < next, cur = day === next;
    const content = day === 7 ? '🎡<small>Roue</small>' : `🏆<small>+${DAILY_COINS[i]}</small>`;
    return `<div class="dday ${got ? 'got' : ''} ${cur ? 'cur' : ''}"><i>J${day}</i><span>${got ? '✓' : content}</span></div>`;
  }).join('');
  return sheetWrap(`
    <div class="sh"><div><h2>🎁 Récompense du jour</h2><div class="when">Jour ${next} sur 7 · reviens chaque jour sans en rater un</div></div>${closeBtn}</div>
    <div class="ddays">${tiles}</div>
    <div class="det">Le jour 7 débloque la <b>roue de la fortune</b> : de ${WHEEL_MIN} à ${WHEEL_MAX} 🏆.</div>
    <div class="sact"><button class="btn primary" data-action="daily-claim">${next === 7 ? '🎡 Débloquer la roue' : `Récupérer +${DAILY_COINS[next - 1]} 🏆`}</button></div>`, 'var(--gold)');
}

function dailyDoneHTML(s) {
  return sheetWrap(`
    <div class="sh"><div><h2>${s.wheel ? '🎡 Roue débloquée !' : `+${s.coins} 🏆`}</h2><div class="when">Jour ${s.streak} sur 7 validé</div></div>${closeBtn}</div>
    <div class="det">${s.wheel ? 'Tu as tenu 7 jours de suite : tourne la roue pour gagner entre ' + WHEEL_MIN + ' et ' + WHEEL_MAX + ' 🏆.'
      : s.streak === 6 ? 'Demain, si tu reviens : la roue de la fortune !' : 'À demain pour la suite !'}</div>
    <div class="sact">${s.wheel ? '<button class="btn primary" data-action="wheel">🎡 Tourner la roue</button>' : ''}<button class="btn ${s.wheel ? '' : 'primary'}" data-action="close">${s.wheel ? 'Plus tard' : 'OK'}</button></div>`, 'var(--gold)');
}

function wheelSheetHTML(s) {
  const colors = ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899', '#14b8a6', '#eab308'];
  const n = colors.length, R = 100;
  const seg = colors.map((c, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
    const p = (a, r) => `${(110 + Math.cos(a) * r).toFixed(1)},${(110 + Math.sin(a) * r).toFixed(1)}`;
    return `<path d="M110,110 L${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)}Z" fill="${c}" stroke="#fff" stroke-width="2"/>
      <text x="${110 + Math.cos(am) * 66}" y="${110 + Math.sin(am) * 66 + 6}" text-anchor="middle" font-size="18">🏆</text>`;
  }).join('');
  const deg = Math.round((s.turns ?? 0) * 360);
  const style = s.spinning ? `--end:${deg}deg;transform:rotate(${deg}deg)` : '';
  const stillWheel = statsOf(state.me.id).wheel_ready;
  return sheetWrap(`
    <div class="sh"><div><h2>🎡 Roue de la fortune</h2><div class="when">De ${WHEEL_MIN} à ${WHEEL_MAX} 🏆</div></div>${s.spinning && !s.revealed ? '' : closeBtn}</div>
    <div class="wheelbox"><div class="wptr">▼</div>
      <svg class="wheel ${s.spinning && !s.revealed ? 'spin' : ''}" viewBox="0 0 220 220" style="${style}" aria-hidden="true">${seg}<circle cx="110" cy="110" r="14" fill="#fff"/></svg></div>
    ${s.revealed ? `<div class="wprize">+${s.amount} 🏆</div>` : ''}
    <div class="sact">
      ${!s.spinning && stillWheel ? '<button class="btn primary" data-action="spin">Tourner !</button>' : ''}
      ${s.revealed ? '<button class="btn primary" data-action="close">Génial !</button>' : ''}
      ${!s.spinning && !stillWheel ? '<div class="det" style="text-align:center">Pas de tour disponible. Reviens 7 jours de suite !</div><button class="btn" data-action="close">Fermer</button>' : ''}
    </div>`, 'var(--gold)');
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
    case 'tab': state.tab = tab; state.sheet = null; render(); window.scrollTo(0, 0); if (tab === 'rank') questStep(2); break;
    case 'week': state.weekOffset = Math.max(-WEEKS_BACK, Math.min(WEEKS_AHEAD, state.weekOffset + Number(d))); render(); break;
    case 'cell': state.sheet = { type: 'task', week: el.dataset.week, kind: el.dataset.kind, day: Number(el.dataset.day), mode: 'auto' }; render(); questStep(4); break;
    case 'open': if (task) { state.sheet = { type: 'task', week: task.week, kind: task.kind, day: task.day_index, mode: el.dataset.mode }; render(); questStep(4); } break;
    case 'close': if (e.target === el) closeSheet(); break;
    case 'do': if (task) act(task, 'done'); break;
    case 'tseg': state.tasksSeg = v; render(); window.scrollTo(0, 0); break;
    case 'propose': state.sheet = { type: 'propose', taskId: Number(id) }; render(); break;
    case 'propose-to': proposeTo(Number(id), Number(el.dataset.to)); break;
    case 'req-accept': answerRequest(Number(id), true); break;
    case 'req-decline': answerRequest(Number(id), false); break;
    case 'req-cancel': answerRequest(Number(id), false, true); break;
    case 'undo': if (task) act(task, 'todo'); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
    // --- Toi : personnage et boutique ---
    case 'seg': state.meSeg = seg; state.sheet = null; render(); break;
    case 'bg': saveProfile({ bg: v }); break;
    case 'title': saveTitle(state.me.title === id ? null : id); break;
    case 'profile': openProfile(Number(id)); break;
    case 'goprofile': state.sheet = null; state.tab = 'me'; state.meSeg = 'profil'; render(); window.scrollTo(0, 0); break;
    case 'board': state.board = v; render(); window.scrollTo(0, 0); break;
    case 'daily-claim': claimDailyNow(); break;
    case 'wheel': state.sheet = { type: 'wheel' }; render(); break;
    case 'spin': spinNow(); break;
    case 'game': openGame(id); break;
    case 'gender': saveProfile({ gender: v }); break;
    case 'skin': saveProfile({ skin: v }); break;
    case 'hair': saveProfile({ hair: v }); break;
    case 'equip': if (ownedBy(state.me.id).has(id)) saveProfile({ outfit: id }); break;
    // --- Jeux ---
    case 'duel-new': if (state.opp) { state.sheet = { type: 'duel-new', opp: state.opp, move: null }; render(); } break;
    case 'pick-move': if (s) { s.move = v; render(); } break;
    case 'duel-send': sendDuel(); break;
    case 'duel-open': state.sheet = { type: 'duel-play', duelId: Number(id), move: null }; render(); break;
    case 'duel-play': playDuelNow(); break;
    case 'duel-cancel': cancelDuelNow(Number(id)); break;
  }
});
// Saisie libre de la mise (on ne redessine pas pour ne pas perdre le focus)
document.addEventListener('change', (e) => {
  const k = e.target.dataset?.input;
  if (k === 'opp') state.opp = Number(e.target.value);       // pas de redessin : on garde la liste ouverte
  else if (k === 'title') saveTitle(e.target.value);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !state.game && currentSheet()) closeSheet(); });

render();
init();
