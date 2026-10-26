// « Colo-Ferme » : ferme dessinée en canvas. Trois onglets : Domaine (grange, bâtiments, décorations), Champs (la terre et ses parcelles), Grange (stock, vente).
// Les données vivent dans l'appli : ce module dessine et appelle les actions de `ctx`.
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


/* ---------- Bâtiments et décorations (dessinés dans un rectangle x, y, w, h ; le sol est en bas) ---------- */
const POUL = [[0.2, 0.0], [0.6, 2.1], [0.85, 4.2]];
function drawItem(c, key, x, y, w, h, t) {
  const cx = x + w / 2, bot = y + h;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const shadow = (rw) => { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(cx, bot - 1, rw, 5, 0, 0, TAU); c.fill(); };
  if (key === 'grange') {
    shadow(w * 0.52);
    c.fillStyle = '#c0392b'; c.strokeStyle = '#7a1f16'; c.lineWidth = 2; c.beginPath(); c.rect(x + 6, y + h * 0.36, w - 12, h * 0.64); c.fill(); c.stroke();
    c.fillStyle = '#8f2a20'; c.beginPath(); c.moveTo(x - 2, y + h * 0.4); c.lineTo(cx, y + 2); c.lineTo(x + w + 2, y + h * 0.4); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#f5e6c8'; c.strokeStyle = '#7a1f16'; const dw = w * 0.34, dh = h * 0.46; c.beginPath(); c.rect(cx - dw / 2, bot - dh, dw, dh); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - dw / 2, bot - dh); c.lineTo(cx + dw / 2, bot); c.moveTo(cx + dw / 2, bot - dh); c.lineTo(cx - dw / 2, bot); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, y + h * 0.28, 6, 0, TAU); c.fill(); c.stroke();
    c.save(); c.translate(cx, y + 3); c.rotate(Math.sin(t * 1.4) * 0.5); c.strokeStyle = '#444'; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); c.fillStyle = '#444'; c.beginPath(); c.moveTo(8, -3); c.lineTo(14, 0); c.lineTo(8, 3); c.fill(); c.restore();
  } else if (key === 'puits') {
    shadow(w * 0.36);
    c.fillStyle = '#9aa3ab'; c.strokeStyle = '#5d646b'; c.lineWidth = 2; c.beginPath(); c.roundRect(cx - 24, bot - 34, 48, 34, 6); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(cx - 24, bot - 34 + k * 11); c.lineTo(cx + 24, bot - 34 + k * 11); c.stroke(); }
    c.fillStyle = '#3d88c4'; c.beginPath(); c.ellipse(cx, bot - 34, 22, 6, 0, 0, TAU); c.fill();
    c.strokeStyle = '#8a5a2c'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 22, bot - 34); c.lineTo(cx - 22, bot - 66); c.moveTo(cx + 22, bot - 34); c.lineTo(cx + 22, bot - 66); c.stroke();
    c.fillStyle = '#b4452f'; c.strokeStyle = '#7a2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 32, bot - 64); c.lineTo(cx, bot - 82); c.lineTo(cx + 32, bot - 64); c.closePath(); c.fill(); c.stroke();
    const sw = Math.sin(t * 2) * 2; c.strokeStyle = '#444'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, bot - 66); c.lineTo(cx + sw, bot - 48); c.stroke();
    c.fillStyle = '#7b5a2c'; c.beginPath(); c.roundRect(cx + sw - 5, bot - 49, 10, 8, 2); c.fill();
  } else if (key === 'etal') {
    shadow(w * 0.46);
    c.fillStyle = '#8a5a2c'; c.fillRect(cx - 38, bot - 30, 76, 30); c.fillStyle = '#a8743b'; c.fillRect(cx - 38, bot - 30, 76, 8);
    c.strokeStyle = '#6b4420'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 36, bot - 30); c.lineTo(cx - 36, bot - 66); c.moveTo(cx + 36, bot - 30); c.lineTo(cx + 36, bot - 66); c.stroke();
    for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#fff' : '#e03b3b'; c.beginPath(); c.moveTo(cx - 42 + k * 14, bot - 68); c.lineTo(cx - 28 + k * 14, bot - 68); c.lineTo(cx - 28 + k * 14, bot - 56 + Math.sin(t * 2 + k) * 1.2); c.arc(cx - 35 + k * 14, bot - 56, 7, 0, Math.PI); c.lineTo(cx - 42 + k * 14, bot - 68); c.fill(); }
    drawFruit(c, 'tomate', cx - 22, bot - 36, 8); drawFruit(c, 'letchi', cx, bot - 36, 8); drawFruit(c, 'ananas', cx + 22, bot - 38, 8);
  } else if (key === 'serre') {
    shadow(w * 0.48);
    c.fillStyle = 'rgba(180,225,245,.55)'; c.strokeStyle = '#5a7f93'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 40, bot); c.lineTo(cx - 40, bot - 34); c.quadraticCurveTo(cx - 38, bot - 62, cx, bot - 64); c.quadraticCurveTo(cx + 38, bot - 62, cx + 40, bot - 34); c.lineTo(cx + 40, bot); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3d9a4a'; for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(cx + k * 13, bot - 8 - Math.abs(k) * 1.5, 6, 11 + Math.sin(t * 2 + k) * 1.5, k * 0.15, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(90,127,147,.8)'; c.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx + k * 20, bot); c.lineTo(cx + k * 14, bot - 62); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - 18, bot - 44, 5, 12, 0.4, 0, TAU); c.fill();
  } else if (key === 'silo') {
    shadow(w * 0.3);
    const g = c.createLinearGradient(cx - 22, 0, cx + 22, 0); g.addColorStop(0, '#c9cfd6'); g.addColorStop(0.5, '#f1f3f5'); g.addColorStop(1, '#a8afb8');
    c.fillStyle = g; c.strokeStyle = '#6d747c'; c.lineWidth = 2; c.beginPath(); c.rect(cx - 22, bot - 78, 44, 78); c.fill(); c.stroke();
    c.fillStyle = '#b4452f'; c.beginPath(); c.moveTo(cx - 25, bot - 78); c.quadraticCurveTo(cx, bot - 108, cx + 25, bot - 78); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.5; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(cx - 22, bot - k * 19); c.lineTo(cx + 22, bot - k * 19); c.stroke(); }
    c.fillStyle = '#6d747c'; c.fillRect(cx - 5, bot - 22, 10, 22);
  } else if (key === 'poulailler') {
    shadow(w * 0.46);
    c.fillStyle = '#b5834a'; c.strokeStyle = '#6b4420'; c.lineWidth = 2; c.beginPath(); c.rect(cx - 30, bot - 40, 56, 40); c.fill(); c.stroke();
    c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(cx - 36, bot - 40); c.lineTo(cx - 2, bot - 64); c.lineTo(cx + 32, bot - 40); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3b2a18'; c.beginPath(); c.roundRect(cx - 8, bot - 26, 16, 26, [8, 8, 0, 0]); c.fill();
    c.strokeStyle = '#8a5a2c'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + 26, bot); c.lineTo(cx + 40, bot - 8); c.stroke();
    for (const [f, ph] of POUL) {                                 // poules qui se promènent
      const hx = x + 8 + (w - 16) * (0.5 + 0.5 * Math.sin(t * 0.5 + ph)) * f + (w - 16) * (1 - f) * 0.4, dir = Math.cos(t * 0.5 + ph) >= 0 ? 1 : -1, by = bot + 2 + Math.sin(t * 8 + ph) * 0.8;
      c.save(); c.translate(hx, by); c.scale(dir, 1);
      c.fillStyle = '#fff'; c.strokeStyle = '#b0a89a'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -7, 7, 5.5, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(6, -12, 3.2, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#f59e0b'; c.beginPath(); c.moveTo(9, -12); c.lineTo(13, -11); c.lineTo(9, -10); c.fill(); c.fillStyle = '#d93025'; c.beginPath(); c.arc(6, -15.2, 1.6, 0, TAU); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(7, -12.6, 0.8, 0, TAU); c.fill(); c.restore();
    }
  } else if (key === 'fleurs') {
    shadow(w * 0.4);
    const cols = ['#f0546b', '#ffd23f', '#c65bd9', '#ff8a3d', '#ffffff'];
    for (let k = 0; k < 7; k++) {
      const fx = x + 8 + (w - 16) * (k / 6), fy = bot - 4 - (k % 3) * 6, sw = Math.sin(t * 2 + k) * 2.2, hgt = 18 + (k % 3) * 4;
      c.strokeStyle = '#3d8a34'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + sw * 0.3, fy - hgt * 0.5, fx + sw, fy - hgt); c.stroke();
      c.fillStyle = cols[k % 5]; for (let q = 0; q < 5; q++) { c.beginPath(); c.arc(fx + sw + Math.cos(q * 1.257) * 3.4, fy - hgt + Math.sin(q * 1.257) * 3.4, 2.6, 0, TAU); c.fill(); }
      c.fillStyle = '#ffe066'; c.beginPath(); c.arc(fx + sw, fy - hgt, 2, 0, TAU); c.fill();
    }
  } else if (key === 'epouvantail') {
    shadow(w * 0.28); const sw = Math.sin(t * 1.6) * 2;
    c.strokeStyle = '#7a5530'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, bot); c.lineTo(cx, bot - 40); c.moveTo(cx - 22, bot - 30); c.lineTo(cx + 22, bot - 30); c.stroke();
    c.fillStyle = '#3b6fb6'; c.beginPath(); c.roundRect(cx - 9, bot - 36, 18, 18, 3); c.fill();
    c.strokeStyle = '#e4c070'; c.lineWidth = 2; for (const sx of [-22, 22]) { c.beginPath(); c.moveTo(cx + sx, bot - 30); c.lineTo(cx + sx + sw, bot - 22); c.moveTo(cx + sx, bot - 30); c.lineTo(cx + sx + sw * 1.4, bot - 26); c.stroke(); }
    c.fillStyle = '#f2d4a0'; c.beginPath(); c.arc(cx, bot - 44, 7, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(cx - 2.5, bot - 45, 1, 0, TAU); c.arc(cx + 2.5, bot - 45, 1, 0, TAU); c.fill();
    c.fillStyle = '#edcd7e'; c.strokeStyle = '#b8913d'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, bot - 50, 13, 3.5, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.moveTo(cx - 6, bot - 50); c.quadraticCurveTo(cx, bot - 62, cx + 6, bot - 50); c.fill(); c.stroke();
  } else if (key === 'arbre') {
    shadow(w * 0.36); const sw = Math.sin(t * 1.2) * 1.5;
    c.fillStyle = '#7a5530'; c.beginPath(); c.moveTo(cx - 5, bot); c.lineTo(cx - 3, bot - 30); c.lineTo(cx + 3, bot - 30); c.lineTo(cx + 5, bot); c.fill();
    for (const [dx, dy, r, col] of [[-12, -34, 15, '#2f8a3c'], [12, -34, 15, '#2f8a3c'], [0, -46, 17, '#3aa04a'], [0, -30, 15, '#34953f']]) { c.fillStyle = col; c.beginPath(); c.arc(cx + dx + sw * (dy / -46), bot + dy, r, 0, TAU); c.fill(); }
    drawFruit(c, 'letchi', cx - 8 + sw, bot - 36, 4); drawFruit(c, 'letchi', cx + 12 + sw, bot - 44, 4);
  } else if (key === 'banc') {
    shadow(w * 0.4);
    c.fillStyle = '#a8743b'; c.strokeStyle = '#6b4420'; c.lineWidth = 1.5; c.beginPath(); c.rect(cx - 26, bot - 22, 52, 7); c.fill(); c.stroke(); c.beginPath(); c.rect(cx - 26, bot - 30, 52, 6); c.fill(); c.stroke();
    c.fillStyle = '#6b4420'; c.fillRect(cx - 22, bot - 15, 5, 15); c.fillRect(cx + 17, bot - 15, 5, 15);
  } else if (key === 'fontaine') {
    shadow(w * 0.42);
    c.fillStyle = '#b9c0c7'; c.strokeStyle = '#6d747c'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, bot - 8, 30, 11, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#5fb5e8'; c.beginPath(); c.ellipse(cx, bot - 10, 25, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#b9c0c7'; c.fillRect(cx - 4, bot - 30, 8, 22); c.beginPath(); c.ellipse(cx, bot - 30, 11, 4, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(130,200,255,.9)'; c.lineWidth = 2; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx, bot - 32); c.quadraticCurveTo(cx + k * 14, bot - 48 - Math.sin(t * 5 + k) * 3, cx + k * 22, bot - 14); c.stroke(); }
  } else if (key === 'mare') {
    c.fillStyle = '#6f4b27'; c.beginPath(); c.ellipse(cx, bot - 10, w * 0.46, 15, 0, 0, TAU); c.fill();
    c.fillStyle = '#4aa3df'; c.beginPath(); c.ellipse(cx, bot - 11, w * 0.42, 12, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.ellipse(cx - 6, bot - 9, 14 + Math.sin(t * 2) * 2, 4, 0, 0, TAU); c.stroke();
    const dx = cx + Math.sin(t * 0.8) * 12, dy = bot - 14 + Math.sin(t * 3) * 1;
    c.fillStyle = '#ffd23f'; c.beginPath(); c.ellipse(dx, dy, 7, 5, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(dx + 6, dy - 5, 3.4, 0, TAU); c.fill();
    c.fillStyle = '#f59e0b'; c.beginPath(); c.moveTo(dx + 9, dy - 5); c.lineTo(dx + 13, dy - 4); c.lineTo(dx + 9, dy - 3); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(dx + 7, dy - 6, 0.8, 0, TAU); c.fill();
    c.fillStyle = '#3d9a4a'; c.beginPath(); c.ellipse(cx - 22, bot - 8, 6, 3, 0, 0, TAU); c.fill();
  } else if (key === 'lanterne') {
    shadow(w * 0.2);
    c.strokeStyle = '#4a4036'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, bot); c.lineTo(cx, bot - 38); c.stroke(); c.beginPath(); c.moveTo(cx, bot - 38); c.quadraticCurveTo(cx + 12, bot - 44, cx + 14, bot - 36); c.stroke();
    const gl = 0.5 + 0.25 * Math.sin(t * 3); const rg = c.createRadialGradient(cx + 14, bot - 28, 1, cx + 14, bot - 28, 22); rg.addColorStop(0, `rgba(255,214,90,${gl})`); rg.addColorStop(1, 'rgba(255,214,90,0)'); c.fillStyle = rg; c.beginPath(); c.arc(cx + 14, bot - 28, 22, 0, TAU); c.fill();
    c.fillStyle = '#e03b3b'; c.strokeStyle = '#7a1f16'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(cx + 8, bot - 36, 12, 16, 4); c.fill(); c.stroke(); c.fillStyle = '#ffe28a'; c.beginPath(); c.ellipse(cx + 14, bot - 28, 3, 5, 0, 0, TAU); c.fill();
  } else if (key === 'foin') {
    shadow(w * 0.38);
    c.fillStyle = '#e1b84a'; c.strokeStyle = '#a8841f'; c.lineWidth = 2; c.beginPath(); c.arc(cx, bot - 17, 17, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(150,110,20,.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, bot - 17, 11, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, bot - 17, 5, 0, TAU); c.stroke();
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(cx + Math.cos(k) * 12, bot - 17 + Math.sin(k) * 12); c.lineTo(cx + Math.cos(k) * 19, bot - 17 + Math.sin(k) * 19); c.stroke(); }
  }
  c.restore();
}

/* ---------- Décors ---------- */
function drawSky(c, t) {
  const sky = c.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#6ec3f0'); sky.addColorStop(1, '#dff3ff');
  c.fillStyle = sky; c.fillRect(0, 0, W, 215);
  c.save(); c.translate(300, 52); c.rotate(t * 0.15); c.fillStyle = 'rgba(255,225,90,.35)';
  for (let k = 0; k < 10; k++) { c.rotate(TAU / 10); c.fillRect(-4, 22, 8, 22); }
  c.restore();
  c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(300, 52, 24, 0, TAU); c.fill();
  for (const [sp, y, s] of [[10, 40, 1], [6, 80, 0.8]]) {
    const x = ((t * sp + y * 9) % (W + 120)) - 60; c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(x, y, 14 * s, 0, TAU); c.arc(x + 16 * s, y + 3, 11 * s, 0, TAU); c.arc(x - 15 * s, y + 4, 10 * s, 0, TAU); c.fill();
  }
  c.fillStyle = '#5ea85f'; c.beginPath(); c.moveTo(0, 150); c.quadraticCurveTo(90, 100, 190, 145); c.quadraticCurveTo(280, 100, W, 140); c.lineTo(W, 215); c.lineTo(0, 215); c.fill();
  c.fillStyle = '#74bd6a'; c.beginPath(); c.moveTo(0, 178); c.quadraticCurveTo(120, 142, 230, 175); c.quadraticCurveTo(310, 152, W, 170); c.lineTo(W, 215); c.lineTo(0, 215); c.fill();
}
function drawDomaineBg(c, t) {
  drawSky(c, t);
  const gr = c.createLinearGradient(0, 205, 0, H); gr.addColorStop(0, '#8fd27a'); gr.addColorStop(1, '#6db95c');
  c.fillStyle = gr; c.fillRect(0, 205, W, H - 205);
  c.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 210; y < H; y += 26) c.fillRect(0, y, W, 12);
  c.fillStyle = '#d9b97b'; c.beginPath(); c.roundRect(0, 337, W, 12, 6); c.fill(); c.beginPath(); c.roundRect(0, 452, W, 12, 6); c.fill();   // petits chemins
  c.fillStyle = '#c8a064'; c.strokeStyle = '#8a6a36'; c.lineWidth = 1.5; c.fillRect(0, 214, W, 4); c.fillRect(0, 205, W, 4);
  for (let x = 6; x < W; x += 36) { c.fillRect(x, 199, 6, 22); c.strokeRect(x, 199, 6, 22); }
}
function drawFieldBg(c) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6e4727'); g.addColorStop(1, '#583619');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 6; y < H; y += 14) c.fillRect(0, y, W, 5);
  c.fillStyle = 'rgba(255,255,255,.05)'; for (let k = 0; k < 70; k++) c.fillRect((k * 53) % W, (k * 97) % H, 3, 2);
}
function label(c, txt, x, y, size = 11, color = '#fff') {
  c.font = `800 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(30,20,10,.75)'; c.strokeText(txt, x, y); c.fillStyle = color; c.fillText(txt, x, y);
}
const fmtLeft = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

/* ---------- Plans ---------- */
const BARN = { x: 20, y: 225, w: 115, h: 110 };
const BSPOTS = [{ x: 145, y: 225, w: 95, h: 110 }, { x: 20, y: 350, w: 100, h: 100 }, { x: 130, y: 350, w: 100, h: 100 }, { x: 240, y: 350, w: 100, h: 100 }, { x: 250, y: 225, w: 90, h: 110 }];
const spotRect = (id) => { const i = Number(id.slice(1)); return id[0] === 'b' ? BSPOTS[i] : { x: 20 + (i % 4) * 85, y: 470 + Math.floor(i / 4) * 60, w: 75, h: 52 }; };
const fieldRect = (i) => ({ x: 20 + (i % 2) * 170, y: 58 + Math.floor(i / 2) * 178, w: 150, h: 168 });
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const spotIds = () => [...Array.from({ length: FARM.spots.b }, (_, i) => 'b' + i), ...Array.from({ length: FARM.spots.d }, (_, i) => 'd' + i)];
const itemOf = (k) => FARM.items.find((i) => i.key === k);
const cropOf = (k) => FARM.crops.find((x) => x.key === k);

export function mount(root, ctx) {
  root.innerHTML = `<div class="fgame">
      <div class="fhud"><span class="fcoins"></span><span class="fcap"></span></div>
      <div class="fstage"><canvas class="fcv" width="${W}" height="${H}" aria-label="Colo-Ferme"></canvas><div class="fgrange" hidden></div></div>
      <div class="fvisit"></div>
      <nav class="ftabs"><button data-tab="domaine">🏡<small>Domaine</small></button><button data-tab="champs">🌱<small>Champs</small></button><button data-tab="grange">🧺<small>Grange</small></button></nav>
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

  function renderHud() {
    hudCoins.innerHTML = `🪙 ${ctx.chips()}`;
    hudCap.innerHTML = tab === 'grange' || owner === ctx.meId ? `Ventes du jour <b>${ctx.got()}/${cap()}</b> 🪙` : `Ferme de <b>${ctx.esc(ctx.nameOf(owner))}</b>`;
    visit.hidden = tab === 'grange';
    visit.innerHTML = ctx.colocs().map((m) => `<button class="fv ${m.id === owner ? 'on' : ''}" data-owner="${m.id}">${ctx.avatar(m, 30)}<small>${m.id === ctx.meId ? 'Ma ferme' : ctx.esc(m.name)}</small>${plotsOf(m.id).some((p) => status(p) === 'ready') ? '<i>✨</i>' : ''}</button>`).join('');
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    cv.hidden = tab === 'grange'; panel.hidden = tab !== 'grange';
    if (tab === 'grange') renderGrange();
  }
  function setTab(k) { tab = k; if (k === 'grange') owner = ctx.meId; renderHud(); }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  visit.addEventListener('click', (e) => { const b = e.target.closest('[data-owner]'); if (b) { owner = Number(b.dataset.owner); renderHud(); } });

  /* ----- Grange : stock, vente, bonus ----- */
  function renderGrange() {
    const stock = ctx.stock().filter((s) => s.qty > 0), left = Math.max(cap() - ctx.got(), 0);
    const perks = FARM.items.filter((i) => i.kind === 'b' && i.perk && has(ctx.meId, i.key));
    const total = buildsOf(ctx.meId).length, max = FARM.items.length;
    panel.innerHTML = `<div class="fg-in">
      <h3>🧺 La grange</h3>
      <p class="fgs">Tes récoltes arrivent ici. Vends-les (plafond du jour : <b>${left}</b> 🪙 restants) ou garde-les pour construire.</p>
      ${stock.length ? stock.map((s) => { const cr = cropOf(s.crop), u = unitPrice(cr); return `<div class="fgrow"><img alt="" src="${fruitIcon(s.crop, 40)}" width="40" height="40"><span class="ct"><b>${cr.name} × ${s.qty}</b><small>${u} 🪙 l'unité</small></span>
        <button class="btn" data-sell="${s.crop}" data-n="1">Vendre 1</button><button class="btn primary" data-sell="${s.crop}" data-n="${s.qty}">Tout</button></div>`; }).join('') : '<div class="fgempty">Grange vide : plante et récolte dans l\'onglet Champs !</div>'}
      <h3>🔧 Bonus actifs</h3>
      ${perks.length ? perks.map((i) => `<div class="fgperk">${i.emoji} <b>${i.name}</b> · ${i.perk}</div>`).join('') : '<div class="fgempty">Construis des bâtiments dans le Domaine pour débloquer des bonus.</div>'}
      <p class="fgs">${total} construction${total > 1 ? 's' : ''} sur ${max}.</p></div>`;
    panel.onclick = (e) => { const b = e.target.closest('[data-sell]'); if (!b) return; const crop = b.dataset.sell, n = Number(b.dataset.n); act(() => ctx.sell(crop, n), (r) => ctx.toast(`Vendu ${r.sold} · +${r.coins} 🪙`)); };
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
    const lv = ctx.level(), have = ctx.chips();
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>Planter · parcelle ${slot + 1}</b><button data-x aria-label="Fermer">✕</button></div>
      <div class="fcrops">${FARM.crops.map((cr) => { const lock = lv < cr.level; return `<button class="fcrop ${lock ? 'lk' : ''}" data-crop="${cr.key}" ${!lock && have >= cr.cost ? '' : 'disabled'}>
        <img alt="" src="${fruitIcon(cr.key, 44)}" width="44" height="44" ${lock ? 'style="filter:grayscale(1) brightness(.7)"' : ''}>
        <span class="ct"><b>${cr.name}</b><small>${lock ? `🔒 Se débloque au niveau ${cr.level}` : `${cr.hours} h · ${FARM.yield} unités à ${cr.sell} 🪙`}</small></span><span class="cp">${lock ? `Niv. ${cr.level}` : `−${cr.cost} 🪙`}</span></button>`; }).join('')}</div></div>`;
    over.onclick = (e) => {
      if (e.target.closest('[data-x]') || e.target === over) { over.hidden = true; return; }
      const b = e.target.closest('[data-crop]'); if (!b) return;
      over.hidden = true; const key = b.dataset.crop, r = fieldRect(slot);
      act(() => ctx.plant(slot, key), () => { burst(r.x + r.w / 2, r.y + r.h * 0.8, 'dirt', 12); pulse['f' + slot] = performance.now(); });
    };
  }
  function openBuildPicker(spot) {
    const kind = spot[0], built = new Set(buildsOf(ctx.meId).map((b) => b.item));
    const list = FARM.items.filter((i) => i.kind === kind && !built.has(i.key));
    over.hidden = false;
    over.innerHTML = `<div class="fsheet"><div class="fsh"><b>${kind === 'b' ? 'Construire un bâtiment' : 'Ajouter une décoration'}</b><button data-x aria-label="Fermer">✕</button></div>
      ${list.length ? `<div class="fcrops">${list.map((it) => { const ok = Object.entries(it.cost).every(([k, v]) => stockQty(k) >= v);
        return `<button class="fcrop" data-item="${it.key}" ${ok ? '' : 'disabled'}><canvas class="fic" width="88" height="88" data-icon="${it.key}"></canvas>
        <span class="ct"><b>${it.name}</b><small>${it.perk ?? 'Décoration'}</small><span class="fcost">${Object.entries(it.cost).map(([k, v]) => `<em class="${stockQty(k) >= v ? 'ok' : 'no'}"><img alt="" src="${fruitIcon(k, 22)}" width="18" height="18">${stockQty(k)}/${v}</em>`).join('')}</span></span></button>`; }).join('')}</div>`
        : '<p class="fp">Tout est déjà construit ici. Bravo !</p>'}</div>`;
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
        if (b) { bounce[id] = performance.now(); const it = itemOf(b.item); ctx.toast(`${it.emoji} ${it.name}${it.perk ? ' · ' + it.perk : ''}`); }
        else if (mine && ctx.isColoc()) openBuildPicker(id);
        else ctx.toast('Emplacement libre');
        return;
      }
      return;
    }
    // Champs
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner);
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = fieldRect(i); if (!hit(r, x, y)) continue;
      pulse['f' + i] = performance.now();
      const p = plots.find((q) => q.slot === i);
      if (i >= slots) { if (mine && i === slots) openUnlock(i); else ctx.toast(mine ? 'Débloque d\'abord la parcelle précédente.' : 'Parcelle pas encore débloquée.'); return; }
      if (!p) { if (mine && ctx.isColoc()) openCropPicker(i); else ctx.toast(mine ? 'Réservé aux colocataires.' : 'Parcelle vide.'); return; }
      const st = status(p), cr = cropOf(p.crop);
      if (mine && (st === 'ready' || st === 'dead')) {
        act(() => ctx.harvest(i), (res) => {
          const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5;
          if (res.withered) { burst(cx, cy, 'dirt', 10); popText(cx, cy - 20, 'Fané…', '#d9c7b0'); return; }
          burst(cx, cy, 'fruit', 8, { crop: p.crop }); popText(cx, cy - 26, `+${res.qty} ${cr.name}`); ctx.toast(`${res.qty} ${cr.name} rangé${res.qty > 1 ? 's' : ''} dans la grange 🧺`);
        });
      } else if (!mine && st === 'grow') {
        if (p.watered_by?.includes(ctx.meId)) { ctx.toast('Tu as déjà arrosé cette parcelle 💧'); return; }
        rain.until = performance.now() + 1400; rain.slot = i;
        act(() => ctx.water(owner, i), (res) => popText(r.x + r.w / 2, r.y + 24, res.reward ? `−20 % · +${res.reward} 🪙` : '−20 % de temps 💧', '#bfe8ff'));
      } else if (st === 'grow') ctx.toast(`${cr.name} : prêt dans ${fmtLeft(Date.parse(p.ready_at) - Date.now())}`);
      else ctx.toast(`${cr.name} est mûr ✨`);
      return;
    }
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
      else if (q.kind === 'star') { c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(q.x, q.y, 3, 0, TAU); c.fill(); }
      else if (q.kind === 'drop') { c.fillStyle = '#59b6f5'; c.beginPath(); c.ellipse(q.x, q.y, 2, 4, 0, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
  }
  const bounceY = (id, now) => (bounce[id] && now - bounce[id] < 500 ? -Math.abs(Math.sin(((now - bounce[id]) / 500) * Math.PI * 2)) * 8 : 0);

  function drawDomaine(t, now) {
    drawDomaineBg(c, t);
    const builds = buildsOf(owner), mine = owner === ctx.meId;
    // papillons
    for (let k = 0; k < 2; k++) { const bx = 180 + Math.sin(t * 0.6 + k * 3) * 140, by = 300 + Math.sin(t * 0.9 + k * 2) * 70 + k * 40, fl = Math.sin(t * 14 + k) * 3; c.fillStyle = k ? '#f59e0b' : '#e879f9'; c.beginPath(); c.ellipse(bx - 3, by, 3 + fl * 0.3, 4, -0.5, 0, TAU); c.ellipse(bx + 3, by, 3 + fl * 0.3, 4, 0.5, 0, TAU); c.fill(); }
    // emplacements libres
    for (const id of spotIds()) {
      const r = spotRect(id), b = builds.find((q) => q.spot === id);
      if (b) continue;
      c.save(); c.setLineDash([6, 5]); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.65)'; c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); c.fill(); c.stroke(); c.restore();
      if (mine) { const s = 1 + Math.sin(t * 3 + r.x) * 0.06; c.fillStyle = 'rgba(255,255,255,.8)'; c.font = `800 ${Math.round(22 * s)}px system-ui`; c.textAlign = 'center'; c.fillText('+', r.x + r.w / 2, r.y + r.h / 2 + 8); label(c, id[0] === 'b' ? 'bâtiment' : 'déco', r.x + r.w / 2, r.y + r.h - 8, 9, '#fff'); }
    }
    // grange (toujours là) puis constructions, de haut en bas
    const dy0 = bounceY('barn', now); drawItem(c, 'grange', BARN.x, BARN.y + dy0, BARN.w, BARN.h, t);
    for (const b of [...builds].sort((p, q) => spotRect(p.spot).y - spotRect(q.spot).y)) { const r = spotRect(b.spot); drawItem(c, b.item, r.x, r.y + bounceY(b.spot, now), r.w, r.h, t); }
    if (mine && ctx.stock().some((s) => s.qty > 0)) { const n = ctx.stock().reduce((a, s) => a + s.qty, 0); label(c, `🧺 ${n}`, BARN.x + BARN.w / 2, BARN.y + BARN.h + 14, 11, '#fff3b0'); }
  }
  function drawFields(t, now) {
    drawFieldBg(c);
    const slots = ctx.slotsOf(owner), plots = plotsOf(owner), mine = owner === ctx.meId;
    for (let i = 0; i < FARM.slotCosts.length; i++) {
      const r = fieldRect(i), p = plots.find((q) => q.slot === i), k = pulse['f' + i] && now - pulse['f' + i] < 260 ? 1 + Math.sin(((now - pulse['f' + i]) / 260) * Math.PI) * 0.05 : 1;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      c.save(); c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
      if (i >= slots) {
        c.fillStyle = '#4b3a28'; c.beginPath(); c.roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16); c.fill();
        c.fillStyle = '#7a6a58'; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 12); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 2; for (let q = 1; q < 5; q++) { c.beginPath(); c.moveTo(r.x, r.y + (r.h * q) / 5); c.lineTo(r.x + r.w, r.y + (r.h * q) / 5); c.stroke(); }
        c.fillStyle = '#d9b44a'; c.beginPath(); c.roundRect(cx - 16, cy - 12, 32, 26, 6); c.fill(); c.strokeStyle = '#8a6d1a'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.arc(cx, cy - 12, 10, Math.PI, 0); c.stroke();
        if (mine && i === slots) label(c, `${FARM.slotCosts[i]} pièces`, cx, r.y + r.h - 14, 13, '#ffe08a'); else label(c, 'verrouillée', cx, r.y + r.h - 14, 11, '#e5ddd0');
      } else {
        const st = p ? status(p) : 'empty', wet = p && st === 'grow' && p.watered_by?.length;
        c.fillStyle = '#3d2410'; c.beginPath(); c.roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16); c.fill();
        c.fillStyle = st === 'dead' ? '#6a5242' : wet ? '#8a5430' : '#a06a3e'; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 12); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 4; c.lineCap = 'round'; for (let q = 1; q < 6; q++) { c.beginPath(); c.moveTo(r.x + 12, r.y + (r.h * q) / 6); c.lineTo(r.x + r.w - 12, r.y + (r.h * q) / 6); c.stroke(); }
        const by = r.y + r.h * 0.8;
        if (st === 'empty') {
          const s = 1 + Math.sin(t * 3 + i) * 0.08;
          c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(cx, cy, 24 * s, 0, TAU); c.fill();
          c.strokeStyle = '#5e3b1c'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - 10, cy); c.lineTo(cx + 10, cy); c.moveTo(cx, cy - 10); c.lineTo(cx, cy + 10); c.stroke();
          label(c, mine ? 'Planter' : 'Vide', cx, r.y + r.h - 12, 12);
        } else if (st === 'dead') {
          c.strokeStyle = '#7b5b3a'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx + 16, by - 34, cx + 30, by - 40); c.stroke();
          c.fillStyle = '#8a6b45'; c.beginPath(); c.ellipse(cx + 34, by - 38, 12, 6, 0.6, 0, TAU); c.fill();
          label(c, mine ? 'Fané · nettoyer' : 'Fané', cx, r.y + r.h - 12, 12, '#e5d4bf');
        } else {
          const cr = cropOf(p.crop), total = cr.hours * HOUR, rt = Date.parse(p.ready_at), left = rt - Date.now();
          const prog = st === 'ready' ? 1 : Math.min(0.999, Math.max(0, 1 - left / total));
          c.save(); c.translate(cx, by); c.scale(1.7, 1.7); drawPlant(c, p.crop, prog, st === 'ready', t, 0, 0); c.restore();
          if (st === 'ready') {
            for (let q = 0; q < 4; q++) { const a = t * 2 + q * 1.6, sx = cx + Math.cos(a) * 52, sy = r.y + r.h * 0.4 + Math.sin(a * 1.3) * 34, s = 2.5 + Math.sin(a * 3) * 1.4; c.fillStyle = 'rgba(255,240,150,.95)'; c.beginPath(); c.moveTo(sx, sy - s * 2); c.lineTo(sx + s, sy); c.lineTo(sx, sy + s * 2); c.lineTo(sx - s, sy); c.closePath(); c.fill(); }
            label(c, mine ? 'Récolter !' : 'Mûr ✨', cx, r.y + r.h - 12, 13, '#fff1a0');
          } else {
            c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(r.x + 16, r.y + r.h - 22, r.w - 32, 9, 4.5); c.fill();
            c.fillStyle = '#7ee06a'; c.beginPath(); c.roundRect(r.x + 16, r.y + r.h - 22, Math.max(9, (r.w - 32) * prog), 9, 4.5); c.fill();
            label(c, fmtLeft(left), r.x + r.w - 34, r.y + 20, 12); label(c, cr.name, r.x + 46, r.y + 20, 11);
            if (wet) label(c, `💧${p.watered_by.length}`, r.x + 24, r.y + 40, 12, '#bfe8ff');
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
