// « Coucou » : un oiseau rouge qui bat des ailes entre des colonnes jaunes (mécanique classique, dessin original).
// Le score = nombre de colonnes passées. Toucher l'écran / espace / ↑ = battre des ailes.
import { SHOP } from '../config.js';
export const W = 288, H = 480, GROUND = 64;
const GRAVITY = 0.42, FLAP = -6.9, MAX_FALL = 9;
const PIPE_W = 54, GAP = 128, SPEED = 2.3, SPACING = 176, BIRD_X = 78, BIRD_R = 12;

export const GROW_F = 26, DEAD_F = 100; // images : gonflement, puis fin de l'animation
// Logique pure (testable sans navigateur)
export function createGame(rng = Math.random) {
  const g = {
    y: H / 2 - 40, vy: 0, pipes: [], score: 0, dead: false, deathT: 0, parts: [], started: false, t: 0, nextX: W + 60, tilt: 0,
    flap() { if (g.dead) return; g.started = true; g.vy = FLAP; },
    step() {
      g.t++;
      if (!g.started) { g.y = H / 2 - 40 + Math.sin(g.t / 9) * 6; return; }
      if (g.dead) {   // l'oiseau gonfle sur place, puis explose en plumes
        g.deathT++;
        if (g.deathT === GROW_F) g.parts = Array.from({ length: 30 }, (_, i) => {
          const a = (i / 30) * Math.PI * 2 + rng() * 0.5, v = 2 + rng() * 5.5;
          return { x: BIRD_X, y: g.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: rng() * 6, vr: (rng() - 0.5) * 0.5, c: i % 3, life: 1, sz: 7 + rng() * 7 };
        });
        for (const q of g.parts) { q.vy += 0.16; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.r += q.vr; q.life -= 0.006; if (q.y > H - GROUND - 3) { q.y = H - GROUND - 3; q.vy = 0; q.vx *= 0.8; q.vr *= 0.8; } }
        return;
      }
      g.vy = Math.min(g.vy + GRAVITY, MAX_FALL);
      g.y += g.vy;
      g.tilt = Math.max(-0.45, Math.min(1.1, g.vy / 9));
      for (const p of g.pipes) p.x -= SPEED;
      if (!g.pipes.length || g.pipes[g.pipes.length - 1].x < W + 40 - SPACING) {
        const top = 70 + rng() * (H - GROUND - GAP - 140);
        g.pipes.push({ x: Math.max(W + 40, g.nextX), top, passed: false });
      }
      g.pipes = g.pipes.filter((p) => p.x > -PIPE_W - 4);
      for (const p of g.pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) { p.passed = true; g.score++; }
        const inX = BIRD_X + BIRD_R - 3 > p.x && BIRD_X - BIRD_R + 3 < p.x + PIPE_W;
        if (inX && (g.y - BIRD_R + 3 < p.top || g.y + BIRD_R - 3 > p.top + GAP)) g.dead = true;
      }
      if (g.y + BIRD_R >= H - GROUND) { g.y = H - GROUND - BIRD_R; g.dead = true; }
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
export function themeAt(score) {   // transition douce pendant les 10 colonnes qui précèdent chaque palier
  let j = 0; for (let i = 1; i < STAGES.length; i++) if (score >= STAGES[i].at - 10) j = i;
  if (j === 0) return STAGES[0];
  const A = STAGES[j - 1], B = STAGES[j], f = Math.min(1, Math.max(0, (score - (B.at - 10)) / 10)), th = {};
  for (const k of Object.keys(B)) th[k] = k === 'at' ? B.at : typeof B[k] === 'string' ? mixC(A[k], B[k], f) : A[k] + (B[k] - A[k]) * f;
  return th;
}

const BASE = { body: '#ef4444', belly: '#fecaca', wing: '#b91c1c' };
export function draw(ctx, g, frame, skin = BASE) {
  const th = themeAt(g.score), hg = H - GROUND;
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, th.sT); gr.addColorStop(1, th.sB); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  if (th.star > 0.01) {   // étoiles et lune
    ctx.fillStyle = `rgba(255,255,255,${th.star})`; for (let k = 0; k < 40; k++) { const sx = (k * 83) % W, sy = (k * 47) % 330, tw = 0.6 + 0.4 * Math.sin(frame / 20 + k); ctx.globalAlpha = th.star * tw; ctx.fillRect(sx, sy, k % 3 ? 1.6 : 2.6, k % 3 ? 1.6 : 2.6); } ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(250,246,225,${th.star})`; ctx.beginPath(); ctx.arc(268, 96, 20, 0, 7); ctx.fill(); ctx.fillStyle = `rgba(7,11,36,${th.star * 0.35})`; ctx.beginPath(); ctx.arc(276, 90, 17, 0, 7); ctx.fill();
  }
  if (th.hell > 0.01) {   // lueur de lave au loin
    const lg = ctx.createLinearGradient(0, hg - 160, 0, hg); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, `rgba(255,110,30,${0.55 * th.hell})`); ctx.fillStyle = lg; ctx.fillRect(0, hg - 160, W, 160);
  }
  // nuages
  ctx.fillStyle = th.cloud;
  for (const [cx, cy, r] of [[50 - (frame * 0.2) % 340 + 340, 90, 18], [190 - (frame * 0.2) % 340 + 340, 140, 14], [120 - (frame * 0.2) % 340 + 340, 60, 12]]) {
    const x = cx % 340 - 20; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.arc(x + r, cy + 4, r * 0.8, 0, 7); ctx.arc(x - r, cy + 4, r * 0.7, 0, 7); ctx.fill();
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
  if (th.dark > 0.01) { ctx.fillStyle = `rgba(0,0,20,${th.dark * (th.star > 0.9 ? 0.3 : 0.4)})`; ctx.fillRect(0, 0, W, H); }
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
  let body = skin.body;
  if (skin.rainbow) { const gr = ctx.createLinearGradient(-14, -14, 14, 14); ['#ef4444', '#facc15', '#22c55e', '#3b82f6'].forEach((c, i) => gr.addColorStop(i / 3, c)); body = gr; }
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, BIRD_R + 2, 0, 7); ctx.fill();
  ctx.fillStyle = skin.belly; ctx.beginPath(); ctx.ellipse(2, 5, 9, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = skin.wing; ctx.beginPath(); ctx.ellipse(-5, 2 + (Math.floor(frame / 5) % 2 ? -3 : 3), 7, 4.5, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = skin.eyeBg ?? '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.4, 0, 7); ctx.fill();
  if (skin.eye) { ctx.shadowColor = skin.eye; ctx.shadowBlur = 8; }
  ctx.fillStyle = skin.eye ?? '#111'; ctx.beginPath(); ctx.arc(7.4, -4, skin.eye ? 3 : 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(21, 2); ctx.lineTo(11, 6); ctx.fill();
  if (skin.acc === 'shades') { ctx.fillStyle = '#111'; ctx.fillRect(2, -8, 12, 6); ctx.fillRect(-2, -6, 5, 2); }
  if (skin.acc === 'band') { ctx.fillStyle = '#dc2626'; ctx.fillRect(-12, -10, 24, 4); ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-22, -4 + Math.sin(frame / 4) * 3); ctx.lineTo(-12, -6); ctx.fill(); }
  if (skin.acc === 'crown') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-7, -21); ctx.lineTo(-2, -16); ctx.lineTo(2, -22); ctx.lineTo(6, -16); ctx.lineTo(10, -21); ctx.lineTo(9, -11); ctx.closePath(); ctx.fill(); }
  if (skin.acc === 'knight') {
    ctx.fillStyle = '#aab3bd'; ctx.beginPath(); ctx.arc(0, -3, 13, Math.PI, 0); ctx.lineTo(13, -3); ctx.lineTo(-13, -3); ctx.fill();
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(1, -8, 12, 3.5);
    ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(-2, -15); ctx.quadraticCurveTo(-10 - Math.sin(frame / 5) * 2, -26, -16, -14 + Math.sin(frame / 4) * 2); ctx.quadraticCurveTo(-8, -17, -2, -12); ctx.fill();
  }
  if (skin.acc === 'dark') { ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-4, -22); ctx.lineTo(0, -14); ctx.lineTo(4, -22); ctx.lineTo(6, -12); ctx.fill(); }
  ctx.restore();
  // score
  ctx.textAlign = 'center'; ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(g.score, W / 2, 70);
  if (!g.started) {
    ctx.font = '700 18px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Touche pour voler', W / 2, 250);
  }
}

export function mount(root, { onEnd, bird }) {
  const skin = { ...BASE, ...(SHOP.bird.find((b) => b.key === bird) ?? {}) };
  root.innerHTML = `<canvas class="gcanvas" width="${W}" height="${H}" aria-label="Jumpy Cardinal"></canvas>
    <div class="gover" hidden><h2>Vous êtes mort</h2><p class="gscore"></p><button class="btn primary" data-act="again">Rejouer ?</button><button class="gquit" data-gact="close">Quitter</button></div>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false }), over = root.querySelector('.gover');
  let g = createGame(), raf = 0, last = 0, acc = 0, frame = 0, reported = false, destroyed = false;
  const flap = () => { if (!g.dead) g.flap(); };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
  const onDown = (e) => { e.preventDefault(); flap(); };
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target.dataset.act === 'again') { g = createGame(); reported = false; over.hidden = true; cv.classList.remove('gray'); }
  });
  function loop(ts) {
    if (destroyed) return;
    acc += Math.min(ts - (last || ts), 100); last = ts;
    while (acc >= 1000 / 60) { g.step(); acc -= 1000 / 60; frame++; }
    draw(ctx, g, frame, skin);
    if (g.dead && g.deathT >= GROW_F + 38) cv.classList.add('gray');
    if (g.dead && !reported && g.deathT >= DEAD_F) {
      reported = true;
      over.querySelector('.gscore').textContent = `${g.score} colonne${g.score > 1 ? 's' : ''} passée${g.score > 1 ? 's' : ''}`;
      over.hidden = false;
      onEnd?.({ score: g.score });
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return { destroy() { destroyed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); } };
}
