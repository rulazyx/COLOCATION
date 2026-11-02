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
    y: H / 2 - 40, vy: 0, pipes: [], score: 0, revived: 0, stageMax: 0, sfx: [], dead: false, exploded: false, deathT: 0, parts: [], started: false, t: 0, nextX: W + 60, tilt: 0,
    flap() { if (g.dead) return; g.started = true; g.vy = FLAP; g.sfx.push('flap'); },
    revive() {   // on repart au même score : l'oiseau revient au centre et les colonnes trop proches disparaissent
      Object.assign(g, { dead: false, exploded: false, deathT: 0, parts: [], vy: 0, y: H / 2 - 40, started: false, tilt: 0 });
      g.revived++;
      g.pipes = g.pipes.filter((p) => p.x > BIRD_X + 110);
    },
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

// Décor par paliers de score (15, 30, 50, 75, 100, 150, 200, 300 … 1000). Chaque palier rapporte des pièces (voir config.js).
const D0 = { star: 0, ruin: 0, hell: 0, dark: 0, snow: 0, bubble: 0, aurora: 0 };
const STAGES = [
  { at: 0,    sT: '#7ec8e3', sB: '#fde7b0', hill: '#9ad1a0', cloud: '#ffffffaa', p1: '#facc15', p2: '#fde68a', p3: '#ca8a04', p4: '#eab308', p5: '#a16207', gnd: '#d9b36c', grass: '#7bbf59', dash: '#c29a52' },
  { at: 15,   sT: '#f9a8c9', sB: '#fde2b8', hill: '#a8d5a2', cloud: '#ffffffcc', p1: '#f6c344', p2: '#fde68a', p3: '#c99512', p4: '#f0b62a', p5: '#a8740f', gnd: '#dcb877', grass: '#86c66a', dash: '#c49c58' },
  { at: 30,   sT: '#f6b26b', sB: '#fde9c4', hill: '#e3b778', cloud: '#fff6e6aa', p1: '#c9874a', p2: '#e0a970', p3: '#9a5f2c', p4: '#b97538', p5: '#7a4620', gnd: '#e8c27a', grass: '#d9a957', dash: '#c4964a' },
  { at: 50,   sT: '#8fb7d6', sB: '#f4c98f', hill: '#86b08a', cloud: '#fff1dcaa', p1: '#e8b923', p2: '#f3d77c', p3: '#b07a10', p4: '#d4a017', p5: '#8a5a12', gnd: '#c9a35e', grass: '#6aa84f', dash: '#b08a48', dark: 0.12 },
  { at: 75,   sT: '#f2a65a', sB: '#fbd9a5', hill: '#c8642d', cloud: '#fff1e0aa', p1: '#8b5a2b', p2: '#a87443', p3: '#5e3a18', p4: '#7a4b22', p5: '#4a2d12', gnd: '#9c6b3c', grass: '#d9782d', dash: '#7d5430', dark: 0.05 },
  { at: 100,  sT: '#3d3a7c', sB: '#d77a6a', hill: '#4c6670', cloud: '#c9a0b8aa', p1: '#c99a2c', p2: '#e0bd6a', p3: '#8a5e14', p4: '#a67c1f', p5: '#6b4510', gnd: '#8a7248', grass: '#4d8a47', dash: '#78603a', star: 0.45, dark: 0.3 },
  { at: 150,  sT: '#070b24', sB: '#1d2c5e', hill: '#16303a', cloud: '#3a4a7a88', p1: '#8c7a3a', p2: '#b4a15c', p3: '#5a4a1c', p4: '#6e5e28', p5: '#41350f', gnd: '#4a4030', grass: '#2f5a3a', dash: '#3e3526', star: 1, dark: 0.5 },
  { at: 200,  sT: '#9ec9e8', sB: '#eef7fd', hill: '#dbeaf5', cloud: '#ffffffcc', p1: '#a8d8f0', p2: '#e3f4fc', p3: '#6fb2d6', p4: '#c3e6f7', p5: '#4f93ba', gnd: '#f4f9fc', grass: '#ffffff', dash: '#c9dfeb', snow: 1 },
  { at: 300,  sT: '#04101f', sB: '#0e3b4a', hill: '#0d2a33', cloud: '#2a5a6a66', p1: '#5d7f8c', p2: '#86a8b4', p3: '#3b5560', p4: '#4c6c78', p5: '#2a3f48', gnd: '#dfe9ee', grass: '#f5fbff', dash: '#b8c8d0', star: 1, snow: 0.5, aurora: 1, dark: 0.2 },
  { at: 400,  sT: '#46464c', sB: '#7a736c', hill: '#3b3b3e', cloud: '#55555a99', p1: '#8b8b86', p2: '#aaa9a2', p3: '#5f5f5b', p4: '#74746f', p5: '#454542', gnd: '#5a5248', grass: '#4d5a36', dash: '#463f36', ruin: 1, dark: 0.35 },
  { at: 500,  sT: '#2a0505', sB: '#d2480e', hill: '#4a0f0a', cloud: '#5a1a1099', p1: '#3a1a1a', p2: '#6a2c20', p3: '#1d0a0a', p4: '#4a2018', p5: '#ff5a1f', gnd: '#2a1210', grass: '#ff6a1a', dash: '#6a1d0c', ruin: 0.3, hell: 1, dark: 0.25 },
  { at: 600,  sT: '#04324a', sB: '#0b6e7a', hill: '#0a4a50', cloud: '#7fd6e022', p1: '#2f7f73', p2: '#4fa596', p3: '#1d5a50', p4: '#3a8f80', p5: '#164a42', gnd: '#c9b48a', grass: '#2f8a6a', dash: '#a8946c', bubble: 1, dark: 0.15 },
  { at: 700,  sT: '#ffb3d9', sB: '#c8f0ff', hill: '#ffd1e8', cloud: '#ffffffdd', p1: '#ff7eb6', p2: '#ffffff', p3: '#e0559a', p4: '#ff9ccb', p5: '#c43d80', gnd: '#ffe0a3', grass: '#9be7c4', dash: '#f7c66e' },
  { at: 800,  sT: '#0b0221', sB: '#3a0a5e', hill: '#1d0838', cloud: '#ff2fd022', p1: '#1b1036', p2: '#00f0ff', p3: '#100822', p4: '#ff2fd0', p5: '#00f0ff', gnd: '#14092a', grass: '#ff2fd0', dash: '#00f0ff', star: 0.6 },
  { at: 900,  sT: '#000005', sB: '#0a0a2a', hill: '#1a1a2e', cloud: '#5050a033', p1: '#6b6b78', p2: '#9a9aa8', p3: '#45454f', p4: '#7d7d8a', p5: '#33333b', gnd: '#4a4a55', grass: '#7a7a88', dash: '#33333b', star: 1 },
  { at: 1000, sT: '#ffe9a8', sB: '#fffaf0', hill: '#fff3cc', cloud: '#ffffffee', p1: '#f5c542', p2: '#fff1b8', p3: '#c99a1c', p4: '#ffd75e', p5: '#a87b10', gnd: '#fff6d6', grass: '#ffe27a', dash: '#f0cf6a' },
].map((s) => ({ ...D0, ...s }));
export const STAGE_AT = STAGES.map((s) => s.at);
export const stageOf = (score) => { let j = 0; while (j + 1 < STAGES.length && score >= STAGES[j + 1].at) j++; return j; };
const hex2 = (h) => { const v = parseInt(h.slice(1, 7), 16), a = h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255; return [v >> 16 & 255, v >> 8 & 255, v & 255, a]; };
const mixC = (a, b, f) => { const x = hex2(a), y = hex2(b); return `rgba(${Math.round(x[0] + (y[0] - x[0]) * f)},${Math.round(x[1] + (y[1] - x[1]) * f)},${Math.round(x[2] + (y[2] - x[2]) * f)},${((x[3] + (y[3] - x[3]) * f) / 255).toFixed(3)})`; };
let thMemo = { k: -1, v: null };
export function themeAt(score) {   // transition douce pendant les 10 colonnes qui précèdent chaque palier (mémorisé : calculé une fois par colonne)
  if (thMemo.k === score) return thMemo.v;
  const win = (i) => Math.min(10, Math.floor((STAGES[i].at - STAGES[i - 1].at) / 2));   // transition pendant les colonnes qui précèdent le palier
  let j = 0; for (let i = 1; i < STAGES.length; i++) if (score >= STAGES[i].at - win(i)) j = i;
  const B = STAGES[j], A = STAGES[Math.max(0, j - 1)], f = j === 0 ? 1 : Math.min(1, Math.max(0, (score - (B.at - win(j))) / win(j))), th = {};
  for (const k of Object.keys(B)) th[k] = k === 'at' ? B.at : typeof B[k] === 'string' ? mixC(A[k], B[k], f) : A[k] + (B[k] - A[k]) * f;
  for (const k of ['hill', 'cloud', 'p1', 'p2', 'p3', 'p4', 'p5', 'gnd', 'grass', 'dash']) if (th.dark > 0.01) th[k] = mixC(rgbaToHex(th[k]), '#000014', th.dark * 0.45);   // la nuit assombrit tout, sans calque plein écran
  thMemo = { k: score, v: th };
  return th;
}
const rgbaToHex = (c) => { if (c[0] === '#') return c; const m = c.match(/[\d.]+/g).map(Number); return '#' + [m[0], m[1], m[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + Math.round((m[3] ?? 1) * 255).toString(16).padStart(2, '0'); };

// Ciel (dégradé, étoiles, lune, lueur de lave) : dessiné une seule fois par colonne dans un calque, puis recopié à chaque image
let skyMemo = { k: '', cv: null };
// Résolution : le jeu est pensé en 288×480, mais tout est dessiné à la taille réelle de l'écran (pixels du téléphone) pour rester net
let RES = 1;
export const FONT = "'Lilita One', 'Chalkboard SE', 'Arial Rounded MT Bold', system-ui, sans-serif";
function skyFor(th, score) {
  const key = `${score}@${RES}`;
  if (skyMemo.k === key) return skyMemo.cv;
  const cv = skyMemo.cv ?? document.createElement('canvas'); cv.width = Math.round(W * RES); cv.height = Math.round(H * RES);
  const c = cv.getContext('2d'), hg = H - GROUND; c.setTransform(RES, 0, 0, RES, 0, 0);
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, th.sT); gr.addColorStop(1, th.sB); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  if (th.star > 0.01) {
    c.fillStyle = '#fff'; for (let k = 0; k < 40; k++) { c.globalAlpha = th.star * (0.5 + 0.5 * ((k * 7) % 5) / 4); c.fillRect((k * 83) % W, (k * 47) % 330, k % 3 ? 1.6 : 2.6, k % 3 ? 1.6 : 2.6); } c.globalAlpha = 1;
    c.fillStyle = `rgba(250,246,225,${th.star})`; c.beginPath(); c.arc(236, 86, 18, 0, 7); c.fill(); c.fillStyle = `rgba(7,11,36,${th.star * 0.35})`; c.beginPath(); c.arc(243, 81, 15, 0, 7); c.fill();
  }
  if (th.aurora > 0.01) {   // aurore boréale : voiles verts et violets
    for (const [y, col] of [[70, '61,255,170'], [110, '140,90,255'], [150, '61,220,255']]) {
      const ag = c.createLinearGradient(0, y - 40, 0, y + 40); ag.addColorStop(0, `rgba(${col},0)`); ag.addColorStop(0.5, `rgba(${col},${0.35 * th.aurora})`); ag.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = ag; c.beginPath(); c.moveTo(0, y - 30); for (let x = 0; x <= W; x += 12) c.lineTo(x, y - 30 + Math.sin(x / 40 + y) * 18); for (let x = W; x >= 0; x -= 12) c.lineTo(x, y + 30 + Math.sin(x / 35 + y) * 14); c.fill();
    }
  }
  if (th.hell > 0.01) { const lg = c.createLinearGradient(0, hg - 160, 0, hg); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, `rgba(255,110,30,${0.55 * th.hell})`); c.fillStyle = lg; c.fillRect(0, hg - 160, W, 160); }
  skyMemo = { k: key, cv };
  return cv;
}

const BASE = { body: '#ef4444', belly: '#fecaca', wing: '#b91c1c' };
// L'oiseau est dessiné une seule fois (16 images : aile haut/bas × 8 phases d'accessoire) puis recopié : plus de dégradés ni d'ombres à chaque image
const BS = 60;
function birdSprite(skin, frame) {
  const wf = Math.floor(frame / 5) % 2, ph = Math.floor(frame / 6) % 8, key = wf * 8 + ph;
  const SS = Math.max(2, Math.ceil(RES));
  if (skin._ss !== SS) { skin._spr = {}; skin._ss = SS; }
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
  pirate(c) {
    c.fillStyle = '#dc2626'; c.beginPath(); c.arc(0, -6, 13, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(0, -10); c.fill();
    c.beginPath(); c.moveTo(-11, -10); c.lineTo(-20, -8); c.lineTo(-17, -3); c.closePath(); c.fill();
    c.fillStyle = '#fff'; for (const [x, y] of [[-5, -14], [2, -16], [8, -13]]) { c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill(); }
    c.strokeStyle = '#111'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-8, -12); c.lineTo(12, 0); c.stroke();
    c.fillStyle = '#111'; c.beginPath(); c.arc(6.5, -4, 4.6, 0, 7); c.fill();
  },
  astro(c) {
    c.fillStyle = 'rgba(190,225,255,.28)'; c.strokeStyle = '#e5e7eb'; c.lineWidth = 2.2; c.beginPath(); c.arc(2, -1, 19, 0, 7); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(-6, -11, 5, 2.4, -0.6, 0, 7); c.fill();
    c.fillStyle = '#9ca3af'; c.fillRect(-12, 15, 28, 5); c.fillStyle = '#ef4444'; c.fillRect(-2, 16, 4, 3);
  },
  santa(c) {
    c.fillStyle = '#dc2626'; c.beginPath(); c.moveTo(-11, -9); c.quadraticCurveTo(-4, -30, 14, -22); c.lineTo(10, -9); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.fillRect(-12, -11, 24, 5); c.beginPath(); c.arc(15, -22, 3.6, 0, 7); c.fill();
    c.beginPath(); c.moveTo(8, 5); c.quadraticCurveTo(15, 18, 4, 16); c.quadraticCurveTo(-2, 12, 8, 5); c.fill();
  },
  zombie(c, s, f) {
    c.strokeStyle = '#3f2a1d'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-10, -6); c.lineTo(-2, -10); for (const x of [-8, -5, -2.5]) { c.moveTo(x - 1.5, -10 + (x + 10) * 0.5); c.lineTo(x + 1.5, -5 + (x + 10) * 0.5); } c.stroke();
    c.fillStyle = '#f1f5f9'; c.fillRect(-13, 1, 8, 3); c.fillStyle = '#7f1d1d'; c.fillRect(-11, 1.5, 2, 2);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(6, -4, 4.6, Math.PI, 0); c.fill();
    if (f % 40 < 20) { c.fillStyle = '#84cc16'; c.beginPath(); c.arc(16, 9, 1.5, 0, 7); c.fill(); }
  },
  robot(c, s, f) {
    c.strokeStyle = '#4b5563'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -13); c.lineTo(0, -21); c.stroke();
    c.fillStyle = f % 30 < 15 ? '#22d3ee' : '#ef4444'; c.beginPath(); c.arc(0, -22, 3, 0, 7); c.fill();
    c.fillStyle = '#374151'; for (const [x, y] of [[-9, -6], [-9, 6], [-3, 11]]) { c.beginPath(); c.arc(x, y, 1.4, 0, 7); c.fill(); }
    c.fillStyle = '#22d3ee'; c.fillRect(2, -6, 9, 4);
  },
  unicorn(c) {
    c.fillStyle = '#facc15'; c.strokeStyle = '#ca8a04'; c.lineWidth = 1; c.beginPath(); c.moveTo(1, -12); c.lineTo(9, -30); c.lineTo(7, -11); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); for (const y of [-15, -20, -25]) { c.moveTo(2 + (-12 - y) * -0.2, y); c.lineTo(8 + (-12 - y) * -0.1, y + 2); } c.stroke();
    ['#f472b6', '#a78bfa', '#60a5fa'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.ellipse(-8 - i * 3, -9 + i * 4, 5, 3, -0.7, 0, 7); c.fill(); });
  },
  ghost(c, s, f) {
    c.fillStyle = s.body; c.beginPath(); c.moveTo(-14, 0); for (let i = 0; i <= 4; i++) c.lineTo(-14 - i * 3, 4 + Math.sin(f / 4 + i) * 2 + (i % 2) * 3); c.lineTo(-14, 10); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.ellipse(5, 6, 2.5, 3.2, 0, 0, 7); c.fill();
  },
  phoenix(c, s, f) {
    const flick = Math.sin(f / 3) * 2;
    [['#f97316', 9], ['#facc15', 6]].forEach(([col, k]) => { c.fillStyle = col; c.beginPath(); c.moveTo(-8, -10); c.quadraticCurveTo(-12, -18 - k - flick, -4, -14 - k); c.quadraticCurveTo(-2, -22 - k + flick, 3, -13 - k * 0.6); c.quadraticCurveTo(8, -18 - k - flick, 8, -10); c.closePath(); c.fill(); });
    c.fillStyle = '#f97316'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-26, -6 + flick); c.lineTo(-22, 2); c.lineTo(-28, 8 - flick); c.lineTo(-13, 6); c.closePath(); c.fill();
  },
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
  ctx.drawImage(skyFor(th, g.score), 0, 0, W, H);
  // nuages
  ctx.fillStyle = th.cloud;
  for (let ci = 0; ci < 3; ci++) {
    const cx = CLOUDS[ci][0] - (frame * 0.2) % 340 + 340, cy = CLOUDS[ci][1], r = CLOUDS[ci][2], x = cx % 340 - 20; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.arc(x + r, cy + 4, r * 0.8, 0, 7); ctx.arc(x - r, cy + 4, r * 0.7, 0, 7); ctx.fill();
  }
  // collines : un plan lointain plus clair, puis le plan proche
  ctx.globalAlpha = 0.45; ctx.fillStyle = th.hill;
  ctx.beginPath(); ctx.moveTo(0, hg);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hg - 72 - Math.sin((x + frame * 0.12) / 55) * 18 - Math.sin((x + frame * 0.12) / 23) * 5);
  ctx.lineTo(W, hg); ctx.fill(); ctx.globalAlpha = 1;
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
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, H - GROUND + 10, W, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, H - GROUND, W, 2);
  ctx.fillStyle = th.dash;
  for (let x = -((frame * SPEED) % 24); x < W; x += 24) ctx.fillRect(x, H - GROUND + 22, 12, 5);
  if (th.hell > 0.01) {   // braises qui montent
    for (let k = 0; k < 22; k++) { const ex = (k * 53 + frame * 0.3) % W, ey = H - GROUND - ((frame * (0.6 + (k % 4) * 0.25) + k * 61) % 420); ctx.fillStyle = `rgba(255,${120 + (k % 3) * 40},40,${th.hell * 0.75})`; ctx.fillRect(ex, ey, 2.4, 2.4); }
  }
  if (th.snow > 0.01) {   // flocons
    ctx.fillStyle = `rgba(255,255,255,${0.85 * th.snow})`;
    for (let k = 0; k < 36; k++) { const sx = ((k * 61 + Math.sin(frame / 30 + k) * 14 - frame * 0.4) % W + W) % W, sy = (k * 97 + frame * (0.8 + (k % 3) * 0.3)) % (H - GROUND); ctx.beginPath(); ctx.arc(sx, sy, 1.2 + (k % 3), 0, 7); ctx.fill(); }
  }
  if (th.bubble > 0.01) {   // bulles
    ctx.strokeStyle = `rgba(200,250,255,${0.6 * th.bubble})`; ctx.lineWidth = 1.2;
    for (let k = 0; k < 18; k++) { const bx = (k * 71 + Math.sin(frame / 20 + k) * 8) % W, by = H - GROUND - ((frame * (0.6 + (k % 4) * 0.2) + k * 53) % (H - GROUND)); ctx.beginPath(); ctx.arc(bx, by, 2 + (k % 4) * 1.5, 0, 7); ctx.stroke(); }
  }
  // oiseau
  if (g.dead && g.deathT >= GROW_F) {   // explosion : plumes
    for (const q of g.parts) {
      ctx.save(); ctx.globalAlpha = Math.max(q.life, 0); ctx.translate(q.x, q.y); ctx.rotate(q.r);
      ctx.fillStyle = [skin.body, skin.wing, skin.belly][q.c];
      ctx.beginPath(); ctx.ellipse(0, 0, q.sz, q.sz * 0.28, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = skin.wing; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-q.sz, 0); ctx.lineTo(q.sz, 0); ctx.stroke();
      ctx.restore();
    }
    scoreText(ctx, g.score);
    return;
  }
  if (g.menu) return;
  ctx.save(); ctx.translate(BIRD_X, g.y);
  if (g.dead) { const k = g.deathT / GROW_F; ctx.translate(Math.sin(g.deathT * 2.2) * k * 3, Math.cos(g.deathT * 2.7) * k * 2); ctx.scale(1 + k * 1.8, 1 + k * 1.8); }
  ctx.rotate(g.dead ? 0 : g.tilt);
  const spr = birdSprite(skin, frame);
  ctx.drawImage(spr, -BS / 2, -BS / 2, BS, BS);
  ctx.restore();
  // score
  scoreText(ctx, g.score);
  if (!g.started) {
    ctx.save(); ctx.textAlign = 'center'; ctx.font = `24px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,40,80,.3)'; ctx.shadowOffsetY = 2; ctx.globalAlpha = 0.75 + Math.sin(frame / 12) * 0.25;
    ctx.fillText(g.revived && g.score ? 'Touche pour repartir' : 'Touche pour voler', W / 2, 262); ctx.restore();
  }
}

// Score : grande police cartoon, petite ombre portée pour rester lisible sur tous les décors, et un rebond à chaque point
let popAt = -1, popScore = 0;
function scoreText(ctx, score) {
  const now = performance.now();
  if (score !== popScore) { if (score > popScore) popAt = now; popScore = score; }
  const k = Math.max(0, 1 - (now - popAt) / 220), sc = 1 + 0.28 * k * k;
  ctx.save(); ctx.translate(W / 2, 62); ctx.scale(sc, sc);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `60px ${FONT}`;
  ctx.fillStyle = 'rgba(0,30,60,.28)'; ctx.fillText(score, 0, 4);
  ctx.fillStyle = '#fff'; ctx.fillText(score, 0, 0);
  ctx.restore();
}


// Sons synthétisés (aucun fichier) : battement d'ailes, point, choc, explosion
function makeAudio() {
  let ac = null, muted = false, noise = null;
  try { muted = localStorage.getItem('jc-mute') === '1'; } catch { /* rien */ }
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
    toggle() { muted = !muted; try { localStorage.setItem('jc-mute', muted ? '1' : '0'); } catch { /* rien */ } if (!muted) ensure(); return muted; },
    play(kind) {
      if (muted || !ensure()) return;
      if (kind === 'flap') tone(340, 640, 0.09, 'triangle', 0.13);
      else if (kind === 'score') { tone(880, 880, 0.09, 'sine', 0.13); tone(1320, 1320, 0.14, 'sine', 0.12, 0.07); }
      else if (kind === 'hit') { tone(220, 70, 0.22, 'square', 0.1); burst(0.12, 0.25, 2500); }
      else if (kind === 'stage') { [660, 880, 1100, 1320].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.12, i * 0.08)); }
      else if (kind === 'boom') { burst(0.5, 0.45, 1800); tone(120, 40, 0.4, 'sine', 0.25); }
    },
  };
}
const SPK_ON = gIcon('sound'), SPK_OFF = gIcon('mute');

// Monte le jeu dans root. L'appli (app.js) gère les menus : onStage(palier) à chaque nouveau décor, onOver({ score, revived }) à la fin de l'animation de mort.
export function mount(root, { bird, onStage, onOver, onFlap, onSky }) {
  let skin = { ...BASE, ...(SHOP.bird.find((b) => b.key === bird) ?? {}) };
  const snd = makeAudio();
  root.innerHTML = `<canvas class="gcanvas" width="${W}" height="${H}" aria-label="Cardinal"></canvas>
    <button class="gmute" data-act="mute" aria-label="Son">${snd.muted ? SPK_OFF : SPK_ON}</button>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false }), muteBtn = root.querySelector('.gmute');
  function fit() {   // nombre de pixels réels par unité de jeu (plafonné à ~4 millions de pixels pour garder 60 images/s)
    const r = cv.getBoundingClientRect(), cover = getComputedStyle(cv).objectFit === 'cover';
    const k = (cover ? Math.max : Math.min)(r.width / W, r.height / H) * (window.devicePixelRatio || 1);
    RES = Math.min(Math.sqrt(4e6 / (W * H)), Math.max(1, Math.round(k * 4) / 4)) || 1;
    cv.width = Math.round(W * RES); cv.height = Math.round(H * RES);
    ctx.setTransform(RES, 0, 0, RES, 0, 0); ctx.imageSmoothingQuality = 'high';
  }
  fit();
  window.addEventListener('resize', fit);
  document.fonts?.load(`60px ${FONT}`);
  let skyTop = '', menu = false, paused = false, g = createGame(), raf = 0, last = 0, frame = 0, reported = false, destroyed = false;
  const flap = () => { if (paused || g.dead || onFlap?.() === false) return; g.flap(); };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
  const onDown = (e) => { snd.unlock(); e.preventDefault(); flap(); };
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  muteBtn.addEventListener('click', () => { muteBtn.innerHTML = snd.toggle() ? SPK_OFF : SPK_ON; });
  function loop(ts) {
    if (destroyed) return;
    if (paused) { last = ts; raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(ts - (last || ts), 50); last = ts;
    let k = dt / (1000 / 60);                          // temps réel écoulé, en images à 60 Hz
    while (k > 0.001) { const kk = Math.min(k, 1.2); g.step(kk); k -= kk; frame += kk; }   // pas de 1,2 max : les collisions restent fiables après un à-coup
    for (const x of g.sfx.splice(0)) snd.play(x);
    const st = stageOf(g.score);
    if (st > g.stageMax) { g.stageMax = st; snd.play('stage'); onStage?.(st); }
    g.menu = menu; draw(ctx, g, frame, skin);
    const top = themeAt(g.score).sT; if (top !== skyTop) { skyTop = top; onSky?.(top); }   // couleur du haut du ciel, pour la barre d'état du téléphone
    if (g.dead && !reported && g.deathT >= DEAD_F) { reported = true; onOver?.({ score: g.score, revived: g.revived }); }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return {
    get score() { return g.score; },
    pause() { paused = true; }, resume() { paused = false; },
    revive() { g.revive(); reported = false; },
    restart() { g = createGame(); reported = false; },
    menu(on) { menu = on; },   // derrière le menu : décor seul, sans oiseau ni score
    get muted() { return snd.muted; },
    toggleMute() { const m = snd.toggle(); muteBtn.innerHTML = m ? SPK_OFF : SPK_ON; return m; },
    setBird(key) { skin = { ...BASE, ...(SHOP.bird.find((b) => b.key === key) ?? {}) }; },
    destroy() { destroyed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', fit); },
  };
}

// Aperçu d'un oiseau (menu, boîte mystère) : même dessin que dans le jeu, en image
export function birdPreview(key, px = 120) {
  const skin = { ...BASE, ...(SHOP.bird.find((b) => b.key === key) ?? {}) };
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const c = cv.getContext('2d'); c.scale(px / 50, px / 50); c.translate(25, 25);
  paintBird(c, 0, skin);
  return cv.toDataURL();
}
