// « Coucou » : un oiseau rouge qui bat des ailes entre des colonnes jaunes (mécanique classique, dessin original).
// Le score = nombre de colonnes passées. Toucher l'écran / espace / ↑ = battre des ailes.
import { SHOP } from '../config.js';
import { gIcon } from '../gameart.js';
export const W = 288, H = 480, GROUND = 64;
const GRAVITY = 0.42, FLAP = -6.9, MAX_FALL = 9;
const PIPE_W = 54, GAP = 128, SPEED = 2.3, SPACING = 176, BIRD_X = 78, BIRD_R = 12;

export const GROW_F = 26, DEAD_F = 100; // images : gonflement, puis fin de l'animation
// Logique pure (testable sans navigateur)
export function createGame(rng = Math.random) {
  const g = {
    y: H / 2 - 40, vy: 0, pipes: [], score: 0, sfx: [], dead: false, exploded: false, deathT: 0, parts: [], started: false, t: 0, nextX: W + 60, tilt: 0,
    flap() { if (g.dead) return; g.started = true; g.vy = FLAP; g.sfx.push('flap'); },
    step(k = 1) {   // k = durée de l'image en « images à 60 Hz » (1 = 16,7 ms) : le mouvement suit le temps réel, quelle que soit la fréquence de l'écran
      g.t += k;
      if (!g.started) { g.y = H / 2 - 40 + Math.sin(g.t / 9) * 6; return; }
      if (g.dead) {   // l'oiseau gonfle sur place, puis explose en plumes
        g.deathT += k;
        if (!g.exploded && g.deathT >= GROW_F) g.exploded = true, g.sfx.push('boom'), g.parts = Array.from({ length: 30 }, (_, i) => {
          const a = (i / 30) * Math.PI * 2 + rng() * 0.5, v = 2 + rng() * 5.5;
          return { x: BIRD_X, y: g.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: rng() * 6, vr: (rng() - 0.5) * 0.5, c: i % 3, life: 1, sz: 7 + rng() * 7 };
        });
        for (const q of g.parts) { q.vy += 0.16 * k; q.vx *= 0.985 ** k; q.x += q.vx * k; q.y += q.vy * k; q.r += q.vr * k; q.life -= 0.006 * k; if (q.y > H - GROUND - 3) { q.y = H - GROUND - 3; q.vy = 0; q.vx *= 0.8; q.vr *= 0.8; } }
        return;
      }
      g.vy = Math.min(g.vy + GRAVITY * k, MAX_FALL);
      g.y += g.vy * k;
      g.tilt = Math.max(-0.45, Math.min(1.1, g.vy / 9));
      for (const p of g.pipes) p.x -= SPEED * k;
      if (!g.pipes.length || g.pipes[g.pipes.length - 1].x < W + 40 - SPACING) {
        const top = 70 + rng() * (H - GROUND - GAP - 140);
        g.pipes.push({ x: Math.max(W + 40, g.nextX), top, passed: false });
      }
      while (g.pipes.length && g.pipes[0].x <= -PIPE_W - 4) g.pipes.shift();
      for (const p of g.pipes) {
        if (!p.passed && p.x + PIPE_W / 2 <= BIRD_X) { p.passed = true; g.score++; g.sfx.push('score'); }   // le point tombe quand l'oiseau est pile au milieu de la colonne
        const inX = BIRD_X + BIRD_R - 3 > p.x && BIRD_X - BIRD_R + 3 < p.x + PIPE_W;
        if (inX && (g.y - BIRD_R + 3 < p.top || g.y + BIRD_R - 3 > p.top + GAP) && !g.dead) { g.dead = true; g.sfx.push('hit'); }
      }
      if (g.y + BIRD_R >= H - GROUND) { g.y = H - GROUND - BIRD_R; if (!g.dead) g.sfx.push('hit'); g.dead = true; }
      if (g.y - BIRD_R < -30) g.y = -30 + BIRD_R;
    },
  };
  return g;
}

// Décor par paliers de score : jour → soir (50) → crépuscule (100) → nuit (150) → monde délabré (200) → enfers (250)
const STAGES = [
  { at: 0,   sT: '#7ec8e3', sB: '#fde7b0', hill: '#9ad1a0', cloud: '#ffffffaa', p1: '#facc15', p2: '#fde68a', p3: '#ca8a04', p4: '#eab308', p5: '#a16207', gnd: '#d9b36c', grass: '#7bbf59', dash: '#c29a52', star: 0, ruin: 0, hell: 0, dark: 0 },
  { at: 50,  sT: '#8fb7d6', sB: '#f4c98f', hill: '#86b08a', cloud: '#fff1dcaa', p1: '#e8b923', p2: '#f3d77c', p3: '#b07a10', p4: '#d4a017', p5: '#8a5a12', gnd: '#c9a35e', grass: '#6aa84f', dash: '#b08a48', star: 0, ruin: 0, hell: 0, dark: 0.12 },
  { at: 100, sT: '#3d3a7c', sB: '#d77a6a', hill: '#4c6670', cloud: '#c9a0b8aa', p1: '#c99a2c', p2: '#e0bd6a', p3: '#8a5e14', p4: '#a67c1f', p5: '#6b4510', gnd: '#8a7248', grass: '#4d8a47', dash: '#78603a', star: 0.45, ruin: 0, hell: 0, dark: 0.3 },
  { at: 150, sT: '#070b24', sB: '#1d2c5e', hill: '#16303a', cloud: '#3a4a7a88', p1: '#8c7a3a', p2: '#b4a15c', p3: '#5a4a1c', p4: '#6e5e28', p5: '#41350f', gnd: '#4a4030', grass: '#2f5a3a', dash: '#3e3526', star: 1, ruin: 0, hell: 0, dark: 0.5 },
  { at: 200, sT: '#46464c', sB: '#7a736c', hill: '#3b3b3e', cloud: '#55555a99', p1: '#8b8b86', p2: '#aaa9a2', p3: '#5f5f5b', p4: '#74746f', p5: '#454542', gnd: '#5a5248', grass: '#4d5a36', dash: '#463f36', star: 0, ruin: 1, hell: 0, dark: 0.35 },
  { at: 250, sT: '#2a0505', sB: '#d2480e', hill: '#4a0f0a', cloud: '#5a1a1099', p1: '#3a1a1a', p2: '#6a2c20', p3: '#1d0a0a', p4: '#4a2018', p5: '#ff5a1f', gnd: '#2a1210', grass: '#ff6a1a', dash: '#6a1d0c', star: 0, ruin: 0.3, hell: 1, dark: 0.25 },
];
const hex2 = (h) => { const v = parseInt(h.slice(1, 7), 16), a = h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255; return [v >> 16 & 255, v >> 8 & 255, v & 255, a]; };
const mixC = (a, b, f) => { const x = hex2(a), y = hex2(b); return `rgba(${Math.round(x[0] + (y[0] - x[0]) * f)},${Math.round(x[1] + (y[1] - x[1]) * f)},${Math.round(x[2] + (y[2] - x[2]) * f)},${((x[3] + (y[3] - x[3]) * f) / 255).toFixed(3)})`; };
let thMemo = { k: -1, v: null };
export function themeAt(score) {   // transition douce pendant les 10 colonnes qui précèdent chaque palier (mémorisé : calculé une fois par colonne)
  if (thMemo.k === score) return thMemo.v;
  let j = 0; for (let i = 1; i < STAGES.length; i++) if (score >= STAGES[i].at - 10) j = i;
  const B = STAGES[j], A = STAGES[Math.max(0, j - 1)], f = j === 0 ? 1 : Math.min(1, Math.max(0, (score - (B.at - 10)) / 10)), th = {};
  for (const k of Object.keys(B)) th[k] = k === 'at' ? B.at : typeof B[k] === 'string' ? mixC(A[k], B[k], f) : A[k] + (B[k] - A[k]) * f;
  for (const k of ['hill', 'cloud', 'p1', 'p2', 'p3', 'p4', 'p5', 'gnd', 'grass', 'dash']) if (th.dark > 0.01) th[k] = mixC(rgbaToHex(th[k]), '#000014', th.dark * 0.45);   // la nuit assombrit tout, sans calque plein écran
  thMemo = { k: score, v: th };
  return th;
}
const rgbaToHex = (c) => { if (c[0] === '#') return c; const m = c.match(/[\d.]+/g).map(Number); return '#' + [m[0], m[1], m[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + Math.round((m[3] ?? 1) * 255).toString(16).padStart(2, '0'); };

// Ciel (dégradé, étoiles, lune, lueur de lave) : dessiné une seule fois par colonne dans un calque, puis recopié à chaque image
let skyMemo = { k: -1, cv: null };
function skyFor(th, score) {
  if (skyMemo.k === score) return skyMemo.cv;
  const cv = skyMemo.cv ?? document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), hg = H - GROUND;
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, th.sT); gr.addColorStop(1, th.sB); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  if (th.star > 0.01) {
    c.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { c.globalAlpha = th.star * (0.5 + 0.5 * ((k * 7) % 5) / 4); c.fillRect((k * 83) % W, (k * 47) % 330, k % 3 ? 1.6 : 2.6, k % 3 ? 1.6 : 2.6); } c.globalAlpha = 1;
    c.fillStyle = `rgba(250,246,225,${th.star})`; c.beginPath(); c.arc(236, 86, 18, 0, 7); c.fill(); c.fillStyle = `rgba(7,11,36,${th.star * 0.35})`; c.beginPath(); c.arc(243, 81, 15, 0, 7); c.fill();
  }
  if (th.hell > 0.01) { const lg = c.createLinearGradient(0, hg - 160, 0, hg); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, `rgba(255,110,30,${0.55 * th.hell})`); c.fillStyle = lg; c.fillRect(0, hg - 160, W, 160); }
  skyMemo = { k: score, cv };
  return cv;
}

const BASE = { body: '#ef4444', belly: '#fecaca', wing: '#b91c1c' };
// L'oiseau est dessiné une seule fois (16 images : aile haut/bas × 8 phases d'accessoire) puis recopié : plus de dégradés ni d'ombres à chaque image
const BS = 60, SS = 3;
function birdSprite(skin, frame) {
  const wf = Math.floor(frame / 5) % 2, ph = Math.floor(frame / 6) % 8, key = wf * 8 + ph;
  skin._spr ??= {};
  if (!skin._spr[key]) {
    const cv = document.createElement('canvas'); cv.width = cv.height = BS * SS;
    const c = cv.getContext('2d'); c.scale(SS, SS); c.translate(BS / 2, BS / 2);
    paintBird(c, ph * 10 + wf * 5, skin);
    skin._spr[key] = cv;
  }
  return skin._spr[key];
}
function paintBird(ctx, frame, skin) {
  let body = skin.body;
  if (skin.rainbow) { const gr = ctx.createLinearGradient(-14, -14, 14, 14); ['#ef4444', '#facc15', '#22c55e', '#3b82f6'].forEach((c, i) => gr.addColorStop(i / 3, c)); body = gr; }
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, BIRD_R + 2, 0, 7); ctx.fill();
  ctx.fillStyle = skin.belly; ctx.beginPath(); ctx.ellipse(2, 5, 9, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = skin.wing; ctx.beginPath(); ctx.ellipse(-5, 2 + (Math.floor(frame / 5) % 2 ? -3 : 3), 7, 4.5, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = skin.eyeBg ?? '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.4, 0, 7); ctx.fill();
  if (skin.eye) { ctx.shadowColor = skin.eye; ctx.shadowBlur = 8; }
  ctx.fillStyle = skin.eye ?? '#111'; ctx.beginPath(); ctx.arc(7.4, -4, skin.eye ? 3 : 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(21, 2); ctx.lineTo(11, 6); ctx.fill();
  PAINT_ACC[skin.acc]?.(ctx, skin, frame);
  if (skin.acc === 'shades') { ctx.fillStyle = '#111'; ctx.fillRect(2, -8, 12, 6); ctx.fillRect(-2, -6, 5, 2); }
  if (skin.acc === 'band') { ctx.fillStyle = '#dc2626'; ctx.fillRect(-12, -10, 24, 4); ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-22, -4 + Math.sin(frame / 4) * 3); ctx.lineTo(-12, -6); ctx.fill(); }
  if (skin.acc === 'crown') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-7, -21); ctx.lineTo(-2, -16); ctx.lineTo(2, -22); ctx.lineTo(6, -16); ctx.lineTo(10, -21); ctx.lineTo(9, -11); ctx.closePath(); ctx.fill(); }
  if (skin.acc === 'knight') {
    ctx.fillStyle = '#aab3bd'; ctx.beginPath(); ctx.arc(0, -3, 13, Math.PI, 0); ctx.lineTo(13, -3); ctx.lineTo(-13, -3); ctx.fill();
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(1, -8, 12, 3.5);
    ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(-2, -15); ctx.quadraticCurveTo(-10 - Math.sin(frame / 5) * 2, -26, -16, -14 + Math.sin(frame / 4) * 2); ctx.quadraticCurveTo(-8, -17, -2, -12); ctx.fill();
  }
  if (skin.acc === 'dark') { ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-4, -22); ctx.lineTo(0, -14); ctx.lineTo(4, -22); ctx.lineTo(6, -12); ctx.fill(); }
}

const PAINT_ACC = {
  duck(c) { c.fillStyle = '#f59e0b'; c.strokeStyle = '#b86a06'; c.lineWidth = 1; c.beginPath(); c.moveTo(9, -2); c.quadraticCurveTo(25, -4, 25, 3); c.quadraticCurveTo(25, 8, 9, 7); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-1, -13, 2.6, 0, 7); c.arc(-4, -12, 2.2, 0, 7); c.fill(); },
  pigeon(c) { c.fillStyle = 'rgba(47,158,138,.9)'; c.beginPath(); c.ellipse(3, 8, 10, 5, 0.25, 0, 7); c.fill(); c.fillStyle = 'rgba(138,95,176,.8)'; c.beginPath(); c.ellipse(5, 10, 6, 3, 0.25, 0, 7); c.fill(); c.fillStyle = '#f97316'; c.beginPath(); c.arc(6, -4, 4.6, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(7, -4, 2.2, 0, 7); c.fill(); },
  clodo(c) {
    c.fillStyle = '#6b4e3d'; c.beginPath(); c.moveTo(-12, -4); c.quadraticCurveTo(-11, -20, 2, -20); c.quadraticCurveTo(14, -20, 13, -4); c.closePath(); c.fill(); c.fillStyle = '#4a362b'; c.fillRect(-13, -8, 27, 5); c.beginPath(); c.arc(1, -21, 3.2, 0, 7); c.fill();
    c.fillStyle = '#b4895a'; c.strokeStyle = '#6b4e3d'; c.lineWidth = 1; c.setLineDash([2, 2]); c.fillRect(-6, 5, 7, 6); c.strokeRect(-6, 5, 7, 6); c.setLineDash([]);
    c.fillStyle = 'rgba(40,30,20,.55)'; for (const [x, y] of [[7, 5], [10, 7], [5, 8], [9, 10]]) c.fillRect(x, y, 1.2, 1.2);
  },
  ptero(c) {
    c.fillStyle = '#4a5f2f'; c.strokeStyle = '#2f3d1c'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -10); c.lineTo(-22, -19); c.lineTo(-13, -5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#c9a24a'; c.beginPath(); c.moveTo(9, -3); c.lineTo(27, 2); c.lineTo(9, 6); c.closePath(); c.fill(); c.strokeStyle = '#7a5e1a'; c.stroke();
    c.fillStyle = '#4a5f2f'; c.beginPath(); c.moveTo(-8, 4); c.lineTo(-20, 12); c.lineTo(-10, 9); c.lineTo(-17, 18); c.lineTo(-4, 11); c.closePath(); c.fill();
  },
};

const CLOUDS = [[50, 90, 18], [190, 140, 14], [120, 60, 12]];
export function draw(ctx, g, frame, skin = BASE) {
  const th = themeAt(g.score), hg = H - GROUND;
  ctx.drawImage(skyFor(th, g.score), 0, 0);
  // nuages
  ctx.fillStyle = th.cloud;
  for (let ci = 0; ci < 3; ci++) {
    const cx = CLOUDS[ci][0] - (frame * 0.2) % 340 + 340, cy = CLOUDS[ci][1], r = CLOUDS[ci][2], x = cx % 340 - 20; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.arc(x + r, cy + 4, r * 0.8, 0, 7); ctx.arc(x - r, cy + 4, r * 0.7, 0, 7); ctx.fill();
  }
  // collines
  ctx.fillStyle = th.hill;
  ctx.beginPath(); ctx.moveTo(0, hg);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hg - 40 - Math.sin((x + frame * 0.3) / 38) * 14);
  ctx.lineTo(W, hg); ctx.fill();
  if (th.ruin > 0.01) {   // ruines : tours et murs brisés qui défilent
    ctx.globalAlpha = Math.min(1, th.ruin); ctx.fillStyle = th.hell > 0.5 ? '#2a0a08' : '#2c2c30';
    for (let k = 0; k < 4; k++) {
      const bx = ((k * 120 - frame * 0.5) % 480 + 480) % 480 - 60, hh = 60 + (k * 37) % 50;
      ctx.beginPath(); ctx.moveTo(bx, hg - 30); ctx.lineTo(bx, hg - 30 - hh); ctx.lineTo(bx + 10, hg - 30 - hh + 8); ctx.lineTo(bx + 16, hg - 30 - hh - 6); ctx.lineTo(bx + 26, hg - 30 - hh + 14); ctx.lineTo(bx + 34, hg - 30 - hh + 2); ctx.lineTo(bx + 40, hg - 30); ctx.fill();
      ctx.fillStyle = th.sB; ctx.globalAlpha = 0.5 * th.ruin; ctx.fillRect(bx + 14, hg - 30 - hh * 0.6, 7, 11); ctx.fillStyle = th.hell > 0.5 ? '#2a0a08' : '#2c2c30'; ctx.globalAlpha = Math.min(1, th.ruin);
    }
    ctx.globalAlpha = 1;
  }
  // colonnes de pierre
  for (const p of g.pipes) {
    for (const [y0, y1, cap] of [[0, p.top, p.top - 16], [p.top + GAP, H - GROUND, p.top + GAP]]) {
      ctx.fillStyle = th.p1; ctx.fillRect(p.x, y0, PIPE_W, y1 - y0);
      ctx.fillStyle = th.p2; ctx.fillRect(p.x + 6, y0, 8, y1 - y0);
      ctx.fillStyle = th.p3; ctx.fillRect(p.x + PIPE_W - 10, y0, 10, y1 - y0);
      ctx.fillStyle = th.p4; ctx.fillRect(p.x - 4, cap, PIPE_W + 8, 16);
      ctx.fillStyle = th.p5; ctx.fillRect(p.x - 4, cap + (cap === p.top - 16 ? 10 : 0), PIPE_W + 8, 6);
      if (th.ruin > 0.5 && th.hell < 0.5) {   // pierre fissurée
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); const cy0 = y0 + ((p.x * 7) % 40) + 20; ctx.moveTo(p.x + 8, cy0); ctx.lineTo(p.x + 20, cy0 + 12); ctx.lineTo(p.x + 14, cy0 + 24); ctx.lineTo(p.x + 30, cy0 + 40); ctx.stroke();
      }
      if (th.hell > 0.3) {   // veines de lave
        ctx.fillStyle = `rgba(255,${100 + Math.sin(frame / 8 + p.x) * 40},20,${th.hell})`; ctx.fillRect(p.x + 18, y0, 3, y1 - y0); ctx.fillRect(p.x + 32, y0 + 10, 2, y1 - y0 - 20);
      }
    }
  }
  // sol
  ctx.fillStyle = th.gnd; ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = th.grass; ctx.fillRect(0, H - GROUND, W, 10);
  ctx.fillStyle = th.dash;
  for (let x = -((frame * SPEED) % 24); x < W; x += 24) ctx.fillRect(x, H - GROUND + 22, 12, 5);
  if (th.hell > 0.01) {   // braises qui montent
    for (let k = 0; k < 22; k++) { const ex = (k * 53 + frame * 0.3) % W, ey = H - GROUND - ((frame * (0.6 + (k % 4) * 0.25) + k * 61) % 420); ctx.fillStyle = `rgba(255,${120 + (k % 3) * 40},40,${th.hell * 0.75})`; ctx.fillRect(ex, ey, 2.4, 2.4); }
  }
  // oiseau (rond, bleu, bec rouge)
  if (g.dead && g.deathT >= GROW_F) {   // explosion : plumes
    for (const q of g.parts) {
      ctx.save(); ctx.globalAlpha = Math.max(q.life, 0); ctx.translate(q.x, q.y); ctx.rotate(q.r);
      ctx.fillStyle = [skin.body, skin.wing, skin.belly][q.c];
      ctx.beginPath(); ctx.ellipse(0, 0, q.sz, q.sz * 0.28, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = skin.wing; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-q.sz, 0); ctx.lineTo(q.sz, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.font = '800 44px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(g.score, W / 2, 70);
    return;
  }
  ctx.save(); ctx.translate(BIRD_X, g.y);
  if (g.dead) { const k = g.deathT / GROW_F; ctx.translate(Math.sin(g.deathT * 2.2) * k * 3, Math.cos(g.deathT * 2.7) * k * 2); ctx.scale(1 + k * 1.8, 1 + k * 1.8); }
  ctx.rotate(g.dead ? 0 : g.tilt);
  const spr = birdSprite(skin, frame);
  ctx.drawImage(spr, -BS / 2, -BS / 2, BS, BS);
  ctx.restore();
  // score
  ctx.textAlign = 'center'; ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(g.score, W / 2, 70);
  if (!g.started) {
    ctx.font = '700 18px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Touche pour voler', W / 2, 250);
  }
}


// Sons synthétisés (aucun fichier) : battement d'ailes, point, choc, explosion
function makeAudio() {
  let ac = null, muted = false, noise = null;
  try { muted = localStorage.getItem('coloc-mute') === '1'; } catch { /* rien */ }
  const ensure = () => {
    try {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return false; ac = new C(); }
      if (ac.state === 'suspended') ac.resume();
      return true;
    } catch { return false; }
  };
  const tone = (f0, f1, dur, type = 'sine', vol = 0.14, delay = 0) => {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const burst = (dur, vol, cutoff) => {
    if (!noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur + 0.02);
  };
  return {
    unlock: ensure,
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('coloc-mute', muted ? '1' : '0'); } catch { /* rien */ } if (!muted) ensure(); return muted; },
    play(kind) {
      if (muted || !ensure()) return;
      if (kind === 'flap') tone(340, 640, 0.09, 'triangle', 0.13);
      else if (kind === 'score') { tone(880, 880, 0.09, 'sine', 0.13); tone(1320, 1320, 0.14, 'sine', 0.12, 0.07); }
      else if (kind === 'hit') { tone(220, 70, 0.22, 'square', 0.1); burst(0.12, 0.25, 2500); }
      else if (kind === 'boom') { burst(0.5, 0.45, 1800); tone(120, 40, 0.4, 'sine', 0.25); }
    },
  };
}
const SPK_ON = gIcon('sound'), SPK_OFF = gIcon('mute');

export function mount(root, { onEnd, bird, fps, quest }) {
  const skin = { ...BASE, ...(SHOP.bird.find((b) => b.key === bird) ?? {}) };
  const snd = makeAudio();
  root.innerHTML = `<canvas class="gcanvas" width="${W}" height="${H}" aria-label="Jumpy Cardinal"></canvas>
    <div class="gend" hidden><h2>Partie terminée</h2><p class="gscore"></p><div class="gwin"></div><button class="gh-btn go" data-act="again">${gIcon('replay')}Rejouer</button><button class="gh-btn" data-gact="home">${gIcon('home')}Menu principal</button></div>
    <button class="gmute" data-act="mute" aria-label="Son">${snd.muted ? SPK_OFF : SPK_ON}</button>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false }), over = root.querySelector('.gend');
  // Compteur de performances (Réglages > Compteur FPS) : images par seconde, pires images, temps de calcul du jeu
  let hud = null, deltas = [], work = [], hudAt = 0, worstAll = 0, jankAll = 0, framesAll = 0;
  let hudTxt = [], jankAt = [], jankGaps = [];
  if (fps) hud = true;
  function perf(ts, workMs) {
    if (!hud) return;
    const d = deltas.last ? ts - deltas.last : 0;
    if (deltas.last) { deltas.push(d); work.push(workMs); framesAll++; if (d > worstAll) worstAll = d; if (d > 25) { jankAll++; if (jankAt.last) jankGaps.push(ts - jankAt.last); jankAt.last = ts; } }
    deltas.last = ts;
    if (ts - hudAt < 500) return; hudAt = ts;
    const cut = 3000; let sum = 0, i = deltas.length;
    while (i > 0 && sum < cut) sum += deltas[--i];
    const dd = deltas.slice(i), ww = work.slice(i); deltas = dd; work = ww; deltas.last = ts;
    if (!dd.length) return;
    const sorted = [...dd].sort((a, b) => a - b), med = sorted[sorted.length >> 1], worst = sorted[sorted.length - 1], jank = dd.filter((x) => x > 25).length;
    const avgW = ww.reduce((a, b) => a + b, 0) / ww.length, maxW = Math.max(...ww);
    const gs = [...jankGaps].sort((x, y) => x - y), gap = gs.length ? gs[gs.length >> 1] : 0, near500 = gs.length ? Math.round(gs.filter((x) => x > 400 && x < 600).length / gs.length * 100) : 0;
    hudTxt = [`${Math.round(1000 / (sum / dd.length))} FPS · écran ~${Math.round(1000 / med)} Hz`, `pire image ${worst.toFixed(0)} ms · >25 ms : ${jank}`, `jeu moy ${avgW.toFixed(2)} ms · max ${maxW.toFixed(1)} ms`,
      `total : ${framesAll} images, ${jankAll} saccades, pire ${worstAll.toFixed(0)} ms`, `écart médian entre saccades : ${gap.toFixed(0)} ms (${near500} % vers 500 ms)`];
  }
  let paused = false, g = createGame(), raf = 0, last = 0, frame = 0, reported = false, destroyed = false;
  let jumps = 0, sent20 = false;
  const flushJumps = () => { if (jumps > 0) { quest?.('fl_jumps', jumps); jumps = 0; } };
  const flap = () => { if (g.dead) return; if (!g.started) quest?.('fl_games'); jumps++; g.flap(); };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
  const muteBtn = root.querySelector('.gmute');
  const onDown = (e) => { snd.unlock(); e.preventDefault(); flap(); };
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'mute') { muteBtn.innerHTML = snd.toggle() ? SPK_OFF : SPK_ON; return; }
    if (a === 'again') { g = createGame(); reported = false; sent20 = false; over.hidden = true; }
  });
  function loop(ts) {
    if (destroyed) return;
    if (paused) { last = ts; raf = requestAnimationFrame(loop); return; }
    const w0 = hud ? performance.now() : 0;
    const dt = Math.min(ts - (last || ts), 50); last = ts;
    let k = dt / (1000 / 60);                          // temps réel écoulé, en images à 60 Hz
    while (k > 0.001) { const kk = Math.min(k, 1.2); g.step(kk); k -= kk; frame += kk; }   // pas de 1,2 max : les collisions restent fiables après un à-coup
    for (const x of g.sfx.splice(0)) snd.play(x);
    if (!sent20 && g.score >= 20) { sent20 = true; quest?.('fl_score', g.score); }
    if (g.dead && jumps) flushJumps();
    draw(ctx, g, frame, skin);
    if (hudTxt.length) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(4, 40, 262, 70); ctx.fillStyle = '#9dffb0'; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; hudTxt.forEach((t, i) => ctx.fillText(t, 8, 54 + i * 13)); }
    if (g.dead && !reported && g.deathT >= DEAD_F) {
      reported = true;
      over.querySelector('.gscore').textContent = `${g.score} colonne${g.score > 1 ? 's' : ''} passée${g.score > 1 ? 's' : ''}`;
      over.hidden = false;
      const gw = over.querySelector('.gwin'); gw.innerHTML = '<small>Calcul des gains…</small>';
      Promise.resolve(onEnd?.({ score: g.score })).then((r) => {
        if (destroyed) return;
        const parts = [];
        if (r?.xp > 0) parts.push(`<span class="gx">+${r.xp} XP</span>`);
        if (r?.coins > 0) parts.push(`<span class="gc">+${r.coins} colocoin${r.coins > 1 ? 's' : ''}</span>`);
        gw.innerHTML = parts.length ? parts.join('') : '<small>Aucun gain cette fois</small>';
      }).catch(() => { if (!destroyed) gw.innerHTML = '<small>Gains non enregistrés</small>'; });
    }
    perf(ts, hud ? performance.now() - w0 : 0);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return { pause() { paused = true; }, resume() { paused = false; }, destroy() { flushJumps(); destroyed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); } };
}
