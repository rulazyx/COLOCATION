// « Colo-Ferme » : ferme dessinée en canvas (aucun emoji). Trois onglets intégrés : Domaine (grange et bâtiments), Champs (parcelles), Grange (stock, vente).
// Les données vivent dans l appli : ce module dessine et appelle les actions de `ctx`.
import { FARM } from '../config.js';

const W = 360, H = 600;
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


/* ---------- Petites icônes dessinées (aucun emoji) ---------- */
const svg = (vb, body, px, extra = '') => `<svg viewBox="${vb}" width="${px}" height="${px}" aria-hidden="true" ${extra} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const ICON = {
  coin: (px = 14) => svg('0 0 20 20', '<circle cx="10" cy="10" r="9" fill="#f6b91d" stroke="#9a6209" stroke-width="1.6"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#fde68a" stroke-width="1.5"/><path d="M7.4 6.4a4 4 0 0 1 2-.9" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>', px, 'style="vertical-align:-2px"'),
  drop: (px = 14) => svg('0 0 20 20', '<path d="M10 2C7 7 4.5 9.5 4.5 12.6a5.5 5.5 0 0 0 11 0C15.5 9.5 13 7 10 2z" fill="#4fb4f2" stroke="#1f6fa8" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.4 12.4a2.8 2.8 0 0 0 1.8 2.3" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/>', px, 'style="vertical-align:-2px"'),
  star: (px = 14) => svg('0 0 20 20', '<path d="M10 1.5l2.2 5.6 5.9.4-4.6 3.8 1.5 5.8L10 13.9l-5 3.2 1.5-5.8L1.9 7.5l5.9-.4z" fill="#ffd84a" stroke="#b9860a" stroke-width="1.3" stroke-linejoin="round"/>', px, 'style="vertical-align:-2px"'),
  lock: (px = 14) => svg('0 0 20 20', '<rect x="4" y="9" width="12" height="9" rx="2" fill="#d9ad33" stroke="#7a5a0e" stroke-width="1.5"/><path d="M6.6 9V6.6a3.4 3.4 0 0 1 6.8 0V9" fill="none" stroke="#7a5a0e" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="13.4" r="1.4" fill="#7a5a0e"/>', px, 'style="vertical-align:-2px"'),
  x: (px = 16) => svg('0 0 20 20', '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>', px),
  house: (px = 24) => svg('0 0 24 24', '<path d="M3 11.5L12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5.5h4V20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', px),
  sprout: (px = 24) => svg('0 0 24 24', '<path d="M12 21v-8M12 13C12 8.5 8.5 6 4 6c0 4.5 3 7 8 7zM12 15c0-4 3-6.5 8-6.5 0 4-3 6.5-8 6.5zM6 21h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', px),
  crate: (px = 24) => svg('0 0 24 24', '<path d="M3 8l9-4 9 4v9l-9 4-9-4zM3 8l9 4 9-4M12 12v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', px),
};

/* ---------- Dessin commun ---------- */
const OL = '#3a2412';                                              // contour brun foncé
const vg = (c, y0, y1, a, b) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
const hg = (c, x0, x1, a, b, m) => { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); if (m) g.addColorStop(0.5, m); g.addColorStop(1, b); return g; };
const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const outline = (c, lw = 2) => { c.strokeStyle = OL; c.lineWidth = lw; c.stroke(); };
function drawSpark(c, x, y, s, col = '#fff3a0') { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - s * 2); c.quadraticCurveTo(x + s * 0.2, y - s * 0.2, x + s * 2, y); c.quadraticCurveTo(x + s * 0.2, y + s * 0.2, x, y + s * 2); c.quadraticCurveTo(x - s * 0.2, y + s * 0.2, x - s * 2, y); c.quadraticCurveTo(x - s * 0.2, y - s * 0.2, x, y - s * 2); c.fill(); }
function drawDrop(c, x, y, s, col = '#4fb4f2') { c.fillStyle = col; c.strokeStyle = '#1f6fa8'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - s * 1.4); c.quadraticCurveTo(x + s * 1.1, y, x, y + s * 0.9); c.quadraticCurveTo(x - s * 1.1, y, x, y - s * 1.4); c.fill(); c.stroke(); }
function drawCoin(c, x, y, r) { c.fillStyle = '#f6b91d'; c.strokeStyle = '#9a6209'; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = '#fde68a'; c.beginPath(); c.arc(x, y, r * 0.58, 0, TAU); c.stroke(); }
function drawLockC(c, x, y, s) { c.fillStyle = '#d9ad33'; c.strokeStyle = '#6b4e0b'; c.lineWidth = 2.2; c.beginPath(); c.roundRect(x - s, y - s * 0.5, s * 2, s * 1.5, 4); c.fill(); c.stroke(); c.beginPath(); c.arc(x, y - s * 0.5, s * 0.62, Math.PI, 0); c.stroke(); c.fillStyle = '#6b4e0b'; c.beginPath(); c.arc(x, y + s * 0.2, s * 0.2, 0, TAU); c.fill(); }

/* ---------- Plante : graine, pousse, feuillue, mûre ---------- */
function drawPlant(c, key, p, ripe, t, cx, by) {
  const sway = Math.sin(t * 1.8 + cx * 0.05) * (1 + 3 * p);
  const leaf = LEAF[key] ?? '#3a9a46';
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = 'rgba(40,20,5,.35)'; c.beginPath(); c.ellipse(cx, by + 3, 17, 5, 0, 0, TAU); c.fill();
  c.fillStyle = '#7a4c28'; c.beginPath(); c.ellipse(cx, by + 1, 14, 4.5, 0, 0, TAU); c.fill();
  if (p < 0.12 && !ripe) {
    c.fillStyle = leaf; c.strokeStyle = '#1d5a22'; c.lineWidth = 1; const s = p / 0.12;
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(cx + d * 3 * s, by - 3 - 5 * s, 4 * s + 1.5, 2 * s + 1, d * 0.6, 0, TAU); c.fill(); c.stroke(); }
    c.restore(); return;
  }
  const g = ripe ? 1 : 0.18 + 0.82 * Math.min(p / 0.95, 1);
  const stemH = 12 + 40 * g;
  c.strokeStyle = '#1d5a22'; c.lineWidth = 5 + g; c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx + sway * 0.4, by - stemH * 0.5, cx + sway, by - stemH); c.stroke();
  c.strokeStyle = '#4db04a'; c.lineWidth = 2.6 + g; c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx + sway * 0.4, by - stemH * 0.5, cx + sway, by - stemH); c.stroke();
  const pairs = 1 + Math.floor(g * 3);
  for (let k = 0; k < pairs; k++) {
    const f = (k + 1) / (pairs + 1), ly = by - stemH * f, lx = cx + sway * f, L = (10 + 10 * g) * (1.1 - f * 0.4);
    for (const sd of [-1, 1]) {
      c.save(); c.translate(lx, ly); c.rotate(sd * (0.7 + Math.sin(t * 2 + k) * 0.08));
      c.fillStyle = leaf; c.strokeStyle = '#1d5a22'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(sd * L * 0.55, 0, L * 0.6, L * 0.27, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sd * L * 0.05, 0); c.lineTo(sd * L * 1.05, 0); c.stroke(); c.restore();
    }
  }
  c.fillStyle = leaf; c.strokeStyle = '#1d5a22'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx + sway, by - stemH - 2, 6 + g * 3, 4 + g * 1.5, -0.4, 0, TAU); c.fill(); c.stroke();
  if (ripe) {
    const bob = Math.sin(t * 4 + cx) * 1.2, r = key === 'vanille' ? 9 : key === 'ananas' ? 12 : 10;
    if (key === 'curcuma') drawFruit(c, key, cx, by - 4 + bob * 0.3, 11);
    else if (key === 'ananas') drawFruit(c, key, cx + sway, by - stemH + 6 + bob, r);
    else if (key === 'vanille') drawFruit(c, key, cx + sway, by - stemH * 0.55 + bob, r);
    else { drawFruit(c, key, cx - 16 + sway * 0.5, by - stemH * 0.55 + bob, r); drawFruit(c, key, cx + 15 + sway * 0.5, by - stemH * 0.4 - bob, r); drawFruit(c, key, cx + sway, by - stemH * 0.95 + bob, r * 0.92); }
  }
  c.restore();
}

/* ---------- Bâtiments (dessinés dans un rectangle x, y, w, h ; le sol est en bas) ---------- */
const POUL = [[0.2, 0.0], [0.6, 2.1], [0.85, 4.2]];
function drawItem(c, key, x, y, w, h, t) {
  const cx = x + w / 2, bot = y + h;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const shadow = (rw) => { c.fillStyle = 'rgba(30,50,10,.28)'; c.beginPath(); c.ellipse(cx + 4, bot - 1, rw, 7, 0, 0, TAU); c.fill(); };
  const planks = (x0, y0, w0, h0, step, a = 0.18) => { c.save(); c.beginPath(); c.rect(x0, y0, w0, h0); c.clip(); c.strokeStyle = `rgba(0,0,0,${a})`; c.lineWidth = 1; for (let px = x0 + step; px < x0 + w0; px += step) { c.beginPath(); c.moveTo(px, y0); c.lineTo(px, y0 + h0); c.stroke(); } c.restore(); };
  const shingles = (pts, col) => { c.save(); c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.clip(); c.strokeStyle = col; c.lineWidth = 1; const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); for (let yy = y0 + 7; yy < y1; yy += 7) { c.beginPath(); c.moveTo(x - 20, yy); c.lineTo(x + w + 20, yy); c.stroke(); } c.restore(); };
  if (key === 'grange') {
    shadow(w * 0.55);
    const bx = x + 10, bw = w - 20, by0 = y + h * 0.40;
    c.fillStyle = hg(c, bx, bx + bw, '#e5503f', '#b2301f', '#d9463a'); c.beginPath(); c.rect(bx, by0, bw, bot - by0); c.fill(); outline(c, 2.4); planks(bx, by0, bw, bot - by0, 10);
    c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(bx + bw * 0.78, by0, bw * 0.22, bot - by0);
    const roof = [[x - 2, y + h * 0.46], [x + w * 0.13, y + h * 0.16], [cx, y + 3], [x + w * 0.87, y + h * 0.16], [x + w + 2, y + h * 0.46]];
    c.beginPath(); roof.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fillStyle = vg(c, y, y + h * 0.46, '#a53a2a', '#6f1f16'); c.fill(); outline(c, 2.4); shingles(roof, 'rgba(0,0,0,.22)');
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 2, y + h * 0.45); c.lineTo(x + w - 2, y + h * 0.45); c.stroke();
    // lucarne à foin
    c.fillStyle = '#3b2a18'; rrect(c, cx - 14, y + h * 0.2, 28, h * 0.2, 3); c.fill(); outline(c, 2); c.fillStyle = '#f0c63f'; c.fillRect(cx - 12, y + h * 0.33, 24, h * 0.06); c.strokeStyle = '#fff'; c.lineWidth = 2; rrect(c, cx - 14, y + h * 0.2, 28, h * 0.2, 3); c.stroke();
    // grande porte
    const dw = w * 0.4, dh = h * 0.5; c.fillStyle = '#f7ead0'; c.beginPath(); c.rect(cx - dw / 2, bot - dh, dw, dh); c.fill(); outline(c, 2.2);
    c.strokeStyle = '#b2301f'; c.lineWidth = 2.6; c.beginPath(); c.rect(cx - dw / 2 + 3, bot - dh + 3, dw - 6, dh - 3); c.moveTo(cx - dw / 2 + 3, bot - dh + 3); c.lineTo(cx + dw / 2 - 3, bot); c.moveTo(cx + dw / 2 - 3, bot - dh + 3); c.lineTo(cx - dw / 2 + 3, bot); c.moveTo(cx, bot - dh + 3); c.lineTo(cx, bot); c.stroke();
    // girouette
    c.save(); c.translate(cx, y + 4); c.rotate(Math.sin(t * 1.4) * 0.5); c.strokeStyle = '#2d2d2d'; c.lineWidth = 2; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); c.fillStyle = '#2d2d2d'; c.beginPath(); c.moveTo(9, -3.5); c.lineTo(15, 0); c.lineTo(9, 3.5); c.fill(); c.restore();
    // bottes de foin devant
    for (const [hx, hy] of [[bx + 2, bot - 9], [bx + 20, bot - 7]]) { c.fillStyle = '#e8c04b'; c.beginPath(); c.arc(hx + 8, hy, 8, 0, TAU); c.fill(); outline(c, 1.6); c.strokeStyle = 'rgba(150,100,10,.6)'; c.lineWidth = 1; c.beginPath(); c.arc(hx + 8, hy, 4.4, 0, TAU); c.stroke(); }
  } else if (key === 'puits') {
    shadow(w * 0.4);
    const sx = cx - 24, sy = bot - 34;
    c.fillStyle = hg(c, sx, sx + 48, '#b7bec6', '#8a929b', '#d3d8dd'); rrect(c, sx, sy, 48, 34, 7); c.fill(); outline(c, 2.2);
    c.save(); rrect(c, sx, sy, 48, 34, 7); c.clip(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(sx, sy + k * 8.5); c.lineTo(sx + 48, sy + k * 8.5); c.stroke(); for (let q = 0; q < 5; q++) { const ox = sx + ((q * 11 + (k % 2) * 6) % 48); c.beginPath(); c.moveTo(ox, sy + (k - 1) * 8.5); c.lineTo(ox, sy + k * 8.5); c.stroke(); } } c.restore();
    c.fillStyle = '#2f7fbd'; c.beginPath(); c.ellipse(cx, sy, 22, 6, 0, 0, TAU); c.fill(); outline(c, 1.8);
    c.strokeStyle = OL; c.lineWidth = 6; c.beginPath(); c.moveTo(cx - 22, sy); c.lineTo(cx - 22, sy - 34); c.moveTo(cx + 22, sy); c.lineTo(cx + 22, sy - 34); c.stroke();
    c.strokeStyle = '#a8703a'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(cx - 22, sy); c.lineTo(cx - 22, sy - 34); c.moveTo(cx + 22, sy); c.lineTo(cx + 22, sy - 34); c.stroke();
    const rf = [[cx - 33, sy - 30], [cx, sy - 50], [cx + 33, sy - 30]]; c.beginPath(); rf.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fillStyle = vg(c, sy - 50, sy - 30, '#d1573a', '#8f2f1c'); c.fill(); outline(c, 2.2);
    const sw = Math.sin(t * 2) * 2; c.strokeStyle = '#2d2d2d'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx, sy - 32); c.lineTo(cx + sw, sy - 14); c.stroke();
    c.fillStyle = '#a8703a'; rrect(c, cx + sw - 5, sy - 15, 10, 9, 2); c.fill(); outline(c, 1.4);
  } else if (key === 'etal') {
    shadow(w * 0.5);
    c.fillStyle = vg(c, bot - 34, bot, '#b9814a', '#8a5a2c'); c.beginPath(); c.rect(cx - 40, bot - 34, 80, 34); c.fill(); outline(c, 2.2); planks(cx - 40, bot - 34, 80, 34, 10);
    c.fillStyle = '#d7a56a'; c.fillRect(cx - 42, bot - 36, 84, 6); outline(c, 1.6);
    c.strokeStyle = OL; c.lineWidth = 6; c.beginPath(); c.moveTo(cx - 38, bot - 34); c.lineTo(cx - 38, bot - 74); c.moveTo(cx + 38, bot - 34); c.lineTo(cx + 38, bot - 74); c.stroke();
    c.strokeStyle = '#a8703a'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 38, bot - 34); c.lineTo(cx - 38, bot - 74); c.moveTo(cx + 38, bot - 34); c.lineTo(cx + 38, bot - 74); c.stroke();
    for (let k = 0; k < 6; k++) { const ax = cx - 42 + k * 14; c.fillStyle = k % 2 ? '#fff8ea' : '#e24a3b'; c.beginPath(); c.moveTo(ax, bot - 76); c.lineTo(ax + 14, bot - 76); c.lineTo(ax + 14, bot - 62 + Math.sin(t * 2 + k) * 1.1); c.arc(ax + 7, bot - 62 + Math.sin(t * 2 + k) * 1.1, 7, 0, Math.PI); c.lineTo(ax, bot - 76); c.fill(); outline(c, 1.4); }
    c.fillStyle = '#7b4f26'; for (const px of [-28, -3, 22]) { rrect(c, cx + px - 1, bot - 46, 26, 12, 2); c.fill(); outline(c, 1.4); }
    drawFruit(c, 'tomate', cx - 14, bot - 48, 8); drawFruit(c, 'letchi', cx + 11, bot - 48, 8); drawFruit(c, 'ananas', cx + 36, bot - 50, 7);
  } else if (key === 'serre') {
    shadow(w * 0.5);
    c.beginPath(); c.moveTo(cx - 40, bot); c.lineTo(cx - 40, bot - 34); c.quadraticCurveTo(cx - 38, bot - 66, cx, bot - 68); c.quadraticCurveTo(cx + 38, bot - 66, cx + 40, bot - 34); c.lineTo(cx + 40, bot); c.closePath();
    c.fillStyle = vg(c, bot - 68, bot, 'rgba(200,238,252,.85)', 'rgba(150,210,235,.7)'); c.fill(); outline(c, 2.2);
    c.save(); c.clip(); c.fillStyle = '#3d9a4a'; for (let k = -3; k <= 3; k++) { c.beginPath(); c.ellipse(cx + k * 11, bot - 10 - Math.abs(k), 5.5, 13 + Math.sin(t * 2 + k) * 1.6, k * 0.12, 0, TAU); c.fill(); } c.strokeStyle = 'rgba(70,110,125,.9)'; c.lineWidth = 1.6; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx + k * 20, bot); c.lineTo(cx + k * 12, bot - 68); c.stroke(); } c.beginPath(); c.moveTo(cx - 40, bot - 30); c.lineTo(cx + 40, bot - 30); c.stroke(); c.restore();
    c.fillStyle = '#b9814a'; c.fillRect(cx - 42, bot - 8, 84, 8); outline(c, 1.8);
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(cx - 20, bot - 46, 4, 13, 0.4, 0, TAU); c.fill();
  } else if (key === 'silo') {
    shadow(w * 0.34);
    c.fillStyle = hg(c, cx - 22, cx + 22, '#aeb6bf', '#8c949d', '#eef1f4'); c.beginPath(); c.rect(cx - 22, bot - 80, 44, 80); c.fill(); outline(c, 2.2);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.4; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(cx - 22, bot - k * 16); c.lineTo(cx + 22, bot - k * 16); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(cx - 14, bot - 78, 5, 76);
    c.beginPath(); c.moveTo(cx - 25, bot - 80); c.quadraticCurveTo(cx, bot - 114, cx + 25, bot - 80); c.closePath(); c.fillStyle = vg(c, bot - 112, bot - 80, '#d1573a', '#8f2f1c'); c.fill(); outline(c, 2.2);
    c.fillStyle = '#4b535b'; rrect(c, cx - 6, bot - 24, 12, 24, [6, 6, 0, 0]); c.fill(); outline(c, 1.6);
    c.strokeStyle = OL; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx + 12, bot); c.lineTo(cx + 12, bot - 66); c.moveTo(cx + 18, bot); c.lineTo(cx + 18, bot - 66); for (let k = 1; k < 8; k++) { c.moveTo(cx + 12, bot - k * 8); c.lineTo(cx + 18, bot - k * 8); } c.stroke();
  } else if (key === 'poulailler') {
    shadow(w * 0.5);
    c.fillStyle = hg(c, cx - 30, cx + 28, '#c99660', '#98693a'); c.beginPath(); c.rect(cx - 30, bot - 40, 58, 40); c.fill(); outline(c, 2.2); planks(cx - 30, bot - 40, 58, 40, 8);
    const rf = [[cx - 38, bot - 38], [cx - 1, bot - 66], [cx + 36, bot - 38]]; c.beginPath(); rf.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath(); c.fillStyle = vg(c, bot - 66, bot - 38, '#d1573a', '#8f2f1c'); c.fill(); outline(c, 2.2);
    c.fillStyle = '#2e2014'; rrect(c, cx - 8, bot - 27, 16, 27, [8, 8, 0, 0]); c.fill(); outline(c, 1.6);
    c.fillStyle = '#b9814a'; c.beginPath(); c.moveTo(cx - 8, bot); c.lineTo(cx - 14, bot + 4); c.lineTo(cx + 14, bot + 4); c.lineTo(cx + 8, bot); c.fill(); outline(c, 1.2);
    for (const [f, ph] of POUL) {
      const hx = x + 8 + (w - 16) * (0.5 + 0.5 * Math.sin(t * 0.5 + ph)) * f + (w - 16) * (1 - f) * 0.4, dir = Math.cos(t * 0.5 + ph) >= 0 ? 1 : -1, by = bot + 6 + Math.sin(t * 8 + ph) * 0.8;
      c.save(); c.translate(hx, by); c.scale(dir, 1);
      c.fillStyle = '#fff'; c.strokeStyle = '#6b6254'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -7, 7.5, 6, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(6.5, -12.5, 3.4, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#f59e0b'; c.beginPath(); c.moveTo(9.6, -12.6); c.lineTo(13.5, -11.4); c.lineTo(9.6, -10.2); c.fill(); c.fillStyle = '#d93025'; c.beginPath(); c.arc(6.2, -16, 1.8, 0, TAU); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(7.4, -13, 0.9, 0, TAU); c.fill(); c.restore();
    }
  }
  c.restore();
}

/* ---------- Décors ---------- */
function drawMeadow(c, t, top) {
  c.fillStyle = vg(c, top, H, '#a4de6e', '#6fbd4a'); c.fillRect(0, top, W, H - top);
  c.fillStyle = 'rgba(255,255,255,.06)'; for (let yy = top, r = 0; yy < H; yy += 30, r++) for (let xx = (r % 2) * 30; xx < W; xx += 60) c.fillRect(xx, yy, 30, 30);
  c.strokeStyle = 'rgba(40,110,30,.55)'; c.lineWidth = 1.6; c.lineCap = 'round';
  for (let k = 0; k < 46; k++) { const gx = (k * 67 + 13) % W, gy = top + 24 + ((k * 131) % (H - top - 30)), sw = Math.sin(t * 1.6 + k) * 1.2; c.beginPath(); c.moveTo(gx - 3, gy); c.lineTo(gx - 4 + sw, gy - 6); c.moveTo(gx, gy); c.lineTo(gx + sw, gy - 8); c.moveTo(gx + 3, gy); c.lineTo(gx + 4 + sw, gy - 6); c.stroke(); }
}
function drawSky(c, t) {
  c.fillStyle = vg(c, 0, 190, '#4fb2ee', '#d3f0ff'); c.fillRect(0, 0, W, 200);
  c.save(); c.translate(318, 56); c.rotate(t * 0.12); c.fillStyle = 'rgba(255,228,110,.35)'; for (let k = 0; k < 12; k++) { c.rotate(TAU / 12); c.fillRect(-3.5, 26, 7, 20); } c.restore();
  c.fillStyle = '#ffe14a'; c.strokeStyle = '#e0a912'; c.lineWidth = 2; c.beginPath(); c.arc(318, 56, 24, 0, TAU); c.fill(); c.stroke();
  for (const [sp, y, s] of [[9, 62, 1.1], [6, 104, 0.85]]) {
    const x = ((t * sp + y * 9) % (W + 140)) - 70; c.fillStyle = 'rgba(255,255,255,.95)';
    c.beginPath(); c.arc(x, y, 14 * s, 0, TAU); c.arc(x + 17 * s, y + 3, 11 * s, 0, TAU); c.arc(x - 16 * s, y + 4, 10 * s, 0, TAU); c.fill();
    c.fillStyle = 'rgba(150,200,235,.35)'; c.beginPath(); c.ellipse(x, y + 12 * s, 28 * s, 4 * s, 0, 0, TAU); c.fill();
  }
  c.fillStyle = '#5fae62'; c.beginPath(); c.moveTo(0, 138); c.quadraticCurveTo(90, 100, 190, 134); c.quadraticCurveTo(280, 100, W, 130); c.lineTo(W, 200); c.lineTo(0, 200); c.fill();
  // lignes d'arbres sur la colline
  for (let k = 0; k < 14; k++) { const tx = 12 + k * 26, ty = 128 + Math.sin(k * 1.3) * 5 + (k % 2) * 4; c.fillStyle = '#3f8f4c'; c.beginPath(); c.arc(tx, ty, 9, 0, TAU); c.fill(); c.fillStyle = '#4fa75b'; c.beginPath(); c.arc(tx - 2, ty - 2, 5, 0, TAU); c.fill(); }
  c.fillStyle = '#79c46c'; c.beginPath(); c.moveTo(0, 160); c.quadraticCurveTo(120, 130, 230, 158); c.quadraticCurveTo(310, 138, W, 156); c.lineTo(W, 200); c.lineTo(0, 200); c.fill();
  // moulin sur la colline
  c.save(); c.translate(60, 120); c.fillStyle = '#f2e6cf'; c.beginPath(); c.moveTo(-10, 28); c.lineTo(-6, 0); c.lineTo(6, 0); c.lineTo(10, 28); c.closePath(); c.fill(); outline(c, 1.6);
  c.fillStyle = '#b2301f'; c.beginPath(); c.moveTo(-8, 0); c.lineTo(0, -9); c.lineTo(8, 0); c.closePath(); c.fill(); outline(c, 1.6);
  c.translate(0, -2); c.rotate(t * 0.8); c.strokeStyle = OL; c.lineWidth = 1.6; c.fillStyle = '#fff8ea'; for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.fillRect(1, -3, 20, 6); c.strokeRect(1, -3, 20, 6); } c.restore();
}
function road(c, y, hgt) {
  c.fillStyle = vg(c, y, y + hgt, '#e6c98a', '#cfa763'); c.beginPath(); c.roundRect(-6, y, W + 12, hgt, 8); c.fill(); c.strokeStyle = 'rgba(90,60,20,.55)'; c.lineWidth = 2; c.stroke();
  c.fillStyle = 'rgba(120,80,30,.25)'; for (let k = 0; k < 16; k++) c.fillRect((k * 47 + 9) % W, y + 4 + (k * 7) % (hgt - 8), 4, 2.4);
}
function fence(c, y) {
  c.fillStyle = '#b98650'; c.strokeStyle = OL; c.lineWidth = 1.6;
  c.fillRect(0, y + 6, W, 4); c.fillRect(0, y + 16, W, 4); c.strokeRect(-1, y + 6, W + 2, 4); c.strokeRect(-1, y + 16, W + 2, 4);
  for (let px = 6; px < W; px += 24) { c.beginPath(); c.moveTo(px, y + 24); c.lineTo(px, y + 4); c.lineTo(px + 3, y); c.lineTo(px + 6, y + 4); c.lineTo(px + 6, y + 24); c.closePath(); c.fillStyle = '#d4a066'; c.fill(); c.stroke(); }
}
function drawDomaineBg(c, t) {
  drawSky(c, t); drawMeadow(c, t, 158); fence(c, 152);
  road(c, 312, 20); road(c, 458, 20);
}
function drawFieldBg(c) {
  c.fillStyle = vg(c, 0, H, '#7a5030', '#5e3b1f'); c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,.10)'; for (let k = 0; k < 60; k++) { c.beginPath(); c.ellipse((k * 53) % W, (k * 97) % H, 7, 3, 0, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(255,220,170,.07)'; for (let k = 0; k < 50; k++) { c.beginPath(); c.ellipse((k * 71 + 20) % W, (k * 41 + 9) % H, 5, 2, 0, 0, TAU); c.fill(); }
}
function label(c, txt, x, y, size = 11, color = '#fff') {
  c.font = `800 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(40,24,10,.85)'; c.strokeText(txt, x, y); c.fillStyle = color; c.fillText(txt, x, y);
}
const fmtLeft = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

/* ---------- Plans ---------- */
const BARN = { x: 12, y: 164, w: 152, h: 142 };
const BSPOTS = [{ x: 172, y: 178, w: 84, h: 128 }, { x: 264, y: 178, w: 84, h: 128 }, { x: 14, y: 336, w: 100, h: 116 }, { x: 130, y: 336, w: 100, h: 116 }, { x: 246, y: 336, w: 100, h: 116 }];
const spotRect = (id) => BSPOTS[Number(id.slice(1))];
const fieldRect = (i) => ({ x: 20 + (i % 2) * 170, y: 104 + Math.floor(i / 2) * 138, w: 150, h: 126 });
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const spotIds = () => Array.from({ length: FARM.spots.b }, (_, i) => 'b' + i);
const itemOf = (k) => FARM.items.find((i) => i.key === k);
const cropOf = (k) => FARM.crops.find((x) => x.key === k);

function drawSite(c, r, t, mine) {          // emplacement libre : chantier délimité par des piquets
  c.save();
  c.fillStyle = vg(c, r.y, r.y + r.h, 'rgba(214,176,112,.9)', 'rgba(176,134,76,.9)'); rrect(c, r.x + 4, r.y + 14, r.w - 8, r.h - 18, 10); c.fill(); c.strokeStyle = 'rgba(90,60,20,.6)'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = '#f3e3b4'; c.lineWidth = 1.8; c.setLineDash([5, 4]); rrect(c, r.x + 10, r.y + 20, r.w - 20, r.h - 30, 7); c.stroke(); c.setLineDash([]);
  for (const [px, py] of [[r.x + 8, r.y + 16], [r.x + r.w - 8, r.y + 16], [r.x + 8, r.y + r.h - 8], [r.x + r.w - 8, r.y + r.h - 8]]) { c.fillStyle = '#a8703a'; c.beginPath(); c.roundRect(px - 3, py - 9, 6, 13, 2); c.fill(); outline(c, 1.4); }
  if (mine) { const s = 1 + Math.sin(t * 3 + r.x) * 0.07, cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 4; c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.arc(cx, cy, 17 * s, 0, TAU); c.fill(); outline(c, 2); c.strokeStyle = '#7a4a1c'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(cx - 8 * s, cy); c.lineTo(cx + 8 * s, cy); c.moveTo(cx, cy - 8 * s); c.lineTo(cx, cy + 8 * s); c.stroke(); }
  c.restore();
}
function drawSign(c, txt, sub, cx, y) {
  c.save(); c.fillStyle = '#7a4d26'; c.fillRect(cx - 44, y + 22, 7, 34); c.fillRect(cx + 37, y + 22, 7, 34); c.strokeStyle = OL; c.lineWidth = 1.6; c.strokeRect(cx - 44, y + 22, 7, 34); c.strokeRect(cx + 37, y + 22, 7, 34);
  c.fillStyle = vg(c, y, y + 38, '#d8a25f', '#b57a3a'); rrect(c, cx - 96, y, 192, 38, 8); c.fill(); outline(c, 2.4);
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 92, y + 19); c.lineTo(cx + 92, y + 19); c.stroke();
  c.font = '800 15px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#3a2412'; c.fillText(txt, cx, y + 17); c.font = '700 10.5px system-ui, sans-serif'; c.fillStyle = '#5b3a1a'; c.fillText(sub, cx, y + 31); c.restore();
}

export function mount(root, ctx) {   // ctx.quest(clé, n) : quêtes du jour
  root.innerHTML = `<div class="fgame">
      <div class="fhud"><span class="fcoins"></span><span class="fcap"></span></div>
      <div class="fstage"><canvas class="fcv" width="${W}" height="${H}" aria-label="Colo-Ferme"></canvas>
        <div class="fvisit"></div><div class="fgrange" hidden></div>
        <nav class="ftabs"><button data-tab="domaine">${ICON.house(26)}<small>Domaine</small></button><button data-tab="champs">${ICON.sprout(26)}<small>Champs</small></button><button data-tab="grange">${ICON.crate(26)}<small>Grange</small></button></nav></div>
      <div class="fover" hidden></div></div>`;
  const cv = root.querySelector('canvas'), c = cv.getContext('2d');
  const hudCoins = root.querySelector('.fcoins'), hudCap = root.querySelector('.fcap'), visit = root.querySelector('.fvisit'), over = root.querySelector('.fover');
  const panel = root.querySelector('.fgrange'), tabs = root.querySelector('.ftabs');
  let tab = 'domaine', owner = ctx.meId, raf = 0, destroyed = false, busy = false, lastSync = Date.now();
  const t0 = performance.now();
  const parts = [], pulse = {}, rain = { until: 0, slot: -1 };
  const bounce = {};

  const plotsOf = (id) => ctx.farm().filter((p) => p.member_id === id);
  const buildsOf = (id) => ctx.builds(id);
  const has = (id, key) => buildsOf(id).some((b) => b.item === key);
  const status = (p) => { const rt = Date.parse(p.ready_at), n = Date.now(); return rt > n ? 'grow' : n > rt + FARM.witherH * HOUR ? 'dead' : 'ready'; };
  const cap = () => FARM.capPerDay + (has(ctx.meId, 'silo') ? FARM.perks.siloCap : 0);
  const unitPrice = (cr) => Math.round(cr.sell * (has(ctx.meId, 'etal') ? 1 + FARM.perks.stallBonus : 1));
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  const stockQty = (k) => ctx.stock().find((s) => s.crop === k)?.qty ?? 0;
  const closeBtn = `<button data-x aria-label="Fermer">${ICON.x(18)}</button>`;

  function renderHud() {
    hudCoins.innerHTML = `${ICON.coin(16)} ${ctx.chips()}`;
    hudCap.innerHTML = tab === 'grange' || owner === ctx.meId ? `Ventes du jour <b>${ctx.got()}/${cap()}</b> ${ICON.coin(14)}` : `Ferme de <b>${ctx.esc(ctx.nameOf(owner))}</b>`;
    visit.hidden = tab === 'grange';
    visit.innerHTML = ctx.colocs().map((m) => `<button class="fv ${m.id === owner ? 'on' : ''}" data-owner="${m.id}">${ctx.avatar(m, 30)}<small>${m.id === ctx.meId ? 'Ma ferme' : ctx.esc(m.name)}</small>${plotsOf(m.id).some((p) => status(p) === 'ready') ? `<i>${ICON.star(13)}</i>` : ''}</button>`).join('');
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    cv.hidden = tab === 'grange'; panel.hidden = tab !== 'grange';
    tabs.classList.toggle('paper', tab === 'grange'); root.querySelector('.fstage').style.background = tab === 'champs' ? '#6a4326' : tab === 'grange' ? '#ecd5a0' : '#6fbd4a';
    if (tab === 'grange') renderGrange();
  }
  function setTab(k) { tab = k; if (k === 'grange') { owner = ctx.meId; ctx.quest?.('fe_barn'); } renderHud(); }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  visit.addEventListener('click', (e) => { const b = e.target.closest('[data-owner]'); if (b) { owner = Number(b.dataset.owner); if (owner !== ctx.meId) ctx.quest?.('fe_visit'); renderHud(); } });

  /* ----- Grange : stock, vente, bonus ----- */
  function renderGrange() {
    const stock = ctx.stock().filter((s) => s.qty > 0), left = Math.max(cap() - ctx.got(), 0);
    const perks = FARM.items.filter((i) => i.perk && has(ctx.meId, i.key));
    const total = buildsOf(ctx.meId).length, max = FARM.items.length;
    panel.innerHTML = `<div class="fg-in">
      <h3>La grange</h3>
      <p class="fgs">Tes récoltes arrivent ici. Vends-les (plafond du jour : <b>${left}</b> ${ICON.coin(13)} restants) ou garde-les pour construire.</p>
      ${stock.length ? stock.map((s) => { const cr = cropOf(s.crop), u = unitPrice(cr); return `<div class="fgrow"><img alt="" src="${fruitIcon(s.crop, 40)}" width="40" height="40"><span class="ct"><b>${cr.name} × ${s.qty}</b><small>${u} ${ICON.coin(12)} l'unité</small></span>
        <button class="btn" data-sell="${s.crop}" data-n="1">Vendre 1</button><button class="btn primary" data-sell="${s.crop}" data-n="${s.qty}">Tout</button></div>`; }).join('') : '<div class="fgempty">Grange vide : plante et récolte dans les Champs.</div>'}
      <h3>Bonus actifs</h3>
      ${perks.length ? perks.map((i) => `<div class="fgperk"><canvas class="fic sm" width="64" height="64" data-icon="${i.key}"></canvas><span><b>${i.name}</b><br>${i.perk}</span></div>`).join('') : '<div class="fgempty">Construis des bâtiments dans le Domaine pour débloquer des bonus.</div>'}
      <p class="fgs">${total} construction${total > 1 ? 's' : ''} sur ${max}.</p></div>`;
    panel.querySelectorAll('canvas.fic').forEach((cc) => { const g = cc.getContext('2d'); g.scale(0.58, 0.58); drawItem(g, cc.dataset.icon, -4, -2, 112, 112, 0); });
    panel.onclick = (e) => { const b = e.target.closest('[data-sell]'); if (!b) return; const crop = b.dataset.sell, n = Number(b.dataset.n); act(() => ctx.sell(crop, n), (r) => ctx.toast(`Vendu ${r.sold} · +${r.coins} pièces`)); };
  }

  /* ----- animations ----- */
  const burst = (x, y, kind, n = 8, extra = {}) => { for (let k = 0; k < n; k++) parts.push({ kind, x, y, vx: (Math.random() - 0.5) * 3.2, vy: -2 - Math.random() * 2.6, life: 0, max: 50 + Math.random() * 20, ...extra }); };
  const popText = (x, y, txt, color = '#fff6b0') => parts.push({ kind: 'text', x, y, vx: 0, vy: -0.7, life: 0, max: 70, txt, color });

  async function act(fn, after) {
    if (busy) return; busy = true;
    try { const r = await fn(); after?.(r); } catch (e) { ctx.toast(e.message || 'Action impossible.'); }
    try { await ctx.refresh(); } catch { /* rien */ }
    lastSync = Date.now(); busy = false; renderHud();
  }

  /* ----- fenêtres ----- */
  function openCropPicker(slot) {
    const lv = ctx.level();
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Planter · parcelle ${slot + 1}</b>${closeBtn}</div>
      <div class="fcrops">${FARM.crops.map((cr) => { const lock = lv < cr.level; return `<button class="fcrop ${lock ? 'lk' : ''}" data-crop="${cr.key}" ${lock ? 'disabled' : ''}>
        <img alt="" src="${fruitIcon(cr.key, 44)}" width="44" height="44" ${lock ? 'style="filter:grayscale(1) brightness(.7)"' : ''}>
        <span class="ct"><b>${cr.name}</b><small>${lock ? `${ICON.lock(12)} Se débloque au niveau ${cr.level}` : `${cr.hours} h · ${FARM.yield} unités à ${cr.sell} ${ICON.coin(12)}`}</small></span><span class="cp">${lock ? `Niv. ${cr.level}` : 'Gratuit'}</span></button>`; }).join('')}</div></div>`;
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      const b = e.target.closest('[data-crop]'); if (!b) return;
      over.hidden = true; const key = b.dataset.crop, r = fieldRect(slot);
      act(() => ctx.plant(slot, key), () => { burst(r.x + r.w / 2, r.y + r.h * 0.8, 'dirt', 12); pulse['f' + slot] = performance.now(); if (key === 'curcuma') ctx.quest?.('fe_plant'); });
    };
  }
  function openBuildPicker(spot) {
    const built = new Set(buildsOf(ctx.meId).map((b) => b.item));
    const list = FARM.items.filter((i) => !built.has(i.key));
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Construire un bâtiment</b>${closeBtn}</div>
      ${list.length ? `<div class="fcrops">${list.map((it) => { const ok = Object.entries(it.cost).every(([k, v]) => stockQty(k) >= v);
        return `<button class="fcrop" data-item="${it.key}" ${ok ? '' : 'disabled'}><canvas class="fic" width="88" height="88" data-icon="${it.key}"></canvas>
        <span class="ct"><b>${it.name}</b><small>${it.perk ?? ''}</small><span class="fcost">${Object.entries(it.cost).map(([k, v]) => `<em class="${stockQty(k) >= v ? 'ok' : 'no'}"><img alt="" src="${fruitIcon(k, 22)}" width="18" height="18">${stockQty(k)}/${v}</em>`).join('')}</span></span></button>`; }).join('')}</div>`
        : '<p class="fp">Tout est déjà construit. Bravo !</p>'}</div>`;
    over.querySelectorAll('canvas.fic').forEach((cc) => { const g = cc.getContext('2d'); g.scale(0.8, 0.8); drawItem(g, cc.dataset.icon, -6, -6, 100, 110, 0); });
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      const b = e.target.closest('[data-item]'); if (!b) return;
      over.hidden = true; const key = b.dataset.item, r = spotRect(spot);
      act(() => ctx.build(spot, key), () => { burst(r.x + r.w / 2, r.y + r.h / 2, 'star', 16); popText(r.x + r.w / 2, r.y + 10, 'Construit !'); bounce[spot] = performance.now(); });
    };
  }

  /* ----- touches ----- */
  function tap(e) {
    e.preventDefault();
    if (!over.hidden || busy) return;
    const [x, y] = toWorld(e), mine = owner === ctx.meId;
    if (tab === 'domaine') {
      if (hit(BARN, x, y)) { bounce.barn = performance.now(); if (mine) setTab('grange'); else ctx.toast('La grange de ' + ctx.nameOf(owner)); return; }
      const builds = buildsOf(owner);
      for (const id of spotIds()) {
        const r = spotRect(id); if (!hit(r, x, y)) continue;
        const b = builds.find((q) => q.spot === id);
        if (b) { bounce[id] = performance.now(); const it = itemOf(b.item); ctx.toast(`${it.name}${it.perk ? ' · ' + it.perk : ''}`); }
        else if (mine && ctx.isColoc()) openBuildPicker(id);
        else ctx.toast('Emplacement libre');
        return;
      }
      return;
    }
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner);
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = fieldRect(i); if (!hit(r, x, y)) continue;
      pulse['f' + i] = performance.now();
      const p = plots.find((q) => q.slot === i);
      if (i >= slots) { if (mine && i === slots) openUnlock(i); else ctx.toast(mine ? "Débloque d'abord la parcelle précédente." : 'Parcelle pas encore débloquée.'); return; }
      if (!p) { if (mine && ctx.isColoc()) openCropPicker(i); else ctx.toast(mine ? 'Réservé aux colocataires.' : 'Parcelle vide.'); return; }
      const st = status(p), cr = cropOf(p.crop);
      if (mine && (st === 'ready' || st === 'dead')) {
        act(() => ctx.harvest(i), (res) => {
          const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5;
          if (res.withered) { burst(cx, cy, 'dirt', 10); popText(cx, cy - 20, 'Fané…', '#d9c7b0'); return; }
          burst(cx, cy, 'fruit', 8, { crop: p.crop }); popText(cx, cy - 26, `+${res.qty} ${cr.name}`); ctx.toast(`${res.qty} ${cr.name} rangé${res.qty > 1 ? 's' : ''} dans la grange`);
        });
      } else if (!mine && st === 'grow') {
        if (p.watered_by?.includes(ctx.meId)) { ctx.toast('Tu as déjà arrosé cette parcelle.'); return; }
        rain.until = performance.now() + 1400; rain.slot = i;
        act(() => ctx.water(owner, i), (res) => popText(r.x + r.w / 2, r.y + 24, res.reward ? `-20 % · +${res.reward} pièces` : '-20 % de temps', '#bfe8ff'));
      } else if (st === 'grow') ctx.toast(`${cr.name} : prêt dans ${fmtLeft(Date.parse(p.ready_at) - Date.now())}`);
      else ctx.toast(`${cr.name} est mûr`);
      return;
    }
  }
  function openUnlock(slot) {
    const cost = FARM.slotCosts[slot];
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Nouvelle parcelle</b>${closeBtn}</div>
      <p class="fp">Acheter la parcelle ${slot + 1} pour <b>${cost}</b> ${ICON.coin(14)} ? (Tu as ${ctx.chips()} ${ICON.coin(14)})</p>
      <div class="fbtns"><button class="btn" data-x>Plus tard</button><button class="btn primary" data-buy ${ctx.chips() >= cost ? '' : 'disabled'}>Acheter</button></div></div>`;
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      if (!e.target.closest('[data-buy]')) return;
      over.hidden = true;
      act(() => ctx.unlock(), () => { const r = fieldRect(slot); burst(r.x + r.w / 2, r.y + r.h / 2, 'star', 12); popText(r.x + r.w / 2, r.y + 30, 'Nouvelle parcelle !'); });
    };
  }
  cv.addEventListener('pointerdown', tap);

  /* ----- dessin ----- */
  function drawParts() {
    for (let k = parts.length - 1; k >= 0; k--) {
      const q = parts[k]; q.life++; if (q.life > q.max) { parts.splice(k, 1); continue; }
      const a = 1 - q.life / q.max;
      if (q.kind === 'text') { q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); label(c, q.txt, q.x, q.y, 14, q.color); c.globalAlpha = 1; continue; }
      q.x += q.vx; q.y += q.vy; q.vy += 0.16; c.globalAlpha = a;
      if (q.kind === 'fruit') drawFruit(c, q.crop, q.x, q.y, 8);
      else if (q.kind === 'dirt') { c.fillStyle = '#7a4d2a'; c.fillRect(q.x, q.y, 4, 4); }
      else if (q.kind === 'star') drawSpark(c, q.x, q.y, 3.5, '#ffe14d');
      else if (q.kind === 'drop') drawDrop(c, q.x, q.y, 2.6);
      c.globalAlpha = 1;
    }
  }
  const bounceY = (id, now) => (bounce[id] && now - bounce[id] < 500 ? -Math.abs(Math.sin(((now - bounce[id]) / 500) * Math.PI * 2)) * 8 : 0);

  function drawDomaine(t, now) {
    drawDomaineBg(c, t);
    const builds = buildsOf(owner), mine = owner === ctx.meId;
    for (const id of spotIds()) if (!builds.find((q) => q.spot === id)) drawSite(c, spotRect(id), t, mine);
    drawItem(c, 'grange', BARN.x, BARN.y + bounceY('barn', now), BARN.w, BARN.h, t);
    for (const b of [...builds].sort((p, q) => spotRect(p.spot).y - spotRect(q.spot).y)) { const r = spotRect(b.spot); drawItem(c, b.item, r.x, r.y + bounceY(b.spot, now), r.w, r.h, t); }
    // papillons
    for (let k = 0; k < 2; k++) { const bx = 180 + Math.sin(t * 0.6 + k * 3) * 140, by = 260 + Math.sin(t * 0.9 + k * 2) * 60 + k * 90, fl = Math.sin(t * 14 + k) * 3; c.fillStyle = k ? '#f59e0b' : '#e879f9'; c.strokeStyle = OL; c.lineWidth = 1; c.beginPath(); c.ellipse(bx - 3, by, 3 + fl * 0.3, 4, -0.5, 0, TAU); c.ellipse(bx + 3, by, 3 + fl * 0.3, 4, 0.5, 0, TAU); c.fill(); c.stroke(); }
    const n = ctx.stock().reduce((a, s) => a + s.qty, 0);
    drawSign(c, mine ? 'Mon domaine' : `Domaine de ${ctx.nameOf(owner)}`, `${builds.length + 1} bâtiment${builds.length ? 's' : ''} sur ${FARM.spots.b + 1}${mine ? ` · ${n} en grange` : ''}`, W / 2, 500);
  }
  function drawBed(r, i, st, wet, t) {
    c.fillStyle = 'rgba(25,12,3,.4)'; rrect(c, r.x + 3, r.y + 6, r.w, r.h, 14); c.fill();
    c.fillStyle = vg(c, r.y, r.y + r.h, '#c08a52', '#8f5f30'); rrect(c, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14); c.fill(); outline(c, 2.4);
    c.fillStyle = 'rgba(255,230,190,.25)'; rrect(c, r.x - 2, r.y - 2, r.w + 4, 5, 3); c.fill();
    const soil = st === 'dead' ? ['#7a6150', '#5d4638'] : wet ? ['#6a4024', '#4e2c15'] : ['#8d5a31', '#6c4224'];
    c.fillStyle = vg(c, r.y, r.y + r.h, soil[0], soil[1]); rrect(c, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 9); c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.6; c.stroke();
    c.save(); rrect(c, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 9); c.clip();
    for (let q = 0; q < 5; q++) { const yy = r.y + 16 + q * 23; c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(r.x + 4, yy + 6, r.w - 8, 4); c.fillStyle = 'rgba(255,215,160,.16)'; c.fillRect(r.x + 4, yy, r.w - 8, 4); }
    if (wet) { c.fillStyle = 'rgba(120,190,255,.12)'; c.fillRect(r.x, r.y, r.w, r.h); }
    c.restore();
  }
  function drawFields(t, now) {
    drawFieldBg(c);
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner), mine = owner === ctx.meId;
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = fieldRect(i), p = plots.find((q) => q.slot === i), k = pulse['f' + i] && now - pulse['f' + i] < 260 ? 1 + Math.sin(((now - pulse['f' + i]) / 260) * Math.PI) * 0.05 : 1;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      c.save(); c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
      if (i >= slots) {
        c.fillStyle = 'rgba(25,12,3,.4)'; rrect(c, r.x + 3, r.y + 6, r.w, r.h, 14); c.fill();
        c.fillStyle = vg(c, r.y, r.y + r.h, '#9a9288', '#6f675d'); rrect(c, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14); c.fill(); outline(c, 2.4);
        c.fillStyle = vg(c, r.y, r.y + r.h, '#7c746a', '#5f574d'); rrect(c, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 9); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 2; for (let q = 1; q < 5; q++) { c.beginPath(); c.moveTo(r.x + 4, r.y + 4 + ((r.h - 8) * q) / 5); c.lineTo(r.x + r.w - 4, r.y + 4 + ((r.h - 8) * q) / 5); c.stroke(); }
        drawLockC(c, cx, cy - 10, 17);
        if (mine && i === slots) { label(c, `${FARM.slotCosts[i]}`, cx - 8, r.y + r.h - 16, 14, '#ffe08a'); drawCoin(c, cx + 14 + String(FARM.slotCosts[i]).length * 4, r.y + r.h - 21, 7); } else label(c, 'Verrouillée', cx, r.y + r.h - 16, 11, '#e5ddd0');
      } else {
        const st = p ? status(p) : 'empty', wet = p && st === 'grow' && p.watered_by?.length;
        drawBed(r, i, st, wet, t);
        if (st === 'empty') {
          const s = 1 + Math.sin(t * 3 + i) * 0.07;
          c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.arc(cx, cy - 4, 24 * s, 0, TAU); c.fill(); outline(c, 2);
          c.strokeStyle = '#4c8f3a'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(cx, cy + 10); c.lineTo(cx, cy - 2); c.stroke();
          c.fillStyle = '#5db14a'; c.strokeStyle = '#2d6a24'; c.lineWidth = 1.5; for (const d of [-1, 1]) { c.beginPath(); c.ellipse(cx + d * 8, cy - 5, 9, 4.5, d * -0.5, 0, TAU); c.fill(); c.stroke(); }
          label(c, mine ? 'Planter' : 'Vide', cx, r.y + r.h - 14, 12);
        } else if (st === 'dead') {
          for (const d of [-34, 0, 34]) { const bx = cx + d, byy = r.y + r.h * 0.72; c.strokeStyle = '#6a4e2c'; c.lineWidth = 3.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, byy); c.quadraticCurveTo(bx + 8, byy - 22, bx + 16, byy - 26); c.stroke(); c.fillStyle = '#8c6c43'; c.strokeStyle = OL; c.lineWidth = 1; c.beginPath(); c.ellipse(bx + 18, byy - 24, 9, 4.5, 0.6, 0, TAU); c.fill(); c.stroke(); }
          label(c, mine ? 'Fané · nettoyer' : 'Fané', cx, r.y + r.h - 14, 12, '#e5d4bf');
        } else {
          const cr = cropOf(p.crop), total = cr.hours * HOUR, rt = Date.parse(p.ready_at), left = rt - Date.now();
          const prog = st === 'ready' ? 1 : Math.min(0.999, Math.max(0, 1 - left / total));
          for (const [dx, fy] of [[-38, 0.5], [38, 0.5], [0, 0.74]]) { c.save(); c.translate(cx + dx, r.y + r.h * fy + 16); c.scale(1.2, 1.2); drawPlant(c, p.crop, Math.min(1, prog + (dx ? 0 : 0.02)), st === 'ready', t + dx, 0, 0); c.restore(); }
          if (st === 'ready') {
            for (let q = 0; q < 4; q++) { const a = t * 2 + q * 1.6, sx = cx + Math.cos(a) * 56, sy = r.y + r.h * 0.4 + Math.sin(a * 1.3) * 30, s = 2.2 + Math.sin(a * 3) * 1.2; drawSpark(c, sx, sy, s, 'rgba(255,244,160,.95)'); }
            label(c, mine ? 'Récolter !' : 'Mûr', cx, r.y + r.h - 12, 13, '#fff1a0');
          } else {
            const bw = r.w - 40; c.fillStyle = 'rgba(25,12,3,.65)'; rrect(c, r.x + 20, r.y + r.h - 22, bw, 11, 5.5); c.fill();
            c.fillStyle = vg(c, r.y + r.h - 22, r.y + r.h - 11, '#9bea6a', '#4fb53a'); rrect(c, r.x + 20, r.y + r.h - 22, Math.max(11, bw * prog), 11, 5.5); c.fill(); c.strokeStyle = OL; c.lineWidth = 1.4; rrect(c, r.x + 20, r.y + r.h - 22, bw, 11, 5.5); c.stroke();
            label(c, fmtLeft(left), r.x + r.w - 32, r.y + 20, 12); label(c, cr.name, r.x + 46, r.y + 20, 11);
            if (wet) { drawDrop(c, r.x + 20, r.y + 40, 5); label(c, `${p.watered_by.length}`, r.x + 33, r.y + 44, 12, '#bfe8ff'); }
          }
          if (now < rain.until && rain.slot === i && Math.random() < 0.8) parts.push({ kind: 'drop', x: r.x + 14 + Math.random() * (r.w - 28), y: r.y - 6, vx: 0, vy: 2.6, life: 0, max: 36 });
        }
      }
      c.restore();
    }
  }
  function frame(now) {
    if (destroyed) return;
    const t = (now - t0) / 1000;
    if (tab === 'domaine') drawDomaine(t, now); else if (tab === 'champs') drawFields(t, now);
    if (tab !== 'grange') drawParts();
    if (Date.now() - lastSync > 20000 && !busy) { lastSync = Date.now(); ctx.refresh().then(renderHud).catch(() => {}); }
    raf = requestAnimationFrame(frame);
  }
  renderHud();
  raf = requestAnimationFrame(frame);
  const hudTimer = setInterval(renderHud, 5000);
  return { destroy() { destroyed = true; cancelAnimationFrame(raf); clearInterval(hudTimer); } };
}
