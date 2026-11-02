// Mer animée de la Course aux pièces : vagues, écume, reflets et bateaux qui tanguent (canvas, ~30 images/s)
const TAU = Math.PI * 2;
export function mountSea(cv) {
  const c = cv.getContext('2d', { alpha: false });
  let W = 0, H = 0, raf = 0, last = 0, dead = false;
  const foam = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random(), p: Math.random() * TAU }));
  const boats = [{ x: 0.12, y: 0.16, s: 1, d: 1 }, { x: 0.86, y: 0.88, s: 0.8, d: -1 }];
  const fit = () => { const r = cv.getBoundingClientRect(), k = Math.min(devicePixelRatio || 1, 2); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = W * k; cv.height = H * k; c.setTransform(k, 0, 0, k, 0, 0); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(cv); fit();
  function boat(x, y, s, t, d) {
    c.save(); c.translate(x, y + Math.sin(t * 1.3 + x) * 3); c.rotate(Math.sin(t * 1.1 + x) * 0.06); c.scale(s * d, s);
    c.fillStyle = '#6b3d17'; c.beginPath(); c.moveTo(-22, 0); c.lineTo(22, 0); c.lineTo(15, 10); c.lineTo(-15, 10); c.closePath(); c.fill();
    c.fillStyle = '#f7efe0'; c.beginPath(); c.moveTo(0, -3); c.lineTo(0, -30); c.quadraticCurveTo(16, -18, 14, -3); c.closePath(); c.fill();
    c.strokeStyle = '#4a2a0c'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -32); c.stroke();
    c.restore();
  }
  function frame(ts) {
    if (dead) return; raf = requestAnimationFrame(frame);
    if (ts - last < 33) return; last = ts; const t = ts / 1000;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3cc0e0'); g.addColorStop(0.5, '#1c93bb'); g.addColorStop(1, '#0d5f86');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // rayons de lumière
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 4; i++) { const x = ((i * 0.3 + t * 0.012) % 1.2 - 0.1) * W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 70, 0); c.lineTo(x + 170, H); c.lineTo(x + 40, H); c.closePath(); c.fill(); }
    // houles : lignes sinusoïdales qui défilent
    for (let row = 0; row < 15; row++) {
      const y0 = (row + 0.5) * H / 15, amp = 3 + (row % 3), sp = 0.5 + (row % 4) * 0.12;
      c.strokeStyle = `rgba(255,255,255,${0.07 + (row % 3) * 0.03})`; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x <= W + 8; x += 8) { const y = y0 + Math.sin(x / 38 + t * sp + row) * amp; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    // écume et scintillements
    for (const f of foam) {
      const a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 1.6 + f.p));
      const x = ((f.x + t * 0.004 * f.s) % 1) * W, y = f.y * H;
      c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.ellipse(x, y, 7 * f.s, 2 * f.s, 0, 0, TAU); c.fill();
    }
    for (const b of boats) boat(((b.x + t * 0.006 * b.d + 1) % 1) * W, b.y * H, b.s, t, b.d);
  }
  raf = requestAnimationFrame(frame);
  return () => { dead = true; cancelAnimationFrame(raf); ro?.disconnect(); };
}
