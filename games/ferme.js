// « Colo-Ferme » v3 : une île à faire grandir, dessinée en canvas (rendu en relief, aucun emoji). On glisse le doigt pour se déplacer.
// Parcelles achetées en colocoins (1, 2, 3…), canne à sucre (1 h), arbres coupés avec du temps. Règles et données : ../farmlogic.js
import { FA, BUILDINGS, DECORS, newFarm, normalize, isLand, isSand, isCleared, isTree, onHouse, bldAt, decorAt, free, isOwned, canPlace, frontier, growMs, yieldN, plotState, cycleMs, bldCycles, bldCoins, summary, chopMs } from '../farmlogic.js';

const T = FA.T, TAU = Math.PI * 2;
const CANE_ICON = (s = 16) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" style="vertical-align:-3px"><path d="M6 19V4M10 19V1M14 19V5" stroke="#5aa832" stroke-width="2.6" stroke-linecap="round"/><path d="M6 8h0M10 6h0M14 10h0" stroke="#e8f7b0" stroke-width="2" stroke-linecap="round"/></svg>`;
const COIN = (s = 18) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" style="vertical-align:-4px"><circle cx="10" cy="10" r="9" fill="#f6b91d" stroke="#9a6209" stroke-width="1.6"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#9a6209" stroke-width="1.4"/></svg>`;
const FRIENDS = (size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><circle cx="32" cy="16" r="6.5" fill="#93c5fd" stroke="#1e40af"/><path d="M21 39c0-7 5-12 11-12s11 5 11 12z" fill="#93c5fd" stroke="#1e40af"/><circle cx="17" cy="18" r="7" fill="#fca5a5" stroke="#991b1b"/><path d="M4 41c0-8 6-13 13-13s13 5 13 13z" fill="#fca5a5" stroke="#991b1b"/></svg>`;
const ICON = (inner, size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const I_BUILD = (s) => ICON('<path d="M6 24L24 9l18 15" stroke="#7a2e12" stroke-width="2.4" fill="#d96b2b"/><rect x="11" y="24" width="26" height="16" fill="#f2e3c0" stroke="#7a5a2e" stroke-width="2.4"/><rect x="21" y="29" width="7" height="11" rx="3" fill="#7b4a22"/>', s);
const I_DECOR = (s) => ICON('<path d="M24 41q3-13 0-24" stroke="#8a5a2b" stroke-width="3.4"/><path d="M24 17q-11-8-18 1M24 17q11-8 18 1M24 17q-7-11-12-13M24 17q7-11 12-13" stroke="#1f8f48" stroke-width="3.6"/><circle cx="21" cy="21" r="2.6" fill="#8a5a2b" stroke="none"/>', s);
const I_HOUSE = (s) => ICON('<path d="M4 24L24 7l20 17" stroke="#7a2e12" stroke-width="2.4" fill="#d96b2b"/><rect x="9" y="24" width="30" height="17" fill="#fbf1d8" stroke="#7a5a2e" stroke-width="2.4"/><rect x="19" y="29" width="8" height="12" rx="3" fill="#7b4a22"/><rect x="31" y="14" width="5" height="9" fill="#9b4b3a" stroke="#6e3427" stroke-width="1.6"/>', s);
const I_HARVEST = (s) => ICON('<path d="M14 42V16M24 42V8M34 42V18" stroke="#5aa832" stroke-width="5"/><path d="M14 24h0M24 18h0M34 26h0" stroke="#e8f7b0" stroke-width="3"/><path d="M10 40h28" stroke="#7a4d2a" stroke-width="4"/>', s);
const I_BACK = (s) => ICON('<path d="M30 10L16 24l14 14" stroke="#1b1d22" stroke-width="5"/>', s);
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const fmtT = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

export function mount(root, ctx) {
  if (!document.getElementById('fm-css')) { const l = document.createElement('link'); l.id = 'fm-css'; l.rel = 'stylesheet'; l.href = new URL('./ferme.css', import.meta.url).href; document.head.appendChild(l); }
  root.classList.add('fm-root');
  root.innerHTML = `<canvas class="fm-cv"></canvas><div class="fm-ui"></div><div class="fm-bubble" hidden></div><div class="fm-sheet" hidden></div><div class="fm-toast" hidden></div>`;
  const cv = root.querySelector('canvas'), c = cv.getContext('2d', { alpha: false }), $ui = root.querySelector('.fm-ui'), $sheet = root.querySelector('.fm-sheet'), $bub = root.querySelector('.fm-bubble'), $toast = root.querySelector('.fm-toast');
  let W = 360, H = 640, K = 1, raf = 0, destroyed = false, paused = false, view = 'home', toastT = 0;
  let mine = normalize(null), shown = mine, owner = ctx.meId, others = {}, mode = null, loaded = false, bubTile = null;
  const cam = { x: 0, y: 0, vx: 0, vy: 0 }, parts = [], hens = [];
  let dirty = false, saveT = 0;

  const fit = () => { const r = root.getBoundingClientRect(); K = Math.min(devicePixelRatio || 1, 2); W = Math.max(200, r.width); H = Math.max(200, r.height); cv.style.width = `${W}px`; cv.style.height = `${H}px`; cv.width = W * K; cv.height = H * K; c.setTransform(K, 0, 0, K, 0, 0); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(root); fit();
  const clamp = () => { cam.x = Math.max(-60, Math.min(FA.N * T - W + 60, cam.x)); cam.y = Math.max(-60, Math.min(FA.N * T - H + 60, cam.y)); };
  const center = (tx, ty) => { cam.x = tx * T - W / 2; cam.y = ty * T - H / 2; clamp(); };
  const home0 = () => center(FA.house.x + 1.5, FA.house.y + 3.5);
  const touch = () => { dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 1500); };
  async function flush() { clearTimeout(saveT); if (!dirty) return; dirty = false; try { await ctx.save(mine); } catch (e) { dirty = true; console.warn(e); } }
  const say = (x, y, txt, col = '#fff6b0') => parts.push({ k: 't', x, y, vy: -0.8, life: 0, max: 60, txt, col });
  const puff = (x, y, col, n = 8) => { for (let i = 0; i < n; i++) parts.push({ k: 'p', x, y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2.2, life: 0, max: 30 + Math.random() * 14, col }); };
  const toast = (m) => { $toast.textContent = m; $toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $toast.hidden = true; }, 2300); };

  /* ---------- Interface ---------- */
  function drawUI() {
    const own = shown === mine, s = summary(mine);
    const top = `<div class="fm-top"><button class="fm-round" data-fm="${view === 'home' ? 'leave' : 'home'}" aria-label="${view === 'home' ? 'Retour à La Kaz' : 'Menu'}">${I_BACK(26)}</button>
      <span class="fm-pill">${CANE_ICON(20)}<b>${mine.cane}</b></span><span class="fm-pill">${COIN(20)}<b>${ctx.coins()}</b></span>
      ${view === 'play' ? `<button class="fm-round fr" data-fm="friends" aria-label="Amis">${FRIENDS(30)}</button>` : ''}</div>`;
    if (view === 'home') {
      $ui.className = 'fm-ui m-home';
      $ui.innerHTML = `${top}<div class="fm-home"><h1>Colo-Ferme</h1><p class="fm-best">${mine.cane} canne${mine.cane > 1 ? 's' : ''} · ${mine.st.harvests} récolte${mine.st.harvests > 1 ? 's' : ''}</p>
        <div class="fm-row2"><button class="fm-btn go big" data-fm="play">${I_HARVEST(30)}Jouer${s.plots + s.blds ? `<i class="fm-dot">${s.plots + s.blds}</i>` : ''}</button><button class="fm-btn big white side" data-fm="friends" aria-label="Amis">${FRIENDS(34)}</button></div></div>`;
      return;
    }
    $ui.className = 'fm-ui m-play';
    const bar = own ? (mode ? `<button class="fm-btn go wide" data-fm="cancel">Terminer le placement</button>` : `
      <button class="fm-tool" data-fm="menu" data-t="build">${I_BUILD(34)}<span>Construire</span></button>
      <button class="fm-tool" data-fm="menu" data-t="decor">${I_DECOR(34)}<span>Décors</span></button>
      <button class="fm-tool" data-fm="menu" data-t="house">${I_HOUSE(34)}<span>Maison</span></button>
      <button class="fm-tool ${s.plots ? 'ready' : ''}" data-fm="all" ${s.plots ? '' : 'disabled'}>${I_HARVEST(34)}<span>Récolter${s.plots ? ` (${s.plots})` : ''}</span></button>`)
      : `<button class="fm-btn go wide" data-fm="visit" data-id="${ctx.meId}">Retour à ma ferme</button>`;
    $ui.innerHTML = `${top}${own ? '' : `<div class="fm-own">Île de ${ctx.esc(ctx.nameOf(owner))}</div>`}<div class="fm-bar">${bar}</div>`;
  }
  const closeSheet = () => { $sheet.hidden = true; $sheet.innerHTML = ''; };
  const openSheet = (html) => { closeBubble(); $sheet.innerHTML = `<div class="fm-card"><button class="fm-x" data-fm="close" aria-label="Fermer">✕</button>${html}</div>`; $sheet.hidden = false; };
  const closeBubble = () => { $bub.hidden = true; bubTile = null; };
  function openBubble(x, y, html) {
    closeSheet(); bubTile = { x, y }; $bub.innerHTML = `<div class="fm-bub">${html}</div>`; $bub.hidden = false; placeBubble();
  }
  function placeBubble() {
    if (!bubTile) return;
    const sx = (bubTile.x + 0.5) * T - cam.x, sy = bubTile.y * T - cam.y, el = $bub.firstElementChild, w = el.offsetWidth || 200, h = el.offsetHeight || 100;
    let left = Math.max(8, Math.min(W - w - 8, sx - w / 2)), top = sy - h - 12, below = false;
    if (top < 70) { top = sy + T + 12; below = true; }
    el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.setProperty('--ax', `${Math.max(16, Math.min(w - 16, sx - left))}px`); el.classList.toggle('below', below);
  }
  const price = (n, ok = mine.cane >= n) => `<span class="fm-price ${ok ? '' : 'no'}">${CANE_ICON(14)} ${n}</span>`;
  function menuHTML(t) {
    if (t === 'build') return `<h3>Construire</h3><p class="fm-sub">Les bâtiments rapportent des colocoins. Ils coûtent de la canne à sucre.</p>` + Object.entries(BUILDINGS).map(([k, B]) => {
      const n = mine.blds.filter((b) => b.k === k).length;
      return `<button class="fm-row" data-fm="place" data-k="${k}" ${mine.cane >= B.cost ? '' : 'disabled'}><span class="fm-ico">${buildIcon(k)}</span><span><b>${B.name}</b><small>${B.text}${n ? ` · ${n} construit${n > 1 ? 's' : ''}` : ''}</small></span>${price(B.cost)}</button>`;
    }).join('');
    if (t === 'decor') return `<h3>Décors</h3><p class="fm-sub">Pose-les où tu veux sur ton terrain.</p><div class="fm-grid">` + Object.entries(DECORS).map(([k, D]) => `<button class="fm-dec" data-fm="placed" data-k="${k}" ${mine.cane >= D.cost ? '' : 'disabled'}>${decorIcon(k)}<b>${D.name}</b>${price(D.cost)}</button>`).join('') + '</div>';
    const hu = FA.houseUp[mine.house], tu = FA.toolsUp[mine.tools];
    return `<h3>Ma maison</h3><p class="fm-sub">Niveau ${mine.house} · tes bâtiments rapportent +${Math.round(FA.houseBonus * 100 * (mine.house - 1))} %</p>
      ${hu ? `<button class="fm-row" data-fm="upHouse" ${mine.cane >= hu ? '' : 'disabled'}><span><b>Améliorer la maison (niveau ${mine.house + 1})</b><small>+${Math.round(FA.houseBonus * 100)} % de colocoins sur tous les bâtiments</small></span>${price(hu)}</button>` : '<p class="fm-max">Maison au niveau maximum.</p>'}
      <p class="fm-sub" style="margin-top:12px">Outils niveau ${mine.tools} · pousse ${Math.round(FA.toolGrow * 100 * (mine.tools - 1))} % plus vite, +${mine.tools - 1} canne par récolte</p>
      ${tu ? `<button class="fm-row" data-fm="upTools" ${mine.cane >= tu ? '' : 'disabled'}><span><b>Améliorer les outils (niveau ${mine.tools + 1})</b><small>Pousse −${Math.round(FA.toolGrow * 100)} % de temps · +1 canne par récolte</small></span>${price(tu)}</button>` : '<p class="fm-max">Outils au niveau maximum.</p>'}
      <div class="fm-stats"><span><b>${mine.st.harvests}</b> récoltes</span><span><b>${mine.st.trees}</b> arbres coupés</span><span><b>${mine.st.cash}</b> colocoins gagnés</span></div>`;
  }
  function bldHTML(b) {
    const B = BUILDINGS[b.k], n = bldCycles(b), coins = bldCoins(mine, b), up = B.up[b.lvl - 1], next = cycleMs(b) - ((Date.now() - b.t) % cycleMs(b));
    return `<h3>${B.name} · niveau ${b.lvl}</h3><p class="fm-sub">${B.text}</p>
      <button class="fm-row ${coins ? 'gold' : ''}" data-fm="collect" data-i="${mine.blds.indexOf(b)}" ${coins ? '' : 'disabled'}><span><b>${coins ? `Récolter ${coins} colocoins` : 'Rien à récolter'}</b><small>${n >= FA.maxStore ? 'Stock plein' : `Prochaine production dans ${fmtT(next)}`}</small></span></button>
      ${up ? `<button class="fm-row" data-fm="upBld" data-i="${mine.blds.indexOf(b)}" ${mine.cane >= up ? '' : 'disabled'}><span><b>Améliorer (niveau ${b.lvl + 1})</b><small>${B.coins[b.lvl - 1]} → ${B.coins[b.lvl]} colocoins par cycle</small></span>${price(up)}</button>` : '<p class="fm-max">Niveau maximum.</p>'}`;
  }
  const buy = (n) => { if (mine.cane < n) { toast('Pas assez de canne à sucre.'); return false; } mine.cane -= n; return true; };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fm]'); if (!b) { if (!$bub.hidden && e.target !== cv && !e.target.closest('.fm-bub')) closeBubble(); return; }
    if (b.disabled) return;
    const a = b.dataset.fm, k = b.dataset.k;
    if (a === 'close') return closeSheet();
    if (a === 'leave') return ctx.quit();
    if (a === 'play') { view = 'play'; closeSheet(); closeBubble(); home0(); drawUI(); return; }
    if (a === 'home') { view = 'home'; mode = null; closeSheet(); closeBubble(); shown = mine; owner = ctx.meId; drawUI(); return; }
    if (a === 'friends') { openSheet(`<h3>Amis</h3><p class="fm-sub">Visite l'île d'un coloc ou d'un copain.</p><div class="fm-friends">${(ctx.players?.() ?? []).filter((m) => m.id !== ctx.meId).map((m) => `<button class="fm-fr" data-fm="visit" data-id="${m.id}">${ctx.avatar(m, 54)}<span>${ctx.esc(m.name)}</span></button>`).join('') || '<p class="fm-sub">Personne d\'autre ne joue pour l\'instant.</p>'}</div>`); return; }
    if (a === 'menu') { openSheet(menuHTML(b.dataset.t)); return; }
    if (a === 'visit') { await switchTo(Number(b.dataset.id)); return; }
    if (a === 'cancel') { mode = null; drawUI(); return; }
    if (a === 'bclose') { closeBubble(); return; }
    if (a === 'place') { mode = { t: 'build', k }; closeSheet(); drawUI(); toast('Touche un emplacement libre sur ton terrain.'); return; }
    if (a === 'placed') { mode = { t: 'decor', k }; closeSheet(); drawUI(); toast('Touche un emplacement pour poser le décor.'); return; }
    if (a === 'all') { harvestAll(); return; }
    if (a === 'upHouse') { const n = FA.houseUp[mine.house]; if (n && buy(n)) { mine.house++; mine.st.builds++; touch(); drawUI(); openSheet(menuHTML('house')); puff(FA.house.x * T + 66, FA.house.y * T, '#ffd95a', 14); } return; }
    if (a === 'upTools') { const n = FA.toolsUp[mine.tools]; if (n && buy(n)) { mine.tools++; mine.st.builds++; touch(); drawUI(); openSheet(menuHTML('house')); } return; }
    if (a === 'upBld') { const bl = mine.blds[Number(b.dataset.i)], n = BUILDINGS[bl.k].up[bl.lvl - 1]; if (n && buy(n)) { bl.lvl++; mine.st.builds++; touch(); drawUI(); openSheet(bldHTML(bl)); puff((bl.x + 1) * T, bl.y * T, '#ffd95a', 14); } return; }
    if (a === 'collect') {
      const bl = mine.blds[Number(b.dataset.i)], n = bldCoins(mine, bl); if (!n) return;
      b.disabled = true;
      try { const got = await ctx.cash(n); bl.t = Date.now(); mine.st.cash += got; touch(); say((bl.x + 1) * T, bl.y * T - 20, `+${got}`, '#ffe14d'); puff((bl.x + 1) * T, bl.y * T, '#ffd23f', 10);
        if (got < n) toast(got ? `Plafond du jour : ${got} colocoins crédités.` : 'Plafond du jour atteint (200 colocoins).'); } catch (er) { toast(er.message || 'Impossible de récolter.'); }
      closeSheet(); drawUI(); return;
    }
    const xy = () => b.dataset.t.split(',').map(Number);
    if (a === 'buyparcel') {
      const [x, y] = xy(), n = FA.parcelCost(mine.owned.length); if (!free(mine, x, y)) return closeBubble();
      b.disabled = true;
      try { await ctx.spend(n); mine.owned.push(`${x},${y}`); touch(); puff(x * T + 22, y * T + 22, '#8b5a2b', 10); say(x * T + 22, y * T, `-${n}`, '#ffd23f'); } catch (er) { toast(er.message || 'Achat impossible.'); }
      closeBubble(); drawUI(); return;
    }
    if (a === 'plant') { const [x, y] = xy(); if (!isOwned(mine, x, y) || mine.plots[`${x},${y}`]) return closeBubble(); mine.plots[`${x},${y}`] = { t: Date.now(), k: 'canne' }; touch(); puff(x * T + 22, y * T + 30, '#7a4d2a', 8); closeBubble(); drawUI(); return; }
    if (a === 'harvest') { const [x, y] = xy(), key = `${x},${y}`, p = mine.plots[key]; if (p && plotState(mine, p).ready) { delete mine.plots[key]; const n = yieldN(mine); mine.cane += n; mine.st.harvests++; touch(); say(x * T + 22, y * T, `+${n}`, '#e6ffb0'); puff(x * T + 22, y * T + 12, '#8fd14f', 8); } closeBubble(); drawUI(); return; }
    if (a === 'chop') { const [x, y] = xy(); if (!isTree(mine, x, y) || !frontier(mine, x, y) || mine.chop[`${x},${y}`]) return closeBubble(); mine.chop[`${x},${y}`] = { t: Date.now(), ms: chopMs(mine.st.trees + Object.keys(mine.chop).length) }; touch(); closeBubble(); puff(x * T + 22, y * T + 18, '#c9a46a', 8); return; }
    if (a === 'rm') { const [x, y] = xy(), o = decorAt(mine, x, y); if (!o) return; mine.decor = mine.decor.filter((z) => z !== o); mine.cane += Math.floor(DECORS[o.k].cost / 2); touch(); closeBubble(); drawUI(); return; }
  });
  function harvestAll() {
    const now = Date.now(); let n = 0;
    for (const [kk, p] of Object.entries(mine.plots)) if (plotState(mine, p, now).ready) { const [x, y] = kk.split(',').map(Number); delete mine.plots[kk]; n += yieldN(mine); mine.st.harvests++; puff(x * T + 22, y * T + 10, '#8fd14f', 6); }
    if (n) { mine.cane += n; touch(); say(cam.x + W / 2, cam.y + H / 2, `+${n}`, '#e6ffb0'); drawUI(); }
  }
  function resolveChops() {
    const now = Date.now(); let any = false;
    for (const [kk, ch] of Object.entries(mine.chop)) if (now - ch.t >= ch.ms) { delete mine.chop[kk]; mine.cleared.push(kk); mine.st.trees++; any = true; const [x, y] = kk.split(',').map(Number); if (loaded && view === 'play') { puff(x * T + 22, y * T + 18, '#6cc56a', 12); say(x * T + 22, y * T, 'Arbre coupé', '#fff'); } }
    if (any) { touch(); drawUI(); }
  }
  async function switchTo(id) {
    if (id === ctx.meId) { shown = mine; owner = id; mode = null; view = 'play'; closeSheet(); closeBubble(); home0(); drawUI(); return; }
    let d = others[id];
    if (!d) { try { const rows = await ctx.others(); rows.forEach((r) => { others[r.member_id] = normalize(r.data); }); } catch { /* rien */ } d = others[id] ?? newFarm(); others[id] = d; }
    owner = id; shown = d; mode = null; view = 'play'; closeSheet(); closeBubble(); home0(); drawUI();
  }

  /* ---------- Gestes : glisser pour se déplacer, toucher pour agir ---------- */
  let down = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); down = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, t: performance.now(), moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() }; cam.vx = cam.vy = 0; });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 8) down.moved = true;
    if (down.moved && view === 'play') { const now = performance.now(), dt = Math.max(1, now - down.lt); cam.vx = (down.lx - e.clientX) / dt * 16; cam.vy = (down.ly - e.clientY) / dt * 16; down.lx = e.clientX; down.ly = e.clientY; down.lt = now; cam.x = down.cx - dx; cam.y = down.cy - dy; clamp(); placeBubble(); }
  });
  const up = (e) => {
    if (!down) return; const d = down; down = null;
    if (view !== 'play') return;
    if (!d.moved && performance.now() - d.t < 500) { const r = cv.getBoundingClientRect(); tap(Math.floor((e.clientX - r.left + cam.x) / T), Math.floor((e.clientY - r.top + cam.y) / T)); cam.vx = cam.vy = 0; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { down = null; });

  function tap(x, y) {
    closeBubble(); closeSheet();
    if (!loaded || !isLand(x, y)) return;
    const own = shown === mine, wx = x * T + T / 2;
    if (!own) { const bl = bldAt(shown, x, y); if (bl) toast(`${BUILDINGS[bl.k].name} · niveau ${bl.lvl}`); return; }
    if (mode?.t === 'build') {
      if (!canPlace(mine, mode.k, x, y)) return toast('Emplacement occupé : choisis une zone dégagée.');
      const B = BUILDINGS[mode.k]; if (!buy(B.cost)) { mode = null; return drawUI(); }
      mine.blds.push({ k: mode.k, x, y, lvl: 1, t: Date.now() }); mine.st.builds++; mode = null; touch(); initHens(); drawUI(); puff(x * T + T, y * T + T, '#d8c9a8', 18); return;
    }
    if (mode?.t === 'decor') {
      if (!free(mine, x, y)) return toast('Emplacement occupé.');
      const D = DECORS[mode.k]; if (!buy(D.cost)) { mode = null; return drawUI(); }
      mine.decor.push({ k: mode.k, x, y }); mine.st.decor++; touch(); drawUI(); puff(wx, y * T + T, '#ffe9a8', 8); return;
    }
    if (onHouse(x, y)) return openSheet(menuHTML('house'));
    const bl = bldAt(mine, x, y); if (bl) return openSheet(bldHTML(bl));
    const dc = decorAt(mine, x, y); if (dc) return openBubble(x, y, `<b>${DECORS[dc.k].name}</b><div class="fm-bbtns"><button class="fm-bb go" data-fm="rm" data-t="${x},${y}">Ranger (+${Math.floor(DECORS[dc.k].cost / 2)} cannes)</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`);
    if (isSand(x, y)) return;
    const key = `${x},${y}`, p = mine.plots[key];
    if (p) {
      const s = plotState(mine, p), left = growMs(mine) * (1 - s.pct);
      return openBubble(x, y, s.ready ? `<b>Canne à sucre prête !</b><small>Récolte : +${yieldN(mine)} cannes</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="harvest" data-t="${key}">Collecter</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`
        : `<b>Canne à sucre</b><div class="fm-bar2"><i style="width:${Math.round(s.pct * 100)}%"></i></div><small>Encore ${fmtT(left)} avant la collecte</small><div class="fm-bbtns"><button class="fm-bb" data-fm="bclose">Fermer</button></div>`);
    }
    if (isOwned(mine, x, y)) return openBubble(x, y, `<b>Parcelle vide</b><small>Planter prend ${fmtT(growMs(mine))} à pousser</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="plant" data-t="${key}">${CANE_ICON(16)} Planter canne</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`);
    if (isTree(mine, x, y)) {
      const ch = mine.chop[key];
      if (ch) return openBubble(x, y, `<b>Coupe en cours…</b><div class="fm-bar2"><i style="width:${Math.round(Math.min(1, (Date.now() - ch.t) / ch.ms) * 100)}%"></i></div><small>Encore ${fmtT(ch.ms - (Date.now() - ch.t))}</small><div class="fm-bbtns"><button class="fm-bb" data-fm="bclose">Fermer</button></div>`);
      if (!frontier(mine, x, y)) return toast('Coupe d\'abord les arbres au bord de ton terrain.');
      const ms = chopMs(mine.st.trees + Object.keys(mine.chop).length);
      return openBubble(x, y, `<b>Couper cet arbre</b><small>Ça prend ${fmtT(ms)} et agrandit ton terrain</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="chop" data-t="${key}">Couper</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`);
    }
    if (free(mine, x, y)) { const n = FA.parcelCost(mine.owned.length); return openBubble(x, y, `<b>Acheter une parcelle</b><small>Pour cultiver ici</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="buyparcel" data-t="${key}" ${ctx.coins() >= n ? '' : 'disabled'}>${COIN(16)} ${n} colocoin${n > 1 ? 's' : ''}</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>${ctx.coins() >= n ? '' : '<small class="fm-no">Pas assez de colocoins</small>'}`); }
  }

  /* ---------- Dessin en relief : tout est préparé en petites images (sprites) puis posé sur la carte ---------- */
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const cache = {};
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    const S = 2, cvs = document.createElement('canvas'); cvs.width = Math.ceil(w * S); cvs.height = Math.ceil(h * S);
    const g = cvs.getContext('2d'); g.scale(S, S); draw(g); return (cache[key] = cvs);
  }
  const lin = (g, y0, y1, a, b) => { const q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
  const rad = (g, x, y, r, a, b) => { const q = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
  const grass = (v) => sprite(`gr${v}`, T + 1, T + 1, (g) => {
    g.fillStyle = lin(g, 0, T, v ? '#9ddc58' : '#a6e063', v ? '#86c746' : '#8fcf4f'); g.fillRect(0, 0, T + 1, T + 1);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, T + 1, 2); g.fillStyle = 'rgba(30,90,10,.10)'; g.fillRect(0, T - 2, T + 1, 3);
    g.strokeStyle = 'rgba(40,120,20,.35)'; g.lineWidth = 1.3; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const bx = 6 + hash(i, v) * (T - 12), by = 10 + hash(v, i) * (T - 14); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 1.5, by - 5); g.moveTo(bx + 3, by); g.lineTo(bx + 4, by - 6); g.stroke(); }
  });
  const sandT = (v) => sprite(`sd${v}`, T + 1, T + 1, (g) => {
    g.fillStyle = lin(g, 0, T, '#f7e3a6', '#ecd08a'); g.fillRect(0, 0, T + 1, T + 1); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, 0, T + 1, 2);
    g.fillStyle = 'rgba(160,120,50,.25)'; for (let i = 0; i < 5; i++) g.fillRect(4 + hash(i, v + 3) * (T - 8), 4 + hash(v + 3, i) * (T - 8), 2, 1.5);
  });
  const forest = () => sprite('fo', T + 1, T + 1, (g) => { g.fillStyle = lin(g, 0, T, '#5fae3b', '#4c9a30'); g.fillRect(0, 0, T + 1, T + 1); });
  const soil = () => sprite('soil', T, T, (g) => {
    g.fillStyle = 'rgba(40,20,0,.28)'; g.beginPath(); g.roundRect(4, 8, T - 8, T - 8, 8); g.fill();
    g.fillStyle = lin(g, 4, T - 4, '#9a6a3c', '#6e4524'); g.beginPath(); g.roundRect(4, 4, T - 8, T - 9, 8); g.fill();
    g.fillStyle = '#4e2f15'; for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect(9, 12 + i * 9, T - 18, 4, 2); g.fill(); }
    g.fillStyle = 'rgba(255,225,170,.45)'; g.beginPath(); g.roundRect(6, 5, T - 12, 3, 2); g.fill();
  });
  const cliff = (sand) => sprite(sand ? 'cls' : 'clg', T + 1, 16, (g) => { g.fillStyle = lin(g, 0, 16, sand ? '#c9a45c' : '#8a5a2e', sand ? '#9d7a3a' : '#5e3a1b'); g.fillRect(0, 0, T + 1, 16); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, T + 1, 3); });
  const treeSpr = (v) => sprite(`tr${v}`, 70, 84, (g) => {
    const bx = 35, by = 72, pal = [['#8fe07a', '#2f8a3a'], ['#9be37d', '#33913f'], ['#7fd873', '#2a7d36']][v];
    g.fillStyle = 'rgba(0,50,0,.28)'; g.beginPath(); g.ellipse(bx + 3, by + 2, 23, 8, 0, 0, TAU); g.fill();
    g.fillStyle = lin(g, by - 22, by, '#9a6030', '#6a3e1a'); g.beginPath(); g.roundRect(bx - 5, by - 24, 10, 26, 3); g.fill(); g.fillStyle = 'rgba(255,210,150,.35)'; g.fillRect(bx - 5, by - 24, 3, 24);
    for (const [dx, dy, r] of [[-12, -30, 15], [12, -30, 15], [0, -44, 19], [-4, -56, 12], [8, -22, 12]]) { g.fillStyle = rad(g, bx + dx, by + dy, r, pal[0], pal[1]); g.beginPath(); g.arc(bx + dx, by + dy, r, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(bx - 6, by - 52, 6, 3.4, -0.5, 0, TAU); g.fill();
  });
  // boîte en relief : façade, côté droit plus sombre, toit à deux pentes
  function hut(g, w, h, o) {
    const d = 11, wallH = h * 0.5, yb = h, rh = o.rh ?? 34, x = 6, ww = w - 6 - d - 6;
    g.fillStyle = 'rgba(0,40,0,.25)'; g.beginPath(); g.ellipse(x + ww / 2 + d / 2, yb + 1, ww / 2 + d, 8, 0, 0, TAU); g.fill();
    g.lineJoin = 'round'; g.lineWidth = 2;
    g.fillStyle = o.side; g.strokeStyle = o.line; g.beginPath(); g.moveTo(x + ww, yb - wallH); g.lineTo(x + ww + d, yb - wallH - d * 0.55); g.lineTo(x + ww + d, yb - d * 0.55); g.lineTo(x + ww, yb); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = lin(g, yb - wallH, yb, o.wall[0], o.wall[1]); g.fillRect(x, yb - wallH, ww, wallH); g.strokeRect(x, yb - wallH, ww, wallH);
    g.fillStyle = o.roofSide; g.beginPath(); g.moveTo(x + ww / 2, yb - wallH - rh); g.lineTo(x + ww / 2 + d, yb - wallH - rh - d * 0.55); g.lineTo(x + ww + d + 3, yb - wallH - d * 0.55); g.lineTo(x + ww + 3, yb - wallH); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = lin(g, yb - wallH - rh, yb - wallH, o.roof[0], o.roof[1]); g.beginPath(); g.moveTo(x - 4, yb - wallH); g.lineTo(x + ww / 2, yb - wallH - rh); g.lineTo(x + ww + 3, yb - wallH); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x + 2, yb - wallH - 1); g.lineTo(x + ww / 2 - 1, yb - wallH - rh + 3); g.lineTo(x + ww / 2 + 4, yb - wallH - rh + 4); g.lineTo(x + 8, yb - wallH - 1); g.fill();
    o.detail?.(g, { x, ww, wallH, yb, d });
    return { x, ww, wallH, yb, d, rh };
  }
  const door = (g, cx, yb, w = 18, h = 26) => { g.fillStyle = '#5a3414'; g.beginPath(); g.roundRect(cx - w / 2, yb - h, w, h, [w / 2, w / 2, 1, 1]); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(cx - w / 2 + 2, yb - h + 4, 3, h - 6); };
  const win = (g, x, y, w = 17, h = 15) => { g.fillStyle = lin(g, y, y + h, '#d6f1ff', '#8cc8e6'); g.fillRect(x, y, w, h); g.strokeStyle = '#7a5a2e'; g.lineWidth = 1.8; g.strokeRect(x, y, w, h); g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke(); };
  const bsp = (k, lvl) => {
    const B = BUILDINGS[k], w = B.w * T + 14, h = B.h * T + 34;
    return sprite(`b:${k}:${lvl}`, w, h, (g) => {
      if (k === 'poulailler') hut(g, w, h, { wall: ['#f0c27a', '#d9a35a'], side: '#b9803f', line: '#6e4a1e', roof: ['#e5543f', '#b83a2a'], roofSide: '#962c20', rh: 30,
        detail: (g2, q) => { g2.strokeStyle = 'rgba(120,70,20,.4)'; g2.lineWidth = 1.2; for (let i = 1; i < 6; i++) { g2.beginPath(); g2.moveTo(q.x + i * (q.ww / 6), q.yb - q.wallH + 2); g2.lineTo(q.x + i * (q.ww / 6), q.yb - 2); g2.stroke(); } door(g2, q.x + q.ww / 2, q.yb, 18, 24); } });
      else if (k === 'brasserie') hut(g, w, h, { wall: ['#c58a52', '#a56d3a'], side: '#7e5028', line: '#4a2c10', roof: ['#6e4524', '#4e2f15'], roofSide: '#3b2310', rh: 30,
        detail: (g2, q) => { door(g2, q.x + q.ww * 0.28, q.yb, 20, 28); for (let i = 0; i < 2; i++) { const bx = q.x + q.ww * 0.55 + i * 28; g2.fillStyle = lin(g2, q.yb - 28, q.yb, '#b98438', '#8a5a22'); g2.beginPath(); g2.roundRect(bx, q.yb - 28, 22, 28, 7); g2.fill(); g2.strokeStyle = '#4a2a0c'; g2.lineWidth = 1.6; g2.stroke(); g2.fillStyle = '#e3b04b'; g2.fillRect(bx, q.yb - 21, 22, 3); g2.fillRect(bx, q.yb - 9, 22, 3); }
          g2.fillStyle = rad(g2, q.x + q.ww * 0.76, q.yb - q.wallH - 22, 12, '#f0a053', '#b05f1c'); g2.beginPath(); g2.arc(q.x + q.ww * 0.76, q.yb - q.wallH - 22, 11, 0, TAU); g2.fill(); g2.fillRect(q.x + q.ww * 0.76 - 3, q.yb - q.wallH - 40, 6, 10); } });
      else hut(g, w, h, { wall: ['#faf1da', '#e4d7b4'], side: '#bdb08a', line: '#7f7452', roof: ['#8d9bab', '#65727f'], roofSide: '#4d5963', rh: 28,
        detail: (g2, q) => { door(g2, q.x + q.ww * 0.62, q.yb, 18, 26); win(g2, q.x + 10, q.yb - q.wallH + 14); g2.fillStyle = lin(g2, q.yb - q.wallH - 40, q.yb - q.wallH - 10, '#b9604a', '#8a3f2c'); g2.fillRect(q.x + q.ww - 22, q.yb - q.wallH - 42, 13, 30); g2.fillStyle = '#6e3427'; g2.fillRect(q.x + q.ww - 24, q.yb - q.wallH - 44, 17, 5); } });
    });
  };
  const houseSpr = (L) => {
    const w = FA.house.w * T + 16, h = FA.house.h * T + 30;
    return sprite(`house:${L}`, w, h, (g) => {
      hut(g, w, h, { wall: L > 1 ? ['#fff6e0', '#ecdcb6'] : ['#f6e8c4', '#e0cc9e'], side: '#bfa97a', line: '#7f6a3e', roof: ['#e8793a', '#bf5420'], roofSide: '#92401a', rh: 44,
        detail: (g2, q) => { door(g2, q.x + q.ww / 2, q.yb, 24, 36); win(g2, q.x + 14, q.yb - q.wallH + 22, 22, 20); win(g2, q.x + q.ww - 36, q.yb - q.wallH + 22, 22, 20);
          if (L >= 2) { g2.fillStyle = lin(g2, q.yb - q.wallH - 50, q.yb - q.wallH - 14, '#b9604a', '#8a3f2c'); g2.fillRect(q.x + 22, q.yb - q.wallH - 52, 16, 36); g2.fillStyle = '#6e3427'; g2.fillRect(q.x + 19, q.yb - q.wallH - 55, 22, 6); } } });
    });
  };
  function caneDraw(x, y, pct, ready, t) {          // x,y = coin haut-gauche de la tuile
    c.drawImage(soil(), x, y, T, T);
    const h = 6 + pct * 24, sway = Math.sin(t * 2 + x) * (0.8 + pct * 1.6);
    for (const [dx, hh] of [[-10, 0.8], [0, 1], [10, 0.88]]) {
      const bx = x + T / 2 + dx, base = y + T - 12, top = base - h * hh;
      c.strokeStyle = ready ? '#cdb83e' : '#5fb534'; c.lineWidth = 4.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx, base); c.quadraticCurveTo(bx + sway * 0.4, (base + top) / 2, bx + sway, top); c.stroke();
      c.strokeStyle = ready ? '#efe27a' : '#a5e06e'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx - 1.2, base); c.quadraticCurveTo(bx - 1.2 + sway * 0.4, (base + top) / 2, bx - 1 + sway, top); c.stroke();
      c.strokeStyle = '#2f7a1c'; c.lineWidth = 1.2; for (let k = 1; k < 4; k++) { const yy = base - (h * hh) * (k / 4); c.beginPath(); c.moveTo(bx - 2.6 + sway * k / 5, yy); c.lineTo(bx + 2.6 + sway * k / 5, yy); c.stroke(); }
      if (pct > 0.15) for (const sgn of [1, -1]) { c.fillStyle = sgn > 0 ? '#58b82f' : '#47a025'; c.beginPath(); c.moveTo(bx + sway, top); c.quadraticCurveTo(bx + sway + sgn * 12, top - 3, bx + sway + sgn * 15, top + 10); c.quadraticCurveTo(bx + sway + sgn * 5, top + 3, bx + sway, top + 3); c.fill(); }
    }
    if (ready) { const a = 0.5 + 0.5 * Math.sin(t * 5 + x); c.fillStyle = `rgba(255,248,170,${a})`; c.beginPath(); c.arc(x + T / 2 + Math.sin(t * 3 + y) * 10, y + 8 + Math.cos(t * 4) * 3, 3, 0, TAU); c.fill(); }
  }
  function drawTree(x, y, t) {
    const h = hash(x, y), sw = Math.sin(t * 1.4 + h * 6) * 1.2, ch = shown.chop?.[`${x},${y}`];
    const spr = treeSpr(Math.floor(h * 3) % 3), s = 0.92 + h * 0.2, bx = x * T + T / 2, by = y * T + T - 6;
    c.save(); c.translate(bx, by); c.rotate(sw * 0.012); c.drawImage(spr, -35 * s, -72 * s, 70 * s, 84 * s); c.restore();
    if (ch) { const p = Math.min(1, (Date.now() - ch.t) / ch.ms); c.fillStyle = 'rgba(0,0,0,.55)'; rr(bx - 17, by - 70, 34, 7, 3); c.fill(); c.fillStyle = '#ffd23f'; rr(bx - 16, by - 69, 32 * p, 5, 2); c.fill(); c.save(); c.translate(bx + 14, by - 40 + Math.sin(t * 9) * 2); c.rotate(Math.sin(t * 9) * 0.4); c.fillStyle = '#7a5a3a'; c.fillRect(-1.5, -12, 3, 22); c.fillStyle = '#c7ccd3'; c.beginPath(); c.moveTo(-1.5, -12); c.lineTo(-10, -8); c.lineTo(-1.5, -2); c.fill(); c.restore(); }
  }
  function drawBuilding(b, t) {
    const B = BUILDINGS[b.k], x = b.x * T - 4, y = b.y * T + B.h * T + 4 - (B.h * T + 34);
    c.drawImage(bsp(b.k, b.lvl), x, y, B.w * T + 14, B.h * T + 34);
    const cx = b.x * T + B.w * T - 20;
    if (b.k !== 'poulailler') { c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) { const p = (t * 0.45 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(cx + Math.sin(p * 5 + k) * 5, y + 6 - p * 26, 4 + p * 6, 0, TAU); c.fill(); } c.globalAlpha = 1; }
    c.fillStyle = '#ffc928'; for (let i = 0; i < b.lvl; i++) { c.beginPath(); c.arc(b.x * T + 12 + i * 12, b.y * T + B.h * T + 8, 4.2, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 1.2; c.stroke(); }
    if (shown === mine && bldCycles(b) > 0) { const by = y - 6 + Math.sin(t * 4) * 3, bx = b.x * T + B.w * T / 2; c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(bx, by, 12, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#9a6209'; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.fillText('$', bx, by + 5); }
  }
  function drawHouse(t) {
    const L = shown.house, w = FA.house.w * T + 16, h = FA.house.h * T + 30, x = FA.house.x * T - 6, y = (FA.house.y + FA.house.h) * T + 4 - h;
    c.drawImage(houseSpr(L), x, y, w, h);
    if (L >= 2) { c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) { const p = (t * 0.4 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(x + 35 + Math.sin(p * 5 + k) * 4, y + 8 - p * 28, 4 + p * 7, 0, TAU); c.fill(); } c.globalAlpha = 1; }
    if (L >= 3) { const fx = x + w - 26, fy = y + 30; c.strokeStyle = '#5b3a1e'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 36); c.stroke(); c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(fx, fy - 36); c.lineTo(fx + 20 + Math.sin(t * 4) * 3, fy - 30); c.lineTo(fx, fy - 22); c.fill(); }
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
  function initHens() {
    hens.length = 0; mine.blds.filter((b) => b.k === 'poulailler').forEach((b) => { for (let i = 0; i < 2; i++) hens.push({ x: b.x * T + 20 + i * 30, y: (b.y + 2) * T + 10, x0: b.x * T - 6, x1: (b.x + 2) * T + 6, v: 0.3 + i * 0.12 }); });
  }
  const hen = (h, t) => { c.save(); c.translate(h.x, h.y + Math.abs(Math.sin(t * 8 + h.x)) * -2); c.scale(h.v > 0 ? 1 : -1, 1); c.fillStyle = 'rgba(0,40,0,.25)'; c.beginPath(); c.ellipse(0, 3, 8, 3, 0, 0, TAU); c.fill(); c.fillStyle = rad(c, 0, -6, 8, '#fff', '#dfe3e8'); c.beginPath(); c.ellipse(0, -6, 8, 7, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(7, -12, 4, 0, TAU); c.fill(); c.fillStyle = '#e63946'; c.fillRect(5, -17, 4, 3); c.fillStyle = '#f59e0b'; c.beginPath(); c.moveTo(10, -12); c.lineTo(14, -11); c.lineTo(10, -10); c.fill(); c.fillStyle = '#111'; c.fillRect(8, -13, 1.6, 1.6); c.restore(); };
  let lastChop = 0;
  function render(ts) {
    if (destroyed) return; raf = requestAnimationFrame(render); if (paused) return;
    const t = ts / 1000;
    if (loaded && ts - lastChop > 1000) { lastChop = ts; resolveChops(); }
    if (view === 'home') { const bx = (FA.house.x + 1.5) * T - W / 2 + 40, by = (FA.house.y + 3.5) * T - H / 2 - 70; cam.x = bx + Math.sin(t * 0.18) * 40; cam.y = by + Math.cos(t * 0.13) * 24; clamp(); }
    else if (!down && (Math.abs(cam.vx) > 0.05 || Math.abs(cam.vy) > 0.05)) { cam.x += cam.vx; cam.y += cam.vy; cam.vx *= 0.93; cam.vy *= 0.93; clamp(); placeBubble(); }
    // eau
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#46c6e6'); g.addColorStop(1, '#1b84ae'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2;
    for (let row = Math.floor(cam.y / 40); row < (cam.y + H) / 40 + 1; row++) { c.beginPath(); for (let sx = -8; sx <= W + 8; sx += 10) { const wx = sx + cam.x, y = row * 40 - cam.y + Math.sin(wx / 34 + t * 0.9 + row * 1.7) * 4; sx < 0 ? c.moveTo(sx, y) : c.lineTo(sx, y); } c.stroke(); }
    c.save(); c.translate(-cam.x, -cam.y);
    const x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(FA.N - 1, Math.ceil((cam.x + W) / T) + 1), y0 = Math.max(0, Math.floor(cam.y / T) - 2), y1 = Math.min(FA.N - 1, Math.ceil((cam.y + H) / T) + 2);
    // ombre de l'île sur l'eau, falaise, écume
    c.fillStyle = 'rgba(0,50,80,.22)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isLand(x, y)) { rr(x * T - 2, y * T + 8, T + 4, T + 14, 10); c.fill(); }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isLand(x, y)) continue;
      const px = x * T, py = y * T;
      if (!isLand(x, y + 1)) c.drawImage(cliff(isSand(x, y)), px, py + T - 1, T + 0.5, 16);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !isLand(x + a, y + b))) { c.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * 2 + x + y)})`; rr(px - 4, py - 4, T + 8, T + 22, 14); c.fill(); }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isLand(x, y)) continue;
      const px = x * T, py = y * T, v = (x + y) & 1;
      c.drawImage(isSand(shown, x, y) ? sandT(v) : isCleared(shown, x, y) ? grass(v) : forest(), px, py, T + 0.5, T + 0.5);
      if (view === 'play' && shown === mine && !mode && free(mine, x, y)) { c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1.5; c.setLineDash([5, 5]); c.strokeRect(px + 4, py + 4, T - 8, T - 8); c.setLineDash([]); }
      if (shown.owned.includes(`${x},${y}`) && !shown.plots[`${x},${y}`]) c.drawImage(soil(), px, py, T, T);
    }
    if (mode && shown === mine) { c.fillStyle = 'rgba(255,255,255,.3)'; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mode.t === 'decor' ? free(mine, x, y) : canPlace(mine, mode.k, x, y)) c.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
    const items = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isTree(shown, x, y)) items.push({ y: y + 1, f: () => drawTree(x, y, t) });
    for (const [kk, p] of Object.entries(shown.plots)) { const [x, y] = kk.split(',').map(Number); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { const s = plotState(shown, p); items.push({ y: y + 0.5, f: () => caneDraw(x * T, y * T, s.pct, s.ready, t) }); } }
    for (const o of shown.decor) items.push({ y: o.y + 1, f: () => drawDecor(o, t) });
    for (const b of shown.blds) items.push({ y: b.y + BUILDINGS[b.k].h, f: () => drawBuilding(b, t) });
    items.push({ y: FA.house.y + FA.house.h, f: () => drawHouse(t) });
    if (shown === mine) for (const h of hens) { h.x += h.v; if (h.x < h.x0 || h.x > h.x1) h.v *= -1; items.push({ y: h.y / T, f: () => hen(h, t) }); }
    items.sort((a, b) => a.y - b.y).forEach((i) => i.f());
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life++; if (q.life > q.max) { parts.splice(i, 1); continue; }
      const a = 1 - q.life / q.max;
      if (q.k === 't') { q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); c.font = '800 18px system-ui'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(q.txt, q.x, q.y); c.fillStyle = q.col; c.fillText(q.txt, q.x, q.y); c.globalAlpha = 1; }
      else { q.vy += 0.12; q.x += q.vx; q.y += q.vy; c.globalAlpha = a; c.fillStyle = q.col; c.fillRect(q.x, q.y, 4, 4); c.globalAlpha = 1; }
    }
    c.restore();
  }

  ctx.load().then((d) => { if (destroyed) return; mine = shown = normalize(d); loaded = true; initHens(); resolveChops(); drawUI(); }).catch((e) => { toast(e.message || 'Ferme indisponible.'); });
  home0(); drawUI();
  const sumTimer = setInterval(() => { if (!paused && shown === mine && !mode && $sheet.hidden && $bub.hidden) drawUI(); }, 15000);
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

