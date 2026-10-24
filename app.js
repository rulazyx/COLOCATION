import { CONFIG, TASK_TEMPLATES } from './config.js';

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (s) => document.querySelector(s);
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKS_AHEAD = 4; // semaine en cours + 4 suivantes

const pad = (n) => String(n).padStart(2, '0');
// Date locale AAAA-MM-JJ (surtout pas toISOString : il décale d'un jour selon le fuseau)
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d = new Date()) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
// Numéro de semaine depuis le lundi 1er janvier 2024 (sert à faire tourner les tâches)
const weekIndex = (monday) =>
  Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2024, 0, 1)) / (7 * 86400000));

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

/* Génère les 9 tâches d'une semaine. Rotation : (numéro de tâche + numéro de semaine) mod nb de colocs */
function buildWeek(monday, members) {
  const n = members.length;
  const wi = weekIndex(monday);
  return TASK_TEMPLATES.map((t, slot) => ({
    week: iso(monday),
    slot,
    label: t.label,
    detail: t.detail,
    day_index: t.day,
    assignee_id: members[(((slot + wi) % n) + n) % n].id,
  }));
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
      check(await sb.from('tasks').upsert(rows, { onConflict: 'week,slot', ignoreDuplicates: true }));
    },
    async tasks(from, to) {
      return check(await sb.from('tasks').select('*').gte('week', from).lte('week', to)
        .order('week').order('day_index').order('slot'));
    },
    async setTask(id, done) {
      check(await sb.from('tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id));
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
  const KEY = 'coloc-demo-v1';
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
      for (const r of rows) if (!db.tasks.some((t) => t.week === r.week && t.slot === r.slot)) db.tasks.push({ ...r, id: db.nextId++, done: false });
      save();
    },
    async tasks(from, to) {
      return db.tasks.filter((t) => t.week >= from && t.week <= to)
        .sort((a, b) => a.week.localeCompare(b.week) || a.day_index - b.day_index || a.slot - b.slot);
    },
    async setTask(id, done) { const t = db.tasks.find((x) => x.id === id); if (t) { t.done = done; save(); } },
    async products() { return db.products; },
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
const state = { api: null, members: [], me: null, tasks: [], products: [], tab: 'tasks', weekOffset: 0, error: null };

async function refresh() {
  const m0 = mondayOf();
  [state.tasks, state.products] = await Promise.all([
    state.api.tasks(iso(m0), iso(addDays(m0, 7 * WEEKS_AHEAD))),
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
async function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  render();
  try { await state.api.setTask(id, t.done); } catch (e) { t.done = !t.done; render(); toast('Erreur réseau, réessaie.'); }
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
    toast("Les notifications ne sont pas disponibles sur ce navigateur.", 6000);
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast("Notifications refusées. Tu peux les réactiver dans les réglages de ton téléphone.", 6000); return; }
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
  app.innerHTML = `
    <header class="top">
      <h1>🏠 Coloc${state.api.mode === 'demo' ? ' <small style="font-weight:400;color:var(--muted)">(démo)</small>' : ''}</h1>
      <div class="right">
        <button class="chip icon" data-action="push" aria-label="Notifications">${pushOn() ? '🔔' : '🔕'}</button>
        <button class="chip" data-action="switch">👤 ${esc(state.me.name)}</button>
      </div>
    </header>
    <main>
      ${pushOn() || store.get('coloc-push-dismiss') === '1' ? '' : `
        <div class="banner">
          <span>Active les notifications pour recevoir les rappels et les alertes de rupture.</span>
          <span style="display:flex;gap:4px;align-items:center"><button class="btn" data-action="push">Activer</button><button class="x" data-action="dismiss" aria-label="Fermer">✕</button></span>
        </div>`}
      ${state.tab === 'tasks' ? tasksHTML() : stockHTML()}
    </main>
    <nav class="tabs">
      <button data-action="tab" data-tab="tasks" class="${state.tab === 'tasks' ? 'active' : ''}"><span class="ico">🧹</span>Tâches ménagères</button>
      <button data-action="tab" data-tab="stock" class="${state.tab === 'stock' ? 'active' : ''}"><span class="ico">🛒</span>Ruptures de stock${outCount ? `<span class="badge">${outCount}</span>` : ''}</button>
    </nav>`;
}

function tasksHTML() {
  const off = state.weekOffset;
  const monday = addDays(mondayOf(), off * 7);
  const list = state.tasks.filter((t) => t.week === iso(monday));
  const done = list.filter((t) => t.done).length;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const title = off === 0 ? 'Cette semaine' : off === 1 ? 'Semaine prochaine' : `Semaine du ${monday.getDate()} ${MONTHS[monday.getMonth()]}`;
  const nameOf = (id) => state.members.find((m) => m.id === id)?.name ?? '?';

  let body = '';
  for (let d = 0; d < 7; d++) {
    const dayTasks = list.filter((t) => t.day_index === d);
    if (!dayTasks.length) continue;
    const date = addDays(monday, d);
    body += `<div class="day">${DAYS[d]} ${date.getDate()}${off === 0 && d === todayIdx ? '<span class="today">Aujourd\'hui</span>' : ''}</div>`;
    body += dayTasks.map((t) => `
      <button class="task ${t.done ? 'done' : ''}" data-action="task" data-id="${t.id}" aria-pressed="${t.done}">
        <span class="check">✓</span>
        <span class="txt"><div class="label">${esc(t.label)}</div><div class="detail">${esc(t.detail)}</div></span>
        <span class="who ${t.assignee_id === state.me.id ? 'me' : ''}">${t.assignee_id === state.me.id ? 'Toi' : esc(nameOf(t.assignee_id))}</span>
      </button>`).join('');
  }
  return `
    <div class="weekbar">
      <button class="arrow" data-action="week" data-d="-1" ${off === 0 ? 'disabled' : ''} aria-label="Semaine précédente">‹</button>
      <h2>${title}</h2>
      <button class="arrow" data-action="week" data-d="1" ${off >= WEEKS_AHEAD ? 'disabled' : ''} aria-label="Semaine suivante">›</button>
    </div>
    <div class="progress">${done} / ${list.length} faites<div class="bar"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div></div>
    ${body || '<div class="empty">Aucune tâche cette semaine.</div>'}`;
}

function stockHTML() {
  const out = state.products.filter((p) => p.out_of_stock).length;
  const nameOf = (id) => state.members.find((m) => m.id === id)?.name;
  return `
    <p class="summary">${out ? `<b>${out}</b> produit${out > 1 ? 's' : ''} en rupture.` : 'Tout est en stock 👌'} Touche un produit pour le signaler (re-touche pour dire qu'il est réapprovisionné).</p>
    <div class="grid">${state.products.map((p) => `
      <button class="card ${p.out_of_stock ? 'out' : ''}" data-action="product" data-id="${p.id}" aria-pressed="${p.out_of_stock}">
        <span class="name">${esc(p.name)}</span>
        <span class="state">${p.out_of_stock ? `En rupture${p.updated_by ? ` · ${esc(nameOf(p.updated_by) ?? '')}` : ''}` : 'OK'}</span>
      </button>`).join('')}</div>`;
}

/* =========================================================
   Événements (délégation)
   ========================================================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, tab, d } = el.dataset;
  switch (action) {
    case 'pick':
      state.me = state.members.find((m) => m.id === Number(id));
      store.set('coloc-me', String(state.me.id));
      render(); syncSub(); break;
    case 'switch': state.me = null; render(); break;
    case 'tab': state.tab = tab; render(); window.scrollTo(0, 0); break;
    case 'week': state.weekOffset = Math.max(0, Math.min(WEEKS_AHEAD, state.weekOffset + Number(d))); render(); break;
    case 'task': toggleTask(Number(id)); break;
    case 'product': toggleProduct(Number(id)); break;
    case 'push': enablePush(); break;
    case 'dismiss': store.set('coloc-push-dismiss', '1'); render(); break;
    case 'reload': location.reload(); break;
  }
});

render();
init();
