// « Colo-Ferme » : un petit jeu de ferme dessiné en canvas (parcelles animées, fruits dessinés à la main).
// Les données (parcelles, colocoins…) vivent dans l'appli : ce module ne fait que dessiner et appeler les actions de `ctx`.
import { FARM } from '../config.js';

const W = 360, H = 600;
const COLS = 2, PW = 150, PH = 112, X0 = 20, GAPX = 20, Y0 = 212, GAPY = 8;
const plotRect = (i) => ({ x: X0 + (i % COLS) * (PW + GAPX), y: Y0 + Math.floor(i / COLS) * (PH + GAPY), w: PW, h: PH });
const HOUR = 3600000;
const TAU = Math.PI * 2;

const LEAF = { curcuma: '#3f9f3c', tomate: '#2e8b3a', letchi: '#2f7d32', passion: '#3d9a4a', papaye: '#3a9a46', ananas: '#5aa832', avocat: '#2d7a3b', vanille: '#2f9c5a' };

/* ---------- Fruits (dessinés centrés sur x, y ; r ≈ rayon) ---------- */
export function drawFruit(c, key, x, y, r) {
  c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineCap = 'round';
  const shine = (rx, ry, a = 0.45) => { c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.ellipse(rx, ry, r * 0.2, r * 0.32, -0.6, 0, TAU); c.fill(); };
  if (key === 'curcuma') {
    for (const [dx, rot] of [[-r * 0.35, -0.5], [r * 0.3, 0.45]]) {
      c.save(); c.translate(dx, 0); c.rotate(rot);
      c.fillStyle = '#e4891c'; c.strokeStyle = '#a65f0c'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(-r * 0.3, -r * 0.9, r * 0.6, r * 1.8, r * 0.3); c.fill(); c.stroke();
      c.strokeStyle = '#b8690f'; c.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-r * 0.28, k * r * 0.3); c.lineTo(r * 0.28, k * r * 0.3 + 2); c.stroke(); }
      c.restore();
    }
  } else if (key === 'tomate') {
    c.fillStyle = '#e63b2e'; c.strokeStyle = '#a3241a'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); c.fill(); c.stroke(); shine(-r * 0.4, -r * 0.3);
    c.fillStyle = '#2f9e44'; c.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.2 : r * 0.55; c.lineTo(Math.cos(a) * rr, -r * 0.8 + Math.sin(a) * rr * 0.5); }
    c.closePath(); c.fill();
  } else if (key === 'letchi') {
    c.fillStyle = '#d02a4c'; c.strokeStyle = '#8f1631'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = 'rgba(120,10,30,.45)';
    for (let k = 0; k < 14; k++) { const a = k * 2.4, d = r * (0.2 + (k % 4) * 0.2); c.fillRect(Math.cos(a) * d - 1, Math.sin(a) * d - 1, 2.4, 2.4); }
    shine(-r * 0.4, -r * 0.35, 0.35);
    c.fillStyle = '#3f9f3c'; c.beginPath(); c.ellipse(r * 0.1, -r * 0.95, r * 0.3, r * 0.14, -0.5, 0, TAU); c.fill();
  } else if (key === 'passion') {
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.1); g.addColorStop(0, '#9b5bd0'); g.addColorStop(1, '#5a2490');
    c.fillStyle = g; c.strokeStyle = '#3b1560'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, r * 0.92, r, 0, 0, TAU); c.fill(); c.stroke(); shine(-r * 0.4, -r * 0.35, 0.4);
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 1; c.beginPath(); c.arc(r * 0.1, r * 0.2, r * 0.35, 0.3, 2.2); c.stroke();
    c.strokeStyle = '#3f9f3c'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -r * 0.95); c.lineTo(r * 0.15, -r * 1.25); c.stroke();
  } else if (key === 'papaye') {
    c.save(); c.rotate(0.35);
    const g = c.createLinearGradient(0, -r * 1.3, 0, r * 1.3); g.addColorStop(0, '#8fbf3a'); g.addColorStop(0.35, '#f2a52b'); g.addColorStop(1, '#ee8a1a');
    c.fillStyle = g; c.strokeStyle = '#b8600d'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, r * 0.78, r * 1.25, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.2, r * 0.14, r * 0.45, 0, 0, TAU); c.fill();
    c.restore();
  } else if (key === 'ananas') {
    c.fillStyle = '#4fa32e'; c.strokeStyle = '#2f6f18'; c.lineWidth = 1.2;
    for (const [a, h] of [[-0.7, 0.9], [-0.35, 1.25], [0, 1.45], [0.35, 1.25], [0.7, 0.9]]) {
      c.beginPath(); c.moveTo(-r * 0.14, -r * 0.8); c.quadraticCurveTo(Math.sin(a) * r * 0.9, -r * 0.8 - r * h * 0.5, Math.sin(a) * r * 0.75, -r * 0.7 - r * h); c.lineTo(r * 0.14, -r * 0.8); c.closePath(); c.fill(); c.stroke();
    }
    c.fillStyle = '#f3b51d'; c.strokeStyle = '#b97b0b'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, r * 0.12, r * 0.82, r * 1.05, 0, 0, TAU); c.fill(); c.stroke();
    c.save(); c.beginPath(); c.ellipse(0, r * 0.12, r * 0.82, r * 1.05, 0, 0, TAU); c.clip();
    c.strokeStyle = 'rgba(160,100,0,.55)'; c.lineWidth = 1;
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(k * r * 0.4 - r, -r); c.lineTo(k * r * 0.4 + r, r * 1.3); c.moveTo(k * r * 0.4 + r, -r); c.lineTo(k * r * 0.4 - r, r * 1.3); c.stroke(); }
    c.restore();
  } else if (key === 'avocat') {
    const path = () => { c.beginPath(); c.moveTo(0, -r * 1.25); c.bezierCurveTo(r * 0.5, -r * 1.2, r * 0.45, -r * 0.4, r * 0.95, r * 0.25); c.bezierCurveTo(r * 1.1, r * 1.1, -r * 1.1, r * 1.1, -r * 0.95, r * 0.25); c.bezierCurveTo(-r * 0.45, -r * 0.4, -r * 0.5, -r * 1.2, 0, -r * 1.25); c.closePath(); };
    c.fillStyle = '#35602a'; c.strokeStyle = '#1f3a18'; c.lineWidth = 1.6; path(); c.fill(); c.stroke();
    const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, 'rgba(120,170,70,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; path(); c.fill();
    shine(-r * 0.45, r * 0.1, 0.3);
  } else if (key === 'vanille') {
    c.strokeStyle = '#4a3320'; c.lineWidth = Math.max(2.4, r * 0.28);
    for (const [dx, bend] of [[-r * 0.5, -0.3], [0, 0.15], [r * 0.5, 0.35]]) {
      c.beginPath(); c.moveTo(dx, -r * 1.1); c.quadraticCurveTo(dx + bend * r, 0, dx + bend * r * 1.4, r * 1.2); c.stroke();
    }
    c.strokeStyle = '#7a5a36'; c.lineWidth = 1;
    for (const dx of [-r * 0.5, 0, r * 0.5]) { c.beginPath(); c.moveTo(dx - 1, -r); c.lineTo(dx - 1, r * 0.4); c.stroke(); }
    c.fillStyle = '#fffbe9'; c.strokeStyle = '#d8cf9c'; c.lineWidth = 1;
    for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(Math.cos(k * 1.26) * r * 0.3, -r * 1.2 + Math.sin(k * 1.26) * r * 0.3, r * 0.22, r * 0.12, k * 1.26, 0, TAU); c.fill(); c.stroke(); }
  }
  c.restore();
}

const iconCache = {};
export function fruitIcon(key, px = 44) {
  if (iconCache[key + px]) return iconCache[key + px];
  const cv = document.createElement('canvas'); cv.width = cv.height = px * 2;
  const c = cv.getContext('2d'); c.scale(2, 2);
  drawFruit(c, key, px / 2, px * (key === 'ananas' ? 0.62 : 0.5), px * (key === 'ananas' ? 0.26 : 0.3));
  return (iconCache[key + px] = cv.toDataURL());
}

/* ---------- Plante : graine → pousse → feuillue → mûre ---------- */
function drawPlant(c, key, p, ripe, t, cx, by) {
  const sway = Math.sin(t * 1.8 + cx * 0.05) * (1 + 3 * p);
  const leaf = LEAF[key] ?? '#3a9a46';
  c.save(); c.lineCap = 'round';
  // petit monticule de terre
  c.fillStyle = '#6a4325'; c.beginPath(); c.ellipse(cx, by + 2, 20, 6, 0, 0, TAU); c.fill();
  if (p < 0.12 && !ripe) {                                   // graine : juste une petite pousse qui apparaît
    c.fillStyle = leaf; const s = p / 0.12;
    c.beginPath(); c.ellipse(cx - 3 * s, by - 3 - 5 * s, 4 * s + 1, 2 * s + 1, -0.6, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(cx + 3 * s, by - 3 - 5 * s, 4 * s + 1, 2 * s + 1, 0.6, 0, TAU); c.fill();
    c.restore(); return;
  }
  const g = ripe ? 1 : 0.18 + 0.82 * Math.min(p / 0.95, 1);
  const stemH = 12 + 40 * g;
  c.strokeStyle = '#3d8a34'; c.lineWidth = 2.5 + g * 1.5;
  c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx + sway * 0.4, by - stemH * 0.5, cx + sway, by - stemH); c.stroke();
  const pairs = 1 + Math.floor(g * 3);
  c.fillStyle = leaf; c.strokeStyle = 'rgba(0,50,0,.35)'; c.lineWidth = 1;
  for (let k = 0; k < pairs; k++) {
    const f = (k + 1) / (pairs + 1), ly = by - stemH * f, lx = cx + sway * f, L = (10 + 10 * g) * (1.1 - f * 0.4);
    for (const sd of [-1, 1]) {
      c.save(); c.translate(lx, ly); c.rotate(sd * (0.7 + Math.sin(t * 2 + k) * 0.08)); c.beginPath();
      c.ellipse(sd * L * 0.55, 0, L * 0.6, L * 0.26, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
    }
  }
  c.beginPath(); c.fillStyle = leaf; c.ellipse(cx + sway, by - stemH - 2, 6 + g * 3, 4 + g * 1.5, -0.4, 0, TAU); c.fill();
  if (ripe) {                                                // fruits mûrs qui se balancent
    const bob = Math.sin(t * 4 + cx) * 1.2, r = key === 'vanille' ? 9 : key === 'ananas' ? 12 : 10;
    if (key === 'curcuma') { drawFruit(c, key, cx, by - 4 + bob * 0.3, 11); }
    else if (key === 'ananas') { drawFruit(c, key, cx + sway, by - stemH + 6 + bob, r); }
    else if (key === 'vanille') { drawFruit(c, key, cx + sway, by - stemH * 0.55 + bob, r); }
    else {
      drawFruit(c, key, cx - 16 + sway * 0.5, by - stemH * 0.55 + bob, r);
      drawFruit(c, key, cx + 15 + sway * 0.5, by - stemH * 0.4 - bob, r);
      drawFruit(c, key, cx + sway, by - stemH * 0.95 + bob, r * 0.92);
    }
  }
  c.restore();
}

/* ---------- Décor ---------- */
function drawScene(c, t) {
  const sky = c.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#6ec3f0'); sky.addColorStop(1, '#dff3ff');
  c.fillStyle = sky; c.fillRect(0, 0, W, 210);
  // soleil et rayons
  c.save(); c.translate(300, 52); c.rotate(t * 0.15); c.fillStyle = 'rgba(255,225,90,.35)';
  for (let k = 0; k < 10; k++) { c.rotate(TAU / 10); c.fillRect(-4, 22, 8, 22); }
  c.restore();
  c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(300, 52, 24, 0, TAU); c.fill();
  // nuages
  for (const [sp, y, s] of [[10, 40, 1], [6, 78, 0.8]]) {
    const x = ((t * sp + y * 9) % (W + 120)) - 60; c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(x, y, 14 * s, 0, TAU); c.arc(x + 16 * s, y + 3, 11 * s, 0, TAU); c.arc(x - 15 * s, y + 4, 10 * s, 0, TAU); c.fill();
  }
  // collines
  c.fillStyle = '#5ea85f'; c.beginPath(); c.moveTo(0, 150); c.quadraticCurveTo(90, 100, 190, 145); c.quadraticCurveTo(280, 100, W, 140); c.lineTo(W, 212); c.lineTo(0, 212); c.fill();
  c.fillStyle = '#74bd6a'; c.beginPath(); c.moveTo(0, 175); c.quadraticCurveTo(120, 140, 230, 172); c.quadraticCurveTo(310, 150, W, 168); c.lineTo(W, 212); c.lineTo(0, 212); c.fill();
  // grange
  c.fillStyle = '#c0392b'; c.fillRect(26, 138, 62, 46); c.fillStyle = '#8f2a20'; c.beginPath(); c.moveTo(20, 140); c.lineTo(57, 112); c.lineTo(94, 140); c.closePath(); c.fill();
  c.fillStyle = '#f5e6c8'; c.fillRect(48, 156, 18, 28); c.strokeStyle = '#8f2a20'; c.lineWidth = 2; c.strokeRect(48, 156, 18, 28); c.beginPath(); c.moveTo(48, 156); c.lineTo(66, 184); c.moveTo(66, 156); c.lineTo(48, 184); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(57, 130, 5, 0, TAU); c.fill();
  // moulin qui tourne
  c.fillStyle = '#e9dcc0'; c.beginPath(); c.moveTo(128, 186); c.lineTo(136, 138); c.lineTo(150, 138); c.lineTo(158, 186); c.closePath(); c.fill();
  c.save(); c.translate(143, 136); c.rotate(t * 0.8); c.fillStyle = '#fff'; c.strokeStyle = '#9a8a6a'; c.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.rect(-3, -34, 6, 34); c.fill(); c.stroke(); }
  c.restore(); c.fillStyle = '#9a8a6a'; c.beginPath(); c.arc(143, 136, 4, 0, TAU); c.fill();
  // champ d'herbe
  const gr = c.createLinearGradient(0, 200, 0, H); gr.addColorStop(0, '#8fd27a'); gr.addColorStop(1, '#6db95c');
  c.fillStyle = gr; c.fillRect(0, 200, W, H - 200);
  c.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 205; y < H; y += 26) c.fillRect(0, y, W, 12);
  // barrière
  c.fillStyle = '#c8a064'; c.strokeStyle = '#8a6a36'; c.lineWidth = 1.5;
  c.fillRect(0, 206, W, 4); c.fillRect(0, 196, W, 4);
  for (let x = 6; x < W; x += 36) { c.fillRect(x, 190, 6, 24); c.strokeRect(x, 190, 6, 24); }
}

/* ---------- Une parcelle ---------- */
function soil(c, x, y, w, h, tone = '#8a5a33') {
  c.fillStyle = '#5e3b1c'; c.beginPath(); c.roundRect(x - 4, y - 4, w + 8, h + 8, 14); c.fill();
  c.fillStyle = tone; c.beginPath(); c.roundRect(x, y, w, h, 11); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 3; c.lineCap = 'round';
  for (let k = 1; k <= 3; k++) { c.beginPath(); c.moveTo(x + 10, y + (h * k) / 4); c.lineTo(x + w - 10, y + (h * k) / 4); c.stroke(); }
}
function label(c, txt, x, y, size = 11, color = '#fff') {
  c.font = `800 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(30,20,10,.75)'; c.strokeText(txt, x, y); c.fillStyle = color; c.fillText(txt, x, y);
}
const fmtLeft = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

export function mount(root, ctx) {
  root.innerHTML = `<div class="fgame">
      <div class="fhud"><span class="fcoins"></span><span class="fcap"></span></div>
      <canvas class="fcv" width="${W}" height="${H}" aria-label="Colo-Ferme"></canvas>
      <div class="fvisit"></div><div class="fover" hidden></div></div>`;
  const cv = root.querySelector('canvas'), c = cv.getContext('2d');
  const hudCoins = root.querySelector('.fcoins'), hudCap = root.querySelector('.fcap'), visit = root.querySelector('.fvisit'), over = root.querySelector('.fover');
  let owner = ctx.meId, raf = 0, destroyed = false, busy = false, t0 = performance.now(), lastSync = Date.now();
  const parts = [];           // particules : pièces, fruits, gouttes, textes
  const pulse = {};           // petites secousses par parcelle
  const rainUntil = { v: 0, slot: -1 };

  const plotsOf = (id) => ctx.farm().filter((p) => p.member_id === id);
  const status = (p) => { const rt = Date.parse(p.ready_at), n = Date.now(); return rt > n ? 'grow' : n > rt + FARM.witherH * HOUR ? 'dead' : 'ready'; };
  const cropOf = (k) => FARM.crops.find((x) => x.key === k);
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };

  function renderHud() {
    hudCoins.innerHTML = `🪙 ${ctx.chips()}`;
    const got = ctx.got();
    hudCap.innerHTML = owner === ctx.meId ? `Récolte du jour <b>${got}/${FARM.capPerDay}</b> 🪙` : `Ferme de <b>${ctx.nameOf(owner)}</b> · arrose pour l'aider !`;
    visit.innerHTML = ctx.colocs().map((m) => `<button class="fv ${m.id === owner ? 'on' : ''}" data-owner="${m.id}">${ctx.avatar(m, 34)}<small>${m.id === ctx.meId ? 'Ma ferme' : ctx.esc(m.name)}</small>${plotsOf(m.id).some((p) => status(p) === 'ready') ? '<i>✨</i>' : ''}</button>`).join('');
  }

  const burst = (x, y, kind, n = 8, extra = {}) => { for (let k = 0; k < n; k++) parts.push({ kind, x, y, vx: (Math.random() - 0.5) * 3.2, vy: -2 - Math.random() * 2.6, life: 0, max: 50 + Math.random() * 20, ...extra }); };
  const popText = (x, y, txt, color = '#fff6b0') => parts.push({ kind: 'text', x, y, vx: 0, vy: -0.7, life: 0, max: 70, txt, color });

  /* ----- actions ----- */
  async function act(fn, after) {
    if (busy) return; busy = true;
    try { const r = await fn(); after?.(r); } catch (e) { ctx.toast(e.message || 'Action impossible.'); }
    try { await ctx.refresh(); } catch { /* rien */ }
    lastSync = Date.now(); busy = false; renderHud();
  }
  function openPicker(slot) {
    const lv = ctx.level(), have = ctx.chips();
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Planter · parcelle ${slot + 1}</b><button data-x aria-label="Fermer">✕</button></div>
      <div class="fcrops">${FARM.crops.map((cr) => { const lock = lv < cr.level; return `<button class="fcrop ${lock ? 'lk' : ''}" data-crop="${cr.key}" ${!lock && have >= cr.cost ? '' : 'disabled'}>
        <img alt="" src="${fruitIcon(cr.key, 44)}" width="44" height="44" ${lock ? 'style="filter:grayscale(1) brightness(.7)"' : ''}>
        <span class="ct"><b>${cr.name}</b><small>${lock ? `🔒 Se débloque au niveau ${cr.level}` : `${cr.hours} h · rapporte ${cr.gain} 🪙`}</small></span><span class="cp">${lock ? `Niv. ${cr.level}` : `−${cr.cost} 🪙`}</span></button>`; }).join('')}</div></div>`;
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      const b = e.target.closest('[data-crop]'); if (!b) return;
      over.hidden = true; const key = b.dataset.crop, r = plotRect(slot);
      act(() => ctx.plant(slot, key), () => { burst(r.x + r.w / 2, r.y + r.h * 0.7, 'dirt', 10); pulse[slot] = performance.now(); });
    };
  }
  function openUnlock(slot) {
    const cost = FARM.slotCosts[slot];
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Nouvelle parcelle</b><button data-x aria-label="Fermer">✕</button></div>
      <p class="fp">Acheter la parcelle ${slot + 1} pour <b>${cost} 🪙</b> ? (Tu as ${ctx.chips()} 🪙)</p>
      <div class="fbtns"><button class="btn" data-x>Plus tard</button><button class="btn primary" data-buy ${ctx.chips() >= cost ? '' : 'disabled'}>Acheter</button></div></div>`;
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      if (!e.target.closest('[data-buy]')) return;
      over.hidden = true;
      act(() => ctx.unlock(), () => { const r = plotRect(slot); burst(r.x + r.w / 2, r.y + r.h / 2, 'star', 12); popText(r.x + r.w / 2, r.y + 30, 'Nouvelle parcelle !'); });
    };
  }

  function tap(e) {
    e.preventDefault();
    if (!over.hidden || busy) return;
    const [x, y] = toWorld(e);
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner);
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = plotRect(i); if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      pulse[i] = performance.now();
      const mine = owner === ctx.meId, p = plots.find((q) => q.slot === i);
      if (i >= slots) { if (mine && i === slots) openUnlock(i); else ctx.toast(mine ? 'Débloque d\'abord la parcelle précédente.' : 'Parcelle pas encore débloquée.'); return; }
      if (!p) { if (mine && ctx.isColoc()) openPicker(i); else ctx.toast(mine ? 'Réservé aux colocataires.' : 'Parcelle vide.'); return; }
      const st = status(p), cr = cropOf(p.crop);
      if (mine && (st === 'ready' || st === 'dead')) {
        act(() => ctx.harvest(i), (res) => {
          const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5;
          if (res.withered) { burst(cx, cy, 'dirt', 8); popText(cx, cy - 20, 'Fané…', '#d9c7b0'); return; }
          burst(cx, cy, 'fruit', 6, { crop: p.crop }); if (res.coins) { burst(cx, cy, 'coin', Math.min(10, 3 + Math.round(res.coins / 15))); popText(cx, cy - 26, `+${res.coins} 🪙`); }
          else popText(cx, cy - 26, 'Plafond atteint !', '#ffb4a8');
          if (res.lost && res.coins) popText(cx, cy - 8, `(${res.lost} perdus)`, '#ffd7a8');
        });
      } else if (!mine && st === 'grow') {
        if (p.watered_by?.includes(ctx.meId)) { ctx.toast('Tu as déjà arrosé cette parcelle 💧'); return; }
        rainUntil.v = performance.now() + 1400; rainUntil.slot = i;
        act(() => ctx.water(owner, i), (res) => { const cx = r.x + r.w / 2; popText(cx, r.y + 20, res.reward ? `−20 % · +${res.reward} 🪙` : '−20 % de temps 💧', '#bfe8ff'); });
      } else if (st === 'grow') { ctx.toast(`${cr.name} : prêt dans ${fmtLeft(Date.parse(p.ready_at) - Date.now())}`); }
      else ctx.toast(`${cr.name} est mûr ✨`);
      return;
    }
  }
  cv.addEventListener('pointerdown', tap);
  visit.addEventListener('click', (e) => { const b = e.target.closest('[data-owner]'); if (b) { owner = Number(b.dataset.owner); renderHud(); } });

  /* ----- dessin ----- */
  function drawParts() {
    for (let k = parts.length - 1; k >= 0; k--) {
      const q = parts[k]; q.life++; if (q.life > q.max) { parts.splice(k, 1); continue; }
      const a = 1 - q.life / q.max;
      if (q.kind === 'text') { q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); label(c, q.txt, q.x, q.y, 14, q.color); c.globalAlpha = 1; continue; }
      if (q.kind === 'coin') {                                         // les pièces filent vers le compteur en haut
        const tx = 40, ty = 0, f = Math.min(1, Math.max(0, (q.life - 14) / 36));
        if (q.life < 14) { q.x += q.vx; q.y += q.vy; q.vy += 0.18; } else { q.x += (tx - q.x) * f * 0.2; q.y += (ty - q.y) * f * 0.2; }
        c.fillStyle = '#f5b301'; c.strokeStyle = '#a87500'; c.lineWidth = 1.5; c.beginPath(); c.arc(q.x, q.y, 6, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = '#a87500'; c.beginPath(); c.arc(q.x, q.y, 2, 0, TAU); c.fill(); continue;
      }
      q.x += q.vx; q.y += q.vy; q.vy += 0.16; c.globalAlpha = a;
      if (q.kind === 'fruit') drawFruit(c, q.crop, q.x, q.y, 7);
      else if (q.kind === 'dirt') { c.fillStyle = '#7a4d2a'; c.fillRect(q.x, q.y, 4, 4); }
      else if (q.kind === 'star') { c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(q.x, q.y, 3, 0, TAU); c.fill(); }
      else if (q.kind === 'drop') { c.fillStyle = '#59b6f5'; c.beginPath(); c.ellipse(q.x, q.y, 2, 4, 0, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
  }
  function frame(now) {
    if (destroyed) return;
    const t = (now - t0) / 1000;
    drawScene(c, t);
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner), mine = owner === ctx.meId;
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = plotRect(i), p = plots.find((q) => q.slot === i), pk = pulse[i] && now - pulse[i] < 260 ? 1 + Math.sin(((now - pulse[i]) / 260) * Math.PI) * 0.05 : 1;
      c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(pk, pk); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      if (i >= slots) {                                              // parcelle verrouillée : planches + cadenas
        c.fillStyle = '#5b4a38'; c.beginPath(); c.roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14); c.fill();
        c.fillStyle = '#8b7a66'; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 11); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(r.x, r.y + (r.h * k) / 4); c.lineTo(r.x + r.w, r.y + (r.h * k) / 4); c.stroke(); }
        c.fillStyle = '#d9b44a'; c.beginPath(); c.roundRect(r.x + r.w / 2 - 14, r.y + r.h / 2 - 8, 28, 22, 5); c.fill(); c.strokeStyle = '#8a6d1a'; c.lineWidth = 2.5; c.stroke();
        c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2 - 8, 9, Math.PI, 0); c.stroke();
        c.fillStyle = '#5b4a1a'; c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2 + 3, 3, 0, TAU); c.fill();
        if (mine && i === slots) label(c, `${FARM.slotCosts[i]} pièces`, r.x + r.w / 2, r.y + r.h - 10, 12, '#ffe08a'); else label(c, 'verrouillée', r.x + r.w / 2, r.y + r.h - 10, 10, '#e5ddd0');
      } else {
        const st = p ? status(p) : 'empty';
        soil(c, r.x, r.y, r.w, r.h, st === 'dead' ? '#5d4636' : st === 'grow' && p.watered_by?.length ? '#74482a' : '#8a5a33');
        const cx = r.x + r.w / 2, by = r.y + r.h * 0.78;
        if (st === 'empty') {
          const s = 1 + Math.sin(t * 3 + i) * 0.08;
          c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(cx, r.y + r.h / 2, 16 * s, 0, TAU); c.fill();
          c.strokeStyle = '#5e3b1c'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - 7, r.y + r.h / 2); c.lineTo(cx + 7, r.y + r.h / 2); c.moveTo(cx, r.y + r.h / 2 - 7); c.lineTo(cx, r.y + r.h / 2 + 7); c.stroke();
        } else if (st === 'dead') {
          c.strokeStyle = '#7b5b3a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx + 10, by - 20, cx + 18, by - 22); c.stroke();
          c.fillStyle = '#8a6b45'; c.beginPath(); c.ellipse(cx + 20, by - 20, 8, 4, 0.6, 0, TAU); c.fill();
          label(c, 'Fané · nettoie', cx, r.y + r.h - 8, 10, '#e5d4bf');
        } else {
          const cr = cropOf(p.crop), total = cr.hours * HOUR, rt = Date.parse(p.ready_at), left = rt - Date.now();
          const prog = st === 'ready' ? 1 : Math.min(0.999, Math.max(0, 1 - left / total));
          drawPlant(c, p.crop, prog, st === 'ready', t, cx, by);
          if (st === 'ready') {                                      // étincelles + pastille « récolter »
            for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.1, sx = cx + Math.cos(a) * 30, sy = r.y + r.h * 0.4 + Math.sin(a * 1.3) * 18, s = 2 + Math.sin(a * 3) * 1.2; c.fillStyle = 'rgba(255,240,150,.95)'; c.beginPath(); c.moveTo(sx, sy - s * 2); c.lineTo(sx + s, sy); c.lineTo(sx, sy + s * 2); c.lineTo(sx - s, sy); c.closePath(); c.fill(); }
            label(c, mine ? 'Récolter !' : 'Mûr ✨', cx, r.y + r.h - 7, 11, '#fff1a0');
          } else {
            c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(r.x + 14, r.y + r.h - 16, r.w - 28, 7, 3.5); c.fill();
            c.fillStyle = '#7ee06a'; c.beginPath(); c.roundRect(r.x + 14, r.y + r.h - 16, Math.max(7, (r.w - 28) * prog), 7, 3.5); c.fill();
            label(c, fmtLeft(left), r.x + r.w - 26, r.y + 16, 10);
            if (p.watered_by?.length) label(c, `💧${p.watered_by.length}`, r.x + 22, r.y + 16, 10, '#bfe8ff');
          }
          if (now < rainUntil.v && rainUntil.slot === i && Math.random() < 0.7) parts.push({ kind: 'drop', x: r.x + 12 + Math.random() * (r.w - 24), y: r.y - 8, vx: 0, vy: 2.4, life: 0, max: 32 });
        }
      }
      c.restore();
    }
    drawParts();
    if (Date.now() - lastSync > 20000 && !busy) { lastSync = Date.now(); ctx.refresh().then(renderHud).catch(() => {}); }
    raf = requestAnimationFrame(frame);
  }
  renderHud();
  raf = requestAnimationFrame(frame);
  const hudTimer = setInterval(renderHud, 5000);
  return { destroy() { destroyed = true; cancelAnimationFrame(raf); clearInterval(hudTimer); } };
}
