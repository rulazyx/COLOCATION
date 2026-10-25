// « Le Grand Raid » : course sans fin sur la plage. Sauter par-dessus les rochers et les crabes,
// glisser sous les branches. Le score = mètres parcourus. La vitesse augmente avec la distance.
export const W = 360, H = 220, GROUND_Y = 176;
const PX_PER_M = 20;
const G = 1700, JUMP_V = -560, SLIDE_T = 0.62;
const STAND_H = 42, SLIDE_H = 18, RUN_X = 64, RUN_W = 20;

export const speedAt = (m) => Math.min(190 + m * 0.07, 400); // px/s

export function createRun(rng = Math.random) {
  const r = {
    m: 0, y: 0, vy: 0, slide: 0, dead: false, obs: [], nextIn: 320, t: 0, started: false,
    jump() { if (r.dead) return; r.started = true; if (r.y === 0 && r.slide <= 0) r.vy = JUMP_V; },
    duck() {
      if (r.dead) return; r.started = true;
      if (r.y > 0) r.vy = Math.max(r.vy, 700); // en l'air : on plonge pour glisser plus vite
      else r.slide = SLIDE_T;
    },
    step(dt) {
      r.t += dt;
      if (r.dead || !r.started) return;
      const v = speedAt(r.m);
      r.m += (v * dt) / PX_PER_M;
      if (r.y > 0 || r.vy < 0) { r.vy += G * dt; r.y -= r.vy * dt; if (r.y <= 0) { r.y = 0; r.vy = 0; if (r.slide === 0) r.slide = 0; } }
      if (r.slide > 0 && r.y === 0) r.slide -= dt; else if (r.y > 0) r.slide = 0;
      for (const o of r.obs) o.x -= v * dt;
      r.obs = r.obs.filter((o) => o.x + o.w > -10);
      r.nextIn -= v * dt;
      if (r.nextIn <= 0) {
        const kind = ['rock', 'crab', 'branch', 'rock', 'branch', 'double'][Math.floor(rng() * 6)];
        const base = { x: W + 20 };
        if (kind === 'rock') r.obs.push({ ...base, kind, w: 30, h: 26, y: 0 });
        else if (kind === 'crab') r.obs.push({ ...base, kind, w: 26, h: 16, y: 0 });
        else if (kind === 'branch') r.obs.push({ ...base, kind, w: 54, h: 34, y: 26 }); // bas de la branche à 26 px du sol
        else { r.obs.push({ ...base, kind: 'rock', w: 26, h: 22, y: 0 }); r.obs.push({ ...base, x: W + 20 + 44, kind: 'rock', w: 26, h: 30, y: 0 }); }
        // l'écart augmente avec la vitesse pour rester toujours jouable
        r.nextIn = v * 0.95 + 90 + rng() * 170 + (kind === 'double' ? 60 : 0);
      }
      const hh = r.slide > 0 ? SLIDE_H : STAND_H;
      const box = { x: RUN_X + 4, w: RUN_W - 8, y: r.y, h: hh };
      for (const o of r.obs) {
        const hitX = box.x < o.x + o.w - 3 && box.x + box.w > o.x + 3;
        const hitY = box.y < o.y + o.h - 2 && box.y + box.h > o.y + 2;
        if (hitX && hitY) { r.dead = true; break; }
      }
    },
  };
  return r;
}

function draw(ctx, r) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#5ec2f2'); sky.addColorStop(1, '#ffe9b5');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const px = r.m * PX_PER_M;
  ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(290, 46, 22, 0, 7); ctx.fill();
  // volcan lointain
  ctx.fillStyle = '#8aa6a3'; ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(60, 70); ctx.lineTo(96, 84); ctx.lineTo(150, 120); ctx.fill();
  // mer
  ctx.fillStyle = '#2aa7c9'; ctx.fillRect(0, 118, W, 30);
  ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const x = ((i * 80 - px * 0.1) % 400 + 400) % 400 - 20; ctx.beginPath(); ctx.moveTo(x, 128 + (i % 3) * 8); ctx.quadraticCurveTo(x + 10, 124 + (i % 3) * 8, x + 20, 128 + (i % 3) * 8); ctx.stroke(); }
  // cocotiers (parallaxe)
  for (let i = 0; i < 4; i++) {
    const x = ((i * 130 - px * 0.35) % 520 + 520) % 520 - 60;
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.quadraticCurveTo(x + 8, 120, x + 4, 90); ctx.stroke();
    ctx.strokeStyle = '#2f9e4f'; ctx.lineWidth = 4;
    for (const a of [-2.6, -2.0, -1.2, -0.5]) { ctx.beginPath(); ctx.moveTo(x + 4, 90); ctx.quadraticCurveTo(x + 4 + Math.cos(a) * 18, 90 + Math.sin(a) * 18 - 6, x + 4 + Math.cos(a) * 34, 90 + Math.sin(a) * 30 + 12); ctx.stroke(); }
  }
  // sable
  ctx.fillStyle = '#f2d18b'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = '#e1bb70'; ctx.fillRect(0, GROUND_Y, W, 4);
  for (let i = 0; i < 14; i++) { const x = ((i * 37 - px) % 400 + 400) % 400 - 20; ctx.fillRect(x, GROUND_Y + 12 + (i % 4) * 9, 6, 2); }
  // obstacles
  for (const o of r.obs) {
    const top = GROUND_Y - o.y - o.h;
    if (o.kind === 'rock') {
      ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.moveTo(o.x, GROUND_Y); ctx.lineTo(o.x + 4, top + 8); ctx.lineTo(o.x + o.w * 0.4, top); ctx.lineTo(o.x + o.w * 0.8, top + 5); ctx.lineTo(o.x + o.w, GROUND_Y); ctx.fill();
      ctx.fillStyle = '#9ca3af'; ctx.fillRect(o.x + 6, top + 6, 6, 3);
    } else if (o.kind === 'crab') {
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.ellipse(o.x + 13, GROUND_Y - 7, 12, 7, 0, 0, 7); ctx.fill();
      ctx.fillRect(o.x - 2, GROUND_Y - 17, 5, 8); ctx.fillRect(o.x + 23, GROUND_Y - 17, 5, 8);
      ctx.fillStyle = '#111'; ctx.fillRect(o.x + 8, GROUND_Y - 12, 2, 3); ctx.fillRect(o.x + 16, GROUND_Y - 12, 2, 3);
    } else { // branche tombante
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(o.x, top + 4); ctx.lineTo(o.x + o.w, top + 10); ctx.stroke();
      ctx.strokeStyle = '#2f9e4f'; ctx.lineWidth = 4;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(o.x + 8 + k * 12, top + 6); ctx.lineTo(o.x + 4 + k * 12, top + 6 + o.h - 6); ctx.stroke(); }
    }
  }
  // coureur
  const slide = r.slide > 0 && r.y === 0, gy = GROUND_Y - r.y, cx = RUN_X + RUN_W / 2, leg = Math.sin(r.t * 18) * 8;
  ctx.lineCap = 'round';
  if (slide) {
    ctx.fillStyle = '#e0a878'; ctx.beginPath(); ctx.arc(cx + 14, gy - 14, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx - 12, gy - 8); ctx.lineTo(cx + 10, gy - 11); ctx.stroke();
    ctx.strokeStyle = '#1f2229'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 12, gy - 8); ctx.lineTo(cx - 24, gy - 3); ctx.stroke();
  } else {
    const air = r.y > 0;
    ctx.strokeStyle = '#1f2229'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, gy - 18); ctx.lineTo(cx + (air ? 9 : leg), gy - (air ? 8 : 0)); ctx.moveTo(cx, gy - 18); ctx.lineTo(cx - (air ? 6 : leg), gy - (air ? 3 : 0)); ctx.stroke();
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(cx, gy - 18); ctx.lineTo(cx + 1, gy - 32); ctx.stroke();
    ctx.strokeStyle = '#e0a878'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, gy - 30); ctx.lineTo(cx + 8 + (air ? 4 : -leg / 2), gy - 22 + (air ? -8 : 0)); ctx.stroke();
    ctx.fillStyle = '#e0a878'; ctx.beginPath(); ctx.arc(cx + 2, gy - 38, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.fillRect(cx - 4, gy - 45, 13, 4);
  }
  ctx.textAlign = 'right'; ctx.font = '800 22px system-ui, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = '#0005';
  const label = `${Math.floor(r.m)} m`; ctx.fillStyle = '#fff'; ctx.fillText(label, W - 12, 28);
  if (!r.started) { ctx.textAlign = 'center'; ctx.font = '700 15px system-ui, sans-serif'; ctx.fillText('⬆ saute · ⬇ glisse', W / 2, 90); }
}

export function mount(root, { onEnd }) {
  root.innerHTML = `<canvas class="gcanvas wide" width="${W}" height="${H}" aria-label="Le Grand Raid"></canvas>
    <div class="gpad"><button class="gbtn" data-act="jump">⬆ Sauter</button><button class="gbtn" data-act="duck">⬇ Glisser</button></div>
    <div class="gover" hidden><h2>Arrêt…</h2><p class="gscore"></p><button class="btn primary" data-act="again">Repartir</button></div>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), over = root.querySelector('.gover');
  let r = createRun(), raf = 0, last = 0, reported = false, destroyed = false, sx = 0, sy = 0;
  const onKey = (e) => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); r.jump(); }
    else if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); r.duck(); }
  };
  window.addEventListener('keydown', onKey);
  // boutons (appui immédiat) + glissé du doigt sur le dessin
  root.addEventListener('pointerdown', (e) => {
    const a = e.target.dataset?.act;
    if (a === 'jump') { e.preventDefault(); r.jump(); }
    else if (a === 'duck') { e.preventDefault(); r.duck(); }
    else if (a === 'again') { r = createRun(); reported = false; over.hidden = true; }
    else if (e.target === cv) { sx = e.clientX; sy = e.clientY; }
  });
  cv.addEventListener('pointerup', (e) => {
    const dy = e.clientY - sy, dx = e.clientX - sx;
    if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) (dy < 0 ? r.jump() : r.duck());
    else r.jump();
  });
  function loop(ts) {
    if (destroyed) return;
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    r.step(dt);
    draw(ctx, r);
    if (r.dead && !reported) {
      reported = true;
      over.querySelector('.gscore').textContent = `${Math.floor(r.m)} m parcourus`;
      over.hidden = false;
      onEnd?.({ score: Math.floor(r.m) });
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return { destroy() { destroyed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); } };
}
