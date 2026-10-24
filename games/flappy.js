// « Coucou » : un oiseau qui bat des ailes entre des colonnes de pierre (mécanique classique, dessin original).
// Le score = nombre de colonnes passées. Toucher l'écran / espace / ↑ = battre des ailes.
export const W = 288, H = 480, GROUND = 64;
const GRAVITY = 0.42, FLAP = -6.9, MAX_FALL = 9;
const PIPE_W = 54, GAP = 128, SPEED = 2.3, SPACING = 176, BIRD_X = 78, BIRD_R = 12;

// Logique pure (testable sans navigateur)
export function createGame(rng = Math.random) {
  const g = {
    y: H / 2 - 40, vy: 0, pipes: [], score: 0, dead: false, started: false, t: 0, nextX: W + 60, tilt: 0,
    flap() { if (g.dead) return; g.started = true; g.vy = FLAP; },
    step() {
      g.t++;
      if (!g.started) { g.y = H / 2 - 40 + Math.sin(g.t / 9) * 6; return; }
      if (g.dead) { g.vy = Math.min(g.vy + GRAVITY * 1.4, MAX_FALL * 1.4); g.y = Math.min(g.y + g.vy, H - GROUND - BIRD_R); return; }
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

// Le ciel (dégradé) est dessiné une seule fois, puis recopié à chaque image : bien plus léger
let skyCache = null;
function sky() {
  if (!skyCache) {
    skyCache = document.createElement('canvas'); skyCache.width = W; skyCache.height = H;
    const c = skyCache.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#7ec8e3'); gr.addColorStop(1, '#fde7b0');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
  }
  return skyCache;
}

function draw(ctx, g, frame) {
  ctx.drawImage(sky(), 0, 0);
  // collines + nuages
  ctx.fillStyle = '#ffffffaa';
  for (const [cx, cy, r] of [[50 - (frame * 0.2) % 340 + 340, 90, 18], [190 - (frame * 0.2) % 340 + 340, 140, 14], [120 - (frame * 0.2) % 340 + 340, 60, 12]]) {
    const x = cx % 340 - 20; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.arc(x + r, cy + 4, r * 0.8, 0, 7); ctx.arc(x - r, cy + 4, r * 0.7, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#9ad1a0';
  ctx.beginPath(); ctx.moveTo(0, H - GROUND);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H - GROUND - 40 - Math.sin((x + frame * 0.3) / 38) * 14);
  ctx.lineTo(W, H - GROUND); ctx.fill();
  // colonnes de pierre
  for (const p of g.pipes) {
    for (const [y0, y1, cap] of [[0, p.top, p.top - 16], [p.top + GAP, H - GROUND, p.top + GAP]]) {
      ctx.fillStyle = '#8d8a96'; ctx.fillRect(p.x, y0, PIPE_W, y1 - y0);
      ctx.fillStyle = '#a7a4b2'; ctx.fillRect(p.x + 6, y0, 8, y1 - y0);
      ctx.fillStyle = '#6f6c79'; ctx.fillRect(p.x + PIPE_W - 10, y0, 10, y1 - y0);
      ctx.fillStyle = '#76738a'; ctx.fillRect(p.x - 4, cap, PIPE_W + 8, 16);
      ctx.fillStyle = '#5fae6b'; ctx.fillRect(p.x - 4, cap + (cap === p.top - 16 ? 10 : 0), PIPE_W + 8, 6);
    }
  }
  // sol
  ctx.fillStyle = '#d9b36c'; ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = '#7bbf59'; ctx.fillRect(0, H - GROUND, W, 10);
  ctx.fillStyle = '#c29a52';
  for (let x = -((frame * SPEED) % 24); x < W; x += 24) ctx.fillRect(x, H - GROUND + 22, 12, 5);
  // oiseau (rond, bleu, bec rouge)
  ctx.save(); ctx.translate(BIRD_X, g.y); ctx.rotate(g.tilt);
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(0, 0, BIRD_R + 2, 0, 7); ctx.fill();
  ctx.fillStyle = '#dbeafe'; ctx.beginPath(); ctx.ellipse(2, 5, 9, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.ellipse(-5, 2 + (Math.floor(frame / 5) % 2 ? -3 : 3), 7, 4.5, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.4, 0, 7); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(7.4, -4, 2, 0, 7); ctx.fill();
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(21, 2); ctx.lineTo(11, 6); ctx.fill();
  ctx.restore();
  // score
  ctx.textAlign = 'center'; ctx.font = '800 44px system-ui, sans-serif';
  ctx.lineWidth = 6; ctx.strokeStyle = '#0006'; ctx.strokeText(g.score, W / 2, 70);
  ctx.fillStyle = '#fff'; ctx.fillText(g.score, W / 2, 70);
  if (!g.started) {
    ctx.font = '700 18px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeText('Touche pour voler', W / 2, 250); ctx.fillText('Touche pour voler', W / 2, 250);
  }
}

export function mount(root, { onEnd }) {
  root.innerHTML = `<canvas class="gcanvas" width="${W}" height="${H}" aria-label="Jeu Flappy"></canvas>
    <div class="gover" hidden><h2>Perdu !</h2><p class="gscore"></p><button class="btn primary" data-act="again">Rejouer</button></div>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false }), over = root.querySelector('.gover');
  let g = createGame(), raf = 0, last = 0, acc = 0, frame = 0, reported = false, destroyed = false;
  const flap = () => { if (!g.dead) g.flap(); };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
  const onDown = (e) => { e.preventDefault(); flap(); };
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target.dataset.act === 'again') { g = createGame(); reported = false; over.hidden = true; }
  });
  function loop(ts) {
    if (destroyed) return;
    acc += Math.min(ts - (last || ts), 100); last = ts;
    while (acc >= 1000 / 60) { g.step(); acc -= 1000 / 60; frame++; }
    draw(ctx, g, frame);
    if (g.dead && !reported && g.y >= H - GROUND - BIRD_R - 0.5) {
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
