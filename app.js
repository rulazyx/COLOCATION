import {
  CONFIG, TASK_KINDS, TASK_GROUPS, levelOf, levelProgress, XP_RULES,
  SKIN_COLORS, HAIR_COLORS, BG_COLORS, OUTFITS, MOVES, DAILY_XP, WHEEL_MIN, WHEEL_MAX, INTRO_STEPS, GOOSE, MESSAGE_MAX, DICE_PRICES, DICE_MAX_DAY, PERKS, perkOfWeek, DAILY, betsFor, BJ_BETS, SHOP, SHOP_SLOTS, LEVEL_BONUS, FARM, shopItem, SOAP_EXCHANGE, BIRD_CRATE, birdRarity, GAME_QUESTS,
} from './config.js';
import { eur, parseEuros, splitCents, balances as budgetBalances, settle as budgetSettle } from './budget.js';
import { NAV_ICONS, CART_SVG, GEAR_SVG, SUGGEST_SVG, CAL_SVG, PX_CAKE, PX_MUG, PX_FOOD, PX_PAD, QUEST_SVG, COIN_SVG, CRATE_SVG, birdSVG } from './shopart.js';
import { avatarSVG } from './avatar.js';
import { makeCloudApi } from './api.js';
import * as APIMOD from './api.js';
const BUILD = 61;   // doit être égal à BUILD dans api.js (voir tools/bump.mjs) : sinon des fichiers de versions différentes se sont mélangés
import { CHALLENGES, challengeByKey, rewardOf, titleOf, BOARDS, ranking, leaderOf, firstPlaces, fmtValue, fmtTime, weekRanking, weekWinners, BADGES, TIER_NAMES, tierOf, questDone } from './challenges.js';

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (s) => document.querySelector(s);
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

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
const outfitName = (id, gender) => { const o = OUTFITS[id] ?? OUTFITS.none; return gender === 'femme' && o.nameF ? o.nameF : o.name; };
const moveEmoji = (m) => MOVES[m]?.emoji ?? '❔';

/* =========================================================
   État + chargement
   ========================================================= */
const state = {
  api: null, members: [], me: null, products: [], scores: [], balances: [], purchases: [], duels: [],
  stats: [], duelStats: [], unlocks: [], views: [], xp: [], weekly: [], logs: [], spent: [], dice: [], perks: [], pconf: [], chips: [], msgs: [], freshMsgs: new Set(), heads: false,
  tasksSeg: 'tasks', gamesSeg: 'games', farm: [], farmSt: [], farmDay: [], farmStock: [], farmBuilds: [], events: [], evVotes: [], expenses: [], expShares: [], budgetSeg: 'exp', open: {}, anim: false, levelUps: [], auth: null,
  tab: 'tasks', meSeg: 'robe', opp: null, sheet: null, error: null, initials: {},
  game: null, won: [], viewedNow: new Set(),
};
const memberById = (id) => state.members.find((m) => m.id === id);
const nameOf = (id) => memberById(id)?.name ?? '?';
const balanceOf = (id) => state.balances.find((b) => b.member_id === id)?.coins ?? 0;
const pendingWagerOf = (id) => state.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
const availableOf = (id) => balanceOf(id) - pendingWagerOf(id);
const chipsOf = (id) => state.chips.find((x) => x.member_id === id)?.chips ?? 0;
const earnedSoap = (id) => state.scores.find((x) => x.member_id === id)?.coins ?? 0;
const soapOf = (id) => earnedSoap(id) - (state.spent.find((x) => x.member_id === id)?.spent ?? 0);
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
    balances: keyed(state.balances, (b) => b.coins), chipsMap: keyed(state.chips, (b) => b.chips), wins: keyed(state.duelStats, (d) => d.wins), xp: keyed(state.xp, (x) => x.xp),
    duels: state.duels, owned: ownedBy(me), chips: chipsOf(me), weekly: state.weekly, currentWeek: currentWeek(),
    viewed: new Set(state.views.filter((v) => v.viewer_id === me).map((v) => v.viewed_id)),
  };
}
const currentWeek = () => iso(mondayOf());
const weeksWon = (id) => weekWinners(state.members, state.weekly, currentWeek()).filter((w) => w.winners.includes(id)).length;
const unlockedKeys = (id) => new Set(state.unlocks.filter((u) => u.member_id === id).map((u) => u.key));
const titleLabel = (m) => (m?.title ? titleOf(m.title) : null);
// Cadre de profil acheté dans la boutique + effet de pseudo
const av = (m, size) => {
  const svg = avatarSVG(m ?? {}, size);
  return m?.frame && size >= 30 && shopItem('frame', m.frame) ? `<span class="fr fr-${m.frame}" style="--fs:${size}px">${svg}${m.frame === 'royal' ? '<i class="lcrown">👑</i>' : ''}</span>` : svg;
};
// Couleur du niveau (code couleur : gris, bronze, argent, or, glace, violet)
const lvlColor = (n) => (n >= 50 ? '#c48bff' : n >= 30 ? '#7fe3f5' : n >= 20 ? '#ffc928' : n >= 10 ? '#cfd6df' : n >= 5 ? '#e0a36a' : '#d9dde3');
const nameHTML = (m) => (m?.namefx && shopItem('namefx', m.namefx) ? `<span class="nfx nfx-${m.namefx}">${esc(m.name)}</span>` : esc(m?.name ?? '?'));
const shopOwned = (id) => new Set(state.purchases.filter((p) => p.member_id === id).map((p) => p.item));

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

// Table modifiée (temps réel) → données à relire
const TABLE_KEYS = {
  members: ['members', 'scores', 'balances', 'xp', 'chips', 'duelStats', 'spent'], products: ['products'], purchases: ['purchases'], tasks: ['scores', 'weekly', 'logs'],
  duels: ['duels', 'duelStats'], member_stats: ['stats'], coin_ledger: ['balances', 'scores', 'weekly'], unlocks: ['unlocks'], task_logs: ['logs', 'scores', 'weekly'],
  xp_log: ['xp'], dice_rolls: ['dice', 'spent', 'pweeks'], messages: ['msgs'], perks: ['perks'], perk_confirms: ['pconf'], chip_ledger: ['chips', 'farmDay'],
  soap_exchanges: ['spent'], farm_plots: ['farm'], farm_state: ['farmSt'], farm_stock: ['farmStock'], farm_builds: ['farmBuilds'],
  events: ['events'], event_votes: ['evVotes'], expenses: ['expenses', 'expShares'], expense_shares: ['expenses', 'expShares'],
};
async function refresh(force = false, only = null) {
  // Pendant une partie, on ne redessine pas l'appli en dessous (ça fait ramer le jeu) : on rattrape à la fermeture
  if (state.game && !force) { state.pendingRefresh = true; return; }   // (au retour du jeu : relecture complète)
  if (state.sheet?.type === 'wheel' && state.sheet.spinning && !state.sheet.revealed) { state.sheet.pending = true; return; }
  if (state.me?.kind === 'coloc' && Date.now() - (state.recAt ?? 0) > 3600000) { state.recAt = Date.now(); state.api.runRecurring?.().then((n) => { if (n) refresh(true); }).catch(() => {}); }   // dépenses automatiques du 1er du mois
  if (Date.now() - (state.settledAt ?? 0) > 600000) { state.settledAt = Date.now(); state.api.settlePlateau().catch(() => {}); }   // en parallèle : on n'attend plus ce calcul pour afficher l'appli
  const api = state.api;
  const LOADERS = {
    members: () => api.members(), scores: () => api.scores(), balances: () => api.balances(), products: () => api.products(), purchases: () => api.purchases(), duels: () => api.duels(),
    stats: () => api.stats(), duelStats: () => api.duelStats(), unlocks: () => api.unlocks(), views: () => api.views(), xp: () => api.xp(), weekly: () => api.weekly(), logs: () => api.taskLogs(),
    spent: () => api.soapSpent(), dice: () => api.diceRolls(), perks: () => api.perks(), pconf: () => api.perkConfirms(), chips: () => api.chips(), pweeks: () => api.plateauWeeks(),
    farm: () => api.farm(), farmSt: () => api.farmState(), farmDay: () => api.farmDay(), farmStock: () => api.farmStock(), farmBuilds: () => api.farmBuilds(),
    events: () => api.events(), evVotes: () => api.eventVotes(), popups: () => api.popups(state.me?.id), msgs: () => (state.me ? api.messages(state.me.id) : []),
    expenses: () => api.expenses(), expShares: () => api.expenseShares(),
  };
  // `only` : si le temps réel dit quelles tables ont changé, on ne relit que ce qui en dépend (au lieu des ~30 requêtes à chaque fois)
  const keys = only ? Object.keys(LOADERS).filter((k) => only.has(k)) : Object.keys(LOADERS);
  const res = await Promise.allSettled(keys.map((k) => LOADERS[k]()));
  const failed = [];
  res.forEach((r, i) => { if (r.status === 'fulfilled') state[keys[i]] = r.value; else failed.push(`${keys[i]}: ${r.reason?.message || r.reason}`); });
  state.syncErr = failed.length ? failed[0] : null; if (!failed.length) state.syncAt = new Date();
  if (failed.length && !state.members?.length) throw new Error(failed[0]);
  state.msgs ??= [];
  if (state.me) state.me = memberById(state.me.id) ?? null;
  state.initials = computeInitials(state.members);
  checkNewResults();
  checkLevelUp();
  render();
  autoClaim();
  markRead();
}

// Passage de niveau : on le fête une fois, avec les apparences débloquées
function checkLevelUp() {
  if (!state.me) return;
  const key = `coloc-level-${state.me.id}`, now = lvlOf(state.me.id);
  const seen = Number(store.get(key));
  if (!seen || now < seen) { store.set(key, String(now)); return; }   // (niveaux remis à zéro : on repart de là)
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

// Nouvelle version prête : on recharge toute seule dès que rien n'est en cours (ni partie, ni fenêtre, ni saisie) ; sinon bannière « Actualiser »
let updatePending = false;
function appIdle() {
  const ae = document.activeElement;
  return !state.game && !currentSheet() && !(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
}
function applyUpdate() {
  if (updatePending) return; updatePending = true;
  const tryNow = () => {
    if (appIdle()) { toast('Mise à jour de l\'appli…', 1500); setTimeout(() => location.reload(), 600); return true; }
    return false;
  };
  if (tryNow()) return;
  showUpdateBar();
  const t = setInterval(() => { if (appIdle()) { clearInterval(t); tryNow(); } }, 3000);
}
function showUpdateBar() {
  if (document.getElementById('updbar')) return;
  const el = document.createElement('div');
  el.id = 'updbar'; el.setAttribute('role', 'status');
  el.innerHTML = '<span><b>Mise à jour disponible</b><small>Une nouvelle version de l\'appli est prête.</small></span><button class="btn" id="updgo">Actualiser</button><button class="updx" id="updx" aria-label="Plus tard">✕</button>';
  document.body.appendChild(el);
  el.querySelector('#updgo').onclick = () => location.reload();
  el.querySelector('#updx').onclick = () => el.remove();
}
// Fichiers de deux versions mélangés (mise à jour en cours de route) : on vide le cache et on recharge, une seule fois
async function healCaches() {
  try {
    if (Date.now() - Number(sessionStorage.getItem('coloc-heal') || 0) < 60000) return false;
    sessionStorage.setItem('coloc-heal', String(Date.now()));
    for (const k of await caches.keys()) await caches.delete(k);
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    location.reload(); return true;
  } catch { return false; }
}
function setTheme(t) {
  store.set('coloc-theme', t);
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
}
async function init() {
  if (APIMOD.BUILD !== BUILD && await healCaches()) return;
  let step = 'démarrage';
  const sp = (p) => window.splashProgress?.(p);
  if ('serviceWorker' in navigator) {
    // Alerte de mise à jour : quand une nouvelle version prend le relais, on propose d'actualiser (sans jamais couper une partie)
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) applyUpdate(); });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => {});
  }
  try {
    const cloud = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    step = 'connexion'; sp(0.15);
    state.api = cloud ? await makeCloudApi() : (await import('./demo.js')).makeDemoApi();
    state.members = await state.api.members(); sp(0.4);
    state.initials = computeInitials(state.members);
    // Session : reconnu seulement si le code secret a déjà été saisi sur cet appareil (et existe encore)
    const meId = Number(store.get('coloc-me'));
    const known = state.members.find((m) => m.id === meId);
    state.me = known && known.has_pin && store.get('coloc-auth') === String(meId) ? known : null;
    sp(0.65);
    step = 'lecture des données (stats, défis…)';
    await refresh(); sp(1); window.splashDone?.();
    {
      const keys = new Set(); let all = false, timer = 0;
      state.api.onChange((table) => {
        if (TABLE_KEYS[table]) TABLE_KEYS[table].forEach((k) => keys.add(k)); else all = true;
        clearTimeout(timer);
        timer = setTimeout(() => { const only = all ? null : new Set(keys); keys.clear(); all = false; refresh(false, only).catch(() => {}); }, 250);
      });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
    // Filet de sécurité si le temps réel rate un message : relecture complète toutes les 60 s (sans gêner une saisie ou une fenêtre ouverte)
    setInterval(() => {
      const ae = document.activeElement;
      if (document.hidden || state.game || state.sheet || !state.me || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
      refresh().catch(() => {});
    }, 60000);
    if (state.me) syncSub();
  } catch (e) {
    console.error(e);
    state.error = `${e.message || String(e)} [étape : ${step} · v11]`;
    render(); window.splashDone?.();
  }
}

/* =========================================================
   Actions
   ========================================================= */
// Tâches : on choisit la tâche faite, un AUTRE coloc doit la confirmer
async function submitTaskNow(kind) {
  try {
    await state.api.submitTask(state.me.id, kind);
    state.sheet = null;
    toast('Envoyé ! Un autre coloc doit confirmer que c\'est fait.');
    await refresh();
  } catch (e) { state.sheet = null; toast(e.message || 'Impossible d\'enregistrer la tâche.'); refresh().catch(() => {}); }
}
async function answerTaskNow(id, ok) {
  const l = state.logs.find((x) => x.id === id);
  try {
    await state.api.answerTask(id, state.me.id, ok);
    toast(l && l.doer_id === state.me.id ? 'Demande annulée.' : ok ? 'Merci, tâche confirmée ! 🧼' : 'Tâche refusée.');
    await refresh();
  } catch (e) { toast(e.message || 'Action impossible.'); refresh().catch(() => {}); }
}

// Code secret : création au premier lancement, saisie ensuite
function startAuth(id) {
  const m = memberById(id);
  state.auth = { id, mode: m?.has_pin ? 'check' : 'create', pin: '', first: null, err: '', busy: false };
  render();
}
async function authKey(v) {
  const a = state.auth;
  if (!a || a.busy) return;
  if (v === 'del') a.pin = a.pin.slice(0, -1);
  else if (a.pin.length < 4) a.pin += v;
  a.err = '';
  if (a.pin.length < 4) return render();
  render();
  if (a.mode === 'create') {
    if (a.first == null) { a.first = a.pin; a.pin = ''; return render(); }
    if (a.first !== a.pin) { a.err = 'Les deux codes sont différents. Recommence.'; a.first = null; a.pin = ''; return render(); }
    a.busy = true;
    try { await state.api.setPin(a.id, a.pin); await finishLogin(a.id); }
    catch (e) { a.busy = false; a.err = e.message || 'Impossible de créer le code.'; a.first = null; a.pin = ''; render(); }
    return;
  }
  a.busy = true;
  try {
    const r = await state.api.checkPin(a.id, a.pin);
    if (r?.ok) return await finishLogin(a.id);
    a.err = r?.locked_s ? `Trop d'essais. Réessaie dans ${Math.ceil(r.locked_s / 60)} min.` : 'Code incorrect.';
  } catch (e) { a.err = e.message || 'Vérification impossible.'; }
  a.busy = false; a.pin = ''; render();
}
async function finishLogin(id) {
  store.set('coloc-me', String(id)); store.set('coloc-auth', String(id));
  state.auth = null;
  state.me = memberById(id);
  await refresh(true);
  state.tab = 'tasks';
  render(); syncSub(); checkNewResults(); render();
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
    await state.api.createDuel(state.me.id, s.opp, XP_RULES.duelStake, s.move);
    state.api.launchGame(state.me.id).then((n) => n && refresh(true)).catch(() => {});
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

/* ---------- Récompenses d'arrivée (bière, cadeau, vacances) ---------- */
const perkDef = (kind) => PERKS.find((k) => k.key === kind);
const perkOfWeekDef = () => perkOfWeek(mondayOf());
const debtors = (perk) => colocs().filter((m) => m.id !== perk.member_id);
const confirmedBy = (perk) => new Set(state.pconf.filter((c) => c.perk_id === perk.id).map((c) => c.member_id));
function perkActive(perk) {
  const d = perkDef(perk.kind);
  if (!d) return false;
  if (d.confirm) return debtors(perk).some((m) => !confirmedBy(perk).has(m.id));
  return Date.now() < Date.parse(perk.created_at) + (d.days ?? 7) * 86400000;
}
const activePerksOf = (id) => state.perks.filter((p) => p.member_id === id && perkActive(p));
// Ce que je dois encore offrir
const perksOwed = () => (state.me?.kind === 'coloc'
  ? state.perks.filter((p) => perkDef(p.kind)?.confirm && p.member_id !== state.me.id && perkActive(p) && !confirmedBy(p).has(state.me.id)) : []);
function perkCardHTML(perk, viewerIsOwner) {
  const d = perkDef(perk.kind), owner = memberById(perk.member_id);
  let body;
  if (d.confirm) {
    const done = confirmedBy(perk), list = debtors(perk);
    const mine = state.me.kind === 'coloc' && state.me.id !== perk.member_id && !done.has(state.me.id);
    body = `<small>${done.size} sur ${list.length} ont tenu parole${list.filter((m) => !done.has(m.id)).length ? ` · reste : ${list.filter((m) => !done.has(m.id)).map((m) => esc(m.name)).join(', ')}` : ''}</small>
      ${mine ? `<button class="mini ok" data-action="perk-ok" data-id="${perk.id}">J'ai offert ma part</button>` : ''}`;
  } else {
    const left = Math.max(0, Math.ceil((Date.parse(perk.created_at) + (d.days ?? 7) * 86400000 - Date.now()) / 86400000));
    body = `<small>${esc(d.short)} · encore ${left} jour${left > 1 ? 's' : ''}</small>`;
  }
  return `<div class="perk ${perk.kind}"><b>${esc(d.title)}</b>${viewerIsOwner ? '' : `<small>Gagné par ${esc(owner?.name)}</small>`}${body}</div>`;
}
async function confirmPerkNow(id) {
  try { await state.api.confirmPerk(id, state.me.id); toast('Merci, c\'est noté !'); await refresh(); }
  catch (e) { toast(e.message || 'Impossible de confirmer.'); }
}

/* ---------- Historiques (trophées, savons) ---------- */
const REASONS = { start: 'Départ', daily: 'Récompense du jour', wheel: 'Roue de la fortune', blackjack: 'Blackjack', plateau: 'Plateau', 'duel-win': 'Chifoumi gagné', 'duel-loss': 'Chifoumi perdu' };
const reasonLabel = (r) => (r?.startsWith('challenge:') ? `Défi : ${titleOf(r.slice(10)) ?? ''}` : REASONS[r] ?? r);
function histRow(label, when, amount, unit) {
  return `<div class="hrow"><div><b>${esc(label)}</b><small>${esc(when)}</small></div><span class="${amount > 0 ? 'plus' : 'minus'}">${amount > 0 ? '+' : ''}${amount} ${unit}</span></div>`;
}
function soapHistHTML() {
  const me = state.me.id;
  const rows = [
    ...state.logs.filter((l) => l.doer_id === me && l.status === 'validated').map((l) => ({ t: l.answered_at, label: `${TASK_KINDS[l.kind]?.short ?? l.kind} (confirmée)`, amount: l.soap })),
    ...state.dice.filter((r) => r.member_id === me).map((r) => ({ t: r.created_at, label: `Dé du plateau (${r.roll})`, amount: -r.cost })),
  ].sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
  return sheetWrap(`
    <div class="sh"><div><h2>🧼 Historique des savons</h2><div class="when">Disponibles : ${soapOf(me)} 🧼 · gagnés en tout : ${earnedSoap(me)}</div></div>${closeBtn}</div>
    ${rows.length ? `<div class="hlist">${rows.map((r) => histRow(r.label, ago(r.t), r.amount, '🧼')).join('')}</div>` : '<div class="det">Aucun mouvement pour l\'instant.</div>'}
    <div class="sact"><button class="btn" data-action="close">Fermer</button></div>`, 'var(--gold)');
}


/* ---------- Budget (comme Tricount) ---------- */
const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];
const budgetIds = () => state.members.filter((m) => m.kind === 'coloc').map((m) => m.id);
const budgetBal = () => budgetBalances(state.expenses, state.expShares, budgetIds());
const budgetMine = () => (state.me ? budgetBal()[state.me.id] ?? 0 : 0);
const sharesOf = (e) => state.expShares.filter((s) => s.expense_id === e.id).map((s) => s.member_id);
const dayLabel = (iso) => {
  const t = new Date(); const d0 = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const y = new Date(Date.now() - 864e5);
  if (iso === d0(t)) return "Aujourd'hui"; if (iso === d0(y)) return 'Hier';
  const l = new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return l.charAt(0).toUpperCase() + l.slice(1);
};
const signed = (c) => (c > 0 ? '+' : c < 0 ? '−' : '') + eur(Math.abs(c));
function budgetHTML() {
  const me = state.me;
  if (me.kind !== 'coloc') return '<div class="empty-msg" style="padding:30px 0">Le budget est réservé aux colocs.</div>';
  const bal = budgetBal(), mine = bal[me.id] ?? 0, seg = state.budgetSeg === 'bal' ? 'bal' : 'exp';
  const list = state.expenses.filter((e) => e.kind === 'expense'), total = list.reduce((a, e) => a + e.amount_cents, 0);
  const myCost = list.reduce((a, e) => a + (splitCents(e.amount_cents, sharesOf(e), e.id)[me.id] ?? 0), 0);
  const hero = `<div class="bgt-hero ${mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}">
    <small>Ton solde</small><b>${mine === 0 ? eur(0) : signed(mine)}</b>
    <span>${mine > 0 ? 'On te doit de l\'argent' : mine < 0 ? 'Tu dois de l\'argent' : 'Tu es à jour'}</span>
    <div class="bgt-sum"><div><small>Dépensé par la coloc</small><b>${eur(total)}</b></div><div><small>Ta part</small><b>${eur(myCost)}</b></div></div></div>`;
  const segs = `<div class="seg" style="margin:12px 0">${[['exp', 'Dépenses'], ['bal', 'Soldes']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-action="bseg" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (seg === 'exp') {
    if (!state.expenses.length) body = '<div class="empty-msg" style="padding:26px 0">Aucune dépense pour l\'instant.<br>Ajoute la première avec le bouton ci-dessous.</div>';
    else {
      let lastDay = '';
      body = state.expenses.map((e) => {
        const head = e.spent_on !== lastDay ? `<h4 class="bgt-day">${esc(dayLabel(e.spent_on))}</h4>` : ''; lastDay = e.spent_on;
        const parts = sharesOf(e), my = splitCents(e.amount_cents, parts, e.id)[me.id] ?? 0;
        const sub = e.kind === 'transfer' ? `${esc(nameOf(e.payer_id))} → ${esc(nameOf(parts[0]))}` : `Payé par ${esc(nameOf(e.payer_id))} · pour ${parts.length} pers.${e.recurring_id ? ' · chaque mois' : ''}`;
        const mineTxt = e.kind === 'transfer' ? '' : my ? `<small>Ta part ${eur(my)}</small>` : '<small>Pas concerné</small>';
        return `${head}<button class="bgt-row ${e.kind}" data-action="exp-open" data-id="${e.id}"><span class="bgt-av">${av(memberById(e.payer_id), 38)}</span>
          <span class="bgt-t"><b>${esc(e.title)}</b><small>${sub}</small></span><span class="bgt-a"><b>${eur(e.amount_cents)}</b>${mineTxt}</span></button>`;
      }).join('');
    }
  } else {
    const max = Math.max(1, ...Object.values(bal).map(Math.abs));
    const rows = state.members.filter((m) => m.kind === 'coloc').map((m) => {
      const c = bal[m.id] ?? 0, w = Math.round(50 * Math.abs(c) / max);
      return `<div class="bgt-bal"><span class="bgt-av">${av(m, 34)}</span><b>${esc(m.name)}</b><div class="bgt-bar"><i class="${c >= 0 ? 'p' : 'n'}" style="${c >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></i></div><em class="${c > 0 ? 'p' : c < 0 ? 'n' : ''}">${c === 0 ? eur(0) : signed(c)}</em></div>`;
    }).join('');
    const sets = budgetSettle(bal);
    const paid = state.members.filter((m) => m.kind === 'coloc').map((m, i) => ({ m, c: list.filter((e) => e.payer_id === m.id).reduce((s, e) => s + e.amount_cents, 0), col: PIE_COLORS[i % PIE_COLORS.length] }));
    const sum = paid.reduce((s, x) => s + x.c, 0);
    const R = 15.9155; let off = 0;
    const pie = sum ? `<div class="bgt-card bgt-pie"><h4 class="bgt-day" style="margin-top:6px">Qui a avancé l'argent</h4><div class="bgt-pierow">
      <svg viewBox="0 0 42 42" width="140" height="140" role="img" aria-label="Répartition des sommes avancées"><circle cx="21" cy="21" r="${R}" fill="none" stroke="rgba(128,128,128,.15)" stroke-width="7"/>
      ${paid.filter((x) => x.c).map((x) => { const p = 100 * x.c / sum, seg = `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${x.col}" stroke-width="7" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${25 - off}"/>`; off += p; return seg; }).join('')}
      <text x="21" y="20.5" text-anchor="middle" font-size="4.6" font-weight="800" fill="currentColor">${esc(eur(sum))}</text><text x="21" y="26" text-anchor="middle" font-size="2.9" fill="currentColor" opacity=".6">avancés</text></svg>
      <ul class="bgt-leg">${paid.map((x) => `<li><i style="background:${x.col}"></i><span>${esc(x.m.name)}</span><b>${eur(x.c)}</b><small>${Math.round(100 * x.c / sum)} %</small></li>`).join('')}</ul></div></div>` : '';
    body = `${pie}<h4 class="bgt-day">Soldes</h4><div class="bgt-card">${rows}</div><h4 class="bgt-day">Pour tout équilibrer</h4>` + (sets.length ? sets.map((t) => `<div class="bgt-set"><span><b>${esc(nameOf(t.from))}</b> doit <b>${eur(t.cents)}</b> à <b>${esc(nameOf(t.to))}</b></span>
      ${t.from === me.id || t.to === me.id ? `<button class="btn" data-action="exp-pay" data-from="${t.from}" data-to="${t.to}" data-c="${t.cents}">Marquer remboursé</button>` : ''}</div>`).join('') : '<div class="empty-msg" style="padding:14px 0">Tout le monde est à jour.</div>');
  }
  return `${hero}${segs}${body}<button class="bgt-fab" data-action="exp-new"><span>+</span> Ajouter une dépense</button>`;
}
function newExpSheet(e) {
  const ids = budgetIds(), today = iso(new Date());
  return e ? { type: 'exp', id: e.id, title: e.title, amount: String(e.amount_cents / 100).replace('.', ','), payer: e.payer_id, day: e.spent_on, parts: sharesOf(e) }
    : { type: 'exp', id: null, title: '', amount: '', payer: state.me.id, day: today, parts: ids };
}
function expPreview(s) {
  const c = parseEuros(s.amount);
  return c > 0 && s.parts.length ? `Soit environ ${eur(Math.round(c / s.parts.length))} par personne` : '';
}
function expFormHTML(s) {
  const cs = state.members.filter((m) => m.kind === 'coloc');
  return sheetWrap(`
    <div class="sh"><div><h2>${s.id ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2><div class="when">Payée par ${esc(nameOf(s.payer))} · partagée à parts égales</div></div>${closeBtn}</div>
    <label class="evl">Pour quoi ?<input class="evin" data-input="exp-title" maxlength="60" placeholder="Ex. Courses, internet…" value="${esc(s.title)}"></label>
    <label class="evl">Montant (€)<input class="evin" data-input="exp-amount" inputmode="decimal" placeholder="0,00" value="${esc(s.amount)}"></label>
    <div class="evl">Pour qui ?</div>
    <div class="bgt-chips">${cs.map((m) => `<button class="bgt-chip ${s.parts.includes(m.id) ? 'on' : ''}" data-action="exp-part" data-id="${m.id}">${av(m, 26)}<span>${esc(m.name)}</span></button>`).join('')}</div>
    <div class="det" id="exppv" style="margin-top:8px">${expPreview(s)}</div>
    <button class="btn primary" style="width:100%;margin-top:10px" data-action="exp-save">${s.id ? 'Enregistrer' : 'Ajouter'}</button>`, 'var(--accent)');
}
function expDetailHTML(s) {
  const e = state.expenses.find((x) => x.id === s.id);
  if (!e) return sheetWrap(`<div class="sh"><h2>Dépense supprimée</h2>${closeBtn}</div>`);
  const parts = sharesOf(e), split = splitCents(e.amount_cents, parts, e.id), tr = e.kind === 'transfer';
  return sheetWrap(`
    <div class="sh"><div><h2>${esc(e.title)}</h2><div class="when">${esc(dayLabel(e.spent_on))} · ${eur(e.amount_cents)}</div></div>${closeBtn}</div>
    <div class="det">${tr ? `${esc(nameOf(e.payer_id))} a remboursé ${esc(nameOf(parts[0]))}.` : `Payé par <b>${esc(nameOf(e.payer_id))}</b>.`}</div>
    ${tr ? '' : `<div class="bgt-card" style="margin-top:8px">${parts.map((id) => `<div class="bgt-bal"><span class="bgt-av">${av(memberById(id), 30)}</span><b>${esc(nameOf(id))}</b><span class="grow"></span><em>${eur(split[id] ?? 0)}</em></div>`).join('')}</div>`}
    <div class="sact two">${tr ? '' : `<button class="btn" data-action="exp-edit" data-id="${e.id}">Modifier</button>`}<button class="btn ${s.confirm ? 'primary' : ''}" style="${s.confirm ? 'background:var(--danger)' : ''}" data-action="exp-del" data-id="${e.id}">${s.confirm ? 'Confirmer la suppression' : 'Supprimer'}</button></div>`, 'var(--accent)');
}
function expSave() {
  const s = state.sheet; if (!s || s.type !== 'exp') return;
  const cents = parseEuros(s.amount);
  if (!s.title.trim()) { toast('Donne un nom à la dépense.'); return; }
  if (!(cents > 0)) { toast('Entre un montant valide.'); return; }
  if (!s.parts.length) { toast('Choisis au moins une personne.'); return; }
  const done = () => { state.sheet = null; toast(s.id ? 'Dépense modifiée' : 'Dépense ajoutée'); render(); };
  calAct(() => (s.id ? state.api.updateExpense(state.me.id, s.id, s.title, cents, s.payer, s.day, s.parts) : state.api.addExpense(state.me.id, s.title, cents, s.payer, s.day, s.parts)), done);
}

/* ---------- Plateau, messages ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Lancer le dé : le dé roule, puis le pion avance de case en case (puis saute si piège / oie)
async function rollDiceNow() {
  if (state.rolling) return;
  state.rolling = true; render();
  try {
    const r = await state.api.rollDice(state.me.id);
    state.moving = { id: state.me.id, pos: r.from, roll: r.roll, tumble: true };
    render();
    await sleep(750);
    state.moving.tumble = false; render(); await sleep(450);
    for (let i = 1; i <= r.roll; i++) { state.moving.pos = r.from + i; render(); await sleep(400); }
    if (r.to !== r.from + r.roll) { await sleep(500); state.moving.pos = r.to; render(); await sleep(600); }
    state.moving = null; state.rolling = false;
    state.sheet = { type: 'dice', r };
    await refresh(true);
  } catch (e) { state.moving = null; state.rolling = false; toast(e.message || 'Lancer impossible.'); refresh(true).catch(() => {}); }
}
async function sendMessageNow() {
  const s = state.sheet, text = (s.text || '').trim();
  if (!text) return toast('Écris ton message.');
  try {
    await state.api.sendMessage(state.me.id, s.to, text);
    state.sheet = null;
    toast(`Message envoyé à ${nameOf(s.to)}.`);
    render();
  } catch (e) { toast(e.message || "Message non envoyé."); }
}
// Messages reçus : on les marque lus quand on ouvre le Profil (les nouveaux restent signalés jusqu'à la fermeture)
let marking = false;
async function markRead() {
  if (marking || !state.me || state.tab !== 'me') return;
  const unread = state.msgs.filter((m) => !m.read_at);
  if (!unread.length) return;
  marking = true;
  unread.forEach((m) => state.freshMsgs.add(m.id));
  try { await state.api.readMessages(state.me.id); state.msgs = await state.api.messages(state.me.id); render(); } catch (e) { console.warn(e); }
  marking = false;
}
const unreadCount = () => state.msgs.filter((m) => !m.read_at).length;

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
async function claimDailyNow() {
  try {
    const r = await state.api.claimDaily(state.me.id, iso(new Date()));
    toast(`+${r.chips} colocoins · +${r.xp} XP`);
    await refresh();
  } catch (e) { toast(e.message || 'Impossible de récupérer la récompense.'); refresh().catch(() => {}); }
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
  chifoumi: { direct: 'duel', name: 'Chifoumi', cls: 'chif', board: 'chifoumi', blurb: "Défie un coloc ou un copain : pierre, feuille, ciseaux. Ton coup reste secret jusqu'à sa réponse. Mise : 10 🪙 — le gagnant prend 10 colocoins au perdant.", duel: true },
  flappy: { name: 'Jumpy Cardinal', cls: 'flap', board: 'flappy', mod: './games/flappy.js', blurb: 'Touche l\'écran pour battre des ailes et passe entre les colonnes sans les toucher. Chaque obstacle rapporte de l\'XP.' },
  blackjack: { direct: 'game', name: 'Blackjack', cls: 'blk', board: 'blackjack', paid: true, mod: './games/blackjack.js', blurb: 'Bats la banque sans dépasser 21, en misant tes colocoins : 5, 10, 25 ou 50 (puis 25 à 200, et 100 à 500 quand tu en as beaucoup). Double ou sépare tes cartes, le blackjack paie 3 pour 2. Tu reçois 50 colocoins chaque jour dans Défis.' },
  ferme: { name: 'Colo-Ferme', cls: 'ferme', board: 'ferme', hidden: true, mod: './games/ferme.js', blurb: 'Construis ta ferme : plante, arrose, récolte, puis bâtis des bâtiments et des décorations avec tes fruits et légumes.' },
  sudoku: { name: 'Sudoku', cls: 'sudo', board: 'sudoku', mod: './games/sudoku.js', blurb: 'Remplis la grille contre la montre. Tu as 3 vies : chaque erreur en coûte une.' },
};
let gameHandle = null, gameScrollY = 0;
function farmCtx() {
  const me = state.me, api = state.api;
  return {
    meId: me.id, isColoc: () => me.kind === 'coloc', esc, toast,
    colocs: () => colocs(), nameOf: (id) => nameOf(id), avatar: (m, sz) => av(m, sz),
    farm: () => state.farm, slotsOf: (id) => farmSlots(id), got: () => state.farmDay.find((d) => d.member_id === me.id)?.got ?? 0,
    chips: () => chipsOf(me.id), level: () => lvlOf(me.id),
    stock: () => state.farmStock.filter((x) => x.member_id === me.id), builds: (id) => state.farmBuilds.filter((b) => b.member_id === id),
    sell: (crop, qty) => api.farmSell(me.id, crop, qty), build: (spot, item) => api.farmBuild(me.id, spot, item),
    plant: (slot, crop) => api.farmPlant(me.id, slot, crop), harvest: (slot) => api.farmHarvest(me.id, slot),
    water: (owner, slot) => api.farmWater(me.id, owner, slot), unlock: () => api.farmUnlock(me.id),
    refresh: () => refresh(true),
  };
}
async function openGame(id) {
  const G = GAMES[id];
  if (!G || state.game) return;
  state.game = id; state.sheet = null; render();
  state.api.launchGame(state.me.id).then((n) => n && refresh(true)).catch(() => {});   // 1er jeu lancé : XP vers le niveau 2
  const layer = document.createElement('div');
  layer.id = 'gamelayer'; layer.className = `gamelayer g-${id}`;
  // Une fois le jeu lancé, il ne reste que la flèche retour (le nom ne s'affiche que sur l'écran jaune d'ouverture)
  layer.innerHTML = `<div class="ghead"><button class="chip" data-gact="close" aria-label="Retour">‹</button><button class="chip gqbtn" data-gact="quests" hidden></button></div><div class="gqpanel" hidden></div><div class="gbody"></div>
    <div class="gsplash"><span>${esc(G.name)}</span></div>`;
  gameScrollY = window.scrollY; document.body.classList.add('ingame');   // l'appli en dessous est masquée : ses animations ne coûtent plus rien pendant la partie
  document.body.appendChild(layer);
  const qs = GAME_QUESTS[id] ?? [], gq = {};
  const qBtn = layer.querySelector('.gqbtn'), qPanel = layer.querySelector('.gqpanel');
  const qDraw = () => {
    if (!qs.length) return;
    const n = qs.filter((q) => gq[q.key]?.done).length;
    qBtn.hidden = false; qBtn.innerHTML = `${QUEST_SVG}<span>Quêtes ${n}/${qs.length}</span>`;
    qPanel.innerHTML = `<div class="gqh"><b>Quêtes du jour</b><small>Reviennent demain</small></div>` + qs.map((q) => {
      const r = gq[q.key] ?? { progress: 0, done: false }, pc = Math.round(100 * Math.min(r.progress, q.target) / q.target);
      return `<div class="gqi ${r.done ? 'ok' : ''}"><div class="gql"><span>${esc(q.label)}</span><em>${r.done ? 'Fait' : `${r.progress}/${q.target}`}</em></div><div class="gqbar"><i style="width:${r.done ? 100 : pc}%"></i></div><div class="gqr">+${q.reward} ${COIN_SVG}</div></div>`;
    }).join('');
  };
  const quest = (key, amount = 1) => {
    const q = qs.find((x) => x.key === key); if (!q || gq[key]?.done) return;
    const r = gq[key] ??= { progress: 0, done: false };
    r.progress = Math.min(q.target, q.mode === 'max' ? Math.max(r.progress, amount) : r.progress + amount);   // affichage immédiat, la base fait foi
    qDraw();
    state.api.gameQuest(state.me.id, key, amount).then((res) => {
      Object.assign(r, { progress: res.progress, done: res.done || r.done }); qDraw();
      if (res.just) { r.done = true; qDraw(); toast(`Quête réussie : ${q.label} · +${res.reward} colocoins`, 4500); refresh(true).catch(() => {}); }
    }).catch((e) => console.warn(e));
  };
  state.api.gameQuests(state.me.id).then((rows) => { rows.forEach((x) => { const q = qs.find((y) => y.key === x.quest); if (q) gq[x.quest] = { progress: Math.max(x.progress, gq[x.quest]?.progress ?? 0), done: x.done }; }); qDraw(); }).catch(() => qDraw());
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-gact="close"]')) closeGame();
    else if (e.target.closest('[data-gact="quests"]')) qPanel.hidden = !qPanel.hidden;
    else if (!qPanel.hidden && !e.target.closest('.gqpanel')) qPanel.hidden = true;
  });
  setTimeout(() => layer.querySelector('.gsplash')?.remove(), 1150);
  try {
    const mod = await import(G.mod);
    await new Promise((r) => setTimeout(r, 700)); // le jeu démarre quand l'écran jaune s'efface
    if (state.game !== id) return;
    gameHandle = mod.mount(layer.querySelector('.gbody'), {
      quest, balance: () => chipsOf(state.me.id), bird: state.me.bird, fps: store.get('coloc-fps') === '1',
      crate: async () => { const key = await state.api.openBirdCrate(state.me.id); await refresh(true); return key; },
      equipBird: (key) => saveProfile({ bird: key }), ...(id === 'ferme' ? farmCtx() : {}),
      async onEnd(r) {
        try {
          if (id === 'blackjack') await state.api.reportBlackjack(state.me.id, r.bet, r.net, r.hands, r.wins, r.blackjack);
          else await state.api.reportGame(state.me.id, id, r.score);
          await refresh(true);
        } catch (e) { console.error(e); toast("Score non enregistré : " + (e.message || 'erreur réseau')); }
      },
    });
  } catch (e) { console.error(e); toast('Impossible de charger ce jeu.'); closeGame(); }
}
function closeGame() {
  try { gameHandle?.destroy(); } catch { /* rien */ }
  gameHandle = null;
  document.getElementById('gamelayer')?.remove();
  document.body.classList.remove('ingame');
  state.game = null;
  if (state.pendingRefresh) { state.pendingRefresh = false; refresh().catch(() => {}); } else render();
  window.scrollTo(0, gameScrollY);
}

async function syncSub() {
  // Si les notifications sont déjà activées sur cet appareil, on (ré)associe l'appareil au prénom choisi.
  if (store.get('coloc-push') !== '1' || state.api.mode !== 'cloud' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Abonnement créé avec une autre clé VAPID que l'actuelle : le serveur le refuse (VapidPkHashMismatch). On le recrée, sans redemander la permission.
    if (sub && CONFIG.VAPID_PUBLIC_KEY && Notification.permission === 'granted') {
      const cur = new Uint8Array(sub.options?.applicationServerKey ?? []), want = b64ToU8(CONFIG.VAPID_PUBLIC_KEY);
      if (cur.length && (cur.length !== want.length || cur.some((v, i) => v !== want[i]))) {
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
      }
    }
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
    if (state.auth) { app.innerHTML = pinHTML(); return; }
    const btn = (m) => `<button data-action="pick" data-id="${m.id}">${esc(m.name)}</button>`;
    app.innerHTML = `<div class="pick"><h1>🏠 Coloc</h1><p>Qui es-tu ?</p>${colocs().map(btn).join('')}
      ${copains().length ? `<h3 class="sec" style="text-align:center">Copains</h3>${copains().map(btn).join('')}` : ''}</div>`;
    return;
  }
  const reqForMe = toConfirm().length;
  const duelsForMe = pendingForMe().length;
  const tab = state.tab;
  const anim = state.anim; state.anim = false;
  const me = state.me;
  const badge = (n, color) => (n ? `<span class="badge" ${color ? `style="background:${color}"` : ''}>${n}</span>` : '');
  const step = introStep();
  const pulse = (t) => (step && step.tab === t ? 'pulse' : '');
  app.innerHTML = `
    ${tab === 'me' ? '' : tab === 'tasks' ? weekHeaderHTML() : `<header class="top hdr">
      <button class="hav ${step?.tab === 'heads' ? 'pulse' : ''}" data-action="goperso" aria-label="Mon profil">${av(me, 44)}<span class="lvlcircle xs" title="Niveau" style="--lc:${lvlColor(lvlOf(me.id))}">${lvlOf(me.id)}</span></button>
      <button class="hcart" data-action="shop" data-slot="outfit" aria-label="Boutique" title="Boutique">${CART_SVG}</button>
      <button class="hcart ${dailyDue() || statsOf(me.id).wheel_ready ? 'dot' : ''} ${pulse('defis')}" data-action="tab" data-tab="defis" aria-label="Quêtes" title="Quêtes">${NAV_ICONS.defis()}</button>
      <span class="grow"></span>
      <button class="hchip cur-cc" data-action="exchange" title="Échanger des savons contre des colocoins">🪙 ${chipsOf(me.id)}</button>
      <button class="hchip cur-soap" data-action="goto-plateau" title="Plateau">🧼 ${soapOf(me.id)}</button>
          </header>
    `}
    <main class="${anim ? 'pg' : ''} ${tab === 'me' ? 'nohdr' : ''}">
      ${pushOn() || store.get('coloc-push-dismiss') === '1' || step ? '' : `
        <div class="banner">
          <span>Active les notifications pour recevoir les rappels, les alertes de rupture, les défis et les messages.</span>
          <span style="display:flex;gap:4px;align-items:center"><button class="btn" style="background:var(--accent);color:var(--on-accent);padding:10px 14px;width:auto" data-action="push">Activer</button><button class="x" data-action="dismiss" aria-label="Fermer">✕</button></span>
        </div>`}
      ${syncBarHTML()}${confirmBannerHTML(tab)}
      ${tab === 'tasks' ? tasksHTML() : tab === 'defis' ? defisTabHTML() : tab === 'games' ? gamesHTML() : tab === 'rank' ? rankHTML() : tab === 'budget' ? budgetHTML() : tab === 'cal' ? calendarHTML() : meHTML()}
    </main>
    ${step ? `<div class="coach" role="status"><div class="cn">Découverte · étape ${step.n} sur ${INTRO_STEPS.length}</div><b>${esc(step.title)}</b><p>${esc(step.text)}</p>
      <div class="cgo">${step.tab === 'heads' ? (tab === 'me' ? '👆 Change d\'onglet : ta tête est visible partout sauf dans Profil' : '👆 Touche ta tête, en haut à gauche') : step.tab === 'defis' ? '👆 Touche le livre « Quêtes », en haut' : `👇 Touche l\'onglet « ${esc(step.title)} » pour continuer`}</div></div>` : ''}
    <nav class="tabs ${me.kind === 'coloc' ? 'six' : ''}">
      <button data-action="tab" data-tab="tasks" class="${tab === 'tasks' ? 'active' : ''} ${pulse('tasks')}"><span class="ico">${NAV_ICONS.tasks()}</span><span class="tl">TÂCHES</span>${badge(reqForMe)}</button>
      ${me.kind === 'coloc' ? `<button data-action="tab" data-tab="budget" class="${tab === 'budget' ? 'active' : ''}"><span class="ico">${NAV_ICONS.budget()}</span><span class="tl">BUDGET</span>${badge(budgetMine() < 0 ? 1 : 0, 'var(--danger)')}</button>` : ''}
      <button data-action="tab" data-tab="cal" class="${tab === 'cal' ? 'active' : ''}"><span class="ico">${NAV_ICONS.cal()}</span><span class="tl">CALENDRIER</span>${badge(evToAnswer())}</button>
      <button data-action="tab" data-tab="games" class="${tab === 'games' ? 'active' : ''} ${pulse('games')}"><span class="ico">${NAV_ICONS.games()}</span><span class="tl">JEUX</span>${badge(duelsForMe)}</button>
      <button data-action="tab" data-tab="rank" class="${tab === 'rank' ? 'active' : ''} ${pulse('rank')}"><span class="ico">${NAV_ICONS.rank()}</span><span class="tl">CLASSEMENT</span></button>
      <button data-action="tab" data-tab="me" class="${tab === 'me' ? 'active' : ''} ${pulse('me')}"><span class="ico">${NAV_ICONS.me()}</span><span class="tl">PERSO</span>${badge(unreadCount() + perksOwed().length, 'var(--danger)')}</button>
    </nav>
    ${sheetHTML()}`;
}

// Tâches faites par un autre coloc : on peut les confirmer depuis n'importe quel onglet
// Onglet Tâches : l'en-tête habituel est remplacé par les savons gagnés cette semaine (tête de chaque coloc)
function weekHeaderHTML() {
  const me = state.me;
  const list = colocs().map((m) => ({ m, n: weekSoap(m.id) })).sort((a, b) => b.n - a.n || (a.m.id === me.id ? -1 : 0));
  return `<header class="top wkhdr">
    <div class="wkt"><b>🧼 Savons cette semaine</b><button class="hcart calbtn ${dailyDue() || statsOf(me.id).wheel_ready ? 'dot' : ''} ${introStep()?.tab === 'defis' ? 'pulse' : ''}" data-action="tab" data-tab="defis" aria-label="Quêtes" title="Quêtes">${NAV_ICONS.defis()}</button>${me.kind === 'coloc' ? `<span class="wkdice" title="Dés restants">🎲 ${diceLeft(me.id)}</span>` : ''}</div>
    <div class="wkheads">${list.map(({ m, n }, i) => `<div class="wkh ${m.id === me.id ? 'me' : ''}">${i === 0 && n > 0 ? '<i class="crown">👑</i>' : ''}${av(m, 42)}<small>${esc(m.name)}</small><b>${n} 🧼</b></div>`).join('')}</div>
  </header>`;
}
function syncBarHTML() {
  if (!state.syncErr) return '';
  return `<div class="syncerr"><span>⚠️ Données non à jour : ${esc(state.syncErr)}</span><button class="mini" data-action="sync">↻ Réessayer</button></div>`;
}
function confirmBannerHTML(tab) {
  const list = toConfirm();
  if (!list.length || (tab === 'tasks' && state.tasksSeg === 'tasks')) return '';   // dans la liste des tâches, la section « À confirmer » suffit
  return `<div class="confirmban"><b>À confirmer</b>${list.map((l) => {
    const K = TASK_KINDS[l.kind];
    return `<div class="crow"><span>${esc(nameOf(l.doer_id))} dit avoir fait : ${K.emoji} ${esc(K.short)} <small>(+${l.soap} 🧼)</small></span>
      <button class="mini ok" data-action="task-ok" data-id="${l.id}">✓ Oui</button><button class="mini" data-action="task-no" data-id="${l.id}">✗ Non</button></div>`;
  }).join('')}</div>`;
}

// Introduction : tant que les 5 onglets n'ont pas été visités, on guide le nouvel arrivant
const introStep = () => {
  if (!state.me || state.game) return null;
  const mask = statsOf(state.me.id).quest_mask ?? 0;
  if (questDone(mask)) return null;
  return INTRO_STEPS.find((x) => !(mask & (1 << (x.n - 1)))) ?? null;
};


/* ---------- Onglet 1 : tâches (liste des tâches réalisables, stocks) ---------- */
const HOUR = 3600000;
const pendingLogs = () => state.logs.filter((l) => l.status === 'pending');
// Tâches faites par un autre coloc qui attendent MA confirmation
const toConfirm = () => (state.me?.kind === 'coloc' ? pendingLogs().filter((l) => l.doer_id !== state.me.id) : []);
function ago(iso8) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso8)) / 60000));
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 48 * 60) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}
const fmtWait = (ms) => (ms < HOUR ? `${Math.max(1, Math.round(ms / 60000))} min` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / (24 * HOUR))} j`);
// État d'une tâche : disponible, en attente de confirmation, ou récemment faite
function kindStatus(kind) {
  const pend = pendingLogs().find((l) => l.kind === kind);
  if (pend) return { st: 'pending', log: pend };
  const last = state.logs.filter((l) => l.kind === kind && l.status === 'validated').sort((a, b) => b.id - a.id)[0];
  if (last) {
    const left = Date.parse(last.answered_at) + TASK_KINDS[kind].cooldownH * HOUR - Date.now();
    if (left > 0) return { st: 'cooldown', log: last, left };
  }
  return { st: 'free' };
}

function tasksHTML() {
  const out = state.products.filter((p) => p.out_of_stock).length;
  const seg = state.tasksSeg;
  return `<div class="seg" style="margin-bottom:12px">${[['tasks', 'Tâches'], ['plateau', 'Plateau'], ['stock', `Stocks${out ? ` (${out})` : ''}`]].map(([k, l]) =>
    `<button class="${seg === k ? 'on' : ''}" data-action="tseg" data-v="${k}">${l}</button>`).join('')}</div>
    ${seg === 'stock' ? stockHTML() : seg === 'plateau' ? plateauHTML() : taskListHTML()}`;
}

/* ---------- Plateau (jeu de l'oie, remis à zéro chaque lundi) ---------- */
const shownPos = (id) => (state.moving && state.moving.id === id ? state.moving.pos : posThisWeek(id));
const posThisWeek = (id) => state.dice.filter((r) => r.member_id === id && r.week === currentWeek()).reduce((best, r) => (!best || r.id > best.id ? r : best), null)?.to_pos ?? 0;   // position cumulée (tours infinis)
const cellOfPos = (pos) => (pos <= 0 ? 0 : ((pos - 1) % GOOSE.size) + 1);
const lapsOf = (pos) => Math.floor(pos / GOOSE.size);
const dicePriceAt = (k) => DICE_PRICES[Math.min(k, DICE_PRICES.length - 1)];
const diceCost = (id) => dicePriceAt(rollsToday(id));   // savons à avoir gagnés CETTE SEMAINE (ils ne sont pas dépensés)
const weekSoap = (id) => state.logs.filter((l) => l.doer_id === id && l.status === 'validated' && l.answered_at && iso(new Date(l.answered_at)) >= currentWeek()).reduce((a, l) => a + l.soap, 0);
function diceLeft(id) {                                  // dés que tu peux lancer maintenant
  let n = 0; const ws = weekSoap(id);
  for (let k = rollsToday(id); k < DICE_MAX_DAY && dicePriceAt(k) <= ws; k++) n++;
  return n;
}
const rollsToday = (id) => state.dice.filter((r) => r.member_id === id && iso(new Date(r.created_at)) === iso(new Date())).length;
function cellLabel(n) {
  const c = GOOSE.cells[n];
  if (n === GOOSE.size) return '<em class="cl fin">🏁</em>';
  if (!c) return '';
  if (c.xp) return `<em class="cl xp">+${c.xp}</em>`;
  if (c.chips) return `<em class="cl tr">+${c.chips}🪙</em>`;
  if (c.back) return `<em class="cl bk">−${c.back}</em>`;
  if (c.goose) return '<em class="cl go">Oie</em>';
  return '';
}
const BEACH_SCENE = `<svg class="bscene" viewBox="0 0 360 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fcdf5"/><stop offset="1" stop-color="#d6f3ff"/></linearGradient>
  <linearGradient id="bsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fa8d0"/><stop offset="1" stop-color="#76dde6"/></linearGradient></defs>
  <rect width="360" height="150" fill="url(#bsky)"/>
  <circle class="sunhalo" cx="300" cy="36" r="30" fill="#ffe36a" opacity=".35"/><circle cx="300" cy="36" r="20" fill="#ffd93b"/>
  <g fill="#fff" opacity=".9"><ellipse cx="70" cy="26" rx="26" ry="8"/><ellipse cx="90" cy="20" rx="18" ry="8"/><ellipse cx="200" cy="40" rx="22" ry="7"/><ellipse cx="216" cy="35" rx="14" ry="6"/></g>
  <rect y="66" width="360" height="62" fill="url(#bsea)"/>
  <g class="waves" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".75"><path d="M10 80q10-6 20 0t20 0"/><path d="M130 76q10-6 20 0t20 0"/><path d="M250 86q10-6 20 0t20 0"/><path d="M60 98q10-6 20 0t20 0"/><path d="M200 104q10-6 20 0t20 0"/></g>
  <g transform="translate(150 70)"><g class="boat"><path d="M-22 0h44l-8 10h-28z" fill="#c0392b"/><rect x="-1" y="-30" width="2" height="30" fill="#6b4a2b"/><path d="M3-28v24l18-4z" fill="#fff"/><path d="M-3-24v20l-14-4z" fill="#ffe3a3"/></g></g>
  <path d="M0 122q30-10 60 0t60 0 60 0 60 0 60 0 60 0V150H0z" fill="#f4dd9d"/>
  <path d="M0 120q30-10 60 0t60 0 60 0 60 0 60 0 60 0" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/></svg>`;
const PALM = `<svg viewBox="0 0 80 110" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M40 108C38 80 44 56 52 34" fill="none" stroke="#8a5a2b" stroke-width="7" stroke-linecap="round"/>
  <path d="M40 98l6-1M41 86l7-1M43 74l7-1M46 62l6-1" stroke="#6b4420" stroke-width="2"/>
  <g fill="#2e9e4f"><path d="M52 34C40 20 22 24 10 38c14-8 26-6 42-4z"/><path d="M52 34C48 16 58 4 72 2c-8 8-10 18-20 32z"/><path d="M52 34C66 22 80 28 84 42c-12-8-20-8-32-8z"/><path d="M52 34C34 30 20 42 18 56c8-12 18-18 34-22z"/><path d="M52 34c14 4 22 16 20 30-4-12-10-20-20-30z"/></g>
  <circle cx="50" cy="38" r="4" fill="#5b3a1a"/><circle cx="56" cy="40" r="4" fill="#5b3a1a"/></svg>`;
const BEACH_FOOT = `<svg class="bfoot" viewBox="0 0 360 44" preserveAspectRatio="xMidYMax meet" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(26 4)"><path d="M0 28L16 0" stroke="#8a5a2b" stroke-width="3"/><path d="M-14 12C-8-6 16-10 30 6z" fill="#e74c3c"/><path d="M-1 8C2-3 12-6 18 4z" fill="#fff"/></g>
  <g transform="translate(120 26)" fill="#ff8a65"><ellipse cx="0" cy="0" rx="11" ry="7"/><circle cx="-5" cy="-8" r="2.5"/><circle cx="5" cy="-8" r="2.5"/><path d="M-11-2l-8-5M11-2l8-5" stroke="#ff8a65" stroke-width="3"/></g>
  <g transform="translate(205 28)"><path d="M0-9l3 7 8 0-6 5 2 8-7-4-7 4 2-8-6-5 8 0z" fill="#ffb74d"/></g>
  <g transform="translate(262 30)"><path d="M0 0a10 9 0 0 1 20 0z" fill="#fce4ec" stroke="#f48fb1" stroke-width="1.5"/></g>
  <g transform="translate(318 10)"><rect x="0" y="14" width="30" height="12" rx="3" fill="#4fc3f7"/><rect x="0" y="14" width="30" height="4" fill="#fff" opacity=".6"/></g></svg>`;

// Plateau en anneau (9 × 8 cases, 30 cases sur le pourtour) : la case 30 rejoint la case 1, on tourne à l'infini
const RING = { cols: 9, rows: 8 };
const ringXY = (n) => {                       // n = 1..30 → [colonne, ligne] (ligne 0 = en haut)
  const { cols, rows } = RING;
  if (n <= cols) return [n - 1, rows - 1];                                   // bas : gauche → droite
  if (n <= cols + rows - 1) return [cols - 1, rows - 1 - (n - cols)];        // droite : vers le haut
  if (n <= 2 * cols + rows - 2) return [cols - 1 - (n - (cols + rows - 1)), 0];   // haut : droite → gauche
  return [0, n - (2 * cols + rows - 2)];                                     // gauche : vers le bas
};
function plateauHTML() {
  const me = state.me, isColoc = me.kind === 'coloc';
  const { cols, rows } = RING;
  const pawns = {};
  colocs().forEach((m) => { const p = cellOfPos(shownPos(m.id)); (pawns[p] ??= []).push(m); });
  const pawnHTML = (n, sz = 16) => (pawns[n] ?? []).map((m) => `<span class="pawn ${m.id === me.id ? 'me' : ''} ${state.moving?.id === m.id ? 'mv' : ''}" title="${esc(m.name)}">${av(m, sz)}</span>`).join('');
  const cells = [], pts = [];
  for (let n = 1; n <= GOOSE.size; n++) {
    const [c, r] = ringXY(n);
    pts.push(`${(c + 0.5) * 100},${(r + 0.5) * 100}`);
    cells.push(`<div class="gc ${GOOSE.cells[n] ? 'sp' : ''} ${n === GOOSE.size ? 'end' : ''} ${state.moving && cellOfPos(state.moving.pos) === n ? 'on' : ''}" style="grid-column:${c + 1};grid-row:${r + 1}"><b>${n}</b>${cellLabel(n)}<div class="pw">${pawnHTML(n)}</div></div>`);
  }
  pts.push(pts[0]);                           // boucle fermée
  const pos = shownPos(me.id), cost = diceCost(me.id), have = weekSoap(me.id), laps = lapsOf(pos), left = diceLeft(me.id);
  const can = isColoc && have >= cost && !state.rolling && rollsToday(me.id) < DICE_MAX_DAY;
  const hist = state.dice.slice(0, 15);
  const free = DICE_PRICES[0] === 0;
  const ranked = colocs().map((m) => ({ m, l: lapsOf(posThisWeek(m.id)) })).sort((x, y) => y.l - x.l || x.m.name.localeCompare(y.m.name));
  const top = ranked[0]?.l ?? 0;
  const last = (state.pweeks ?? [])[0];
  const lastTxt = last ? (last.winners?.length ? `Semaine passée : ${last.winners.map(nameOf).map(esc).join(' & ')} · ${last.laps} tour${last.laps > 1 ? 's' : ''} · +${GOOSE.weekWin} 🪙` : '') : '';
  const center = `<div class="gcenter">
      <div class="gttl">🏁 Tours de la semaine</div>
      <div class="glaps">${ranked.map(({ m, l }) => `<div class="${l && l === top ? 'lead' : ''}">${av(m, 18)}<span class="nm">${esc(m.name)}</span><b>${l}</b>${l && l === top ? '<em>👑</em>' : ''}</div>`).join('')}</div>
      <div class="gdep"><span>🏖️ Départ</span><div class="pw">${pawnHTML(0, 18)}</div></div>
      ${lastTxt ? `<small class="glast">${lastTxt}</small>` : ''}
    </div>`;
  return `
    <p class="summary" style="margin-top:0">Le plateau est une <b>boucle</b> : on tourne à l'infini. Chaque tour terminé rapporte ${GOOSE.finish.xp} XP, et à la fin de la semaine, celui qui a fait le <b>plus de tours</b> gagne <b>${GOOSE.weekWin} 🪙</b>. Le <b>premier dé du jour est gratuit</b>. Les suivants se débloquent avec tes <b>savons gagnés cette semaine</b> (${DICE_PRICES.slice(1).join(', ')} 🧼) : ils ne sont <b>pas dépensés</b>. ${DICE_MAX_DAY} dés maximum par jour.</p>
    <div class="perkbox"><b>Récompense du premier tour de la semaine</b><span>${esc(perkOfWeekDef().title)}</span><small>${esc(perkOfWeekDef().short)}</small></div>
    <div class="beach ring">${state.moving ? `<div class="dieover"><span class="die d${state.moving.roll} ${state.moving.tumble ? 'tumble' : ''}">${Array.from({ length: state.moving.roll }, () => '<i></i>').join('')}</span></div>` : ''}
      <div class="ggrid ring" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">
        <svg class="gpath" viewBox="0 0 ${cols * 100} ${rows * 100}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="#e7c27b" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts.join(' ')}" fill="none" stroke="#fff3cf" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
        <div class="glagoon" style="grid-column:2/${cols};grid-row:2/${rows}"></div>
        <span class="palm c">${PALM}</span>
        ${cells.join('')}
        <div style="grid-column:2/${cols};grid-row:2/${rows};position:relative;z-index:2">${center}</div>
      </div></div>
    <div class="legend"><span><i class="cl xp">+N</i> EXP</span><span><i class="cl tr">🪙</i> colocoins</span><span><i class="cl bk">−1</i> piège</span><span><i class="cl go">Oie</i> avance encore</span></div>
    <button class="btn primary" style="margin-top:12px" data-action="roll" ${can ? '' : 'disabled'}>${!isColoc ? 'Réservé aux colocataires' : state.rolling ? 'Le dé roule…' : rollsToday(me.id) >= DICE_MAX_DAY ? 'Plus de dé aujourd\'hui' : have < cost ? `Encore ${cost - have} 🧼 cette semaine pour le prochain dé` : cost === 0 ? 'Lancer le dé · gratuit' : 'Lancer le dé'}${isColoc ? `<span class="dleft" title="Dés restants">🎲 ${left}</span>` : ''}</button>
    <div class="det" style="text-align:center">${have} 🧼 gagnés cette semaine · case ${cellOfPos(pos) || 'départ'} sur ${GOOSE.size} · ${laps} tour${laps > 1 ? 's' : ''} terminé${laps > 1 ? 's' : ''} cette semaine</div>
    <h3 class="sec">Derniers lancers</h3>
    ${hist.length ? hist.map((r) => `<div class="up hist"><div class="mini-av">${av(memberById(r.member_id), 38)}</div>
      <div class="txt"><b>${esc(nameOf(r.member_id))} : dé ${r.roll}</b><small>case ${cellOfPos(r.from_pos) || 'départ'} → ${cellOfPos(r.to_pos) || 'départ'}${r.note ? ` · ${esc(r.note)}` : ''} · ${ago(r.created_at)} · </small></div></div>`).join('')
      : '<div class="empty-msg" style="padding:16px 0">Personne n\'a encore lancé le dé.</div>'}`;
}

function taskListHTML() {
  const me = state.me, isColoc = me.kind === 'coloc';
  const vac = activePerksOf(me.id).find((pk) => pk.kind === 'vacances');
  const confirm = toConfirm();
  const mine = pendingLogs().filter((l) => l.doer_id === me.id);
  const done = state.logs.filter((l) => l.status === 'validated').slice(0, 20);
  const row = (l, actions) => {
    const K = TASK_KINDS[l.kind], doer = memberById(l.doer_id);
    return `<div class="up"><div class="mini-av">${av(doer, 44)}</div>
      <div class="txt"><b>${esc(doer?.name)} : ${K.emoji} ${esc(K.short)}</b><small>${ago(l.created_at)} · +${l.soap} 🧼</small></div>${actions}</div>`;
  };
  return `
    ${vac ? `<div class="perk vacances"><b>${esc(perkDef('vacances').title)}</b><small>Tu as gagné une semaine sans tâche ménagère grâce au plateau.</small></div>` : ''}
    ${confirm.length ? `<h3 class="sec" style="margin-top:0">À confirmer</h3>
      <p class="summary" style="margin-top:0">Ces tâches ont été faites par un autre coloc. Confirme seulement si c'est vrai !</p>
      ${confirm.map((l) => row(l, `<button class="mini ok" data-action="task-ok" data-id="${l.id}">✓ Oui</button><button class="mini" data-action="task-no" data-id="${l.id}">✗ Non</button>`)).join('')}` : ''}
    ${mine.length ? `<h3 class="sec" ${confirm.length ? '' : 'style="margin-top:0"'}>En attente de confirmation</h3>
      ${mine.map((l) => row(l, `<button class="mini" data-action="task-cancel" data-id="${l.id}">Annuler</button>`)).join('')}` : ''}
    <h3 class="sec" ${confirm.length || mine.length ? '' : 'style="margin-top:0"'}>Tâches à faire</h3>
    ${isColoc ? '<p class="summary" style="margin-top:0">Fais une tâche quand tu veux : touche-la, confirme, puis un autre coloc validera.</p>'
      : '<p class="summary" style="margin-top:0">Les tâches ménagères sont réservées aux colocataires.</p>'}
    <div class="klist">${TASK_GROUPS.map((G) => {
      const ks = Object.entries(TASK_KINDS).filter(([, K]) => K.group === G.key);
      const free = ks.filter(([k]) => kindStatus(k).st === 'free').length, max = Math.max(...ks.map(([, K]) => K.soap));
      return `<button class="kcard" style="--c:${G.color}" data-action="task-group" data-id="${G.key}" ${isColoc ? '' : 'disabled'}>
        <span class="kemo">${G.emoji}</span>
        <span class="ktxt"><b>${esc(G.label)}</b><small>${ks.length} choix · ${free} disponible${free > 1 ? 's' : ''}</small></span>
        <span class="ksoap">jusqu'à +${max} 🧼</span></button>`;
    }).join('')}</div>
    ${done.length ? `<h3 class="sec">Dernières tâches</h3>${done.map((l) => {
      const K = TASK_KINDS[l.kind];
      return `<div class="up hist"><div class="mini-av">${av(memberById(l.doer_id), 38)}</div>
        <div class="txt"><b>${esc(nameOf(l.doer_id))} : ${K.emoji} ${esc(K.short)}</b><small>${ago(l.answered_at)} · +${l.soap} 🧼 · confirmé par ${esc(nameOf(l.validator_id))}</small></div></div>`;
    }).join('')}` : ''}`;
}

// Menu d'une catégorie : les différents choix
function taskGroupHTML(s) {
  const G = TASK_GROUPS.find((g) => g.key === s.group), isColoc = state.me.kind === 'coloc';
  return sheetWrap(`
    <div class="sh"><div><h2>${G.emoji} ${esc(G.label)}</h2><div class="when">Choisis ce que tu as fait</div></div>${closeBtn}</div>
    <div class="klist">${Object.entries(TASK_KINDS).filter(([, K]) => K.group === G.key).map(([k, K]) => {
      const { st, log, left } = kindStatus(k);
      const sub = st === 'pending' ? `⏳ ${esc(nameOf(log.doer_id))} l'a faite, à confirmer`
        : st === 'cooldown' ? `✅ ${esc(nameOf(log.doer_id))} ${ago(log.answered_at)} · dispo dans ${fmtWait(left)}` : esc(K.detail);
      return `<button class="kcard ${st}" style="--c:${G.color}" data-action="task-pick" data-id="${k}" ${st === 'free' && isColoc ? '' : 'disabled'}>
        <span class="kemo">${K.emoji}</span><span class="ktxt"><b>${esc(K.room)}</b><small>${sub}</small></span><span class="ksoap">+${K.soap} 🧼</span></button>`;
    }).join('')}</div>`, G.color);
}

// Fenêtre de confirmation d'une tâche (avant l'envoi)
function taskConfirmHTML(s) {
  const K = TASK_KINDS[s.kind];
  return sheetWrap(`
    <div class="sh"><div><h2>${K.emoji} ${esc(K.label)}</h2><div class="when">${esc(K.detail)}</div></div>${closeBtn}</div>
    <div class="reward">+${K.soap} 🧼 · +${K.soap * XP_RULES.taskPerSoap} XP une fois confirmée</div>
    <div class="det">Tu as vraiment fait cette tâche ? Un autre coloc devra confirmer pour que tu gagnes tes savons.</div>
    <div class="sact"><button class="btn primary" data-action="task-submit" data-id="${s.kind}">Oui, je l'ai faite</button><button class="btn" data-action="close">Annuler</button></div>`, K.color);
}

// Écran du code secret (4 chiffres)
function pinHTML() {
  const a = state.auth, m = memberById(a.id);
  const title = a.mode === 'check' ? 'Entre ton code secret' : a.first == null ? 'Crée ton code secret' : 'Confirme ton code';
  const hint = a.mode === 'check' ? 'Code à 4 chiffres' : a.first == null ? 'Choisis 4 chiffres que toi seul connais. Tu devras les saisir à chaque connexion.' : 'Retape le même code';
  return `<div class="pick pinpage">
    <div class="pin-av">${av(m, 84)}</div>
    <h1>${esc(m?.name)}</h1><p><b>${title}</b><br><small>${hint}</small></p>
    <div class="pdots ${a.err ? 'bad' : ''}">${[0, 1, 2, 3].map((i) => `<i class="${i < a.pin.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="perr">${esc(a.err)}</div>
    <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === '' ? '<span></span>'
      : `<button data-action="pin-key" data-v="${k}" ${a.busy ? 'disabled' : ''} aria-label="${k === 'del' ? 'Effacer' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}</div>
    <button class="link" data-action="pin-back">‹ Choisir un autre prénom</button>
  </div>`;
}

/* ---------- Onglet Défis : récompense du jour tout en haut, puis les défis ---------- */
function dailyCardHTML() {
  const st = statsOf(state.me.id), due = dailyDue();
  return `<div class="dailycard ${due ? 'due' : ''}">
    <div class="dh"><b>🎁 Récompense du jour</b><small>${due ? 'À récupérer' : 'Récupérée · reviens demain'}</small></div>
    <div class="dreward"><span>🪙 +${DAILY.chips} colocoins</span><span>+${DAILY.xp} XP</span></div>
    ${due ? `<button class="btn primary" data-action="daily-claim">Récupérer</button>` : ''}
    ${st.wheel_ready ? `<button class="wheelban" data-action="wheel">🎡 Ta roue de la fortune est prête ! <b>Tourner</b></button>` : ''}
  </div>`;
}
const defisTabHTML = () => dailyCardHTML() + `<h3 class="sec">Défis ${unlockedKeys(state.me.id).size}/${CHALLENGES.length}</h3>` + defisHTML();

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
  if (state.popups?.length) return { type: 'popup' };
  return null;
}
function closeSheet() {
  if (state.sheet) state.sheet = null;
  else if (state.won.length) state.won = [];
  else if (state.levelUps.length) state.levelUps = [];
  else if (state.popups?.length) { const [x] = state.popups.splice(0, 1); state.api.popupSeen(state.me.id, x.id).catch(() => {}); }
  render();
}

function sheetHTML() {
  const s = currentSheet();
  if (!s) return '';
  switch (s.type) {
    case 'profile': return profileSheetHTML(s);
    case 'won': return wonSheetHTML();
    case 'dice': return diceSheetHTML(s);
    case 'msg': return msgSheetHTML(s);
    case 'ginfo': return gameInfoHTML(s);
    case 'shop': return shopHTML(s);
    case 'exchange': return exchangeHTML();
    case 'crate': return crateHTML(s);
    case 'cal-new': return calNewHTML();
    case 'soaphist': return soapHistHTML();
    case 'wheel': return wheelSheetHTML(s);
    case 'task-do': return taskConfirmHTML(s);
    case 'task-group': return taskGroupHTML(s);
    case 'levelup': return levelUpSheetHTML();
    case 'exp': return expFormHTML(s);
    case 'expd': return expDetailHTML(s);
    case 'popup': return popupHTML(state.popups[0]);
    case 'duel-pick': return duelPickHTML();
    case 'duel-new': return duelNewHTML(s);
    case 'duel-play': return duelPlayHTML(s);
    case 'duel-result': return duelResultHTML(s);
    default: return '';
  }
}

// Fenêtre surprise « jeu vidéo » (une fois par message)
const linkify = (h) => h.replace(/https:\/\/[^\s<]+/g, (u) => `<a class="pxlink" href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>`);
function popupHTML(pp) {
  const [hero, ...rest] = String(pp.body).split('\n'), last = rest.length ? rest.pop() : null;
  const confetti = Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.35}s;background:${['#ffd23f', '#ff4d6d', '#3be8b0', '#4cc9f0', '#b388ff'][i % 5]}"></i>`).join('');
  return `<div class="overlay popov" data-action="noop"><div class="pxwin" role="dialog" aria-modal="true">
    <div class="pxconf" aria-hidden="true">${confetti}</div>
    <div class="pxtop"><span>★ ÉVÉNEMENT SPÉCIAL ★</span></div>
    <div class="pxcake" aria-hidden="true">${PX_CAKE}</div>
    <h2 class="pxtitle">${esc(pp.title)}</h2>
    <div class="pxlvl"><b>${esc(hero)}</b><span>NIVEAU +1</span></div>
    ${rest.map((t, i) => `<div class="pxdlg"><em>${i ? 'LOG' : 'MESSAGE'}</em>${esc(t)}</div>`).join('')}
    ${last ? `<div class="pxquest"><div class="pxqh"><span>NOUVELLE QUÊTE</span><small>Multijoueur</small></div><p>${linkify(esc(last))}</p>
      <div class="pxrew"><span>${PX_MUG}Bière à volonté</span><span>${PX_FOOD}Buffet à volonté</span><span>${PX_PAD}Invite ta team</span></div></div>` : ''}
    <button class="pxbtn" data-action="close">APPUIE SUR START</button>
  </div></div>`;
}
function levelUpSheetHTML() {
  const l = state.levelUps[state.levelUps.length - 1];
  const p = levelProgress(xpOf(state.me.id));
  return sheetWrap(`
    <div class="sh"><div><h2>Niveau ${l.level} !</h2><div class="when">Bravo ${esc(state.me.name)}, tu montes en niveau</div></div>${closeBtn}</div>
    ${l.skins.length ? `<div class="det">Nouveau${l.skins.length > 1 ? 'x' : ''} personnage${l.skins.length > 1 ? 's' : ''} débloqué${l.skins.length > 1 ? 's' : ''} :</div>
      <div class="shop" style="margin-top:8px">${l.skins.map((k) => `<div class="item">${av({ ...state.me, outfit: k }, 84)}<b>${esc(outfitName(k, state.me.gender))}</b></div>`).join('')}</div>` : '<div class="det">Continue comme ça pour débloquer de nouveaux personnages.</div>'}
    ${l.level % LEVEL_BONUS.every === 0 ? `<div class="det" style="font-weight:800">Palier ${l.level} : +${LEVEL_BONUS.chips} 🪙 offerts !</div>` : ''}
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
      <div><h2>Défier ${esc(opp.name)}</h2><div class="when">Chifoumi · mise ${XP_RULES.duelStake} 🪙</div></div>${closeBtn}</div>
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
      <div><h2>${esc(ch?.name)} te défie !</h2><div class="when">${d.wager ? `Mise : ${d.wager} 🪙` : 'Chifoumi'}</div></div>${closeBtn}</div>
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
  const headline = tie ? '🤝 Égalité !' : won ? '🎉 Victoire !' : '😅 Perdu…';
  const detail = tie ? 'Égalité : personne ne perd de colocoins, on recommence ?'
    : won ? (d.wager ? `Tu gagnes +${d.wager} 🪙 contre ${esc(other?.name)}` : `Tu bats ${esc(other?.name)} !`)
    : (d.wager ? `Tu perds −${d.wager} 🪙 contre ${esc(other?.name)}` : `${esc(other?.name)} gagne cette fois.`);
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
function gamesHTML() { return gamesListHTML(); }
function gamesListHTML() {
  const me = state.me;
  const received = pendingForMe();
  const sent = state.duels.filter((d) => d.status === 'pending' && d.challenger_id === me.id);
  const hist = state.duels.filter((d) => d.status === 'done').slice(0, 8);
  return `
    ${received.length ? `<h3 class="sec" style="margin-top:0">Défis reçus</h3>${received.map((d) => {
      const ch = memberById(d.challenger_id);
      return `<div class="up"><div class="mini-av">${av(ch, 44)}</div>
        <div class="txt"><b>${esc(ch?.name)} te défie</b><small>Chifoumi · mise ${XP_RULES.duelStake} 🪙</small></div>
        <button class="mini ok" data-action="duel-open" data-id="${d.id}">Relever</button>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Refuser</button></div>`;
    }).join('')}` : ''}

    <button class="gfarm" data-action="game" data-id="ferme" aria-label="Colo-Ferme">${farmArt()}<span class="gt-name">Colo-Ferme</span>${farmReadyBadge()}</button>
    <div class="gtiles">${Object.entries(GAMES).filter(([, g]) => !g.hidden).map(([id, g]) => `
      <button class="gtile g-${g.cls}" data-action="${g.direct === 'duel' ? 'duel-pick' : g.direct ? 'game' : 'ginfo'}" data-id="${id}" aria-label="${esc(g.name)}">${gameArt(g.cls)}${g.paid || g.duel ? '<span class="paidbadge" title="Payant (colocoins)">🪙</span>' : ''}<span class="gt-name">${esc(g.name)}</span></button>`).join('')}</div>

    ${sent.length ? `<h3 class="sec">Mes défis en attente</h3>${sent.map((d) => `
      <div class="up"><div class="mini-av">${av(memberById(d.opponent_id), 44)}</div>
        <div class="txt"><b>En attente de ${esc(nameOf(d.opponent_id))}</b><small>ton coup est secret</small></div>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Annuler</button></div>`).join('')}` : ''}

    <h3 class="sec">Derniers duels</h3>
    ${hist.length ? hist.map((d) => {
      const ch = memberById(d.challenger_id), op = memberById(d.opponent_id);
      const w = d.winner_id ? nameOf(d.winner_id) : null;
      const mineD = d.challenger_id === me.id || d.opponent_id === me.id;
      return `<div class="up hist ${mineD ? 'mine' : ''}"><div class="vs-av">${av(ch, 38)}${av(op, 38)}</div>
        <div class="txt"><b>${esc(ch?.name)} ${moveEmoji(d.challenger_move)} vs ${moveEmoji(d.opponent_move)} ${esc(op?.name)}</b>
        <small>${w ? `${esc(w)} gagne` : 'Égalité'}</small></div></div>`;
    }).join('') : '<div class="empty-msg" style="padding:16px 0">Aucun duel pour l\'instant. Lance le premier !</div>'}`;
}


/* ---------- Colo-Ferme ---------- */
const farmOf = (id) => state.farm.filter((p) => p.member_id === id);
const farmSlots = (id) => state.farmSt.find((x) => x.member_id === id)?.slots ?? FARM.baseSlots;
const cropOf = (k) => FARM.crops.find((c) => c.key === k);
function farmStatus(p) {
  const t = Date.parse(p.ready_at), n = Date.now();
  if (t > n) return 'grow';
  return n > t + FARM.witherH * 3600000 ? 'dead' : 'ready';
}
function farmReadyBadge() {
  const n = state.me?.kind === 'coloc' ? farmOf(state.me.id).filter((p) => farmStatus(p) === 'ready').length : 0;
  return n ? `<span class="gbadge">${n} à récolter</span>` : '';
}
function farmArt() {
  return `<svg class="gart" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8f2"/><stop offset="1" stop-color="#d8f0ff"/></linearGradient></defs>
    <rect width="400" height="150" fill="url(#fsky)"/><circle cx="335" cy="34" r="20" fill="#ffd84a"/>
    <path d="M0 78 Q70 40 140 74 T290 70 T400 62 V150 H0Z" fill="#4c9a5b"/><path d="M0 92 Q100 64 200 90 T400 84 V150 H0Z" fill="#6cbc6a"/>
    <path d="M0 110 H400 V150 H0Z" fill="#8a5a2c"/>
    <g stroke="#6b4420" stroke-width="3"><path d="M0 122 H400 M0 136 H400"/></g>
    <g stroke="#3a2412" stroke-width="1.6"><circle cx="40" cy="112" r="8" fill="#e4891c"/><circle cx="100" cy="112" r="8" fill="#e63b2e"/><circle cx="160" cy="112" r="8" fill="#f3b51d"/><circle cx="220" cy="112" r="8" fill="#35602a"/><circle cx="280" cy="112" r="8" fill="#d02a4c"/><circle cx="340" cy="112" r="8" fill="#f2a52b"/></g>
    <g fill="#c0392b"><rect x="40" y="38" width="46" height="34"/><path d="M34 40 L63 18 L92 40Z" fill="#8a2b20"/></g><rect x="56" y="52" width="14" height="20" fill="#f5e6c8"/>
  </svg>`;
}

// Décors des tuiles de jeux (dessins originaux en SVG, sans texte : le nom est ajouté par-dessus)
function gameArt(cls) {
  const head = (w, h, inner) => `<svg class="gart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
  if (cls === 'chif') return head(200, 174, `
    <defs><linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#b5379b"/></linearGradient></defs><rect width="200" height="174" fill="url(#gc)"/>
    <path d="M18 100 l14-30 l34-8 l18 24 l-6 32 l-34 8 z" fill="#8b929c" stroke="#4a4f57" stroke-width="3" stroke-linejoin="round"/><path d="M34 74 l22-4 l10 14" fill="none" stroke="#c4c9d0" stroke-width="4" stroke-linecap="round"/>
    <g transform="rotate(-6 100 76)"><rect x="76" y="34" width="50" height="64" rx="4" fill="#fff" stroke="#d6dbe3" stroke-width="3"/><path d="M114 34 l12 12 h-12z" fill="#e3e8ef"/><path d="M85 56h30M85 67h30M85 78h22" stroke="#9aa3b2" stroke-width="3" stroke-linecap="round"/></g>
    <g transform="translate(150 70)"><path d="M-22 -40 L10 8 M22 -40 L-10 8" stroke="#dfe5ee" stroke-width="9" stroke-linecap="round"/><path d="M-22 -40 L10 8 M22 -40 L-10 8" stroke="#8b95a5" stroke-width="3" stroke-linecap="round"/><circle cx="-16" cy="22" r="12" fill="none" stroke="#ffd166" stroke-width="7"/><circle cx="16" cy="22" r="12" fill="none" stroke="#ffd166" stroke-width="7"/></g>`);
  if (cls === 'flap') return head(200, 174, `
    <defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc8ff"/><stop offset="1" stop-color="#c9efff"/></linearGradient></defs><rect width="200" height="174" fill="url(#gf)"/>
    <ellipse cx="40" cy="30" rx="26" ry="9" fill="#fff" opacity=".8"/><ellipse cx="150" cy="22" rx="20" ry="7" fill="#fff" opacity=".7"/>
    <rect x="122" y="-4" width="42" height="64" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/><rect x="116" y="52" width="54" height="18" rx="4" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/>
    <rect x="122" y="112" width="42" height="70" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/><rect x="116" y="100" width="54" height="18" rx="4" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/>
    <rect x="28" y="-4" width="34" height="40" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/><rect x="23" y="30" width="44" height="14" rx="4" fill="#ffd23f" stroke="#c98a00" stroke-width="3"/>
    <g transform="rotate(-12 80 80)"><ellipse cx="80" cy="82" rx="24" ry="20" fill="#e5252a"/><path d="M58 84 q-14 -6 -16 6 q10 2 18 -2z" fill="#a8141a"/><ellipse cx="76" cy="90" rx="12" ry="8" fill="#a8141a"/><circle cx="90" cy="74" r="7" fill="#fff"/><circle cx="92" cy="74" r="3" fill="#222"/><path d="M98 80 l14 4 l-14 6z" fill="#ff9f1c"/><path d="M72 62 l-4 -10 l9 5 l3 -9 l4 10z" fill="#a8141a"/></g>`);
  if (cls === 'raid') return head(200, 174, `
    <defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a5a"/><stop offset="1" stop-color="#ffd8a0"/></linearGradient></defs><rect width="200" height="174" fill="url(#gr)"/>
    <circle cx="150" cy="38" r="16" fill="#fff3c4"/><circle cx="92" cy="26" r="12" fill="#6b5a5a" opacity=".5"/><circle cx="104" cy="12" r="9" fill="#6b5a5a" opacity=".35"/>
    <path d="M10 174 L78 44 L108 44 L190 174z" fill="#4a3a3a"/><path d="M78 44 L108 44 L112 52 L74 52z" fill="#ff5a1f"/><path d="M84 52 l-8 40 l10 -6 l4 30 l8 -34 l6 18 l4 -48z" fill="#ff7a2f"/><path d="M60 80 L50 174 H70z" fill="#3a2c2c" opacity=".6"/>
    <rect y="146" width="200" height="28" fill="#2f9bbf"/><path d="M0 154 q25 -8 50 0 t50 0 t50 0 t50 0" fill="none" stroke="#bfeaff" stroke-width="3"/>`);
  if (cls === 'sudo') return head(200, 174, `
    <defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#8b3cf0"/></linearGradient></defs><rect width="200" height="174" fill="url(#gs)"/>
    <g stroke="#fff" opacity=".55" stroke-width="2"><path d="M0 58H200M0 116H200M66 0V174M133 0V174"/></g><g stroke="#fff" opacity=".25"><path d="M0 29H200M0 87H200M0 145H200M33 0V174M100 0V174M166 0V174"/></g>
    <g fill="#fff" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="26" text-anchor="middle"><text x="16" y="24">5</text><text x="83" y="24" opacity=".6">3</text><text x="150" y="82">7</text><text x="50" y="82">1</text><text x="116" y="82" opacity=".6">9</text><text x="16" y="140">8</text><text x="83" y="140">6</text><text x="183" y="140" opacity=".6">2</text><text x="183" y="24">4</text><text x="116" y="24" opacity=".6">2</text><text x="150" y="140">3</text></g>`);
  return head(400, 174, `
    <defs><radialGradient id="gb" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#1f9a5e"/><stop offset="1" stop-color="#0a3b25"/></radialGradient></defs><rect width="400" height="174" fill="url(#gb)"/>
    <g transform="rotate(-9 150 80)"><rect x="100" y="14" width="100" height="136" rx="10" fill="#fff" stroke="#d6dbe3" stroke-width="3"/>
      <text x="112" y="52" font-family="Georgia,serif" font-weight="700" font-size="38" fill="#111">A</text>
      <path d="M150 62 c-26 22 -26 40 -4 40 c-2 8 -6 12 -10 16 h28 c-4 -4 -8 -8 -10 -16 c22 0 22 -18 -4 -40z" fill="#111" transform="translate(0 -2)"/></g>
    <g transform="rotate(8 260 80)"><rect x="210" y="14" width="100" height="136" rx="10" fill="#fff" stroke="#d6dbe3" stroke-width="3"/>
      <text x="222" y="52" font-family="Georgia,serif" font-weight="700" font-size="38" fill="#d92d2d">K</text>
      <path d="M260 120 c-30 -18 -30 -42 -10 -42 c6 0 10 4 10 8 c0 -4 4 -8 10 -8 c20 0 20 24 -10 42z" fill="#d92d2d"/></g>`);
}

// Fiche d'un jeu : texte uniquement + bouton Jouer
function duelPickHTML() {
  const me = state.me, others = [...colocs(), ...copains()].filter((m) => m.id !== me.id);
  return sheetWrap(`
    <div class="sh"><div><h2>✊ Chifoumi</h2><div class="when">Mise ${XP_RULES.duelStake} 🪙 · choisis ton adversaire</div></div>${closeBtn}</div>
    <div class="heads picker">${others.map((m) => `<button class="headb" data-action="duel-with" data-id="${m.id}">${av(m, 56)}<small>${esc(m.name)}</small>${m.kind === 'copain' ? '<i>copain</i>' : ''}</button>`).join('')}</div>`);
}
function gameInfoHTML(s) {
  const g = GAMES[s.id], me = state.me, st = statsOf(me.id);
  if (!g) return '';
  const wins = state.duelStats.find((d) => d.member_id === me.id)?.wins ?? 0;
  const rec = { chifoumi: `${wins} victoire${wins > 1 ? 's' : ''}`, flappy: `Record : ${st.flappy_best || 0}`, ferme: `${st.farm_harvests || 0} récolte${(st.farm_harvests || 0) > 1 ? 's' : ''}`,
    sudoku: st.sudoku_best ? `Record : ${fmtTime(st.sudoku_best)}` : 'Pas encore terminé', blackjack: `${chipsOf(me.id)} colocoins · ${st.blackjack_wins || 0} main${(st.blackjack_wins || 0) > 1 ? 's' : ''} gagnée${(st.blackjack_wins || 0) > 1 ? 's' : ''}` }[s.id];
  const others = state.members.filter((m) => m.id !== me.id);
  if (!others.some((m) => m.id === state.opp)) state.opp = others[0]?.id ?? null;
  return sheetWrap(`
    <div class="sh"><div><h2>${esc(g.name)}</h2><div class="when">${esc(rec)}</div></div>${closeBtn}</div>
    <div class="det">${esc(g.blurb)}</div>
    ${g.board ? `<h3 class="sec">🏅 Classement des records</h3>${boardListHTML(BOARDS.find((b) => b.key === g.board), 6)}` : ''}
    ${g.duel ? `<select class="dd" data-input="opp" aria-label="Adversaire">${others.map((m) => `<option value="${m.id}" ${m.id === state.opp ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <div class="sact"><button class="btn primary" data-action="duel-new" ${others.length ? '' : 'disabled'}>Défier</button></div>`
      : `<div class="sact"><button class="btn primary" data-action="game" data-id="${s.id}">Jouer</button></div>`}`);
}

/* ---------- Onglet Profil ---------- */
function meHTML() {
  const me = state.me, seg = state.meSeg, lp = levelProgress(xpOf(me.id)), unread = unreadCount();
  const segs = [['robe', 'Garde-robe'], ['titres', 'Titres'], ['badges', 'Badges'], ['cadres', 'Cadres']];
  return `
    <div class="mehead"><button class="gearbtn ${seg === 'regl' ? 'on' : ''}" data-action="seg" data-seg="${seg === 'regl' ? 'robe' : 'regl'}" aria-label="Réglages" title="Réglages">${GEAR_SVG}</button>
    <div class="pname"><b>${nameHTML(me)}</b>${titleLabel(me) ? `<span class="ptitle">${esc(titleLabel(me))}</span>` : ''}${me.kind === 'copain' ? '<span class="ptitle">Copain</span>' : ''}</div><button class="gearbtn ${seg === 'sugg' ? 'on' : ''}" data-action="seg" data-seg="${seg === 'sugg' ? 'robe' : 'sugg'}" aria-label="Suggestions" title="Suggestions">${SUGGEST_SVG}</button></div>
    <div class="center-av">${av(me, 150)}</div>
    <div class="lvlline"><b>Niveau ${lp.level}</b> · ${xpOf(me.id)} XP · encore ${lp.need - lp.into} pour le niveau ${lp.level + 1}
      <div class="bar sm lvlbar"><i style="width:${lp.pct}%"></i></div></div>
    ${unread && seg !== 'regl' ? `<button class="btn" style="margin:10px 0" data-action="seg" data-seg="regl">✉️ ${unread} nouveau${unread > 1 ? 'x' : ''} message${unread > 1 ? 's' : ''}</button>` : ''}
    <div class="seg four">${segs.map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-action="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    ${seg === 'regl' ? '' : ''}
    ${seg === 'titres' ? titresHTML() : seg === 'badges' ? badgesTabHTML() : seg === 'cadres' ? cadresHTML() : seg === 'regl' ? reglagesHTML() : seg === 'sugg' ? suggestHTML() : robeHTML()}`;
}

// Cases de statistiques d'un profil (le tien ou celui d'un autre)
function badgeCells(m) {
  const st = statsOf(m.id);
  const wins = state.duelStats.find((x) => x.member_id === m.id)?.wins ?? 0;
  return [
    ['level', 'NV', 'Niveau', lvlOf(m.id)],
    ['chores', '🧼', 'Savons', earnedSoap(m.id)],
    ['dollars', '🪙', 'Colocoins', chipsOf(m.id)],
    ['chifoumi', '✊', 'Victoires chifoumi', wins],
    ['flappy', '🐦', 'Jumpy Cardinal', st.flappy_best || 0],
    ['blackjack', '🃏', 'Blackjack (mains gagnées)', st.blackjack_wins || 0],
  ];
}
// pick = true : on peut toucher un badge pour le mettre en avant sur son profil
function statGrid(m, pick = false) {
  return `<div class="stgrid">${badgeCells(m).map(([k, e, l, raw, shown]) => {
    const t = tierOf(k, raw), on = m.badge === k;
    const inner = `<span class="medal ${t == null ? 'none' : 't' + t}" title="${t == null ? 'Pas encore de résultat' : TIER_NAMES[t]}">${e}</span><b>${esc(shown ?? raw)}</b><small>${l}</small><i class="tier ${t == null ? 'none' : 't' + t}">${t == null ? '—' : TIER_NAMES[t]}</i>${on ? '<em class="star">★ affiché</em>' : ''}`;
    return pick ? `<button class="stc ${on ? 'feat' : ''}" data-action="badge" data-id="${k}" aria-pressed="${on}">${inner}</button>` : `<div class="stc ${on ? 'feat' : ''}">${inner}</div>`;
  }).join('')}</div>`;
}
// Le badge mis en avant par la personne (les autres sont dans un sous-menu)
function featuredBadgeHTML(m) {
  const c = badgeCells(m).find((x) => x[0] === m.badge);
  if (!c) return '';
  const [k, e, l, raw, shown] = c, t = tierOf(k, raw);
  return `<div class="featbadge"><span class="medal ${t == null ? 'none' : 't' + t}">${e}</span><div><b>${esc(shown ?? raw)}</b><small>${l}${t == null ? '' : ` · ${TIER_NAMES[t]}`}</small></div></div>`;
}


function inboxHTML() {
  if (!state.msgs.length) return '<div class="det">Aucun message pour l\'instant. Les autres peuvent t\'en envoyer depuis ton profil.</div>';
  return state.msgs.slice(0, 10).map((m) => `<div class="up ${state.freshMsgs.has(m.id) ? 'fresh' : ''}"><div class="mini-av">${av(memberById(m.from_id), 40)}</div>
    <div class="txt"><b>${esc(nameOf(m.from_id))}${state.freshMsgs.has(m.id) ? ' <span class="newtag">nouveau</span>' : ''}</b><small class="msgbody">${esc(m.body)}</small><small>${ago(m.created_at)}</small></div>
    <button class="mini" data-action="msg" data-id="${m.from_id}">Répondre</button></div>`).join('');
}

function defisHTML() {
  const ctx = makeCtx();
  const have = unlockedKeys(state.me.id);
  const rows = CHALLENGES.map((c) => ({ c, p: c.check(ctx), done: have.has(c.key) }));
  const rewardTxt = (c) => {
    const r = rewardOf(c.key);
    return [r.xp ? `+${r.xp} XP` : '', r.skin ? `🎭 ${outfitName(r.skin, state.me.gender)}` : ''].filter(Boolean).join(' · ');
  };
  const row = ({ c, p, done }) => `
      <div class="chal ${done ? 'done' : ''}">
        <div class="cemo">${done ? c.emoji : '🔒'}</div>
        <div class="ctxt"><b>${esc(c.title)}</b><small>${esc(c.desc)}${c.hint ? ` <i>${esc(c.hint)}</i>` : ''}</small>
          ${done ? '' : `<div class="bar sm"><i style="width:${(p.value / p.goal) * 100}%"></i></div><small class="cp">${p.value} / ${p.goal}</small>`}
          ${rewardTxt(c) ? `<span class="crew">${rewardTxt(c)}</span>` : ''}</div>
        ${done ? `<button class="mini ${state.me.title === c.key ? 'ok' : ''}" data-action="title" data-id="${c.key}">${state.me.title === c.key ? 'Affiché' : 'Afficher'}</button>` : ''}
      </div>`;
  const cats = [...new Set(CHALLENGES.map((c) => c.cat))];
  const group = (list) => cats.map((cat) => {
    const part = list.filter((r) => r.c.cat === cat);
    return part.length ? `<h4 class="cat">${esc(cat)}</h4>${part.map(row).join('')}` : '';
  }).join('');
  const todo = rows.filter((r) => !r.done), done = rows.filter((r) => r.done);
  return `
    <p class="summary">Chaque défi réussi débloque un <b>titre</b> à afficher sur ton profil et de l'<b>XP</b>, parfois un personnage.</p>
    ${group(todo)}
    ${done.length ? `<h3 class="sec">Terminés (${done.length})</h3>${group(done)}` : ''}`;
}

function titresHTML() {
  const me = state.me, unlocked = CHALLENGES.filter((c) => unlockedKeys(me.id).has(c.key));
  return `<p class="summary" style="margin-top:12px">Choisis le titre affiché sous ton pseudo. Chaque défi réussi en débloque un.</p>
    ${me.title ? `<button class="btn" data-action="title" data-id="${me.title}">Ne plus afficher de titre</button>` : ''}
    ${unlocked.length ? unlocked.map((c) => `<div class="chal done"><div class="cemo">${c.emoji}</div><div class="ctxt"><b>${esc(c.title)}</b><small>${esc(c.desc)}</small></div>
      <button class="mini ${me.title === c.key ? 'ok' : ''}" data-action="title" data-id="${c.key}">${me.title === c.key ? 'Affiché' : 'Afficher'}</button></div>`).join('')
      : '<div class="det">Réussis un défi (onglet Quêtes) pour débloquer ton premier titre.</div>'}`;
}

function badgesTabHTML() {
  const me = state.me;
  return `<p class="summary" style="margin-top:12px">Touche un badge pour le mettre en avant sur ton profil. Les autres restent visibles dans un sous-menu.</p>
    ${statGrid(me, true)}
    ${activePerksOf(me.id).length || perksOwed().length ? `<h3 class="sec">Récompenses du plateau</h3>
      ${activePerksOf(me.id).map((pk) => perkCardHTML(pk, true)).join('')}
      ${perksOwed().length ? `<div class="det">À offrir :</div>${perksOwed().map((pk) => perkCardHTML(pk, false)).join('')}` : ''}` : ''}`;
}

function cadresHTML() {
  const me = state.me, owned = shopOwned(me.id);
  const mine = SHOP.frame.filter((f) => owned.has(`frame:${f.key}`));
  return `<p class="summary" style="margin-top:12px">Les cadres entourent ton personnage partout dans l'application.</p>
    <div class="shop">
      <button class="item ${!me.frame ? 'eq' : ''}" data-action="shop-equip" data-slot="frame" data-id="">${avatarSVG(me, 76)}<b>Sans cadre</b><small>${!me.frame ? 'Équipé' : 'Choisir'}</small></button>
      ${mine.map((f) => `<button class="item ${me.frame === f.key ? 'eq' : ''}" data-action="shop-equip" data-slot="frame" data-id="${f.key}">${av({ ...me, frame: f.key }, 76)}<b>${esc(f.name)}</b><small>${me.frame === f.key ? 'Équipé' : 'Équiper'}</small></button>`).join('')}
    </div>
    ${mine.length ? '' : '<div class="det">Tu n\'as encore aucun cadre.</div>'}
    <button class="btn primary" style="margin-top:14px" data-action="shop" data-slot="frame">🛒 Acheter des cadres</button>`;
}

function suggestHTML() {
  return `<h3 class="sec" style="margin-top:14px">💡 Suggestions</h3>
    <p class="muted" style="margin:0 0 8px">Une idée, un bug, une envie de jeu ou de défi ? Écris-la ici, elle part directement vers le développeur.</p>
    <textarea id="suggtxt" class="suggtxt" maxlength="1000" rows="6" placeholder="Ma suggestion…"></textarea>
    <button class="btn primary" style="width:100%;margin-top:8px" data-action="suggest-send">Envoyer</button>`;
}

function reglagesHTML() {
  const me = state.me;
  const head = '<h3 class="sec" style="margin-top:14px">⚙️ Réglages</h3>';
  const swatches = (list, field, current) => list.map((o) =>
    `<button class="sw ${current?.toLowerCase() === o.c ? 'sel' : ''}" style="background:${o.c}" data-action="${field}" data-v="${o.c}" aria-label="${esc(o.name)}" aria-pressed="${current?.toLowerCase() === o.c}"></button>`).join('');
  const cur = OUTFITS[me.outfit] ?? OUTFITS.none;
  return `
    ${head}
    <button class="btn foldbtn" data-action="tog" data-id="sexe" aria-expanded="${!!state.open.sexe}">Changer de sexe ${state.open.sexe ? '▴' : '▾'}</button>
    ${state.open.sexe ? `<div class="seg small" style="margin-top:8px">${[['homme', '👨 Homme'], ['femme', '👩 Femme']].map(([k, l]) =>
      `<button class="${me.gender === k ? 'on' : ''}" data-action="gender" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    <button class="btn foldbtn" data-action="tog" data-id="couleur" aria-expanded="${!!state.open.couleur}">Changer de couleur ${state.open.couleur ? '▴' : '▾'}</button>
    ${state.open.couleur ? `
      <h3 class="sec">Couleur de peau ${cur.hidesSkin ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
      <div class="swatches">${swatches(SKIN_COLORS, 'skin', me.skin)}</div>
      <h3 class="sec">Couleur de cheveux ${cur.hidesHair ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
      <div class="swatches">${swatches(HAIR_COLORS, 'hair', me.hair)}</div>
      <h3 class="sec">Couleur de fond du profil</h3>
      <div class="swatches">${BG_COLORS.map((c) => `<button class="sw ${(me.bg ?? BG_COLORS[0]).toLowerCase() === c ? 'sel' : ''}" style="background:${c}" data-action="bg" data-v="${c}" aria-label="Fond ${c}"></button>`).join('')}</div>` : ''}
    <h3 class="sec">Thème</h3>
    <div class="seg" style="margin-bottom:10px">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button class="${(store.get('coloc-theme') || 'auto') === k ? 'on' : ''}" data-action="theme" data-v="${k}">${l}</button>`).join('')}</div>
    <button class="btn foldbtn" data-action="fps">${store.get('coloc-fps') === '1' ? 'Compteur FPS (Jumpy Cardinal) : activé' : 'Compteur FPS (Jumpy Cardinal) : désactivé'}</button>
    <button class="btn foldbtn" data-action="push">${pushOn() ? '🔔 Notifications activées' : '🔕 Activer les notifications'}</button>
    <button class="btn foldbtn" data-action="switch">Changer de prénom <small>(actuellement ${esc(me.name)})</small></button>
    <h3 class="sec">Mes messages</h3>
    ${inboxHTML()}`;
}

function robeHTML() {
  const me = state.me, owned = ownedBy(me.id);
  return `
    <h3 class="sec">Ma garde-robe</h3>
    <div class="shop">${Object.entries(OUTFITS).filter(([id]) => owned.has(id)).map(([id]) => `
      <button class="item ${me.outfit === id || (!me.outfit && id === 'none') ? 'eq' : ''}" data-action="equip" data-id="${id}">
        ${av({ ...me, outfit: id, frame: null }, 76)}<b>${esc(outfitName(id, me.gender))}</b><small>${(me.outfit ?? 'none') === id ? 'Portée' : 'Porter'}</small></button>`).join('')}</div>
    <h3 class="sec">À débloquer</h3>
    <div class="shop">${Object.entries(OUTFITS).filter(([id]) => id !== 'none' && !owned.has(id)).map(([id, o]) => `
      <div class="item locked">
        ${av({ ...me, outfit: id, frame: null }, 76)}<b>${esc(outfitName(id, me.gender))}</b><small>${o.level ? `Niveau ${o.level}` : o.price ? `Boutique · ${o.price} 🪙` : `Défi : ${esc(titleOf(o.challenge) ?? '?')}`}</small></div>`).join('') || '<div class="det" style="grid-column:1/-1">Tu as tout débloqué 🎉</div>'}</div>`;
}

// ---------- Boutique (caddie) : cadres, effets de pseudo, looks de l'oiseau ----------
const RAR_CLS = { 'Commun': 'rar-c', 'Rare': 'rar-r', 'Épique': 'rar-e', 'Légendaire': 'rar-l' };
function birdTabHTML(me, owned, bal, cur) {
  const has = (k) => owned.has(`bird:${k}`), pool = SHOP.bird.filter((b) => !has(b.key)), tot = pool.reduce((a, b) => a + b.w, 0);
  const odds = ['Commun', 'Rare', 'Épique', 'Légendaire'].map((r) => [r, pool.filter((b) => birdRarity(b.w) === r).reduce((a, b) => a + b.w, 0)]).filter(([, w]) => w > 0)
    .map(([r, w]) => `<span class="rar ${RAR_CLS[r]}">${r} ${(w / tot * 100 < 10 ? (w / tot * 100).toFixed(1) : Math.round(w / tot * 100))} %</span>`).join('');
  const tileB = (b) => {
    const mine = has(b.key), eq = cur === b.key;
    return `<div class="item ${eq ? 'eq' : ''} ${mine ? '' : 'locked'}">${mine ? birdSVG(b.key, 70) : `<span class="lockbird">${birdSVG(b.key, 70)}</span>`}<b>${mine ? esc(b.name) : '???'}</b>
      ${mine ? `<button class="mini ${eq ? 'ok' : ''}" data-action="shop-equip" data-slot="bird" data-id="${b.key}">${eq ? 'Équipé' : 'Équiper'}</button>` : `<span class="rar ${RAR_CLS[birdRarity(b.w)]}">${birdRarity(b.w)}</span>`}</div>`;
  };
  return `<div class="cratebox">${CRATE_SVG(78)}<div class="cratetxt"><b>Caisse mystère</b><small>Un oiseau au hasard parmi ceux que tu n'as pas encore. Les oiseaux de couleur sont les plus fréquents.</small>
      <button class="mini ok" data-action="crate-open" ${pool.length && bal >= BIRD_CRATE.price ? '' : 'disabled'}>${pool.length ? `Ouvrir · ${BIRD_CRATE.price} 🪙` : 'Tous débloqués !'}</button></div></div>
    ${pool.length ? `<div class="odds">${odds}</div>` : ''}
    <div class="shop shopgrid"><div class="item ${!cur ? 'eq' : ''}">${birdSVG(null, 70)}<b>Oiseau classique</b><button class="mini ${!cur ? 'ok' : ''}" data-action="shop-equip" data-slot="bird" data-id="">${!cur ? 'Équipé' : 'Équiper'}</button></div>${SHOP.bird.map(tileB).join('')}</div>
    <div class="det">Les oiseaux ne s'achètent plus à l'unité : ils se gagnent dans les caisses.</div>`;
}
function crateHTML(s) {
  const b = SHOP.bird.find((x) => x.key === s.key);
  if (s.phase === 0) return sheetWrap(`<div class="cratereveal"><div class="crateshake">${CRATE_SVG(150)}</div><div class="when">Ouverture…</div></div>`, 'var(--gold)');
  const r = birdRarity(b.w);
  return sheetWrap(`<div class="cratereveal pop"><span class="rar ${RAR_CLS[r]}">${r}</span><div class="bigbird">${birdSVG(b.key, 150)}</div><h2>${esc(b.name)}</h2><div class="when">Nouvel oiseau débloqué !</div>
    <div class="sact two"><button class="btn primary" data-action="crate-equip" data-id="${b.key}">Équiper</button><button class="btn" data-action="crate-again">Fermer</button></div></div>`, 'var(--gold)');
}
async function crateOpen() {
  try {
    const key = await state.api.openBirdCrate(state.me.id);
    await refresh(true);
    state.sheet = { type: 'crate', key, phase: 0 }; render();
    setTimeout(() => { if (state.sheet?.type === 'crate' && state.sheet.key === key) { state.sheet.phase = 1; render(); } }, 1300);
  } catch (e) { toast(e.message || 'Ouverture impossible.'); refresh(true).catch(() => {}); }
}

function shopHTML(s) {
  const me = state.me, slot = s.slot || 'outfit', owned = shopOwned(me.id), bal = chipsOf(me.id), skins = ownedBy(me.id);
  const none = { outfit: 'Tenue de base', frame: 'Sans cadre', namefx: 'Pseudo normal', bird: 'Oiseau classique' }[slot];
  const noneKey = slot === 'outfit' ? 'none' : null;
  const cur = slot === 'outfit' ? (me.outfit || 'none') : (me[slot] || null);
  const preview = (key) => (slot === 'outfit' ? av({ ...me, outfit: key, frame: null }, 64) : slot === 'frame' ? (key ? av({ ...me, frame: key }, 64) : avatarSVG(me, 64))
    : slot === 'namefx' ? `<span class="nprev">${nameHTML({ name: me.name, namefx: key })}</span>` : birdSVG(key, 70));
  const tile = (key, name, price) => {
    const isNone = key === noneKey;
    const has = isNone || (slot === 'outfit' ? skins.has(key) : owned.has(`${slot}:${key}`)), eq = cur === key;
    return `<div class="item ${eq ? 'eq' : ''}">${preview(key)}<b>${esc(slot === 'outfit' && !isNone ? outfitName(key, me.gender) : name)}</b>
      ${has ? `<button class="mini ${eq ? 'ok' : ''}" data-action="shop-equip" data-slot="${slot}" data-id="${key ?? ''}">${eq ? 'Équipé' : 'Équiper'}</button>`
        : `<button class="mini ok" data-action="shop-buy" data-slot="${slot}" data-id="${key}" ${bal >= price ? '' : 'disabled'}>${price} 🪙</button>`}</div>`;
  };
  const head = `<div class="sh"><div><h2 class="shoph">${CART_SVG} Boutique</h2><div class="when">Tu as ${bal} 🪙</div></div>${closeBtn}</div>
    <div class="seg five" style="margin-bottom:10px">${SHOP_SLOTS.map(([k, l]) => `<button class="${slot === k ? 'on' : ''}" data-action="shop-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (slot === 'bird') return sheetWrap(head + birdTabHTML(me, owned, bal, cur), 'var(--gold)');
  return sheetWrap(`${head}
    <div class="shop shopgrid">${tile(noneKey, none, 0)}${SHOP[slot].map((it) => tile(it.key, it.name, it.price)).join('')}</div>
    <div class="det">${{ outfit: 'Des personnages à acheter : 100 🪙 chacun (dino : 200 🪙).', frame: 'Un cadre autour de ton personnage, visible partout.', namefx: 'Une couleur ou un effet pour ton pseudo.' }[slot]}</div>`, 'var(--gold)');
}
/* ---------- Calendrier : activités proposées + sondage de présence ---------- */
const upcomingEvents = () => state.events.filter((e) => Date.parse(e.starts_at) >= Date.now() - 3 * 3600000);
const fmtEv = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; };
function eventCardHTML(e, past) {
  const me = state.me, votes = state.evVotes.filter((v) => v.event_id === e.id), mine = votes.find((v) => v.member_id === me.id)?.vote;
  const by = (k) => votes.filter((v) => v.vote === k), everyone = state.members.length, answered = votes.length;
  const btn = (k, l) => `<button class="evb ${k} ${mine === k ? 'on' : ''}" data-action="cal-vote" data-id="${e.id}" data-v="${k}" aria-pressed="${mine === k}">${l} <b>${by(k).length}</b></button>`;
  return `<div class="evcard ${past ? 'past' : ''}">
    <div class="evtop"><div><b>${esc(e.title)}</b><small>${fmtEv(e.starts_at)}${e.place ? ` · ${esc(e.place)}` : ''}</small><small>Proposé par ${esc(nameOf(e.creator_id))}</small></div>
      ${e.creator_id === me.id ? `<button class="evdel" data-action="cal-del" data-id="${e.id}" aria-label="Supprimer l'activité">✕</button>` : ''}</div>
    <div class="evvotes">${btn('yes', 'Présent')}${btn('maybe', 'Peut-être')}${btn('no', 'Absent')}</div>
    <div class="evwho">${by('yes').map((v) => `<span title="${esc(nameOf(v.member_id))}">${av(memberById(v.member_id), 24)}</span>`).join('')}${everyone > answered ? `<small>${everyone - answered} sans réponse</small>` : ''}</div>
  </div>`;
}
const evToAnswer = () => (state.me ? upcomingEvents().filter((e) => !state.evVotes.some((v) => v.event_id === e.id && v.member_id === state.me.id)).length : 0);
function calendarHTML() {
  const up = upcomingEvents(), past = state.events.filter((e) => !up.includes(e)).slice(-5).reverse();
  return (`
    <div class="sh"><div><h2>Calendrier</h2><div class="when">Propose une activité, chacun répond</div></div></div>
    <button class="btn primary" style="width:100%;margin:4px 0 10px" data-action="cal-new">Proposer une activité</button>
    ${up.length ? up.map((e) => eventCardHTML(e, false)).join('') : '<div class="det">Aucune activité prévue pour le moment.</div>'}
    ${past.length ? `<h3 class="sec">Passées</h3>${past.map((e) => eventCardHTML(e, true)).join('')}` : ''}`);
}
function calNewHTML() {
  const d = new Date(Date.now() + 86400000), pad = (n) => String(n).padStart(2, '0'), day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return sheetWrap(`
    <div class="sh"><div><h2>Nouvelle activité</h2><div class="when">Tout le monde pourra répondre</div></div>${closeBtn}</div>
    <label class="evl">Quoi ?<input id="evtitle" class="evin" maxlength="60" placeholder="Ex. Soirée jeux de société"></label>
    <label class="evl">Où ? <small>(facultatif)</small><input id="evplace" class="evin" maxlength="60" placeholder="Ex. Au salon"></label>
    <div class="evrow"><label class="evl">Jour<input id="evday" class="evin" type="date" value="${day}"></label><label class="evl">Heure<input id="evtime" class="evin" type="time" value="20:00"></label></div>
    <button class="btn primary" style="width:100%;margin-top:10px" data-action="cal-create">Proposer</button>
    <button class="btn" style="width:100%;margin-top:6px" data-action="calendar">Retour</button>`, 'var(--accent)');
}
async function calAct(fn, ok) {
  try { await fn(); await refresh(true); if (ok) ok(); } catch (e) { toast(e.message || 'Action impossible.'); refresh(true).catch(() => {}); }
}

function exchangeHTML() {
  const me = state.me, have = soapOf(me.id), coloc = me.kind === 'coloc';
  return sheetWrap(`
    <div class="sh"><div><h2>Échange</h2><div class="when">Tu as ${have} 🧼 · ${chipsOf(me.id)} 🪙</div></div>${closeBtn}</div>
    <div class="det">Change tes savons contre des colocoins : plus tu en échanges d'un coup, plus c'est avantageux.</div>
    ${SOAP_EXCHANGE.map((o) => `<div class="up"><div class="txt"><b>${o.soap} 🧼 → ${o.coins} 🪙</b><small>${o.coins / o.soap} colocoins par savon</small></div>
      <button class="mini ok" data-action="exchange-do" data-id="${o.soap}" ${coloc && have >= o.soap ? '' : 'disabled'}>Échanger</button></div>`).join('')}
    ${coloc ? '' : '<div class="det">Seuls les colocataires gagnent des savons.</div>'}`, 'var(--gold)');
}
async function exchangeNow(soap) {
  try {
    const r = await state.api.exchangeSoap(state.me.id, soap);
    await refresh(true);
    toast(`+${r.coins} colocoins !`);
  } catch (e) { toast(e.message || 'Échange impossible.'); refresh(true).catch(() => {}); }
}
async function shopBuy(slot, key) {
  try {
    await state.api.buyShop(state.me.id, `${slot}:${key}`);
    await refresh(true);
    toast(`Acheté : ${shopItem(slot, key)?.name ?? key} !`);
    saveProfile({ [slot]: key });          // on l'équipe tout de suite
  } catch (e) { toast(e.message || 'Achat impossible.'); refresh(true).catch(() => {}); }
}

/* ---------- Onglet Classement ---------- */
const MEDALS = ['🥇', '🥈', '🥉'];
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
function rankHTML() {
  const seg = state.rankSeg === 'level' ? 'level' : state.rankSeg === 'chores' ? 'chores' : 'dollars';
  const board = BOARDS.find((b) => b.key === seg);
  return `<div class="seg" style="margin-bottom:12px">${[['dollars', '🪙 Colocoins'], ['level', 'Niveau'], ['chores', '🧼 Savons']].map(([k, l]) =>
    `<button class="${seg === k ? 'on' : ''}" data-action="rseg" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="summary" style="margin-top:0">${{ dollars: 'Le nombre de colocoins que chacun possède en ce moment.', level: 'Le niveau (puis l\'XP) de chaque coloc et copain.', chores: 'Les savons gagnés grâce aux tâches ménagères.' }[seg]}</p>
    ${boardListHTML(board)}`;
}
// Liste classée d'un classement (utilisée aussi dans la fenêtre de règle des jeux)
function boardListHTML(board, max = 99) {
  const me = state.me, rows = ranking(makeCtx(), board).slice(0, max);
  return `<ol class="rank">${rows.map((r) => {
    const m = memberById(r.id);
    return `<li class="${r.id === me.id ? 'me' : ''}"><button class="rrow" data-action="profile" data-id="${r.id}">
      <span class="pos">${r.rank ? (r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank) : '–'}</span><span class="rav">${av(m, 38)}</span>
      <span class="nm">${nameHTML(m)}${r.id === me.id ? ' (toi)' : ''}${titleLabel(m) ? `<small class="ptitle">${esc(titleLabel(m))}</small>` : ''}${m?.kind === 'copain' ? '<small class="ptitle">Copain</small>' : ''}</span>
      <span class="pts">${r.rank ? esc(fmtValue(board, r.value)) : '—'}</span></button></li>`;
  }).join('')}</ol>`;
}

/* ---------- Feuilles : profil, défis réussis, récompense du jour, roue ---------- */
function profileSheetHTML(s) {
  const m = memberById(s.id);
  if (!m) return '';
  const mine = m.id === state.me.id;
  const t = titleLabel(m);
  const unlocked = CHALLENGES.filter((c) => unlockedKeys(m.id).has(c.key));
  const last = state.logs.filter((l) => l.status === 'validated' && l.doer_id === m.id).slice(0, 3);
  return sheetWrap(`
    <div class="sh"><div><h2>${mine ? 'Mon profil vu par les autres' : esc(m.name)}</h2><div class="when">${t ? esc(t) : 'Aucun titre affiché'}${m.kind === 'copain' ? ' · Copain' : ''}</div></div>${closeBtn}</div>
    <div class="center-av" style="background:${esc(m.bg || '#e6ebf1')}">${av(m, 130)}</div>
    <div class="pname"><b>${nameHTML(m)}</b></div>
    <div class="pbird">${birdSVG(m.bird, 54)}<span><small>Oiseau de Jumpy Cardinal</small><b>${esc(SHOP.bird.find((b) => b.key === m.bird)?.name ?? 'Oiseau classique')}</b></span></div>
    ${featuredBadgeHTML(m)}
    <details class="allbadges"><summary>${m.badge ? 'Voir tous les badges' : 'Badges'}</summary>${statGrid(m)}</details>
    ${activePerksOf(m.id).map((pk) => perkCardHTML(pk, mine)).join('')}
    ${mine ? '' : `<div class="sact two"><button class="btn primary" data-action="duel-with" data-id="${m.id}">Défier au chifoumi</button><button class="btn" data-action="msg" data-id="${m.id}">Envoyer un message</button></div>`}
    ${m.kind === 'copain' ? '' : `<h3 class="sec">3 dernières tâches</h3>
      ${last.length ? last.map((l) => { const K = TASK_KINDS[l.kind]; return `<div class="up hist"><div class="txt"><b>${K.emoji} ${esc(K.short)}</b><small>${ago(l.answered_at)} · +${l.soap} 🧼</small></div></div>`; }).join('')
        : '<div class="det">Aucune tâche validée pour l\'instant.</div>'}`}
    ${unlocked.length ? `<h3 class="sec">Titres débloqués</h3><div class="tags">${unlocked.map((c) => `<span class="tag">${c.emoji} ${esc(c.title)}</span>`).join('')}</div>` : ''}
    ${mine ? `<div class="sact"><button class="btn primary" data-action="goprofile">Modifier mon profil</button></div>` : ''}`);
}

function msgSheetHTML(s) {
  const to = memberById(s.to);
  if (!to) return '';
  return sheetWrap(`
    <div class="sh"><div><h2>Message à ${esc(to.name)}</h2><div class="when">${MESSAGE_MAX} caractères maximum · notification envoyée</div></div>${closeBtn}</div>
    <textarea class="msgin" id="msgtext" rows="3" maxlength="${MESSAGE_MAX}" placeholder="Ton message…" data-input="msg">${esc(s.text || '')}</textarea>
    <div class="det" id="msgcount" style="text-align:right">${(s.text || '').length}/${MESSAGE_MAX}</div>
    <div class="sact"><button class="btn primary" data-action="msg-send">Envoyer</button></div>`);
}

function diceSheetHTML(s) {
  const r = s.r;
  return sheetWrap(`
    <div class="sh"><div><h2>Tu as fait ${r.roll}</h2><div class="when">Case ${cellOfPos(r.from) || 'départ'} → case ${cellOfPos(r.to) || 'départ'}</div></div>${closeBtn}</div>
    <div class="dicebig"><span class="die d${r.roll}">${Array.from({ length: r.roll }, () => '<i></i>').join('')}</span></div>
    ${r.note ? `<div class="reward">${esc(r.note)}</div>` : '<div class="det">Case sans effet.</div>'}
    ${r.perk ? `<div class="perk ${r.perk}"><b>Récompense : ${esc(perkDef(r.perk)?.title)}</b><small>${esc(perkDef(r.perk)?.short)}. Elle reste visible sur ton profil.</small></div>` : ''}
    <div class="sact"><button class="btn primary" data-action="close">OK</button></div>`, 'var(--gold)');
}

function wonSheetHTML() {
  const list = state.won.map((k) => challengeByKey[k]).filter(Boolean);
  return sheetWrap(`
    <div class="sh"><div><h2>🎯 Défi${list.length > 1 ? 's' : ''} réussi${list.length > 1 ? 's' : ''} !</h2><div class="when">Bravo ${esc(state.me.name)}</div></div>${closeBtn}</div>
    ${list.map((c) => {
      const r = rewardOf(c.key);
      const parts = [r.xp ? `+${r.xp} XP` : '', r.skin ? `🎭 Nouveau personnage : ${esc(outfitName(r.skin, state.me.gender))}` : ''].filter(Boolean).join(' · ');
      return `<div class="srow"><div class="swho"><b>${c.emoji} ${esc(c.title)}</b></div><small>${esc(c.desc)}</small>
        <div class="reward" style="margin:6px 0 0">Titre débloqué${parts ? ` · ${parts}` : ''}</div>
        ${r.skin ? `<div class="center-av" style="margin:8px 0 0">${av({ ...state.me, outfit: r.skin }, 84)}</div>` : ''}</div>`;
    }).join('')}
    <div class="sact"><button class="btn primary" data-action="close">Super !</button></div>`, 'var(--gold)');
}

function wheelSheetHTML(s) {
  const colors = ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899', '#14b8a6', '#eab308'];
  const n = colors.length, R = 100;
  const seg = colors.map((c, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
    const p = (a, r) => `${(110 + Math.cos(a) * r).toFixed(1)},${(110 + Math.sin(a) * r).toFixed(1)}`;
    return `<path d="M110,110 L${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)}Z" fill="${c}" stroke="#fff" stroke-width="2"/>
      <text x="${110 + Math.cos(am) * 66}" y="${110 + Math.sin(am) * 66 + 6}" text-anchor="middle" font-size="18">✦</text>`;
  }).join('');
  const deg = Math.round((s.turns ?? 0) * 360);
  const style = s.spinning ? `--end:${deg}deg;transform:rotate(${deg}deg)` : '';
  const stillWheel = statsOf(state.me.id).wheel_ready;
  return sheetWrap(`
    <div class="sh"><div><h2>🎡 Roue de la fortune</h2><div class="when">De ${WHEEL_MIN} à ${WHEEL_MAX} XP</div></div>${s.spinning && !s.revealed ? '' : closeBtn}</div>
    <div class="wheelbox"><div class="wptr">▼</div>
      <svg class="wheel ${s.spinning && !s.revealed ? 'spin' : ''}" viewBox="0 0 220 220" style="${style}" aria-hidden="true">${seg}<circle cx="110" cy="110" r="14" fill="#fff"/></svg></div>
    ${s.revealed ? `<div class="wprize">+${s.amount} XP</div>` : ''}
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
  const s = state.sheet;
  switch (action) {
    case 'pick': startAuth(Number(id)); break;
    case 'pin-key': authKey(v); break;
    case 'pin-back': state.auth = null; render(); break;
    case 'switch': store.set('coloc-auth', ''); state.me = null; state.auth = null; state.tab = 'tasks'; state.sheet = null; render(); break;
    case 'tab': {
      state.anim = state.tab !== tab; state.tab = tab; state.sheet = null; state.heads = false; render(); window.scrollTo(0, 0);
      const is = INTRO_STEPS.find((x) => x.tab === tab); if (is) questStep(is.n);
      if (tab === 'me') markRead();
      break;
    }
    case 'tog': state.open[id] = !state.open[id]; render(); break;
    case 'head': state.heads = false; openProfile(Number(id)); break;
    case 'roll': rollDiceNow(); break;
    case 'shop': state.heads = false; state.sheet = { type: 'shop', slot: el.dataset.slot || 'outfit' }; render(); break;
    case 'calendar': state.sheet = null; state.tab = 'cal'; state.anim = true; render(); window.scrollTo(0, 0); break;
    case 'goperso': state.anim = state.tab !== 'me'; state.tab = 'me'; state.sheet = null; render(); window.scrollTo(0, 0); questStep(5); questStep(6); markRead(); break;
    case 'bseg': state.budgetSeg = v; render(); break;
    case 'exp-new': state.sheet = newExpSheet(null); render(); break;
    case 'exp-open': state.sheet = { type: 'expd', id: Number(id), confirm: false }; render(); break;
    case 'exp-edit': { const e = state.expenses.find((x) => x.id === Number(id)); if (e) { state.sheet = newExpSheet(e); render(); } break; }
    case 'exp-del': if (s?.type === 'expd' && !s.confirm) { s.confirm = true; render(); } else calAct(() => state.api.deleteExpense(state.me.id, Number(id)), () => { state.sheet = null; toast('Dépense supprimée'); render(); }); break;
    case 'exp-part': if (s?.type === 'exp') { const n = Number(id); s.parts = s.parts.includes(n) ? s.parts.filter((x) => x !== n) : [...s.parts, n]; render(); } break;
    case 'exp-save': expSave(); break;
    case 'exp-pay': calAct(() => state.api.addTransfer(state.me.id, Number(el.dataset.from), Number(el.dataset.to), Number(el.dataset.c)), () => toast('Remboursement enregistré')); break;
    case 'cal-new': state.sheet = { type: 'cal-new' }; render(); break;
    case 'cal-create': {
      const title = document.getElementById('evtitle')?.value ?? '', place = document.getElementById('evplace')?.value ?? '';
      const when = new Date(`${document.getElementById('evday')?.value}T${document.getElementById('evtime')?.value || '20:00'}`);
      if (isNaN(when)) { toast('Choisis un jour et une heure.'); break; }
      calAct(() => state.api.createEvent(state.me.id, title, place, when.toISOString()), () => { state.sheet = null; state.tab = 'cal'; toast('Activité proposée !'); render(); });
      break;
    }
    case 'cal-vote': calAct(() => state.api.voteEvent(state.me.id, Number(id), v)); break;
    case 'cal-del': calAct(() => state.api.deleteEvent(state.me.id, Number(id))); break;
    case 'exchange': state.heads = false; state.sheet = { type: 'exchange' }; render(); break;
    case 'exchange-do': exchangeNow(Number(id)); break;
    case 'shop-tab': if (s?.type === 'shop') { s.slot = v; render(); } break;
    case 'shop-buy': shopBuy(el.dataset.slot, id); break;
    case 'crate-open': crateOpen(); break;
    case 'crate-equip': saveProfile({ bird: id }); state.sheet = { type: 'shop', slot: 'bird' }; render(); break;
    case 'crate-again': state.sheet = { type: 'shop', slot: 'bird' }; render(); break;
    case 'shop-equip': saveProfile({ [el.dataset.slot]: id || null }); break;
    case 'goto-plateau': state.tab = 'tasks'; state.tasksSeg = 'plateau'; state.sheet = null; state.heads = false; render(); window.scrollTo(0, 0); break;
    case 'hist-soap': state.sheet = { type: 'soaphist' }; render(); break;
    case 'perk-ok': confirmPerkNow(Number(id)); break;
    case 'ginfo': state.sheet = { type: 'ginfo', id }; render(); break;
    case 'duel-with': state.opp = Number(id); state.sheet = { type: 'duel-new', opp: Number(id), move: null }; render(); break;
    case 'msg': state.sheet = { type: 'msg', to: Number(id), text: '' }; render(); break;
    case 'msg-send': sendMessageNow(); break;
    case 'close': if (e.target === el) closeSheet(); break;
    case 'rseg': state.anim = state.rankSeg !== v; state.rankSeg = v; render(); window.scrollTo(0, 0); break;
    case 'tseg': state.anim = state.tasksSeg !== v; state.tasksSeg = v; render(); window.scrollTo(0, 0); break;
    case 'task-group': state.sheet = { type: 'task-group', group: id }; render(); break;
    case 'task-pick': state.sheet = { type: 'task-do', kind: id }; render(); break;
    case 'task-submit': submitTaskNow(id); break;
    case 'task-ok': answerTaskNow(Number(id), true); break;
    case 'task-no': case 'task-cancel': answerTaskNow(Number(id), false); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'theme': setTheme(v); render(); break;
    case 'fps': store.set('coloc-fps', store.get('coloc-fps') === '1' ? '0' : '1'); render(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
    case 'sync': refresh(true).then(() => toast(state.syncErr ? 'Toujours en erreur' : 'À jour ✓')).catch((e) => toast(e.message)); break;
    // --- Toi : personnage et boutique ---
    case 'seg': state.anim = state.meSeg !== seg; state.meSeg = seg; state.sheet = null; render(); break;
    case 'bg': saveProfile({ bg: v }); break;
    case 'badge': saveProfile({ badge: state.me.badge === id ? null : id }); break;
    case 'title': saveTitle(state.me.title === id ? null : id); break;
    case 'profile': openProfile(Number(id)); break;
    case 'goprofile': state.sheet = null; state.tab = 'me'; state.meSeg = 'robe'; state.anim = true; markRead(); render(); window.scrollTo(0, 0); break;
    case 'daily-claim': claimDailyNow(); break;
    case 'wheel': state.sheet = { type: 'wheel' }; render(); break;
    case 'spin': spinNow(); break;
    case 'game': openGame(id); break;
    case 'suggest-send': {
      const ta = document.getElementById('suggtxt'), txt = ta?.value ?? '';
      state.api.sendSuggestion(state.me.id, txt)
        .then(() => { toast('Merci ! Suggestion envoyée 💡'); state.meSeg = 'robe'; render(); })
        .catch((e) => toast(e.message || 'Envoi impossible.'));
      break;
    }
    case 'gender': saveProfile({ gender: v }); break;
    case 'skin': saveProfile({ skin: v }); break;
    case 'hair': saveProfile({ hair: v }); break;
    case 'equip': if (ownedBy(state.me.id).has(id)) saveProfile({ outfit: id }); break;
    // --- Jeux ---
    case 'duel-pick': state.sheet = { type: 'duel-pick' }; render(); break;
    case 'duel-with': state.opp = Number(id); state.sheet = { type: 'duel-new', opp: state.opp, move: null }; render(); break;
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
  if (k === 'exp-payer' && state.sheet?.type === 'exp') state.sheet.payer = Number(e.target.value);
  else if (k === 'opp') state.opp = Number(e.target.value);       // pas de redessin : on garde la liste ouverte
  else if (k === 'title') saveTitle(e.target.value);
});
document.addEventListener('input', (e) => {
  const ek = e.target.dataset?.input;
  if (ek && ek.startsWith('exp-') && state.sheet?.type === 'exp') {
    const s = state.sheet;
    if (ek === 'exp-title') s.title = e.target.value; else if (ek === 'exp-amount') s.amount = e.target.value; else if (ek === 'exp-day') s.day = e.target.value;
    const pv = document.getElementById('exppv'); if (pv) pv.textContent = expPreview(s);
  }
  if (e.target.dataset?.input === 'msg' && state.sheet?.type === 'msg') {
    state.sheet.text = e.target.value;
    const c = document.getElementById('msgcount'); if (c) c.textContent = `${e.target.value.length}/${MESSAGE_MAX}`;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !state.game && currentSheet()) closeSheet(); });

render();
init();

/* ---------- Monnaies : chacune a son image SVG et sa couleur ----------
   🪙 colocoin : pièce jaune trouée, mot « colocoins » en jaune (police arrondie)
   🧼 savon    : savon bleu, mot « savons » en bleu (autre police)
   XP         : pastille « EXP » jaune-orangé ; plus aucune étoile */
const EXP_SVG = '<svg viewBox="0 0 46 20" width="2.5em" height="1.1em" aria-label="EXP" role="img" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="expg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8c1a"/></linearGradient></defs><rect x="1" y="1" width="44" height="18" rx="9" fill="url(#expg)" stroke="#c2570c" stroke-width="1.4"/><text x="23" y="14.2" text-anchor="middle" font-size="12.5" font-weight="800" font-family="Lilita One,Arial Rounded MT Bold,system-ui,sans-serif" fill="#fff" stroke="#8a3d05" stroke-width=".5" paint-order="stroke" letter-spacing=".6">EXP</text></svg>';
const CUR_RE = /(🪙|🧼|⭐|\b[Cc]olocoins?\b|\b[Ss]avons?\b|\bXP\b)/g;
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|OPTION|SELECT|TITLE|TEXT|TSPAN|INPUT)$/i;
function decorate(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
    const par = n.parentElement;
    if (!par || SKIP.test(par.nodeName) || par.closest('.dc,svg')) return NodeFilter.FILTER_REJECT;
    CUR_RE.lastIndex = 0;
    return CUR_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  } });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(CUR_RE).forEach((part, i) => {
      if (i % 2 === 0) { if (part) frag.appendChild(document.createTextNode(part)); return; }
      const e = document.createElement(/^[A-Za-z]/.test(part) && part !== 'XP' ? 'b' : 'i');
      e.classList.add('dc');
      if (part === '🪙') { e.className = 'dc cc'; e.setAttribute('role', 'img'); e.setAttribute('aria-label', 'colocoin'); }
      else if (part === '🧼') { e.className = 'dc cs'; e.setAttribute('role', 'img'); e.setAttribute('aria-label', 'savon'); }
      else if (part === '⭐') { return; }
      else if (part === 'XP') { e.className = 'dc cxp'; e.innerHTML = EXP_SVG; }
      else if (/^[Cc]olocoin/.test(part)) { e.className = 'dc w-cc'; e.textContent = part; }
      else { e.className = 'dc w-soap'; e.textContent = part; }
      frag.appendChild(e);
    });
    n.parentNode.replaceChild(frag, n);
  }
}
try {
  decorate(document.body);
  new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) decorate(n); else if (n.nodeType === 3 && n.parentNode) decorate(n.parentNode); }); })
    .observe(document.body, { childList: true, subtree: true });
} catch { /* rien */ }
