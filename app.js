import {
  CONFIG, TASK_KINDS, levelOf, levelProgress, XP_RULES,
  SKIN_COLORS, HAIR_COLORS, BG_COLORS, OUTFITS, MOVES, DAILY_XP, WHEEL_MIN, WHEEL_MAX, INTRO_STEPS, GOOSE, MESSAGE_MAX, DICE_PRICES, PERKS, perkOfWeek,
} from './config.js';
import { avatarSVG } from './avatar.js';
import { makeCloudApi, makeDemoApi } from './api.js';
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

/* =========================================================
   État + chargement
   ========================================================= */
const state = {
  api: null, members: [], me: null, products: [], scores: [], balances: [], purchases: [], duels: [],
  stats: [], duelStats: [], unlocks: [], views: [], xp: [], weekly: [], logs: [], spent: [], dice: [], perks: [], pconf: [], msgs: [], freshMsgs: new Set(), heads: false,
  tasksSeg: 'tasks', anim: false, levelUps: [], auth: null,
  tab: 'tasks', meSeg: 'profil', opp: null, sheet: null, error: null, initials: {},
  game: null, won: [], viewedNow: new Set(),
};
const memberById = (id) => state.members.find((m) => m.id === id);
const nameOf = (id) => memberById(id)?.name ?? '?';
const balanceOf = (id) => state.balances.find((b) => b.member_id === id)?.coins ?? 0;
const pendingWagerOf = (id) => state.duels.filter((d) => d.status === 'pending' && d.challenger_id === id).reduce((a, d) => a + d.wager, 0);
const availableOf = (id) => balanceOf(id) - pendingWagerOf(id);
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
    balances: keyed(state.balances, (b) => b.coins), wins: keyed(state.duelStats, (d) => d.wins), xp: keyed(state.xp, (x) => x.xp),
    duels: state.duels, owned: ownedBy(me), weekly: state.weekly, currentWeek: currentWeek(),
    viewed: new Set(state.views.filter((v) => v.viewer_id === me).map((v) => v.viewed_id)),
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
  [state.members, state.scores, state.balances, state.products, state.purchases, state.duels,
    state.stats, state.duelStats, state.unlocks, state.views, state.xp, state.weekly, state.logs, state.spent, state.dice, state.perks, state.pconf] = await Promise.all([
    state.api.members(),
    state.api.scores(), state.api.balances(), state.api.products(), state.api.purchases(), state.api.duels(),
    state.api.stats(), state.api.duelStats(), state.api.unlocks(), state.api.views(), state.api.xp(), state.api.weekly(), state.api.taskLogs(), state.api.soapSpent(), state.api.diceRolls(), state.api.perks(), state.api.perkConfirms(),
  ]);
  state.msgs = state.me ? await state.api.messages(state.me.id) : [];
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
    // Session : reconnu seulement si le code secret a déjà été saisi sur cet appareil (et existe encore)
    const meId = Number(store.get('coloc-me'));
    const known = state.members.find((m) => m.id === meId);
    state.me = known && known.has_pin && store.get('coloc-auth') === String(meId) ? known : null;
    sp(0.65);
    step = 'lecture des données (stats, défis…)';
    await refresh(); sp(1); window.splashDone?.();
    state.api.onChange(debounce(() => refresh().catch(() => {}), 250));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
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
    await state.api.createDuel(state.me.id, s.opp, 0, s.move); // chifoumi amical : toujours 0 trophée
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
async function openTrHist() {
  state.sheet = { type: 'trhist', rows: null }; render();
  try { const rows = await state.api.ledger(state.me.id); if (state.sheet?.type === 'trhist') { state.sheet.rows = rows; render(); } }
  catch (e) { state.sheet = null; toast(e.message || 'Historique indisponible.'); render(); }
}
function histRow(label, when, amount, unit) {
  return `<div class="hrow"><div><b>${esc(label)}</b><small>${esc(when)}</small></div><span class="${amount > 0 ? 'plus' : 'minus'}">${amount > 0 ? '+' : ''}${amount} ${unit}</span></div>`;
}
function trHistHTML(s) {
  return sheetWrap(`
    <div class="sh"><div><h2>🏆 Historique des trophées</h2><div class="when">Solde : ${balanceOf(state.me.id)} 🏆</div></div>${closeBtn}</div>
    ${s.rows == null ? '<div class="det">Chargement…</div>' : s.rows.length ? `<div class="hlist">${s.rows.map((r) => histRow(reasonLabel(r.reason), ago(r.created_at), r.amount, '🏆')).join('')}</div>` : '<div class="det">Aucun gain ni perte pour l\'instant.</div>'}
    <div class="sact"><button class="btn" data-action="close">Fermer</button></div>`, 'var(--gold)');
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

/* ---------- Plateau, messages ---------- */
async function rollDiceNow() {
  if (state.rolling) return;
  state.rolling = true; render();
  try {
    const r = await state.api.rollDice(state.me.id);
    state.rolling = false;
    state.sheet = { type: 'dice', r };
    await refresh(true);
  } catch (e) { state.rolling = false; toast(e.message || 'Lancer impossible.'); refresh(true).catch(() => {}); }
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
function nextStreak() {
  const s = statsOf(state.me.id);
  const y = iso(addDays(startOfToday(), -1));
  return s.last_login === y && s.streak < 7 ? s.streak + 1 : 1;
}
async function claimDailyNow() {
  try {
    const r = await state.api.claimDaily(state.me.id, iso(new Date()));
    toast(r.wheel ? 'Jour 7 ! Ta roue de la fortune est prête.' : `+${r.xp} XP · jour ${r.streak} sur 7`);
    await refresh();
    if (r.wheel) { state.sheet = { type: 'wheel' }; render(); }
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
  chifoumi: { name: 'Chifoumi', cls: 'chif', blurb: "Défie un coloc ou un copain : pierre, feuille, ciseaux. Ton coup reste secret jusqu'à sa réponse. Victoire : +5 trophées. Défaite : −4 trophées.", duel: true },
  flappy: { name: 'Jumpy Cardinal', cls: 'flap', mod: './games/flappy.js', blurb: 'Touche l\'écran pour battre des ailes et passe entre les colonnes sans les toucher. Chaque obstacle rapporte de l\'XP.' },
  raid: { name: 'Le Grand Raid', cls: 'raid', mod: './games/raid.js', blurb: 'Une course sans fin sur la plage : saute les obstacles et grimpe le plus haut possible. Atteins 3 070 m pour le sommet du Piton.' },
  sudoku: { name: 'Sudoku', cls: 'sudo', mod: './games/sudoku.js', blurb: 'Remplis la grille contre la montre. Tu as 3 vies : chaque erreur en coûte une.' },
  blackjack: { name: 'Blackjack', cls: 'blk', mod: './games/blackjack.js', blurb: 'Bats la banque sans dépasser 21. Mise 1, 5, 10 ou 25 trophées (il te faut au moins 1 trophée), double ou sépare tes cartes. Le blackjack paie 3 pour 2.' },
};
let gameHandle = null;
async function openGame(id) {
  const G = GAMES[id];
  if (!G || state.game) return;
  state.game = id; state.sheet = null; render();
  const layer = document.createElement('div');
  layer.id = 'gamelayer'; layer.className = `gamelayer g-${id}`;
  // Une fois le jeu lancé, il ne reste que la flèche retour (le nom ne s'affiche que sur l'écran jaune d'ouverture)
  layer.innerHTML = `<div class="ghead"><button class="chip" data-gact="close" aria-label="Retour">‹</button></div><div class="gbody"></div>
    <div class="gsplash"><span>${esc(G.name)}</span></div>`;
  document.body.appendChild(layer);
  layer.addEventListener('click', (e) => { if (e.target.closest('[data-gact="close"]')) closeGame(); });
  setTimeout(() => layer.querySelector('.gsplash')?.remove(), 1150);
  try {
    const mod = await import(G.mod);
    await new Promise((r) => setTimeout(r, 700)); // le jeu démarre quand l'écran jaune s'efface
    if (state.game !== id) return;
    gameHandle = mod.mount(layer.querySelector('.gbody'), {
      balance: () => availableOf(state.me.id),
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
    <header class="top hdr">
      <button class="hav" data-action="heads" aria-label="Les colocs" aria-expanded="${state.heads}">${av(me, 44)}<span class="lvlcircle xs" title="Niveau">${lvlOf(me.id)}</span></button>
      <span class="grow"></span>
      <button class="hchip" data-action="hist-soap" title="Historique des savons">🧼 ${soapOf(me.id)}</button>
      <button class="hchip" data-action="hist-tr" title="Historique des trophées">🏆 ${balanceOf(me.id)}</button>
    </header>
    ${state.heads ? headsHTML() : ''}
    <main class="${anim ? 'pg' : ''}">
      ${pushOn() || store.get('coloc-push-dismiss') === '1' || step ? '' : `
        <div class="banner">
          <span>Active les notifications pour recevoir les rappels, les alertes de rupture, les défis et les messages.</span>
          <span style="display:flex;gap:4px;align-items:center"><button class="btn" style="background:var(--accent);color:var(--on-accent);padding:10px 14px;width:auto" data-action="push">Activer</button><button class="x" data-action="dismiss" aria-label="Fermer">✕</button></span>
        </div>`}
      ${tab === 'tasks' ? tasksHTML() : tab === 'defis' ? defisTabHTML() : tab === 'games' ? gamesHTML() : tab === 'rank' ? rankHTML() : meHTML()}
    </main>
    ${step ? `<div class="coach" role="status"><div class="cn">Découverte · étape ${step.n} sur ${INTRO_STEPS.length}</div><b>${esc(step.title)}</b><p>${esc(step.text)}</p>
      <div class="cgo">👇 Touche l'onglet « ${esc(step.title)} » pour continuer</div></div>` : ''}
    <nav class="tabs">
      <button data-action="tab" data-tab="tasks" class="${tab === 'tasks' ? 'active' : ''} ${pulse('tasks')}"><span class="ico">🧹</span>Tâches${badge(reqForMe)}</button>
      <button data-action="tab" data-tab="defis" class="${tab === 'defis' ? 'active' : ''} ${pulse('defis')}"><span class="ico">🎯</span>Défis${badge(dailyDue() || statsOf(me.id).wheel_ready ? 1 : 0, 'var(--danger)')}</button>
      <button data-action="tab" data-tab="games" class="${tab === 'games' ? 'active' : ''} ${pulse('games')}"><span class="ico">🎮</span>Jeux${badge(duelsForMe)}</button>
      <button data-action="tab" data-tab="rank" class="${tab === 'rank' ? 'active' : ''} ${pulse('rank')}"><span class="ico">🥇</span>Classement</button>
      <button data-action="tab" data-tab="me" class="${tab === 'me' ? 'active' : ''} ${pulse('me')}"><span class="ico">👤</span>Profil${badge(unreadCount() + perksOwed().length, 'var(--danger)')}</button>
    </nav>
    ${sheetHTML()}`;
}

// Introduction : tant que les 5 onglets n'ont pas été visités, on guide le nouvel arrivant
const introStep = () => {
  if (!state.me || state.game) return null;
  const mask = statsOf(state.me.id).quest_mask ?? 0;
  if (questDone(mask)) return null;
  return INTRO_STEPS.find((x) => !(mask & (1 << (x.n - 1)))) ?? null;
};

// Tête du header : déroule les têtes de tous les colocs et copains (la tienne en premier)
function headsHTML() {
  const me = state.me;
  const list = [me, ...colocs().filter((m) => m.id !== me.id), ...copains().filter((m) => m.id !== me.id)];
  return `<div class="heads" role="menu">${list.map((m) => `
    <button class="headb" data-action="head" data-id="${m.id}" role="menuitem">${av(m, 48)}<small>${m.id === me.id ? 'Moi' : esc(m.name)}</small>${m.kind === 'copain' ? '<i>copain</i>' : ''}</button>`).join('')}</div>`;
}

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
const posThisWeek = (id) => state.dice.filter((r) => r.member_id === id && r.week === currentWeek()).reduce((m, r) => Math.max(m, r.to_pos), 0);
const diceCost = (id) => DICE_PRICES[Math.min(rollsToday(id), DICE_PRICES.length - 1)];
const rollsToday = (id) => state.dice.filter((r) => r.member_id === id && iso(new Date(r.created_at)) === iso(new Date())).length;
function cellLabel(n) {
  const c = GOOSE.cells[n];
  if (n === GOOSE.size) return '<em class="cl fin">Arrivée</em>';
  if (!c) return '';
  if (c.xp) return `<em class="cl xp">+${c.xp} XP</em>`;
  if (c.trophy) return `<em class="cl tr">+${c.trophy} 🏆</em>`;
  if (c.back) return `<em class="cl bk">−${c.back}</em>`;
  if (c.goose) return '<em class="cl go">Oie</em>';
  return '';
}
function plateauHTML() {
  const me = state.me, isColoc = me.kind === 'coloc';
  const cols = 6, rows = GOOSE.size / cols;
  const pawns = {};
  colocs().forEach((m) => { const p = posThisWeek(m.id); (pawns[p] ??= []).push(m); });
  const cells = [];
  for (let r = rows - 1; r >= 0; r--) {         // ligne du haut = les cases les plus hautes
    const row = Array.from({ length: cols }, (_, i) => r * cols + i + 1);
    if (r % 2 === 1) row.reverse();
    row.forEach((n) => cells.push(`<div class="gc ${GOOSE.cells[n] ? 'sp' : ''} ${n === GOOSE.size ? 'end' : ''}"><b>${n}</b>${cellLabel(n)}<div class="pw">${(pawns[n] ?? []).map((m) => `<span class="pawn ${m.id === me.id ? 'me' : ''}" title="${esc(m.name)}">${av(m, 22)}</span>`).join('')}</div></div>`));
  }
  const pos = posThisWeek(me.id), cost = diceCost(me.id), have = soapOf(me.id), done = pos >= GOOSE.size;
  const can = isColoc && !done && have >= cost && !state.rolling;
  const hist = state.dice.slice(0, 15);
  return `
    <p class="summary" style="margin-top:0">Chaque semaine le plateau repart de zéro. Un dé coûte <b>${DICE_PRICES.join(' puis ')} 🧼</b> au fil des lancers de la journée (retour à ${DICE_PRICES[0]} à minuit). Les savons dépensés ne rapportent rien : on joue pour l'XP et les trophées des cases.</p>
    <div class="perkbox"><b>Récompense d'arrivée de la semaine</b><span>${esc(perkOfWeekDef().title)}</span><small>${esc(perkOfWeekDef().short)} · en plus de ${GOOSE.finish.xp} XP et ${GOOSE.finish.trophy} 🏆</small></div>
    <div class="goose"><div class="gstart"><b>Départ</b><div class="pw">${(pawns[0] ?? []).map((m) => `<span class="pawn ${m.id === me.id ? 'me' : ''}" title="${esc(m.name)}">${av(m, 22)}</span>`).join('')}</div></div>
      <div class="ggrid">${cells.join('')}</div></div>
    <div class="legend"><span><i class="cl xp">XP</i> bonus d'XP</span><span><i class="cl tr">🏆</i> trophées</span><span><i class="cl bk">−n</i> piège : recule</span><span><i class="cl go">Oie</i> avance encore</span></div>
    <button class="btn primary" style="margin-top:12px" data-action="roll" ${can ? '' : 'disabled'}>${!isColoc ? 'Réservé aux colocataires' : done ? 'Arrivé ! Reviens lundi' : state.rolling ? 'Le dé roule…' : `Lancer le dé · ${cost} 🧼`}</button>
    <div class="det" style="text-align:center">Tu as ${have} 🧼 · case ${pos || 'départ'} sur ${GOOSE.size}</div>
    <h3 class="sec">Derniers lancers</h3>
    ${hist.length ? hist.map((r) => `<div class="up hist"><div class="mini-av">${av(memberById(r.member_id), 38)}</div>
      <div class="txt"><b>${esc(nameOf(r.member_id))} : dé ${r.roll}</b><small>case ${r.from_pos || 'départ'} → ${r.to_pos}${r.note ? ` · ${esc(r.note)}` : ''} · ${ago(r.created_at)} · −${r.cost} 🧼</small></div></div>`).join('')
      : '<div class="empty-msg" style="padding:16px 0">Personne n\'a encore lancé le dé.</div>'}`;
}

function taskListHTML() {
  const me = state.me, isColoc = me.kind === 'coloc';
  const vac = activePerksOf(me.id).find((pk) => pk.kind === 'vacances');
  const confirm = toConfirm();
  const mine = pendingLogs().filter((l) => l.doer_id === me.id);
  const kinds = Object.entries(TASK_KINDS).map(([k, K]) => ({ k, K, ...kindStatus(k) }))
    .sort((a, b) => (a.st === 'free' ? 0 : 1) - (b.st === 'free' ? 0 : 1));
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
    <div class="klist">${kinds.map(({ k, K, st, log, left }) => {
      const sub = st === 'pending' ? `⏳ ${esc(nameOf(log.doer_id))} l'a faite, en attente de confirmation`
        : st === 'cooldown' ? `✅ Faite par ${esc(nameOf(log.doer_id))} ${ago(log.answered_at)} · de nouveau dispo dans ${fmtWait(left)}`
        : esc(K.detail);
      return `<button class="kcard ${st}" style="--c:${K.color}" data-action="task-pick" data-id="${k}" ${st === 'free' && isColoc ? '' : 'disabled'}>
        <span class="kemo">${K.emoji}</span>
        <span class="ktxt"><b>${esc(K.label)}</b><small>${sub}</small></span>
        <span class="ksoap">+${K.soap} 🧼</span></button>`;
    }).join('')}</div>
    ${done.length ? `<h3 class="sec">Dernières tâches</h3>${done.map((l) => {
      const K = TASK_KINDS[l.kind];
      return `<div class="up hist"><div class="mini-av">${av(memberById(l.doer_id), 38)}</div>
        <div class="txt"><b>${esc(nameOf(l.doer_id))} : ${K.emoji} ${esc(K.short)}</b><small>${ago(l.answered_at)} · +${l.soap} 🧼 · confirmé par ${esc(nameOf(l.validator_id))}</small></div></div>`;
    }).join('')}` : ''}`;
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
  const next = due ? nextStreak() : st.streak || 1;
  const tiles = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1, got = due ? day < next : day <= next, cur = due && day === next;
    const content = day === 7 ? '🎡<small>Roue</small>' : `⭐<small>+${DAILY_XP[i]}</small>`;
    return `<div class="dday ${got ? 'got' : ''} ${cur ? 'cur' : ''}"><i>J${day}</i><span>${got ? '✓' : content}</span></div>`;
  }).join('');
  return `<div class="dailycard ${due ? 'due' : ''}">
    <div class="dh"><b>🎁 Récompense du jour</b><small>${due ? `Jour ${next} sur 7` : 'Récupérée · reviens demain'}</small></div>
    <div class="ddays">${tiles}</div>
    ${due ? `<button class="btn primary" data-action="daily-claim">${next === 7 ? '🎡 Débloquer la roue' : `Récupérer +${DAILY_XP[next - 1]} XP`}</button>` : ''}
    ${st.wheel_ready ? `<button class="wheelban" data-action="wheel">🎡 Ta roue de la fortune est prête ! <b>Tourner</b></button>` : ''}
    ${due ? `<small class="det">Le jour 7 débloque la roue de la fortune : de ${WHEEL_MIN} à ${WHEEL_MAX} XP.</small>` : ''}
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
  return null;
}
function closeSheet() {
  if (state.sheet) state.sheet = null;
  else if (state.won.length) state.won = [];
  else if (state.levelUps.length) state.levelUps = [];
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
    case 'trhist': return trHistHTML(s);
    case 'soaphist': return soapHistHTML();
    case 'wheel': return wheelSheetHTML(s);
    case 'task-do': return taskConfirmHTML(s);
    case 'levelup': return levelUpSheetHTML();
    case 'duel-new': return duelNewHTML(s);
    case 'duel-play': return duelPlayHTML(s);
    case 'duel-result': return duelResultHTML(s);
    default: return '';
  }
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
      <div><h2>Défier ${esc(opp.name)}</h2><div class="when">Chifoumi · ${XP_RULES.duelWinTrophies} 🏆 pour le gagnant</div></div>${closeBtn}</div>
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
      <div><h2>${esc(ch?.name)} te défie !</h2><div class="when">${d.wager ? `Mise : ${d.wager} 🏆 · si tu perds, −${d.wager} 🏆` : `${XP_RULES.duelWinTrophies} 🏆 pour le gagnant`}</div></div>${closeBtn}</div>
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
  return `
    ${received.length ? `<h3 class="sec" style="margin-top:0">Défis reçus</h3>${received.map((d) => {
      const ch = memberById(d.challenger_id);
      return `<div class="up"><div class="mini-av">${av(ch, 44)}</div>
        <div class="txt"><b>${esc(ch?.name)} te défie</b><small>Chifoumi · ${XP_RULES.duelWinTrophies} 🏆 à gagner, −${XP_RULES.duelLossTrophies} 🏆 si tu perds</small></div>
        <button class="mini ok" data-action="duel-open" data-id="${d.id}">Relever</button>
        <button class="mini" data-action="duel-cancel" data-id="${d.id}">Refuser</button></div>`;
    }).join('')}` : ''}

    <div class="gtiles">${Object.entries(GAMES).map(([id, g]) => `
      <button class="gtile g-${g.cls}" data-action="ginfo" data-id="${id}" aria-label="${esc(g.name)}"><span class="gt-name">${esc(g.name)}</span></button>`).join('')}</div>

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

// Fiche d'un jeu : texte uniquement + bouton Jouer
function gameInfoHTML(s) {
  const g = GAMES[s.id], me = state.me, st = statsOf(me.id);
  if (!g) return '';
  const wins = state.duelStats.find((d) => d.member_id === me.id)?.wins ?? 0;
  const rec = { chifoumi: `${wins} victoire${wins > 1 ? 's' : ''}`, flappy: `Record : ${st.flappy_best || 0}`, raid: `Record : ${st.raid_best || 0} m`,
    sudoku: st.sudoku_best ? `Record : ${fmtTime(st.sudoku_best)}` : 'Pas encore terminé', blackjack: `${st.blackjack_wins || 0} main${(st.blackjack_wins || 0) > 1 ? 's' : ''} gagnée${(st.blackjack_wins || 0) > 1 ? 's' : ''} · ${balanceOf(me.id)} trophées` }[s.id];
  const others = state.members.filter((m) => m.id !== me.id);
  if (!others.some((m) => m.id === state.opp)) state.opp = others[0]?.id ?? null;
  return sheetWrap(`
    <div class="sh"><div><h2>${esc(g.name)}</h2><div class="when">${esc(rec)}</div></div>${closeBtn}</div>
    <div class="det">${esc(g.blurb)}</div>
    ${g.duel ? `<select class="dd" data-input="opp" aria-label="Adversaire">${others.map((m) => `<option value="${m.id}" ${m.id === state.opp ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <div class="sact"><button class="btn primary" data-action="duel-new" ${others.length ? '' : 'disabled'}>Défier</button></div>`
      : `<div class="sact"><button class="btn primary" data-action="game" data-id="${s.id}">Jouer</button></div>`}`);
}

/* ---------- Onglet Profil ---------- */
function meHTML() {
  const me = state.me;
  const seg = state.meSeg;
  const p = levelProgress(xpOf(me.id));
  return `
    <section class="hero2">
      <div class="avwrap">${av(me, 88)}</div>
      <div class="hmain">
        <div class="lvlrow"><span class="lvlcircle" title="Niveau">${p.level}</span>
          <div class="lvlinfo"><div class="bar sm lvlbar"><i style="width:${p.pct}%"></i></div>
          <div class="sub">${xpOf(me.id)} XP · encore ${p.need - p.into} pour le niveau ${p.level + 1}</div></div></div>
        <div class="sub"><b>${balanceOf(me.id)} 🏆</b> trophées · <b>${soapOf(me.id)} 🧼</b> savons</div></div>
    </section>
    <div class="seg">${[['profil', 'Profil'], ['robe', 'Garde-robe']].map(([k, l]) =>
      `<button class="${seg === k ? 'on' : ''}" data-action="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    ${seg === 'robe' ? robeHTML() : persoHTML()}`;
}

// Cases de statistiques d'un profil (le tien ou celui d'un autre)
function statGrid(m) {
  const st = statsOf(m.id);
  const soap = earnedSoap(m.id);
  const wins = state.duelStats.find((x) => x.member_id === m.id)?.wins ?? 0;
  const cells = [
    ['level', '⭐', 'Niveau', lvlOf(m.id)],
    ['coins', '🏆', 'Trophées', balanceOf(m.id)],
    ['chores', '🧼', 'Savons', soap],
    ['chifoumi', '✊', 'Victoires chifoumi', wins],
    ['flappy', '🐦', 'Jumpy Cardinal', st.flappy_best || 0],
    ['raid', '🏃', 'Grand Raid', st.raid_best || 0, `${st.raid_best || 0} m`],
  ];
  return `<div class="stgrid">${cells.map(([k, e, l, raw, shown]) => {
    const t = tierOf(k, raw);
    return `<div class="stc"><span class="medal ${t == null ? 'none' : 't' + t}" title="${t == null ? 'Pas encore de résultat' : TIER_NAMES[t]}">${e}</span><b>${esc(shown ?? raw)}</b><small>${l}</small><i class="tier ${t == null ? 'none' : 't' + t}">${t == null ? '—' : TIER_NAMES[t]}</i></div>`;
  }).join('')}</div>`;
}

// Réglages du profil : titre affiché
function profileEdit(m) {
  const unlocked = CHALLENGES.filter((c) => unlockedKeys(m.id).has(c.key));
  return `
    <h3 class="sec">Titre affiché</h3>
    <select class="dd" data-input="title" aria-label="Titre affiché">
      <option value="">Aucun titre</option>
      ${unlocked.map((c) => `<option value="${c.key}" ${m.title === c.key ? 'selected' : ''}>${c.emoji} ${esc(c.title)}</option>`).join('')}
    </select>
    ${unlocked.length ? '' : '<div class="det">Réussis un défi pour débloquer ton premier titre.</div>'}`;
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
  rows.sort((a, b) => Number(b.done) - Number(a.done));
  const rewardTxt = (c) => {
    const r = rewardOf(c.key);
    return [r.xp ? `+${r.xp} XP` : '', r.skin ? `🎭 ${outfitName(r.skin, state.me.gender)}` : ''].filter(Boolean).join(' · ');
  };
  return `
    <p class="summary">Chaque défi réussi débloque un <b>titre</b> à afficher sur ton profil et de l'<b>XP</b>, parfois un personnage.</p>
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
  const cur = OUTFITS[me.outfit] ?? OUTFITS.none;
  const swatches = (list, field, current) => list.map((o) =>
    `<button class="sw ${current?.toLowerCase() === o.c ? 'sel' : ''}" style="background:${o.c}" data-action="${field}" data-v="${o.c}" aria-label="${esc(o.name)}" aria-pressed="${current?.toLowerCase() === o.c}"></button>`).join('');
  return `
    <div class="pname"><b>${esc(me.name)}</b>${titleLabel(me) ? `<span class="ptitle">${esc(titleLabel(me))}</span>` : ''}${me.kind === 'copain' ? '<span class="ptitle">Copain</span>' : ''}</div>
    <div class="center-av">${av(me, 150)}</div>
    <h3 class="sec">Genre</h3>
    <div class="seg small">${[['homme', '👨 Homme'], ['femme', '👩 Femme']].map(([k, l]) =>
      `<button class="${me.gender === k ? 'on' : ''}" data-action="gender" data-v="${k}">${l}</button>`).join('')}</div>
    <h3 class="sec">Couleur de peau ${cur.hidesSkin ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
    <div class="swatches">${swatches(SKIN_COLORS, 'skin', me.skin)}</div>
    <h3 class="sec">Couleur de cheveux ${cur.hidesHair ? '<small>(cachée par ta tenue)</small>' : ''}</h3>
    <div class="swatches">${swatches(HAIR_COLORS, 'hair', me.hair)}</div>
    <h3 class="sec">Couleur de fond du profil</h3>
    <div class="swatches">${BG_COLORS.map((c) => `<button class="sw ${(me.bg ?? BG_COLORS[0]).toLowerCase() === c ? 'sel' : ''}" style="background:${c}" data-action="bg" data-v="${c}" aria-label="Fond ${c}"></button>`).join('')}</div>
    ${profileEdit(me)}
    ${activePerksOf(me.id).length || perksOwed().length ? `<h3 class="sec">Récompenses du plateau</h3>
      ${activePerksOf(me.id).map((pk) => perkCardHTML(pk, true)).join('')}
      ${perksOwed().length ? `<div class="det">À offrir :</div>${perksOwed().map((pk) => perkCardHTML(pk, false)).join('')}` : ''}` : ''}
    <h3 class="sec">Mes badges</h3>
    ${statGrid(me)}
    <h3 class="sec">Mes messages</h3>
    ${inboxHTML()}
    <button class="btn" style="margin-top:14px" data-action="push">${pushOn() ? '🔔 Notifications activées' : '🔕 Activer les notifications'}</button>
    <button class="link" data-action="switch">Changer de prénom (actuellement ${esc(me.name)})</button>`;
}

function robeHTML() {
  const me = state.me, owned = ownedBy(me.id);
  return `
    <div class="center-av">${av(me, 150)}</div>
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
function rankHTML() { return weekHTML(); }

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
    <p class="summary">Seuls les trophées gagnés cette semaine comptent (chifoumi, blackjack, plateau). Le·la champion·ne reçoit 👑 à la fin de la semaine. <b>Prince</b> : finir 1 semaine premier. <b>Roi</b> : 2 semaines de suite. <b>Dieu</b> : 6 semaines au total.</p>
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
  const last = state.logs.filter((l) => l.status === 'validated' && l.doer_id === m.id).slice(0, 3);
  return sheetWrap(`
    <div class="sh"><div><h2>${mine ? 'Mon profil vu par les autres' : esc(m.name)}</h2><div class="when">${t ? esc(t) : 'Aucun titre affiché'}${m.kind === 'copain' ? ' · Copain' : ''}</div></div>${closeBtn}</div>
    <div class="center-av" style="background:${esc(m.bg || '#e6ebf1')}">${av(m, 130)}</div>
    <div class="pname"><b>${esc(m.name)}</b></div>
    ${statGrid(m)}
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
    <div class="sh"><div><h2>Tu as fait ${r.roll}</h2><div class="when">Case ${r.from || 'départ'} → case ${r.to}</div></div>${closeBtn}</div>
    <div class="dicebig"><span class="die d${r.roll}">${Array.from({ length: r.roll }, () => '<i></i>').join('')}</span></div>
    ${r.note ? `<div class="reward">${esc(r.note)}</div>` : '<div class="det">Case sans effet.</div>'}
    ${r.perk ? `<div class="perk ${r.perk}"><b>Récompense : ${esc(perkDef(r.perk)?.title)}</b><small>${esc(perkDef(r.perk)?.short)}. Elle reste visible sur ton profil.</small></div>` : ''}
    <div class="sact"><button class="btn primary" data-action="close">OK</button></div>`, 'var(--gold)');
}

function wonSheetHTML() {
  const list = state.won.map((k) => challengeByKey[k]).filter(Boolean);
  return sheetWrap(`
    <div class="sh"><div><h2>🏆 Défi${list.length > 1 ? 's' : ''} réussi${list.length > 1 ? 's' : ''} !</h2><div class="when">Bravo ${esc(state.me.name)}</div></div>${closeBtn}</div>
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
      <text x="${110 + Math.cos(am) * 66}" y="${110 + Math.sin(am) * 66 + 6}" text-anchor="middle" font-size="18">⭐</text>`;
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
    case 'heads': state.heads = !state.heads; render(); break;
    case 'head': state.heads = false; openProfile(Number(id)); break;
    case 'roll': rollDiceNow(); break;
    case 'hist-tr': openTrHist(); break;
    case 'hist-soap': state.sheet = { type: 'soaphist' }; render(); break;
    case 'perk-ok': confirmPerkNow(Number(id)); break;
    case 'ginfo': state.sheet = { type: 'ginfo', id }; render(); break;
    case 'duel-with': state.opp = Number(id); state.sheet = { type: 'duel-new', opp: Number(id), move: null }; render(); break;
    case 'msg': state.sheet = { type: 'msg', to: Number(id), text: '' }; render(); break;
    case 'msg-send': sendMessageNow(); break;
    case 'close': if (e.target === el) closeSheet(); break;
    case 'tseg': state.anim = state.tasksSeg !== v; state.tasksSeg = v; render(); window.scrollTo(0, 0); break;
    case 'task-pick': state.sheet = { type: 'task-do', kind: id }; render(); break;
    case 'task-submit': submitTaskNow(id); break;
    case 'task-ok': answerTaskNow(Number(id), true); break;
    case 'task-no': case 'task-cancel': answerTaskNow(Number(id), false); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
    // --- Toi : personnage et boutique ---
    case 'seg': state.anim = state.meSeg !== seg; state.meSeg = seg; state.sheet = null; render(); break;
    case 'bg': saveProfile({ bg: v }); break;
    case 'title': saveTitle(state.me.title === id ? null : id); break;
    case 'profile': openProfile(Number(id)); break;
    case 'goprofile': state.sheet = null; state.tab = 'me'; state.meSeg = 'profil'; state.anim = true; markRead(); render(); window.scrollTo(0, 0); break;
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
document.addEventListener('input', (e) => {
  if (e.target.dataset?.input === 'msg' && state.sheet?.type === 'msg') {
    state.sheet.text = e.target.value;
    const c = document.getElementById('msgcount'); if (c) c.textContent = `${e.target.value.length}/${MESSAGE_MAX}`;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !state.game && currentSheet()) closeSheet(); });

render();
init();
