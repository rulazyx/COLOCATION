import {
  CONFIG, TASK_KINDS, TASK_TEMPLATES, SKIP_PENALTY, ALLOW_EARLY_VALIDATION, participants, pickAssignee,
} from './config.js';

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

/* Génère les tâches d'une semaine.
   - tâche normale : UNE personne, par rotation parmi les personnes concernées (cf. participants() dans config.js)
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
  return {
    mode: 'cloud',
    async members() { return check(await sb.from('members').select('*').order('id')); },
    async ensureWeeks(rows) {
      check(await sb.from('tasks').upsert(rows, { onConflict: 'week,slot,assignee_id', ignoreDuplicates: true }));
    },
    async tasks(from, to) {
      return check(await sb.from('tasks').select('*').gte('week', from).lte('week', to)
        .order('week').order('day_index').order('slot').order('assignee_id'));
    },
    async scores() { return check(await sb.from('scores').select('*')); },
    // Change le statut seulement si la tâche est encore dans l'état attendu (évite que 2 personnes valident en même temps)
    async setStatus(id, from, patch) {
      const data = check(await sb.from('tasks').update(patch).eq('id', id).eq('status', from).select('id'));
      return data.length > 0;
    },
    async products() { return check(await sb.from('products').select('*').order('id')); },
    async setProduct(id, out, memberId) {
      check(await sb.from('products').update({ out_of_stock: out, updated_by: memberId, updated_at: new Date().toISOString() }).eq('id', id));
      if (out) {
        // Déclenche le push vers tous les colocs. Un échec ici ne doit pas annuler le signalement.
        sb.functions.invoke('notify', { body: { type: 'stock', productId: id } })
          .then((r) => { if (r.error) console.warn('notify:', r.error); });
      }
    },
    onChange(cb) {
      sb.channel('coloc')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, cb)
        .subscribe();
    },
    async saveSub(memberId, sub) {
      check(await sb.from('push_subs').upsert({ endpoint: sub.endpoint, member_id: memberId, sub }, { onConflict: 'endpoint' }));
    },
  };
}

function makeDemoApi() {
  const KEY = 'coloc-demo-v2';
  const members = ['Anthony', 'Mathilde', 'Lily', 'Victor', 'Zakaria'].map((name, i) => ({ id: i + 1, name }));
  const PRODUCTS = ['Papier toilette', 'Sopalin', 'Produit toilettes', 'Cumin', 'Curcuma', 'Paprika', 'Poivre', 'Sel',
    'Liquide vaisselle', 'Désinfectant spray', 'Vinaigre blanc', "Huile d'olive", 'Huile de tournesol'];
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  if (!db) db = { tasks: [], nextId: 1, products: PRODUCTS.map((name, i) => ({ id: i + 1, name, out_of_stock: false, updated_by: null })) };
  const save = () => store.set(KEY, JSON.stringify(db));
  return {
    mode: 'demo',
    async members() { return members; },
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
    onChange() {},
    async saveSub() {},
  };
}

/* =========================================================
   État + chargement
   ========================================================= */
const state = {
  api: null, members: [], me: null, tasks: [], products: [], scores: [],
  tab: 'tasks', weekOffset: 0, sheet: null, error: null, initials: {},
};
const nameOf = (id) => state.members.find((m) => m.id === id)?.name ?? '?';

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
  [state.tasks, state.scores, state.products] = await Promise.all([
    state.api.tasks(iso(addDays(m0, -7 * WEEKS_BACK)), iso(addDays(m0, 7 * WEEKS_AHEAD))),
    state.api.scores(),
    state.api.products(),
  ]);
  render();
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
  const tab = state.tab;
  app.innerHTML = `
    <header class="top">
      <h1>🏠 Coloc${state.api.mode === 'demo' ? ' <small style="font-weight:400;color:var(--muted)">(démo)</small>' : ''}</h1>
      <button class="chip" data-action="push" aria-label="Notifications">${pushOn() ? '🔔' : '🔕'}</button>
    </header>
    <main>
      ${pushOn() || store.get('coloc-push-dismiss') === '1' ? '' : `
        <div class="banner">
          <span>Active les notifications pour recevoir les rappels et les alertes de rupture.</span>
          <span style="display:flex;gap:4px;align-items:center"><button class="btn-act btn" style="background:var(--accent);color:#fff;padding:10px 14px;width:auto" data-action="push">Activer</button><button class="x" data-action="dismiss" aria-label="Fermer">✕</button></span>
        </div>`}
      ${tab === 'tasks' ? tasksHTML() : tab === 'stock' ? stockHTML() : meHTML()}
    </main>
    <nav class="tabs">
      <button data-action="tab" data-tab="tasks" class="${tab === 'tasks' ? 'active' : ''}"><span class="ico">🧹</span>Tâches</button>
      <button data-action="tab" data-tab="stock" class="${tab === 'stock' ? 'active' : ''}"><span class="ico">🛒</span>Stocks${outCount ? `<span class="badge">${outCount}</span>` : ''}</button>
      <button data-action="tab" data-tab="me" class="${tab === 'me' ? 'active' : ''}"><span class="ico">👤</span>Toi${todoMine ? `<span class="badge" style="background:var(--accent)">${todoMine}</span>` : ''}</button>
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

/* ---------- Feuille de validation (= confirmation) ---------- */
function sheetHTML() {
  const s = state.sheet;
  if (!s) return '';
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

  return `
    <div class="overlay" data-action="close"><div class="sheet" role="dialog" aria-modal="true" style="--c:${K.color}">
      <div class="sh"><div class="badge-k">${K.emoji}</div>
        <div><h2>${title}</h2><div class="when">${s.mode === 'auto' ? `${DAYS[t0.day_index]} ${date.getDate()} ${MONTHS[date.getMonth()]}` : `${esc(t0.label)} · ${relDay(date)}`}</div></div>
        <button class="close" data-action="close" aria-label="Fermer">✕</button></div>
      <div class="det">${esc(t0.detail)}</div>
      <div class="reward">Récompense : +${t0.reward} 🪙${multi ? ' par personne (tâche pour tous)' : ''}</div>
      ${rows}
    </div></div>`;
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

/* ---------- Onglet 3 : Toi ---------- */
function myUpcoming() {
  const limit = addDays(startOfToday(), -7);
  return state.tasks
    .filter((t) => t.assignee_id === state.me.id && t.status === 'todo' && taskDate(t) >= limit)
    .sort((a, b) => taskDate(a) - taskDate(b) || a.slot - b.slot);
}

function meHTML() {
  const byId = Object.fromEntries(state.scores.map((s) => [s.member_id, s]));
  const mine = byId[state.me.id] ?? { coins: 0, done_count: 0 };
  const monday = iso(mondayOf());
  const weekCoins = state.tasks.filter((t) => t.week === monday && t.actor_id === state.me.id).reduce((a, t) => a + t.coins, 0);
  const ranking = state.members
    .map((m) => ({ ...m, coins: byId[m.id]?.coins ?? 0, done: byId[m.id]?.done_count ?? 0 }))
    .sort((a, b) => b.coins - a.coins || b.done - a.done || a.name.localeCompare(b.name));
  const medals = ['🥇', '🥈', '🥉'];
  const up = myUpcoming();
  const today = startOfToday();

  return `
    <section class="hero">
      <div class="coins"><span>🪙</span> ${mine.coins}</div>
      <div class="sub">${mine.done_count} tâche${mine.done_count > 1 ? 's' : ''} faite${mine.done_count > 1 ? 's' : ''} · ${weekCoins >= 0 ? '+' : ''}${weekCoins} cette semaine</div>
    </section>

    <h3 class="sec">Classement</h3>
    <ol class="rank">${ranking.map((m, i) => `
      <li class="${m.id === state.me.id ? 'me' : ''}"><span class="pos">${medals[i] ?? i + 1}</span><span class="nm">${esc(m.name)}${m.id === state.me.id ? ' (toi)' : ''}</span><span class="pts">${m.coins} 🪙</span></li>`).join('')}
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

    <button class="link" data-action="switch">Changer de prénom (actuellement ${esc(state.me.name)})</button>`;
}

/* =========================================================
   Événements (délégation)
   ========================================================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, tab, d } = el.dataset;
  const task = id ? state.tasks.find((t) => t.id === Number(id)) : null;
  switch (action) {
    case 'pick':
      state.me = state.members.find((m) => m.id === Number(id));
      store.set('coloc-me', String(state.me.id));
      render(); syncSub(); break;
    case 'switch': state.me = null; state.tab = 'tasks'; render(); break;
    case 'tab': state.tab = tab; state.sheet = null; render(); window.scrollTo(0, 0); break;
    case 'week': state.weekOffset = Math.max(-WEEKS_BACK, Math.min(WEEKS_AHEAD, state.weekOffset + Number(d))); render(); break;
    case 'cell': state.sheet = { week: el.dataset.week, kind: el.dataset.kind, day: Number(el.dataset.day), mode: 'auto' }; render(); break;
    case 'open': if (task) { state.sheet = { week: task.week, kind: task.kind, day: task.day_index, mode: el.dataset.mode }; render(); } break;
    case 'close': if (e.target === el) { state.sheet = null; render(); } break;
    case 'do': if (task) act(task, 'done'); break;
    case 'skip': if (task) act(task, 'skipped'); break;
    case 'undo': if (task) act(task, 'todo'); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sheet) { state.sheet = null; render(); } });

render();
init();
