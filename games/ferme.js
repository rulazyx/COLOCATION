// « Colo-Ferme » v2 : une île à faire grandir, dessinée en canvas (aucun emoji). On glisse le doigt pour se déplacer dans la ferme.
// Monnaie du jeu : la canne à sucre. Les bâtiments rapportent des colocoins. Règles et données : ../farmlogic.js
import { FA, BUILDINGS, DECORS, newFarm, normalize, isLand, isSand, isCleared, isTree, onHouse, bldAt, decorAt, free, canPlace, frontier, growMs, yieldN, plotState, cycleMs, bldCycles, bldCoins, summary, dist } from '../farmlogic.js';
import { COIN_SVG } from '../shopart.js';

const T = FA.T, TAU = Math.PI * 2;
const CANE_ICON = (s = 16) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" style="vertical-align:-3px"><path d="M6 19V4M10 19V1M14 19V5" stroke="#5aa832" stroke-width="2.6" stroke-linecap="round"/><path d="M6 8h0M10 6h0M14 10h0" stroke="#2f6f18" stroke-width="2.6" stroke-linecap="round"/><path d="M10 3c3-2 5-2 8 0M6 6C4 4 2 4 0 5" stroke="#3f9f3c" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const fmtT = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

export function mount(root, ctx) {
  root.classList.add('fm-root');
  root.innerHTML = `<canvas class="fm-cv"></canvas><div class="fm-top"><span class="fm-cane"></span><div class="fm-visit"></div></div><div class="fm-bar"></div><div class="fm-sheet" hidden></div>`;
  const cv = root.querySelector('canvas'), c = cv.getContext('2d', { alpha: false }), $cane = root.querySelector('.fm-cane'), $bar = root.querySelector('.fm-bar'), $sheet = root.querySelector('.fm-sheet'), $visit = root.querySelector('.fm-visit');
  let W = 360, H = 640, raf = 0, destroyed = false, paused = false;
  let mine = normalize(null), shown = mine, owner = ctx.meId, others = {}, mode = null, loaded = false;
  const cam = { x: 0, y: 0, vx: 0, vy: 0 }, parts = [], hens = [];
  let dirty = false, saveT = 0;

  const fit = () => { const r = root.getBoundingClientRect(), k = Math.min(devicePixelRatio || 1, 2); W = Math.max(200, r.width); H = Math.max(200, r.height); cv.style.width = `${W}px`; cv.style.height = `${H}px`; cv.width = W * k; cv.height = H * k; c.setTransform(k, 0, 0, k, 0, 0); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(root); fit();
  const clamp = () => { cam.x = Math.max(-60, Math.min(FA.N * T - W + 60, cam.x)); cam.y = Math.max(-60, Math.min(FA.N * T - H + 60, cam.y)); };
  const center = (tx, ty) => { cam.x = tx * T - W / 2; cam.y = ty * T - H / 2; clamp(); };
  const touch = () => { dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 1500); };
  async function flush() { clearTimeout(saveT); if (!dirty) return; dirty = false; try { await ctx.save(mine); } catch (e) { dirty = true; console.warn(e); } }
  const say = (x, y, txt, col = '#fff6b0') => parts.push({ k: 't', x, y, vy: -0.8, life: 0, max: 60, txt, col });
  const puff = (x, y, col, n = 8) => { for (let i = 0; i < n; i++) parts.push({ k: 'p', x, y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2.2, life: 0, max: 30 + Math.random() * 14, col }); };

  /* ---------- Interface ---------- */
  function drawUI() {
    const own = shown === mine;
    $cane.innerHTML = `${CANE_ICON(20)}<b>${mine.cane}</b>`;
    const ps = (ctx.players?.() ?? []);
    $visit.innerHTML = ps.map((m) => `<button class="fv ${m.id === owner ? 'on' : ''}" data-fm="visit" data-id="${m.id}" aria-label="Ferme de ${ctx.esc(m.name)}">${ctx.avatar(m, 28)}</button>`).join('');
    const s = summary(mine);
    $bar.innerHTML = own ? `${mode ? `<button class="fm-b hot" data-fm="cancel">Terminer le placement</button>` : `
      <button class="fm-b" data-fm="menu" data-t="build"><i>${'+'}</i>Construire</button><button class="fm-b" data-fm="menu" data-t="decor">Décors</button><button class="fm-b" data-fm="menu" data-t="house">Maison</button>
      ${s.plots ? `<button class="fm-b hot" data-fm="all">Tout récolter (${s.plots})</button>` : ''}`}`
      : `<button class="fm-b hot" data-fm="visit" data-id="${ctx.meId}">Retour à ma ferme</button><span class="fm-own">Île de ${ctx.esc(ctx.nameOf(owner))}</span>`;
  }
  const closeSheet = () => { $sheet.hidden = true; $sheet.innerHTML = ''; };
  const openSheet = (html) => { $sheet.innerHTML = `<div class="fm-card"><button class="fm-x" data-fm="close" aria-label="Fermer">✕</button>${html}</div>`; $sheet.hidden = false; };
  const price = (n, ok = mine.cane >= n) => `<span class="fm-price ${ok ? '' : 'no'}">${CANE_ICON(14)} ${n}</span>`;
  function menuHTML(t) {
    if (t === 'build') return `<h3>Construire</h3><p class="fm-sub">Les bâtiments rapportent des colocoins. Ils coûtent de la canne à sucre.</p>` + Object.entries(BUILDINGS).map(([k, B]) => {
      const n = mine.blds.filter((b) => b.k === k).length;
      return `<button class="fm-row" data-fm="place" data-k="${k}" ${mine.cane >= B.cost ? '' : 'disabled'}><span class="fm-ico">${buildIcon(k)}</span><span><b>${B.name}</b><small>${B.text}${n ? ` · ${n} construit${n > 1 ? 's' : ''}` : ''}</small></span>${price(B.cost)}</button>`;
    }).join('');
    if (t === 'decor') return `<h3>Décors</h3><p class="fm-sub">Pose-les où tu veux sur ton terrain.</p><div class="fm-grid">` + Object.entries(DECORS).map(([k, D]) => `<button class="fm-dec" data-fm="placed" data-k="${k}" ${mine.cane >= D.cost ? '' : 'disabled'}><span class="fm-ico">${decorIcon(k)}</span><b>${D.name}</b>${price(D.cost)}</button>`).join('') + '</div>';
    const hu = FA.houseUp[mine.house], tu = FA.toolsUp[mine.tools];
    return `<h3>Ma maison</h3><p class="fm-sub">Niveau ${mine.house} · tes bâtiments rapportent +${Math.round(FA.houseBonus * 100 * (mine.house - 1))} %</p>
      ${hu ? `<button class="fm-row" data-fm="upHouse" ${mine.cane >= hu ? '' : 'disabled'}><span><b>Améliorer la maison (niveau ${mine.house + 1})</b><small>+${Math.round(FA.houseBonus * 100)} % de colocoins sur tous les bâtiments</small></span>${price(hu)}</button>` : '<div class="fm-max">Maison au niveau maximum</div>'}
      <p class="fm-sub" style="margin-top:12px">Outils niveau ${mine.tools} · pousse ${Math.round(FA.toolGrow * 100 * (mine.tools - 1))} % plus vite, +${mine.tools - 1} canne par récolte</p>
      ${tu ? `<button class="fm-row" data-fm="upTools" ${mine.cane >= tu ? '' : 'disabled'}><span><b>Améliorer les outils (niveau ${mine.tools + 1})</b><small>Pousse −${Math.round(FA.toolGrow * 100)} % de temps · +1 canne par récolte</small></span>${price(tu)}</button>` : '<div class="fm-max">Outils au niveau maximum</div>'}
      <div class="fm-stats"><span><b>${mine.st.harvests}</b> récoltes</span><span><b>${mine.st.trees}</b> arbres coupés</span><span><b>${mine.st.cash}</b> colocoins gagnés</span></div>`;
  }
  function bldHTML(b) {
    const B = BUILDINGS[b.k], n = bldCycles(b), coins = bldCoins(mine, b), up = B.up[b.lvl - 1], next = cycleMs(b) - ((Date.now() - b.t) % cycleMs(b));
    return `<h3>${B.name} · niveau ${b.lvl}</h3><p class="fm-sub">${B.text}</p>
      <button class="fm-row ${coins ? 'gold' : ''}" data-fm="collect" data-i="${mine.blds.indexOf(b)}" ${coins ? '' : 'disabled'}><span><b>${coins ? `Récolter ${coins} colocoins` : 'Rien à récolter'}</b><small>${n >= FA.maxStore ? 'Stock plein' : `Prochaine production dans ${fmtT(next)}`}</small></span><span class="fm-price">${COIN_SVG}</span></button>
      ${up ? `<button class="fm-row" data-fm="upBld" data-i="${mine.blds.indexOf(b)}" ${mine.cane >= up ? '' : 'disabled'}><span><b>Améliorer (niveau ${b.lvl + 1})</b><small>${B.coins[b.lvl - 1]} → ${B.coins[b.lvl]} colocoins par cycle</small></span>${price(up)}</button>` : '<div class="fm-max">Niveau maximum</div>'}`;
  }
  const buy = (n) => { if (mine.cane < n) { ctx.toast('Pas assez de canne à sucre.'); return false; } mine.cane -= n; return true; };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fm]'); if (!b || b.disabled) return;
    const a = b.dataset.fm, k = b.dataset.k;
    if (a === 'close') return closeSheet();
    if (a === 'menu') { openSheet(menuHTML(b.dataset.t)); return; }
    if (a === 'visit') { await switchTo(Number(b.dataset.id)); return; }
    if (a === 'cancel') { mode = null; drawUI(); return; }
    if (a === 'place') { mode = { t: 'build', k }; closeSheet(); drawUI(); ctx.toast('Touche un emplacement libre sur ton terrain.'); return; }
    if (a === 'placed') { mode = { t: 'decor', k }; closeSheet(); drawUI(); ctx.toast('Touche un emplacement pour poser le décor.'); return; }
    if (a === 'all') { harvestAll(); return; }
    if (a === 'upHouse') { const n = FA.houseUp[mine.house]; if (n && buy(n)) { mine.house++; mine.st.builds++; touch(); drawUI(); openSheet(menuHTML('house')); puff(FA.house.x * T + 66, FA.house.y * T, '#ffd95a', 14); } return; }
    if (a === 'upTools') { const n = FA.toolsUp[mine.tools]; if (n && buy(n)) { mine.tools++; mine.st.builds++; touch(); drawUI(); openSheet(menuHTML('house')); } return; }
    if (a === 'upBld') { const bl = mine.blds[Number(b.dataset.i)], n = BUILDINGS[bl.k].up[bl.lvl - 1]; if (n && buy(n)) { bl.lvl++; mine.st.builds++; touch(); drawUI(); openSheet(bldHTML(bl)); puff((bl.x + 1) * T, bl.y * T, '#ffd95a', 14); } return; }
    if (a === 'collect') {
      const bl = mine.blds[Number(b.dataset.i)], n = bldCoins(mine, bl); if (!n) return;
      b.disabled = true;
      try { const got = await ctx.cash(n); bl.t = Date.now(); mine.st.cash += got; touch(); say((bl.x + 1) * T, bl.y * T - 20, `+${got}`, '#ffe14d'); puff((bl.x + 1) * T, bl.y * T, '#ffd23f', 10);
        if (got < n) ctx.toast(got ? `Plafond du jour : ${got} colocoins crédités.` : 'Plafond du jour atteint (200 colocoins).'); } catch (er) { ctx.toast(er.message || 'Impossible de récolter.'); }
      closeSheet(); drawUI(); return;
    }
    if (a === 'cut') { const [x, y] = b.dataset.t.split(',').map(Number), n = FA.treeCost(mine.st.trees); if (!isTree(mine, x, y) || !buy(n)) return; mine.cleared.push(`${x},${y}`); mine.st.trees++; touch(); closeSheet(); drawUI(); puff(x * T + 22, y * T + 18, '#5fae3d', 16); say(x * T + 22, y * T, `-${n}`, '#ffffff'); return; }
    if (a === 'rm') { const [x, y] = b.dataset.t.split(',').map(Number), o = decorAt(mine, x, y); if (!o) return; mine.decor = mine.decor.filter((z) => z !== o); mine.cane += Math.floor(DECORS[o.k].cost / 2); touch(); closeSheet(); drawUI(); return; }
  });
  function harvestAll() {
    const now = Date.now(); let n = 0;
    for (const [kk, p] of Object.entries(mine.plots)) if (plotState(mine, p, now).ready) { const [x, y] = kk.split(',').map(Number); delete mine.plots[kk]; n += yieldN(mine); mine.st.harvests++; puff(x * T + 22, y * T + 10, '#8fd14f', 6); }
    if (n) { mine.cane += n; touch(); say(cam.x + W / 2, cam.y + H / 2, `+${n}`, '#e6ffb0'); drawUI(); }
  }
  async function switchTo(id) {
    if (id === ctx.meId) { shown = mine; owner = id; mode = null; center(FA.house.x + 1, FA.house.y + 4); drawUI(); return; }
    let d = others[id];
    if (!d) { try { const rows = await ctx.others(); rows.forEach((r) => { others[r.member_id] = normalize(r.data); }); } catch { /* rien */ } d = others[id] ?? newFarm(); others[id] = d; }
    owner = id; shown = d; mode = null; closeSheet(); center(FA.house.x + 1, FA.house.y + 4); drawUI();
  }

  /* ---------- Gestes : glisser pour se déplacer, toucher pour agir ---------- */
  let down = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); down = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, t: performance.now(), moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() }; cam.vx = cam.vy = 0; });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 8) down.moved = true;
    if (down.moved) { const now = performance.now(), dt = Math.max(1, now - down.lt); cam.vx = (down.lx - e.clientX) / dt * 16; cam.vy = (down.ly - e.clientY) / dt * 16; down.lx = e.clientX; down.ly = e.clientY; down.lt = now; cam.x = down.cx - dx; cam.y = down.cy - dy; clamp(); }
  });
  const up = (e) => {
    if (!down) return; const d = down; down = null;
    if (!d.moved && performance.now() - d.t < 500) { const r = cv.getBoundingClientRect(); tap(Math.floor((e.clientX - r.left + cam.x) / T), Math.floor((e.clientY - r.top + cam.y) / T)); cam.vx = cam.vy = 0; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { down = null; });

  function tap(x, y) {
    if (!loaded || shown !== mine || !isLand(x, y)) return;
    closeSheet();
    const wx = x * T + T / 2, wy = y * T;
    if (mode?.t === 'build') {
      if (!canPlace(mine, mode.k, x, y)) return ctx.toast('Emplacement occupé : choisis une zone dégagée.');
      const B = BUILDINGS[mode.k]; if (!buy(B.cost)) { mode = null; return drawUI(); }
      mine.blds.push({ k: mode.k, x, y, lvl: 1, t: Date.now() }); mine.st.builds++; mode = null; touch(); drawUI(); puff(x * T + T, y * T + T, '#d8c9a8', 18); return;
    }
    if (mode?.t === 'decor') {
      if (!free(mine, x, y)) return ctx.toast('Emplacement occupé.');
      const D = DECORS[mode.k]; if (!buy(D.cost)) { mode = null; return drawUI(); }
      mine.decor.push({ k: mode.k, x, y }); mine.st.decor++; touch(); drawUI(); puff(wx, y * T + T, '#ffe9a8', 8); return;
    }
    if (onHouse(x, y)) return openSheet(menuHTML('house'));
    const bl = bldAt(mine, x, y); if (bl) return openSheet(bldHTML(bl));
    const dc = decorAt(mine, x, y); if (dc) return openSheet(`<h3>${DECORS[dc.k].name}</h3><button class="fm-row" data-fm="rm" data-t="${x},${y}"><span><b>Ranger ce décor</b><small>Tu récupères ${Math.floor(DECORS[dc.k].cost / 2)} cannes</small></span></button>`);
    if (isSand(x, y)) return;
    const key = `${x},${y}`, p = mine.plots[key];
    if (p) {
      const s = plotState(mine, p);
      if (s.ready) { delete mine.plots[key]; const n = yieldN(mine); mine.cane += n; mine.st.harvests++; touch(); drawUI(); say(wx, y * T, `+${n}`, '#e6ffb0'); puff(wx, y * T + 12, '#8fd14f', 8); }
      else ctx.toast(`Pousse… encore ${fmtT(growMs(mine) * (1 - s.pct))}`);
      return;
    }
    if (isTree(mine, x, y)) {
      if (!frontier(mine, x, y)) return ctx.toast('Coupe d\'abord les arbres au bord de ton terrain.');
      const n = FA.treeCost(mine.st.trees);
      return openSheet(`<h3>Couper cet arbre</h3><p class="fm-sub">Ça agrandit ton terrain : tu pourras y planter ou construire.</p><button class="fm-row" data-fm="cut" data-t="${x},${y}" ${mine.cane >= n ? '' : 'disabled'}><span><b>Couper</b><small>Coût en canne à sucre</small></span>${price(n)}</button>`);
    }
    if (free(mine, x, y)) { mine.plots[key] = { t: Date.now() }; touch(); puff(wx, y * T + 30, '#7a4d2a', 6); }
  }

  /* ---------- Dessin ---------- */
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  function drawCane(x, y, pct, ready, t) {          // x,y = coin haut-gauche de la tuile
    c.fillStyle = '#6b4423'; rr(x + 5, y + 24, T - 10, 15, 5); c.fill(); c.fillStyle = '#82552d'; rr(x + 5, y + 24, T - 10, 6, 4); c.fill();
    const h = 8 + pct * 24, sway = Math.sin(t * 2 + x) * (1 + pct * 1.5);
    for (const [dx, hh] of [[-9, 0.82], [0, 1], [9, 0.9]]) {
      const bx = x + T / 2 + dx, top = y + 36 - h * hh;
      c.strokeStyle = ready ? '#d6c24a' : '#6cbd3a'; c.lineWidth = 4.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, y + 36); c.quadraticCurveTo(bx + sway * 0.4, (y + 36 + top) / 2, bx + sway, top); c.stroke();
      c.strokeStyle = '#2f7a1c'; c.lineWidth = 1.2; for (let k = 1; k < 4; k++) { const yy = y + 36 - (h * hh) * (k / 4); c.beginPath(); c.moveTo(bx - 2.4 + sway * k / 5, yy); c.lineTo(bx + 2.4 + sway * k / 5, yy); c.stroke(); }
      c.fillStyle = '#4fae2d'; c.beginPath(); c.moveTo(bx + sway, top); c.quadraticCurveTo(bx + sway + 12, top - 2, bx + sway + 15, top + 9); c.quadraticCurveTo(bx + sway + 5, top + 3, bx + sway, top + 3); c.fill();
      c.beginPath(); c.moveTo(bx + sway, top); c.quadraticCurveTo(bx + sway - 12, top - 3, bx + sway - 14, top + 8); c.quadraticCurveTo(bx + sway - 5, top + 3, bx + sway, top + 3); c.fill();
    }
    if (ready) { const a = 0.5 + 0.5 * Math.sin(t * 5 + x); c.fillStyle = `rgba(255,248,170,${a})`; c.beginPath(); c.arc(x + T / 2 + Math.sin(t * 3 + y) * 10, y + 8 + Math.cos(t * 4) * 3, 2.6, 0, TAU); c.fill(); }
  }
  function drawTree(x, y, t) {
    const h = hash(x, y), sw = Math.sin(t * 1.4 + h * 6) * 1.6, bx = x * T + T / 2, by = y * T + T - 6, s = 0.9 + h * 0.25;
    c.fillStyle = 'rgba(0,40,0,.22)'; c.beginPath(); c.ellipse(bx, by + 2, 17 * s, 6 * s, 0, 0, TAU); c.fill();
    c.fillStyle = '#7a4a22'; c.fillRect(bx - 4, by - 16 * s, 8, 17 * s);
    const g = h > 0.55 ? ['#2e8b3a', '#3fa84a', '#6cc56a'] : ['#2f7d32', '#3d9a40', '#68bd62'];
    for (const [dx, dy, r, col] of [[-9, -22, 14, g[0]], [9, -22, 14, g[0]], [0, -32, 17, g[1]], [-3, -38, 10, g[2]]]) { c.fillStyle = col; c.beginPath(); c.arc(bx + dx * s + sw * (-dy / 30), by + dy * s, r * s, 0, TAU); c.fill(); }
  }
  function drawBuilding(b, t) {
    const B = BUILDINGS[b.k], x = b.x * T, y = b.y * T, w = B.w * T, h = B.h * T;
    c.fillStyle = 'rgba(0,40,0,.2)'; c.beginPath(); c.ellipse(x + w / 2, y + h - 2, w / 2, 9, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y); c.lineJoin = 'round';
    if (b.k === 'poulailler') {
      c.fillStyle = '#e0a763'; rr(8, 34, w - 16, h - 40, 4); c.fill(); c.strokeStyle = '#8b5a2b'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(120,70,20,.5)'; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(8 + k * 14, 36); c.lineTo(8 + k * 14, h - 8); c.stroke(); }
      c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(0, 38); c.lineTo(w / 2, 6); c.lineTo(w, 38); c.closePath(); c.fill(); c.strokeStyle = '#7b241c'; c.stroke();
      c.fillStyle = '#4a2a0c'; rr(w / 2 - 10, h - 34, 20, 28, [10, 10, 2, 2]); c.fill();
      for (let i = 0; i < 2; i++) { const hx = 14 + i * (w - 28) + Math.sin(t * 2 + i * 3) * 4, hy = h - 6 + Math.abs(Math.sin(t * 3 + i * 2)) * -3; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hx, hy - 6, 7, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#e63946'; c.beginPath(); c.arc(hx + (i ? -5 : 5), hy - 12, 2.5, 0, TAU); c.fill(); c.fillStyle = '#f4a300'; c.fillRect(hx + (i ? -9 : 7), hy - 9, 3, 2); }
    } else if (b.k === 'brasserie') {
      c.fillStyle = '#b97a45'; rr(6, 40, w - 12, h - 46, 4); c.fill(); c.strokeStyle = '#6e4423'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(70,40,10,.35)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(6, 52 + k * 11); c.lineTo(w - 6, 52 + k * 11); c.stroke(); }
      c.fillStyle = '#5b3a1e'; c.beginPath(); c.moveTo(-2, 44); c.lineTo(w / 2, 10); c.lineTo(w + 2, 44); c.closePath(); c.fill();
      c.fillStyle = '#c87533'; c.beginPath(); c.arc(w * 0.72, 26, 11, 0, TAU); c.fill(); c.fillRect(w * 0.72 - 3, 8, 6, 10); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(w * 0.72 - 4, 23, 3, 0, TAU); c.fill();
      c.fillStyle = '#4a2a0c'; rr(w * 0.2, h - 36, 22, 30, [11, 11, 2, 2]); c.fill();
      for (let i = 0; i < 2; i++) { const bx = w * 0.5 + i * 26; c.fillStyle = '#9a6a2e'; rr(bx, h - 26, 20, 24, 6); c.fill(); c.strokeStyle = '#4a2a0c'; c.stroke(); c.fillStyle = '#d9a441'; c.fillRect(bx, h - 20, 20, 3); c.fillRect(bx, h - 10, 20, 3); }
      c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) { const p = (t * 0.5 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(w * 0.72 + Math.sin(p * 6 + k) * 5, 4 - p * 26, 4 + p * 6, 0, TAU); c.fill(); } c.globalAlpha = 1;
    } else {
      c.fillStyle = '#f3ead3'; rr(8, 36, w - 16, h - 42, 4); c.fill(); c.strokeStyle = '#a39776'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#7d8a99'; c.beginPath(); c.moveTo(0, 40); c.lineTo(w / 2, 8); c.lineTo(w, 40); c.closePath(); c.fill();
      c.fillStyle = '#9b4b3a'; c.fillRect(w - 26, 2, 12, 28); c.fillStyle = '#6e3427'; c.fillRect(w - 28, 0, 16, 5);
      c.fillStyle = '#d9a441'; rr(18, 46, 18, 16, 3); c.fill(); c.fillStyle = '#4a2a0c'; rr(w / 2 + 4, h - 34, 20, 28, [10, 10, 2, 2]); c.fill();
      c.fillStyle = '#f0e0b8'; for (let i = 0; i < 2; i++) { rr(10 + i * 20, h - 20, 18, 14, 6); c.fill(); c.strokeStyle = '#a58f5c'; c.lineWidth = 1.5; c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 3; k++) { const p = (t * 0.45 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(w - 20 + Math.sin(p * 5 + k) * 5, -2 - p * 28, 4 + p * 6, 0, TAU); c.fill(); } c.globalAlpha = 1;
    }
    c.restore();
    c.fillStyle = '#ffc928'; for (let i = 0; i < b.lvl; i++) { c.beginPath(); c.arc(x + 12 + i * 12, y + h + 4, 4.2, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 1.2; c.stroke(); }
    if (shown === mine && bldCycles(b) > 0) { const by = y - 14 + Math.sin(t * 4) * 3; c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x + w / 2, by, 12, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#9a6209'; c.font = '800 12px system-ui'; c.textAlign = 'center'; c.fillText(bldCoins(shown, b), x + w / 2, by + 4.5); }
  }
  function drawHouse(t) {
    const L = shown.house, x = FA.house.x * T, y = FA.house.y * T, w = FA.house.w * T, h = FA.house.h * T;
    c.fillStyle = 'rgba(0,40,0,.2)'; c.beginPath(); c.ellipse(x + w / 2, y + h - 2, w / 2 + 4, 10, 0, 0, TAU); c.fill();
    c.lineJoin = 'round'; c.fillStyle = L > 1 ? '#fbf1d8' : '#f2e3c0'; rr(x + 10, y + 46, w - 20, h - 52, 5); c.fill(); c.strokeStyle = '#9b7d4a'; c.lineWidth = 2.4; c.stroke();
    if (L > 1) { c.fillStyle = '#f2e3c0'; rr(x + w - 34, y + 62, 30, h - 68, 4); c.fill(); c.stroke(); }
    c.fillStyle = '#d96b2b'; c.beginPath(); c.moveTo(x - 2, y + 54); c.lineTo(x + w / 2, y + 6 - (L - 1) * 3); c.lineTo(x + w + 2, y + 54); c.closePath(); c.fill(); c.strokeStyle = '#8f3d12'; c.stroke();
    c.fillStyle = '#b4551d'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + 14 + k * 8, y + 50 - k * 2); c.lineTo(x + w - 14 - k * 8, y + 50 - k * 2); c.lineWidth = 2; c.stroke(); }
    c.fillStyle = '#7b4a22'; rr(x + w / 2 - 12, y + h - 40, 24, 34, [12, 12, 2, 2]); c.fill();
    c.fillStyle = '#bfe6f5'; for (const wx of [x + 24, x + w - 46]) { rr(wx, y + 66, 22, 20, 3); c.fill(); c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; c.stroke(); c.beginPath(); c.moveTo(wx + 11, y + 66); c.lineTo(wx + 11, y + 86); c.stroke(); }
    if (L >= 2) { c.fillStyle = '#a04a22'; c.fillRect(x + 26, y + 20, 14, 26); c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) { const p = (t * 0.4 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(x + 33 + Math.sin(p * 5 + k) * 4, y + 16 - p * 26, 4 + p * 5, 0, TAU); c.fill(); } c.globalAlpha = 1; }
    if (L >= 3) { c.strokeStyle = '#5b3a1e'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x + w - 20, y + 20); c.lineTo(x + w - 20, y - 18); c.stroke(); c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(x + w - 20, y - 18); c.lineTo(x + w - 2 + Math.sin(t * 4) * 2, y - 12); c.lineTo(x + w - 20, y - 6); c.fill(); for (let i = 0; i < 5; i++) { c.fillStyle = ['#ff6b9d', '#ffd23f', '#ff8a3d', '#c77dff', '#fff'][i]; c.beginPath(); c.arc(x + 12 + i * 12, y + h + 2, 4, 0, TAU); c.fill(); } }
  }
  function drawDecor(o, t) {
    const x = o.x * T + T / 2, y = o.y * T + T - 4;
    if (o.k === 'palmier') { c.strokeStyle = '#8a5a2b'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 18, x + 2, y - 36); c.stroke(); c.fillStyle = '#2e9e4f'; for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.55 + Math.sin(t * 1.6 + i) * 0.08; c.beginPath(); c.moveTo(x + 2, y - 36); c.quadraticCurveTo(x + 2 + Math.cos(a) * 16, y - 36 + Math.sin(a) * 16 - 6, x + 2 + Math.cos(a) * 26, y - 36 + Math.sin(a) * 18 + 10); c.quadraticCurveTo(x + 2 + Math.cos(a) * 14, y - 36 + Math.sin(a) * 12 + 2, x + 2, y - 36); c.fill(); } }
    else if (o.k === 'fleurs') { for (let i = 0; i < 6; i++) { c.fillStyle = ['#ff6b9d', '#ffd23f', '#fff', '#c77dff'][i % 4]; c.beginPath(); c.arc(x - 12 + (i % 3) * 12, y - 8 - (i > 2 ? 10 : 0) + Math.sin(t * 2 + i) * 0.8, 4, 0, TAU); c.fill(); c.fillStyle = '#3fa84a'; c.fillRect(x - 13 + (i % 3) * 12, y - 6 - (i > 2 ? 10 : 0), 2, 6); } }
    else if (o.k === 'fontaine') { c.fillStyle = '#b9c3cc'; c.beginPath(); c.ellipse(x, y - 6, 17, 8, 0, 0, TAU); c.fill(); c.fillStyle = '#6fd0f0'; c.beginPath(); c.ellipse(x, y - 8, 13, 5, 0, 0, TAU); c.fill(); c.fillStyle = '#9aa6b1'; c.fillRect(x - 3, y - 24, 6, 16); c.strokeStyle = 'rgba(160,230,255,.9)'; c.lineWidth = 2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x, y - 24); c.quadraticCurveTo(x + i * 10, y - 34 + Math.sin(t * 6 + i) * 2, x + i * 14, y - 12); c.stroke(); } }
    else if (o.k === 'lanterne') { c.fillStyle = '#4a4a52'; c.fillRect(x - 2, y - 30, 4, 30); c.fillStyle = '#ffe28a'; c.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3); c.beginPath(); c.arc(x, y - 34, 16, 0, TAU); c.fill(); c.globalAlpha = 1; c.fillStyle = '#ffd23f'; rr(x - 6, y - 42, 12, 12, 3); c.fill(); }
    else if (o.k === 'banc') { c.fillStyle = '#8b5a2b'; c.fillRect(x - 16, y - 14, 32, 6); c.fillRect(x - 16, y - 24, 32, 5); c.fillRect(x - 14, y - 10, 4, 10); c.fillRect(x + 10, y - 10, 4, 10); }
    else if (o.k === 'barriere') { c.fillStyle = '#e8d3a2'; for (let i = 0; i < 4; i++) c.fillRect(x - 17 + i * 10, y - 22, 5, 22); c.fillRect(x - 18, y - 16, 38, 4); }
    else { c.fillStyle = '#9a6a2e'; rr(x - 11, y - 26, 22, 26, 7); c.fill(); c.strokeStyle = '#4a2a0c'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#d9a441'; c.fillRect(x - 11, y - 20, 22, 3); c.fillRect(x - 11, y - 8, 22, 3); }
  }
  function render(ts) {
    if (destroyed) return; raf = requestAnimationFrame(render); if (paused) return;
    const t = ts / 1000;
    if (!down && (Math.abs(cam.vx) > 0.05 || Math.abs(cam.vy) > 0.05)) { cam.x += cam.vx; cam.y += cam.vy; cam.vx *= 0.93; cam.vy *= 0.93; clamp(); }
    // eau
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#39b8dc'); g.addColorStop(1, '#1b84ae'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2;
    for (let row = Math.floor(cam.y / 40); row < (cam.y + H) / 40 + 1; row++) { c.beginPath(); for (let sx = -8; sx <= W + 8; sx += 10) { const wx = sx + cam.x, y = row * 40 - cam.y + Math.sin(wx / 34 + t * 0.9 + row * 1.7) * 4; sx < 0 ? c.moveTo(sx, y) : c.lineTo(sx, y); } c.stroke(); }
    c.save(); c.translate(-cam.x, -cam.y);
    const x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(FA.N - 1, Math.ceil((cam.x + W) / T) + 1), y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(FA.N - 1, Math.ceil((cam.y + H) / T) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isLand(x, y)) continue;
      const px = x * T, py = y * T, sand = isSand(shown, x, y);
      // écume sur le bord de l'île
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !isLand(x + a, y + b));
      if (edge) { c.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * 2 + x + y)})`; rr(px - 4, py - 4, T + 8, T + 8, 14); c.fill(); }
      c.fillStyle = sand ? ((x + y) % 2 ? '#f3dc9b' : '#efd490') : isCleared(shown, x, y) ? ((x + y) % 2 ? '#9bd957' : '#92d150') : '#5ea63a';
      c.fillRect(px, py, T + 0.5, T + 0.5);
      if (!sand && isCleared(shown, x, y) && hash(x, y) > 0.7) { c.strokeStyle = 'rgba(40,110,20,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px + 12, py + 30); c.lineTo(px + 14, py + 24); c.moveTo(px + 16, py + 30); c.lineTo(px + 18, py + 25); c.stroke(); }
    }
    // placement : emplacements possibles en surbrillance
    if (mode && shown === mine) { c.fillStyle = 'rgba(255,255,255,.28)'; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mode.t === 'decor' ? free(mine, x, y) : canPlace(mine, mode.k, x, y)) c.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
    // objets triés par ligne (les plus bas passent devant)
    const items = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isTree(shown, x, y)) items.push({ y: y + 1, f: () => drawTree(x, y, t) });
    for (const [kk, p] of Object.entries(shown.plots)) { const [x, y] = kk.split(',').map(Number); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { const s = plotState(shown, p); items.push({ y: y + 0.9, f: () => drawCane(x * T, y * T, s.pct, s.ready, t) }); } }
    for (const o of shown.decor) items.push({ y: o.y + 1, f: () => drawDecor(o, t) });
    for (const b of shown.blds) items.push({ y: b.y + BUILDINGS[b.k].h, f: () => drawBuilding(b, t) });
    items.push({ y: FA.house.y + FA.house.h, f: () => drawHouse(t) });
    for (const h of hens) { h.x += h.v; if (h.x < h.x0 || h.x > h.x1) h.v *= -1; items.push({ y: h.y / T, f: () => { c.save(); c.translate(h.x, h.y + Math.abs(Math.sin(t * 8 + h.x)) * -2); c.scale(h.v > 0 ? 1 : -1, 1); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -6, 7, 5.5, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(6, -11, 3.6, 0, TAU); c.fill(); c.fillStyle = '#e63946'; c.fillRect(5, -16, 3, 3); c.fillStyle = '#f4a300'; c.fillRect(9, -11, 3.5, 2); c.restore(); } }); }
    items.sort((a, b) => a.y - b.y).forEach((i) => i.f());
    // particules
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life++; if (q.life > q.max) { parts.splice(i, 1); continue; }
      const a = 1 - q.life / q.max;
      if (q.k === 't') { q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); c.font = '800 18px system-ui'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(q.txt, q.x, q.y); c.fillStyle = q.col; c.fillText(q.txt, q.x, q.y); c.globalAlpha = 1; }
      else { q.vy += 0.12; q.x += q.vx; q.y += q.vy; c.globalAlpha = a; c.fillStyle = q.col; c.fillRect(q.x, q.y, 4, 4); c.globalAlpha = 1; }
    }
    c.restore();
  }

  function icons() { /* SVG du menu : voir buildIcon / decorIcon */ }
  function init() {
    // poules qui se promènent autour des poulaillers
    hens.length = 0; mine.blds.filter((b) => b.k === 'poulailler').forEach((b) => { for (let i = 0; i < 2; i++) hens.push({ x: b.x * T + 20 + i * 30, y: (b.y + 2) * T + 8, x0: b.x * T - 14, x1: (b.x + 2) * T + 14, v: 0.3 + i * 0.12 }); });
  }
  ctx.load().then((d) => { if (destroyed) return; mine = shown = normalize(d); loaded = true; init(); center(FA.house.x + 1, FA.house.y + 4); drawUI(); }).catch((e) => { ctx.toast(e.message || 'Ferme indisponible.'); });
  drawUI(); center(FA.house.x + 1, FA.house.y + 4);
  const sumTimer = setInterval(() => { if (!paused && shown === mine && !mode && $sheet.hidden) drawUI(); }, 15000);
  raf = requestAnimationFrame(render);
  const onVis = () => { if (document.hidden) flush(); }; document.addEventListener('visibilitychange', onVis);
  return { pause() { paused = true; flush(); }, resume() { paused = false; }, destroy() { destroyed = true; cancelAnimationFrame(raf); clearInterval(sumTimer); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); flush(); } };
}

// Petites icônes pour les menus (SVG)
const S = (inner, v = '0 0 40 40') => `<svg viewBox="${v}" width="40" height="40" aria-hidden="true">${inner}</svg>`;
function buildIcon(k) {
  if (k === 'poulailler') return S('<path d="M6 18L20 6l14 12z" fill="#c0392b"/><rect x="9" y="18" width="22" height="16" fill="#e0a763" stroke="#8b5a2b" stroke-width="2"/><rect x="17" y="24" width="7" height="10" rx="3" fill="#4a2a0c"/>');
  if (k === 'brasserie') return S('<path d="M4 18L20 6l16 12z" fill="#5b3a1e"/><rect x="6" y="18" width="28" height="16" fill="#b97a45" stroke="#6e4423" stroke-width="2"/><circle cx="28" cy="12" r="5" fill="#c87533"/><rect x="11" y="24" width="9" height="10" rx="2" fill="#4a2a0c"/>');
  return S('<path d="M5 19L20 8l15 11z" fill="#7d8a99"/><rect x="7" y="19" width="26" height="15" fill="#f3ead3" stroke="#a39776" stroke-width="2"/><rect x="27" y="4" width="5" height="12" fill="#9b4b3a"/><rect x="15" y="25" width="8" height="9" rx="3" fill="#4a2a0c"/>');
}
function decorIcon(k) {
  const m = { palmier: '<path d="M20 36q3-12 0-22" stroke="#8a5a2b" stroke-width="4" fill="none"/><path d="M20 14q-10-8-16 0M20 14q10-8 16 0M20 14q-6-10-10-12M20 14q6-10 10-12" stroke="#2e9e4f" stroke-width="4" fill="none" stroke-linecap="round"/>',
    fleurs: '<circle cx="12" cy="24" r="4" fill="#ff6b9d"/><circle cx="22" cy="20" r="4" fill="#ffd23f"/><circle cx="30" cy="26" r="4" fill="#c77dff"/><path d="M12 28v7M22 24v11M30 30v5" stroke="#3fa84a" stroke-width="2"/>',
    fontaine: '<ellipse cx="20" cy="30" rx="14" ry="6" fill="#b9c3cc"/><ellipse cx="20" cy="28" rx="10" ry="4" fill="#6fd0f0"/><rect x="18" y="12" width="4" height="16" fill="#9aa6b1"/><path d="M20 12q-8-4-9 8M20 12q8-4 9 8" stroke="#6fd0f0" stroke-width="2" fill="none"/>',
    lanterne: '<rect x="18" y="14" width="4" height="22" fill="#4a4a52"/><rect x="14" y="6" width="12" height="12" rx="3" fill="#ffd23f"/>',
    banc: '<rect x="6" y="20" width="28" height="5" fill="#8b5a2b"/><rect x="6" y="12" width="28" height="5" fill="#8b5a2b"/><rect x="8" y="24" width="4" height="9" fill="#8b5a2b"/><rect x="28" y="24" width="4" height="9" fill="#8b5a2b"/>',
    barriere: '<rect x="5" y="10" width="5" height="24" fill="#e8d3a2"/><rect x="14" y="10" width="5" height="24" fill="#e8d3a2"/><rect x="23" y="10" width="5" height="24" fill="#e8d3a2"/><rect x="32" y="10" width="4" height="24" fill="#e8d3a2"/><rect x="3" y="18" width="34" height="4" fill="#d6bd86"/>',
    tonneau: '<rect x="10" y="8" width="20" height="26" rx="8" fill="#9a6a2e" stroke="#4a2a0c" stroke-width="2"/><rect x="10" y="14" width="20" height="3" fill="#d9a441"/><rect x="10" y="26" width="20" height="3" fill="#d9a441"/>' };
  return S(m[k] ?? '');
}
