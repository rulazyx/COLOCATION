// « Colo-Ferme » v3 : une île à faire grandir, dessinée en canvas (rendu en relief, aucun emoji). On glisse le doigt pour se déplacer.
// Parcelles achetées en colocoins (1, 2, 3…), canne à sucre (1 h), arbres coupés avec du temps. Règles et données : ../farmlogic.js
import { FA, BUILDINGS, DECORS, newFarm, normalize, isLand, isSand, isCleared, isTree, onHouse, bldAt, decorAt, free, isOwned, canPlace, hasPort, shipState, shipCoins, frontier, growMs, yieldN, plotState, cycleMs, bldCycles, bldCoins, summary, chopMs } from '../farmlogic.js';

const T = FA.T, TAU = Math.PI * 2;
const CANE_ICON = (s = 16) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" style="vertical-align:-3px"><path d="M6 19V4M10 19V1M14 19V5" stroke="#5aa832" stroke-width="2.6" stroke-linecap="round"/><path d="M6 8h0M10 6h0M14 10h0" stroke="#e8f7b0" stroke-width="2" stroke-linecap="round"/></svg>`;
const COIN = (s = 18) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" style="vertical-align:-4px"><circle cx="10" cy="10" r="9" fill="#f6b91d" stroke="#9a6209" stroke-width="1.6"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#9a6209" stroke-width="1.4"/></svg>`;
const FRIENDS = (size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><circle cx="32" cy="16" r="6.5" fill="#93c5fd" stroke="#1e40af"/><path d="M21 39c0-7 5-12 11-12s11 5 11 12z" fill="#93c5fd" stroke="#1e40af"/><circle cx="17" cy="18" r="7" fill="#fca5a5" stroke="#991b1b"/><path d="M4 41c0-8 6-13 13-13s13 5 13 13z" fill="#fca5a5" stroke="#991b1b"/></svg>`;
const ICON = (inner, size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const I_BUILD = (s) => ICON('<path d="M6 24L24 9l18 15" stroke="#7a2e12" stroke-width="2.4" fill="#d96b2b"/><rect x="11" y="24" width="26" height="16" fill="#f2e3c0" stroke="#7a5a2e" stroke-width="2.4"/><rect x="21" y="29" width="7" height="11" rx="3" fill="#7b4a22"/>', s);
const I_DECOR = (s) => ICON('<path d="M24 41q3-13 0-24" stroke="#8a5a2b" stroke-width="3.4"/><path d="M24 17q-11-8-18 1M24 17q11-8 18 1M24 17q-7-11-12-13M24 17q7-11 12-13" stroke="#1f8f48" stroke-width="3.6"/><circle cx="21" cy="21" r="2.6" fill="#8a5a2b" stroke="none"/>', s);
const I_HOUSE = (s) => ICON('<path d="M4 24L24 7l20 17" stroke="#7a2e12" stroke-width="2.4" fill="#d96b2b"/><rect x="9" y="24" width="30" height="17" fill="#fbf1d8" stroke="#7a5a2e" stroke-width="2.4"/><rect x="19" y="29" width="8" height="12" rx="3" fill="#7b4a22"/><rect x="31" y="14" width="5" height="9" fill="#9b4b3a" stroke="#6e3427" stroke-width="1.6"/>', s);
const I_HARVEST = (s) => ICON('<path d="M14 42V16M24 42V8M34 42V18" stroke="#5aa832" stroke-width="5"/><path d="M14 24h0M24 18h0M34 26h0" stroke="#e8f7b0" stroke-width="3"/><path d="M10 40h28" stroke="#7a4d2a" stroke-width="4"/>', s);
const I_SHOP = (s) => ICON('<path d="M7 18h34l-3-9H10z" fill="#e5543f" stroke="#8a2a1c" stroke-width="2.4"/><path d="M7 18q4 6 8.5 0q4 6 8.5 0q4 6 8.5 0q4 6 8.5 0" fill="#fff4dc" stroke="#8a2a1c" stroke-width="2.2"/><rect x="10" y="24" width="28" height="16" fill="#f2e3c0" stroke="#7a5a2e" stroke-width="2.4"/><rect x="19" y="29" width="10" height="11" rx="2" fill="#7b4a22"/>', s);
const I_HELP = (s) => ICON('<circle cx="24" cy="24" r="17" fill="#ffc928" stroke="#9a6209" stroke-width="2.6"/><path d="M18 19c0-4 3-6 6-6s6 2 6 5.5c0 4-5 4.5-5 8" stroke="#4a2e05" stroke-width="3.6" fill="none"/><circle cx="25" cy="34" r="2.4" fill="#4a2e05" stroke="none"/>', s);
const I_BACK = (s) => ICON('<path d="M30 10L16 24l14 14" stroke="#1b1d22" stroke-width="5"/>', s);
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const fmtT = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

export function mount(root, ctx) {
  if (!document.getElementById('fm-css')) { const l = document.createElement('link'); l.id = 'fm-css'; l.rel = 'stylesheet'; l.href = new URL('./ferme.css', import.meta.url).href; document.head.appendChild(l); }
  root.classList.add('fm-root');
  root.innerHTML = `<canvas class="fm-cv"></canvas><div class="fm-ui"></div><div class="fm-bubble" hidden></div><div class="fm-sheet" hidden></div><div class="fm-toast" hidden></div><div class="fm-tuto" hidden></div>`;
  const cv = root.querySelector('canvas'), c = cv.getContext('2d', { alpha: false }), $ui = root.querySelector('.fm-ui'), $sheet = root.querySelector('.fm-sheet'), $bub = root.querySelector('.fm-bubble'), $toast = root.querySelector('.fm-toast'), $tuto = root.querySelector('.fm-tuto');
  let W = 360, H = 640, K = 1, raf = 0, destroyed = false, paused = false, view = 'home', toastT = 0;
  let mine = normalize(null), shown = mine, owner = ctx.meId, others = {}, mode = null, loaded = false, bubTile = null;
  const cam = { x: 0, y: 0, vx: 0, vy: 0 }, parts = [], anims = [];
  let dirty = false, saveT = 0;

  const fit = () => { K = Math.min(devicePixelRatio || 1, 2); W = Math.max(200, root.clientWidth || root.offsetWidth); H = Math.max(200, root.clientHeight || root.offsetHeight); cv.style.width = `${W}px`; cv.style.height = `${H}px`; cv.width = W * K; cv.height = H * K; c.setTransform(K, 0, 0, K, 0, 0); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(root); fit();
  const fitSoon = () => { fit(); setTimeout(fit, 250); setTimeout(fit, 900); }; fitSoon(); window.addEventListener('resize', fit);
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
      <button class="fm-round fr" data-fm="tuto" aria-label="Comment jouer">${I_HELP(26)}</button>${view === 'play' ? `<button class="fm-round" data-fm="friends" aria-label="Amis">${FRIENDS(30)}</button>` : ''}</div>`;
    if (view === 'home') {
      $ui.className = 'fm-ui m-home';
      $ui.innerHTML = `${top}<div class="fm-home"><h1>Colo-Ferme</h1><p class="fm-best">${mine.cane} canne${mine.cane > 1 ? 's' : ''} · ${mine.st.harvests} récolte${mine.st.harvests > 1 ? 's' : ''}</p>
        <div class="fm-row2"><button class="fm-btn go big" data-fm="play">${I_HARVEST(30)}Jouer${s.plots + s.blds ? `<i class="fm-dot">${s.plots + s.blds}</i>` : ''}</button><button class="fm-btn big white side" data-fm="friends" aria-label="Amis">${FRIENDS(34)}</button></div></div>`;
      return;
    }
    $ui.className = 'fm-ui m-play';
    const bar = own ? (mode ? `<button class="fm-btn go wide" data-fm="cancel">${mode.t === 'parcel' ? 'Annuler la parcelle' : 'Terminer le placement'}</button>` : `
      <button class="fm-tool" data-fm="menu" data-t="shop">${I_SHOP(34)}<span>Boutique</span></button>
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
    if (t === 'shop') {
      const n = FA.parcelCost(mine.owned.length), canP = ctx.coins() >= n, freeLeft = Math.max(0, 3 - mine.owned.length);
      const bl = (k) => { const B = BUILDINGS[k], done = B.port && mine.blds.some((z) => z.k === k), cnt = mine.blds.filter((z) => z.k === k).length;
        return `<button class="fm-row" data-fm="place" data-k="${k}" ${mine.cane >= B.cost && !done ? '' : 'disabled'}><span class="fm-ico">${buildIcon(k)}</span><span><b>${B.name}</b><small>${done ? 'Déjà construit' : B.text}${cnt && !B.port ? ` · ${cnt} construit${cnt > 1 ? 's' : ''}` : ''}</small></span>${done ? '<span class="fm-price">✓</span>' : price(B.cost)}</button>`; };
      return `<h3>Boutique</h3><p class="fm-sub">Les parcelles s'achètent en colocoins, les bâtiments en canne à sucre.</p>
        <button class="fm-row" data-fm="parcel" ${canP ? '' : 'disabled'}><span class="fm-ico">${buildIcon('parcelle')}</span><span><b>Parcelle de culture</b><small>${freeLeft ? `Gratuite · encore ${freeLeft} parcelle${freeLeft > 1 ? 's' : ''} offerte${freeLeft > 1 ? 's' : ''}` : 'Pour planter de la canne à sucre'}</small></span>${n ? `<span class="fm-price ${canP ? '' : 'no'}">${COIN(14)} ${n}</span>` : '<span class="fm-price">Gratuit</span>'}</button>
        <h4>Élevage et production</h4>${['poulailler', 'chevrerie', 'porcherie', 'brasserie', 'raffinerie'].map(bl).join('')}
        <h4>Port d'export</h4><p class="fm-sub">Le quai (sur la plage) et l'entrepôt sont nécessaires pour accéder à la mer.</p>${['quai', 'entrepot'].map(bl).join('')}`;
    }
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
  function portHTML() {
    const q = mine.blds.find((z) => z.k === 'quai'), e = mine.blds.find((z) => z.k === 'entrepot'), ok = hasPort(mine), sh = shipState(mine);
    let body;
    if (!ok) body = `<p class="fm-sub">Pour accéder à la mer et exporter ta marchandise, il te faut :</p><div class="fm-chk ${q ? 'ok' : ''}">${q ? '✓' : '○'} Un quai sur la plage</div><div class="fm-chk ${e ? 'ok' : ''}">${e ? '✓' : '○'} Un entrepôt d'export</div><p class="fm-sub" style="margin-top:10px">Construis ce qui manque dans la Boutique.</p>`;
    else if (sh.st === 'idle') body = `<p class="fm-sub">La mer est ouverte : le bateau t'attend à quai.</p><button class="fm-row" data-fm="ship" ${mine.cane >= FA.ship.cane ? '' : 'disabled'}><span><b>Charger le bateau</b><small>Il revient dans ${FA.ship.hours} h avec ${shipCoins(mine)} colocoins</small></span>${price(FA.ship.cane)}</button>`;
    else if (sh.st === 'away') body = `<p class="fm-sub">Le bateau est parti vendre ta marchandise.</p><div class="fm-bar2"><i style="width:${Math.round(sh.pct * 100)}%"></i></div><p class="fm-sub">Retour dans ${fmtT(sh.left)}</p>`;
    else body = `<p class="fm-sub">Le bateau est de retour !</p><button class="fm-row gold" data-fm="shipcash"><span><b>Récolter ${shipCoins(mine)} colocoins</b><small>Paiement de l'export</small></span></button>`;
    return `<h3>Port d'export</h3>${body}`;
  }
  const buy = (n) => { if (mine.cane < n) { toast('Pas assez de canne à sucre.'); return false; } mine.cane -= n; return true; };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fm]'); if (!b) { if (!$bub.hidden && e.target !== cv && !e.target.closest('.fm-bub')) closeBubble(); return; }
    if (b.disabled) return;
    const a = b.dataset.fm, k = b.dataset.k;
    if (a === 'close') return closeSheet();
    if (a === 'leave') return ctx.quit();
    if (a === 'play') { view = 'play'; closeSheet(); closeBubble(); home0(); drawUI(); return; }
    if (a === 'home') { view = 'home'; mode = null; closeSheet(); closeBubble(); shown = mine; owner = ctx.meId; initAnimals(); drawUI(); return; }
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
    if (a === 'parcel') { mode = { t: 'parcel' }; closeSheet(); drawUI(); toast('Touche un terrain dégagé pour poser ta parcelle.'); return; }
    if (a === 'ship') { if (buy(FA.ship.cane)) { mine.ship = { t: Date.now() }; touch(); drawUI(); openSheet(portHTML()); } return; }
    if (a === 'shipcash') {
      const n = shipCoins(mine); b.disabled = true;
      try { const got = await ctx.cash(n); mine.ship = null; mine.st.cash += got; touch(); const q = mine.blds.find((z) => z.k === 'quai'); if (q) { say((q.x + 1) * T, q.y * T - 20, `+${got}`, '#ffe14d'); puff((q.x + 1) * T, q.y * T, '#ffd23f', 12); }
        if (got < n) toast(got ? `Plafond du jour : ${got} colocoins crédités.` : 'Plafond du jour atteint (200 colocoins).'); } catch (er) { toast(er.message || 'Impossible de récolter.'); }
      closeSheet(); drawUI(); return;
    }
    if (a === 'tuto') { showTuto(0); return; }
    if (a === 'tnext') { showTuto(tutoI + 1); return; }
    if (a === 'tskip') { endTuto(); return; }
    if (a === 'plant') { const [x, y] = xy(); if (!isOwned(mine, x, y) || mine.plots[`${x},${y}`]) return closeBubble(); mine.plots[`${x},${y}`] = { t: Date.now(), k: 'canne' }; touch(); puff(x * T + 22, y * T + 30, '#7a4d2a', 8); closeBubble(); drawUI(); return; }
    if (a === 'harvest') { const [x, y] = xy(), key = `${x},${y}`, p = mine.plots[key]; if (p && plotState(mine, p).ready) { delete mine.plots[key]; const n = yieldN(mine); mine.cane += n; mine.st.harvests++; touch(); say(x * T + 22, y * T, `+${n}`, '#e6ffb0'); puff(x * T + 22, y * T + 12, '#8fd14f', 8); } closeBubble(); drawUI(); return; }
    if (a === 'chop') { const [x, y] = xy(); if (!isTree(mine, x, y) || !frontier(mine, x, y) || mine.chop[`${x},${y}`]) return closeBubble(); if (Object.keys(mine.chop).length >= FA.maxChop) { toast(`${FA.maxChop} arbres maximum en même temps.`); return closeBubble(); } mine.chop[`${x},${y}`] = { t: Date.now(), ms: chopMs(mine.st.trees + Object.keys(mine.chop).length) }; touch(); closeBubble(); puff(x * T + 22, y * T + 18, '#c9a46a', 8); return; }
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
    if (id === ctx.meId) { shown = mine; owner = id; mode = null; view = 'play'; closeSheet(); closeBubble(); initAnimals(); home0(); drawUI(); return; }
    let d = others[id];
    if (!d) { try { const rows = await ctx.others(); rows.forEach((r) => { others[r.member_id] = normalize(r.data); }); } catch { /* rien */ } d = others[id] ?? newFarm(); others[id] = d; }
    owner = id; shown = d; mode = null; view = 'play'; closeSheet(); closeBubble(); initAnimals(); home0(); drawUI();
  }

  /* ---------- Introduction et didacticiel ---------- */
  const tutoKey = `kaz-ferme-tuto-${ctx.meId}`;
  const tutoSeen = () => { try { return localStorage.getItem(tutoKey) === '1'; } catch { return true; } };
  const SLIDES = [
    { ico: I_HARVEST(76), t: 'Bienvenue à la Colo-Ferme !', p: "Ton île t'attend : fais pousser de la canne à sucre, élève des animaux et envoie ta marchandise par bateau pour gagner des colocoins." },
    { ico: buildIcon('parcelle'), t: 'Tes parcelles', p: "Ouvre la Boutique, choisis « Parcelle de culture » puis touche un terrain dégagé. Les 3 premières parcelles sont gratuites, les suivantes coûtent 1, 2, 3 colocoins…" },
    { ico: CANE_ICON(70), t: 'Planter et récolter', p: "Touche une parcelle vide, puis « Planter canne ». Elle pousse en 1 heure : reviens la toucher pour la collecter. Tout le monde commence avec 0 canne." },
    { ico: buildIcon('arbre'), t: 'Couper des arbres', p: "Les arbres au bord de ton terrain se coupent avec du temps (pas de canne). Tu peux en couper 3 en même temps, pour agrandir ton île." },
    { ico: buildIcon('chevrerie'), t: 'Bâtiments et animaux', p: "Avec ta canne, construis poulailler, enclos à chèvres ou à cochons, brasserie, raffinerie. Ils produisent des colocoins à récolter (2 cycles stockés au maximum)." },
    { ico: buildIcon('quai'), t: 'Le port', p: "Pour accéder à la mer, construis le quai (sur la plage) et l'entrepôt d'export. Charge ensuite le bateau de cannes : il revient avec des colocoins." },
    { ico: FRIENDS(70), t: 'À toi de jouer !', p: "Visite les îles de tes colocs avec le bouton Amis. Tu retrouves ce didacticiel avec le bouton « ? » en haut." },
  ];
  let tutoI = 0;
  function showTuto(i) {
    if (i >= SLIDES.length) return endTuto();
    tutoI = i; const sl = SLIDES[i], last = i === SLIDES.length - 1;
    closeSheet(); closeBubble();
    $tuto.innerHTML = `<div class="fm-tcard"><div class="fm-tico">${sl.ico}</div><h2>${sl.t}</h2><p>${sl.p}</p>
      <div class="fm-tdots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="fm-btn go big" data-fm="tnext">${last ? "C'est parti !" : 'Suivant'}</button>${last ? '' : '<button class="fm-tskip" data-fm="tskip">Passer</button>'}</div>`;
    $tuto.hidden = false;
  }
  function endTuto() { $tuto.hidden = true; $tuto.innerHTML = ''; try { localStorage.setItem(tutoKey, '1'); } catch { /* rien */ } }

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
    if (mode?.t === 'parcel') {
      if (!free(mine, x, y)) return toast('Choisis un terrain dégagé et libre.');
      const n = FA.parcelCost(mine.owned.length);
      if (n && ctx.coins() < n) { mode = null; drawUI(); return toast('Pas assez de colocoins.'); }
      mode = null; drawUI();
      (async () => {
        try { if (n) await ctx.spend(n); mine.owned.push(`${x},${y}`); touch(); puff(x * T + 22, y * T + 22, '#8b5a2b', 12); say(x * T + 22, y * T, n ? `-${n}` : 'Parcelle !', n ? '#ffd23f' : '#e6ffb0'); }
        catch (er) { toast(er.message || 'Achat impossible.'); }
        drawUI();
      })();
      return;
    }
    if (mode?.t === 'build') {
      if (!canPlace(mine, mode.k, x, y)) return toast(BUILDINGS[mode.k].sand ? 'Le quai se pose sur la plage, au bord de l\'eau.' : 'Emplacement occupé : choisis une zone dégagée.');
      const B = BUILDINGS[mode.k]; if (!buy(B.cost)) { mode = null; return drawUI(); }
      mine.blds.push({ k: mode.k, x, y, lvl: 1, t: Date.now() }); mine.st.builds++; mode = null; touch(); initAnimals(); drawUI(); puff(x * T + T, y * T + T, '#d8c9a8', 18); return;
    }
    if (mode?.t === 'decor') {
      if (!free(mine, x, y)) return toast('Emplacement occupé.');
      const D = DECORS[mode.k]; if (!buy(D.cost)) { mode = null; return drawUI(); }
      mine.decor.push({ k: mode.k, x, y }); mine.st.decor++; touch(); drawUI(); puff(wx, y * T + T, '#ffe9a8', 8); return;
    }
    if (onHouse(x, y)) return openSheet(menuHTML('house'));
    const bl = bldAt(mine, x, y); if (bl) return openSheet(BUILDINGS[bl.k].port ? portHTML() : bldHTML(bl));
    const dc = decorAt(mine, x, y); if (dc) return openBubble(x, y, `<b>${DECORS[dc.k].name}</b><div class="fm-bbtns"><button class="fm-bb go" data-fm="rm" data-t="${x},${y}">Ranger (+${Math.floor(DECORS[dc.k].cost / 2)} cannes)</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`);
    if (isSand(x, y)) return;
    const key = `${x},${y}`, p = mine.plots[key];
    if (p) {
      const s = plotState(mine, p), left = growMs(mine) * (1 - s.pct);
      return openBubble(x, y, s.ready ? `<b>Canne à sucre prête !</b><small>Récolte : +${yieldN(mine)} cannes</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="harvest" data-t="${key}">Collecter</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`
        : `<b>Canne à sucre</b><div class="fm-bar2"><i style="width:${Math.round(s.pct * 100)}%"></i></div><small>Encore ${fmtT(left)} avant la collecte</small><div class="fm-bbtns"><button class="fm-bb" data-fm="bclose">Fermer</button></div>`);
    }
    if (isOwned(mine, x, y)) return openBubble(x, y, `<b>Parcelle vide</b><small>La canne met ${fmtT(growMs(mine))} à pousser</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="plant" data-t="${key}">${CANE_ICON(16)} Planter canne</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>`);
    if (isTree(mine, x, y)) {
      const ch = mine.chop[key], nChop = Object.keys(mine.chop).length;
      if (ch) return openBubble(x, y, `<b>Coupe en cours…</b><div class="fm-bar2"><i style="width:${Math.round(Math.min(1, (Date.now() - ch.t) / ch.ms) * 100)}%"></i></div><small>Encore ${fmtT(ch.ms - (Date.now() - ch.t))}</small><div class="fm-bbtns"><button class="fm-bb" data-fm="bclose">Fermer</button></div>`);
      if (!frontier(mine, x, y)) return toast('Coupe d\'abord les arbres au bord de ton terrain.');
      const ms = chopMs(mine.st.trees + nChop);
      return openBubble(x, y, `<b>Couper cet arbre</b><small>Ça prend ${fmtT(ms)} et agrandit ton terrain · ${nChop}/${FA.maxChop} coupes en cours</small><div class="fm-bbtns"><button class="fm-bb go" data-fm="chop" data-t="${key}" ${nChop >= FA.maxChop ? 'disabled' : ''}>Couper</button><button class="fm-bb" data-fm="bclose">Annuler</button></div>${nChop >= FA.maxChop ? `<small class="fm-no">${FA.maxChop} arbres maximum en même temps</small>` : ''}`);
    }
    if (free(mine, x, y)) toast('Pour cultiver ici, achète une parcelle dans la Boutique.');
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
  const GR = [['#a8e266', '#8fd04f'], ['#9ddb5a', '#86c746'], ['#aee56d', '#93d453'], ['#98d655', '#80c244']];
  const grass = (v, fl) => sprite(`gr${v}${fl ? 'f' : ''}`, T + 1, T + 1, (g) => {
    g.fillStyle = lin(g, 0, T, GR[v][0], GR[v][1]); g.fillRect(0, 0, T + 1, T + 1);
    g.fillStyle = 'rgba(255,255,200,.10)'; g.beginPath(); g.ellipse(14 + v * 6, 12, 18, 9, 0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,110,20,.10)'; g.beginPath(); g.ellipse(T - 12 - v * 4, T - 10, 16, 8, -0.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,110,20,.38)'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const bx = 5 + hash(i, v) * (T - 10), by = 12 + hash(v, i) * (T - 14); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 1.6, by - 5.5); g.moveTo(bx + 2.6, by); g.lineTo(bx + 3.4, by - 6.5); g.moveTo(bx + 5, by); g.lineTo(bx + 6.4, by - 4.4); g.stroke(); }
    if (fl) for (let i = 0; i < 3; i++) { const fx = 8 + hash(i, 5) * (T - 16), fy = 10 + hash(5, i) * (T - 18); g.fillStyle = ['#fff', '#ffd23f', '#ff9ec4'][i]; g.beginPath(); g.arc(fx, fy, 2.6, 0, TAU); g.fill(); g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(fx, fy, 1, 0, TAU); g.fill(); }
  });
  const sandT = (v) => sprite(`sd${v}`, T + 1, T + 1, (g) => {
    g.fillStyle = lin(g, 0, T, '#f9e7ad', '#edd38e'); g.fillRect(0, 0, T + 1, T + 1); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, T + 1, 2);
    g.fillStyle = 'rgba(160,120,50,.28)'; for (let i = 0; i < 7; i++) g.fillRect(4 + hash(i, v + 3) * (T - 8), 4 + hash(v + 3, i) * (T - 8), 2, 1.5);
    g.strokeStyle = 'rgba(190,150,70,.25)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(6, 14 + v * 10); g.quadraticCurveTo(T / 2, 8 + v * 10, T - 6, 15 + v * 10); g.stroke();
  });
  const forest = () => sprite('fo', T + 1, T + 1, (g) => {
    g.fillStyle = lin(g, 0, T, '#4f9f33', '#3f8a28'); g.fillRect(0, 0, T + 1, T + 1);
    for (let i = 0; i < 6; i++) { const bx = hash(i, 2) * T, by = hash(2, i) * T; g.fillStyle = i % 2 ? 'rgba(20,80,20,.28)' : 'rgba(150,220,90,.18)'; g.beginPath(); g.arc(bx, by, 7 + hash(i, i) * 5, 0, TAU); g.fill(); }
  });
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
  // Maison en perspective : face avant, côté droit plus sombre (profondeur vers le haut-droite), toit à faîtage horizontal (pan avant) et pignon visible côté droit
  function hut(g, w, h, o) {
    const d = 12, k = 0.55, wallH = o.wallH ?? h * 0.5, yb = h, rh = o.rh ?? 34, x = 6, ww = w - 6 - d - 8, yt = yb - wallH, ov = 5;
    const ry = yt - rh - d * k / 2, rx0 = x - ov + d / 2, rx1 = x + ww + ov + d / 2;
    g.fillStyle = 'rgba(0,40,0,.25)'; g.beginPath(); g.ellipse(x + ww / 2 + d / 2, yb - d * k / 2 + 2, ww / 2 + d + 4, 8, 0, 0, TAU); g.fill();
    g.lineJoin = 'round'; g.lineWidth = 2;
    // côté droit
    g.fillStyle = o.side; g.strokeStyle = o.line; g.beginPath(); g.moveTo(x + ww, yt); g.lineTo(x + ww + d, yt - d * k); g.lineTo(x + ww + d, yb - d * k); g.lineTo(x + ww, yb); g.closePath(); g.fill(); g.stroke();
    // pignon (triangle sur le côté droit)
    g.fillStyle = o.gable ?? o.side; g.beginPath(); g.moveTo(x + ww, yt); g.lineTo(x + ww + d, yt - d * k); g.lineTo(x + ww + d / 2, ry + 1); g.closePath(); g.fill(); g.stroke();
    // face avant
    g.fillStyle = lin(g, yt, yb, o.wall[0], o.wall[1]); g.fillRect(x, yt, ww, wallH); g.strokeRect(x, yt, ww, wallH);
    g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x + 1, yb - 5, ww - 2, 4);
    // toit : pan avant en trapèze, bandeaux de tuiles
    g.fillStyle = lin(g, ry, yt + 3, o.roof[0], o.roof[1]); g.beginPath(); g.moveTo(x - ov, yt + 3); g.lineTo(x + ww + ov, yt + 3); g.lineTo(rx1, ry); g.lineTo(rx0, ry); g.closePath(); g.fill(); g.stroke();
    g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1.4;
    for (let i = 1; i < 5; i++) { const yy = ry + (yt + 3 - ry) * i / 5; g.beginPath(); g.moveTo(x - 20, yy); g.lineTo(x + ww + 30, yy); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x - 20, ry, ww + 60, 4); g.restore();
    g.fillStyle = o.roofSide; g.beginPath(); g.moveTo(x + ww + ov, yt + 3); g.lineTo(rx1, ry); g.lineTo(rx1 - 2, ry + 3); g.lineTo(x + ww + ov - 2, yt + 3); g.closePath(); g.fill();
    const q = { x, ww, wallH, yb, yt, ry, d, rh };
    o.detail?.(g, q);
    return q;
  }
  const door = (g, cx, yb, w = 18, h = 26) => { g.fillStyle = '#5a3414'; g.beginPath(); g.roundRect(cx - w / 2, yb - h, w, h, [w / 2, w / 2, 1, 1]); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(cx - w / 2 + 2, yb - h + 4, 3, h - 6); };
  const win = (g, x, y, w = 17, h = 15) => { g.fillStyle = lin(g, y, y + h, '#d6f1ff', '#8cc8e6'); g.fillRect(x, y, w, h); g.strokeStyle = '#7a5a2e'; g.lineWidth = 1.8; g.strokeRect(x, y, w, h); g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke(); };
  const chimney = (g, q, fx) => { const cx = q.x + q.ww * fx; g.fillStyle = lin(g, q.ry - 16, q.ry + 16, '#c4695a', '#8a3f2c'); g.fillRect(cx, q.ry - 16, 14, 28); g.fillStyle = '#6e3427'; g.fillRect(cx - 2, q.ry - 19, 18, 5); };
  const bH = (B) => B.h * T + 34 + (B.animal ? 56 : 0);
  const crate = (g, x, y, s = 14) => { g.fillStyle = lin(g, y, y + s, '#d9a45a', '#a8742e'); g.fillRect(x, y, s, s); g.strokeStyle = '#6e4a1e'; g.lineWidth = 1.4; g.strokeRect(x, y, s, s); g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s); g.moveTo(x + s, y); g.lineTo(x, y + s); g.stroke(); };
  function penSpr(k, lvl) {
    const B = BUILDINGS[k], w = B.w * T + 14, h = bH(B), fy = h - B.h * T, goat = k === 'chevrerie';
    return sprite(`pen:${k}:${lvl}`, w, h, (g) => {
      g.fillStyle = 'rgba(0,40,0,.22)'; g.beginPath(); g.roundRect(7, fy + 4, w - 14, B.h * T - 2, 14); g.fill();
      g.fillStyle = lin(g, fy, h, goat ? '#dcc78a' : '#b98355', goat ? '#c7ad6c' : '#94623a'); g.beginPath(); g.roundRect(6, fy, w - 12, B.h * T - 6, 12); g.fill();
      g.strokeStyle = goat ? 'rgba(150,110,40,.35)' : 'rgba(70,40,15,.3)'; g.lineWidth = 1.4; for (let i = 0; i < 14; i++) { const sx = 14 + hash(i, lvl + 3) * (w - 34), sy = fy + 10 + hash(lvl + 3, i) * (B.h * T - 30); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 6, sy - 1.5); g.stroke(); }
      if (!goat) { g.fillStyle = 'rgba(80,120,150,.85)'; g.beginPath(); g.ellipse(w - 42, fy + B.h * T - 34, 22, 8, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(w - 46, fy + B.h * T - 36, 8, 2.4, 0, 0, TAU); g.fill(); }
      else { g.fillStyle = lin(g, fy + 40, fy + 60, '#b08040', '#7e5424'); g.fillRect(w - 52, fy + 38, 30, 9); g.strokeStyle = '#5a3a14'; g.lineWidth = 1.5; g.strokeRect(w - 52, fy + 38, 30, 9); g.fillStyle = '#7fc84a'; g.fillRect(w - 50, fy + 36, 26, 4); }
      // abri au fond à gauche
      g.save(); g.translate(10, fy + 8 - 74); hut(g, 96, 74, { wall: goat ? ['#e8c586', '#c9a05c'] : ['#e7a7a0', '#c97f78'], side: goat ? '#a97f3d' : '#a45f58', gable: goat ? '#b88a46' : '#b46c64', line: '#5e3d17', roof: goat ? ['#b9602f', '#8d3f1a'] : ['#6a8fb0', '#476b8c'], roofSide: '#3a2a16', rh: 20, wallH: 36,
        detail: (g2, q) => { door(g2, q.x + q.ww * 0.5, q.yb, 20, 24); } }); g.restore();
      // clôture du fond + côtés
      g.lineJoin = 'round'; g.strokeStyle = '#6e4a1e'; g.lineWidth = 1.6;
      const post = (px, py) => { g.fillStyle = lin(g, py - 20, py, '#e9d3a2', '#bfa56c'); g.fillRect(px - 2.6, py - 20, 5.2, 22); g.strokeRect(px - 2.6, py - 20, 5.2, 22); };
      for (let px = 106; px <= w - 10; px += 22) post(px, fy + 6);
      g.fillStyle = '#d6bd86'; g.fillRect(104, fy - 8, w - 112, 3.4); g.fillRect(104, fy - 1, w - 112, 3.4);
      for (const sx of [10, w - 10]) { for (let py = fy + 28; py <= h - 12; py += 22) post(sx, py); g.fillStyle = '#d6bd86'; g.fillRect(sx - 1.7, fy + 8, 3.4, h - fy - 22); }
    });
  }
  function penFront(k) {
    const B = BUILDINGS[k], w = B.w * T + 14;
    return sprite(`penf:${k}`, w, 30, (g) => {
      g.lineJoin = 'round'; g.strokeStyle = '#6e4a1e'; g.lineWidth = 1.6;
      g.fillStyle = '#d6bd86'; g.fillRect(8, 12, w - 16, 3.6); g.fillRect(8, 19, w - 16, 3.6);
      for (let px = 12; px <= w - 10; px += 22) { g.fillStyle = lin(g, 2, 26, '#ecd8a8', '#bfa56c'); g.fillRect(px - 2.8, 2, 5.6, 24); g.strokeRect(px - 2.8, 2, 5.6, 24); }
    });
  }
  const bsp = (k, lvl) => {
    const B = BUILDINGS[k], w = B.w * T + 14, h = bH(B);
    if (B.animal) return penSpr(k, lvl);
    return sprite(`b:${k}:${lvl}`, w, h, (g) => {
      if (k === 'poulailler') hut(g, w, h, { wall: ['#f0c27a', '#d9a35a'], side: '#b9803f', line: '#6e4a1e', roof: ['#e5543f', '#b83a2a'], roofSide: '#962c20', rh: 26,
        detail: (g2, q) => { g2.strokeStyle = 'rgba(120,70,20,.4)'; g2.lineWidth = 1.2; for (let i = 1; i < 6; i++) { g2.beginPath(); g2.moveTo(q.x + i * (q.ww / 6), q.yt + 2); g2.lineTo(q.x + i * (q.ww / 6), q.yb - 2); g2.stroke(); } door(g2, q.x + q.ww / 2, q.yb, 18, 24); } });
      else if (k === 'brasserie') hut(g, w, h, { wall: ['#c58a52', '#a56d3a'], side: '#7e5028', line: '#4a2c10', roof: ['#6e4524', '#4e2f15'], roofSide: '#3b2310', rh: 26,
        detail: (g2, q) => { door(g2, q.x + q.ww * 0.28, q.yb, 20, 28); for (let i = 0; i < 2; i++) { const bx = q.x + q.ww * 0.55 + i * 28; g2.fillStyle = lin(g2, q.yb - 28, q.yb, '#b98438', '#8a5a22'); g2.beginPath(); g2.roundRect(bx, q.yb - 28, 22, 28, 7); g2.fill(); g2.strokeStyle = '#4a2a0c'; g2.lineWidth = 1.6; g2.stroke(); g2.fillStyle = '#e3b04b'; g2.fillRect(bx, q.yb - 21, 22, 3); g2.fillRect(bx, q.yb - 9, 22, 3); }
          chimney(g2, q, 0.7); } });
      else if (k === 'entrepot') hut(g, w, h, { wall: ['#c9d4df', '#a2b3c4'], side: '#7c8ea0', gable: '#8d9fb1', line: '#41505f', roof: ['#b5473c', '#8b2f27'], roofSide: '#5e1f1a', rh: 24,
        detail: (g2, q) => { g2.fillStyle = '#6a7b8c'; g2.beginPath(); g2.roundRect(q.x + q.ww * 0.5 - 22, q.yb - 36, 44, 36, 3); g2.fill(); g2.strokeStyle = '#34414e'; g2.lineWidth = 1.8; g2.stroke(); g2.beginPath(); g2.moveTo(q.x + q.ww * 0.5, q.yb - 36); g2.lineTo(q.x + q.ww * 0.5, q.yb); g2.stroke(); g2.fillStyle = 'rgba(255,255,255,.16)'; g2.fillRect(q.x + q.ww * 0.5 - 20, q.yb - 34, 18, 32);
          crate(g2, q.x + 4, q.yb - 14, 14); crate(g2, q.x + q.ww - 22, q.yb - 14, 14); crate(g2, q.x + q.ww - 22, q.yb - 28, 14); } });
      else if (k === 'quai') {
        const px = 8, pw = w - 20, py = h - 30;
        g.fillStyle = 'rgba(0,50,80,.3)'; g.beginPath(); g.ellipse(w / 2 + 4, h - 3, pw / 2 + 4, 6, 0, 0, TAU); g.fill();
        g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = '#4a2c10';
        g.fillStyle = '#6e4a1e'; g.fillRect(px, py + 14, pw, 11); g.strokeRect(px, py + 14, pw, 11);
        g.fillStyle = lin(g, py, py + 14, '#d9a766', '#b9803f'); g.beginPath(); g.moveTo(px, py + 14); g.lineTo(px + 12, py); g.lineTo(px + pw + 12, py); g.lineTo(px + pw, py + 14); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = 'rgba(80,45,15,.5)'; g.lineWidth = 1.2; for (let i = 1; i < 6; i++) { const xx = px + i * pw / 6; g.beginPath(); g.moveTo(xx, py + 14); g.lineTo(xx + 12, py); g.stroke(); }
        g.strokeStyle = '#4a2c10'; g.lineWidth = 2; for (const xx of [px + 4, px + pw - 4]) { g.fillStyle = '#7a5226'; g.fillRect(xx - 3, py - 12, 6, 26); g.strokeRect(xx - 3, py - 12, 6, 26); }
        g.strokeStyle = '#e8d3a2'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(px + 4, py - 8); g.quadraticCurveTo(px + pw / 2, py + 4, px + pw - 4, py - 8); g.stroke();
        crate(g, px + pw - 40, py - 12, 16); g.fillStyle = lin(g, py - 20, py, '#9a6a2e', '#6e4423'); g.beginPath(); g.roundRect(px + 22, py - 20, 16, 20, 5); g.fill(); g.strokeStyle = '#3a210a'; g.lineWidth = 1.6; g.stroke();
      }
      else hut(g, w, h, { wall: ['#faf1da', '#e4d7b4'], side: '#bdb08a', line: '#7f7452', roof: ['#8d9bab', '#65727f'], roofSide: '#4d5963', rh: 24,
        detail: (g2, q) => { door(g2, q.x + q.ww * 0.62, q.yb, 18, 26); win(g2, q.x + 10, q.yt + 14); chimney(g2, q, 0.72); } });
    });
  };
  const houseSpr = (L) => {
    const w = FA.house.w * T + 16, h = FA.house.h * T + 30;
    return sprite(`house:${L}`, w, h, (g) => {
      hut(g, w, h, { wall: L > 1 ? ['#fff6e0', '#ecdcb6'] : ['#f6e8c4', '#e0cc9e'], side: '#bfa97a', gable: '#cdb98a', line: '#7f6a3e', roof: ['#e8793a', '#bf5420'], roofSide: '#92401a', rh: 40,
        detail: (g2, q) => { door(g2, q.x + q.ww / 2, q.yb, 24, 36); win(g2, q.x + 14, q.yt + 22, 22, 20); win(g2, q.x + q.ww - 36, q.yt + 22, 22, 20);
          g2.fillStyle = '#7a4a22'; g2.fillRect(q.x + 8, q.yt + 44, 34, 4); g2.fillRect(q.x + q.ww - 42, q.yt + 44, 34, 4);   // jardinières
          g2.fillStyle = '#ff6b9d'; for (let i = 0; i < 4; i++) { g2.beginPath(); g2.arc(q.x + 12 + i * 9, q.yt + 42, 3, 0, TAU); g2.arc(q.x + q.ww - 38 + i * 9, q.yt + 42, 3, 0, TAU); g2.fill(); }
          if (L >= 2) chimney(g2, q, 0.14); } });
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
  function drawBuilding(b, t, pass = 2) {          // pass 0 = fond (enclos), 1 = devant (clôture, pastilles), 2 = tout
    const B = BUILDINGS[b.k], x = b.x * T - 4, y = (b.y + B.h) * T + 4 - bH(B);
    if (pass !== 1) c.drawImage(bsp(b.k, b.lvl), x, y, B.w * T + 14, bH(B));
    if (pass === 0) return;
    if (B.animal) c.drawImage(penFront(b.k), x, (b.y + B.h) * T - 22, B.w * T + 14, 30);
    if (b.k === 'quai' && hasPort(shown) && shipState(shown).st !== 'away') drawBoat(b, t);
    const cx = b.x * T + B.w * T - 20;
    if (b.k === 'brasserie' || b.k === 'raffinerie') { c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 3; k++) { const p = (t * 0.45 + k / 3) % 1; c.globalAlpha = 1 - p; c.beginPath(); c.arc(cx - 12 + Math.sin(p * 5 + k) * 5, y + 10 - p * 26, 4 + p * 6, 0, TAU); c.fill(); } c.globalAlpha = 1; }
    if (!B.port) { c.fillStyle = '#ffc928'; for (let i = 0; i < b.lvl; i++) { c.beginPath(); c.arc(b.x * T + 12 + i * 12, (b.y + B.h) * T + 8, 4.2, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 1.2; c.stroke(); } }
    const ready = B.port ? (b.k === 'quai' && shown === mine && hasPort(mine) && shipState(mine).st === 'ready') : (shown === mine && bldCycles(b) > 0);
    if (ready) { const by = y - 6 + Math.sin(t * 4) * 3 + (B.animal ? 40 : 0), bx = b.x * T + B.w * T / 2; c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(bx, by, 12, 0, TAU); c.fill(); c.strokeStyle = '#9a6209'; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#9a6209'; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.fillText('$', bx, by + 5); }
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
  /* ---------- Animaux : poules, chèvres, cochons (ils se promènent dans leur enclos) ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  function initAnimals() {
    anims.length = 0;
    for (const b of shown.blds) {
      const B = BUILDINGS[b.k]; if (b.k !== 'poulailler' && !B.animal) continue;
      const kind = b.k === 'poulailler' ? 'poule' : B.animal, n = kind === 'poule' ? 2 : 3;
      const bx = kind === 'poule' ? { x0: b.x * T + 6, x1: (b.x + B.w) * T - 6, y0: (b.y + B.h) * T + 6, y1: (b.y + B.h) * T + 26 } : { x0: b.x * T + 22, x1: (b.x + B.w) * T - 18, y0: b.y * T + 52, y1: (b.y + B.h) * T - 12 };
      for (let i = 0; i < n; i++) { const x = rnd(bx.x0, bx.x1), y = rnd(bx.y0, bx.y1); anims.push({ k: kind, x, y, tx: x, ty: y, wait: rnd(0, 90), face: Math.random() < 0.5 ? 1 : -1, moving: false, sp: kind === 'poule' ? 0.35 : kind === 'chevre' ? 0.28 : 0.22, bx }); }
    }
  }
  function stepAnimals() {
    for (const a of anims) {
      if (a.wait > 0) { a.wait--; a.moving = false; continue; }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d < 1.5) { a.wait = 40 + Math.random() * 160; a.tx = rnd(a.bx.x0, a.bx.x1); a.ty = rnd(a.bx.y0, a.bx.y1); a.moving = false; continue; }
      a.moving = true; a.x += dx / d * a.sp; a.y += dy / d * a.sp; if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
    }
  }
  const shadowE = (rx) => { c.fillStyle = 'rgba(0,40,0,.25)'; c.beginPath(); c.ellipse(0, 2, rx, rx * 0.32, 0, 0, TAU); c.fill(); };
  function henShape() { shadowE(8); c.fillStyle = rad(c, 0, -6, 8, '#fff', '#dfe3e8'); c.beginPath(); c.ellipse(0, -6, 8, 7, 0, 0, TAU); c.fill(); c.fillStyle = '#d6dbe2'; c.beginPath(); c.ellipse(-3, -6, 4.5, 3, 0.4, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(7, -12, 4, 0, TAU); c.fill(); c.fillStyle = '#e63946'; c.fillRect(5, -17, 4, 3); c.fillStyle = '#f59e0b'; c.beginPath(); c.moveTo(10, -12); c.lineTo(14, -11); c.lineTo(10, -10); c.fill(); c.fillStyle = '#111'; c.fillRect(8, -13, 1.6, 1.6); c.fillStyle = '#f59e0b'; c.fillRect(-2, -1, 1.6, 4); c.fillRect(2, -1, 1.6, 4); }
  function goatShape() {
    shadowE(13); c.fillStyle = '#8b7d68'; for (const lx of [-8, -4, 4, 8]) c.fillRect(lx - 1, -7, 2.4, 8);
    c.fillStyle = rad(c, 0, -13, 12, '#fffaf0', '#d6ccb8'); c.beginPath(); c.ellipse(0, -13, 12.5, 7.2, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8e0d0'; c.beginPath(); c.moveTo(-11, -16); c.lineTo(-15.5, -21); c.lineTo(-9, -18); c.fill();
    c.fillStyle = '#f6f0e4'; c.beginPath(); c.ellipse(9, -18, 4.2, 6.5, -0.5, 0, TAU); c.fill(); c.beginPath(); c.ellipse(13.5, -22.5, 5.2, 3.8, 0.2, 0, TAU); c.fill();
    c.fillStyle = '#cfc4ad'; c.beginPath(); c.moveTo(15, -20); c.lineTo(15.8, -14.5); c.lineTo(13, -19); c.fill();
    c.strokeStyle = '#8a7a55'; c.lineWidth = 1.9; c.lineCap = 'round'; c.beginPath(); c.moveTo(11, -25); c.quadraticCurveTo(8, -32, 3.5, -29.5); c.stroke();
    c.fillStyle = '#d8cdb6'; c.beginPath(); c.ellipse(9.5, -23, 3.2, 1.4, 0.6, 0, TAU); c.fill(); c.fillStyle = '#222'; c.fillRect(14.5, -24, 1.6, 1.6); c.fillStyle = '#b89c8a'; c.fillRect(17.5, -22, 1.6, 1.4);
  }
  function pigShape() {
    shadowE(14); c.fillStyle = '#e0788f'; for (const lx of [-8, -3, 3, 8]) c.fillRect(lx - 1.2, -6, 2.8, 7);
    c.fillStyle = rad(c, 0, -11, 13, '#ffc2cf', '#ee8fa6'); c.beginPath(); c.ellipse(0, -11, 13.5, 8.4, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.ellipse(-2, -15, 8, 2.8, 0, 0, TAU); c.fill();
    c.strokeStyle = '#e0788f'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); c.arc(-15, -14, 3.4, -1.2, 3.6); c.stroke();
    c.fillStyle = rad(c, 12, -12, 7, '#ffc9d5', '#ee8fa6'); c.beginPath(); c.arc(12, -12, 6.6, 0, TAU); c.fill();
    c.fillStyle = '#e0788f'; c.beginPath(); c.moveTo(8, -17); c.lineTo(11, -22); c.lineTo(13, -17); c.fill();
    c.fillStyle = '#f7a1b4'; c.beginPath(); c.ellipse(18, -11, 3.6, 3.1, 0, 0, TAU); c.fill(); c.fillStyle = '#9b3b52'; c.fillRect(17, -12, 1.2, 1.8); c.fillRect(19.2, -12, 1.2, 1.8);
    c.fillStyle = '#222'; c.fillRect(13, -15, 1.7, 1.7);
  }
  function drawAnimal(a) { c.save(); c.translate(a.x, a.y - (a.moving ? Math.abs(Math.sin(a.x * 0.35 + a.y * 0.2)) * 1.8 : 0)); c.scale(a.face, 1); (a.k === 'poule' ? henShape : a.k === 'chevre' ? goatShape : pigShape)(); c.restore(); }
  function seaDir(b) {
    const B = BUILDINGS[b.k], x = b.x, y = b.y, w = B.w, h = B.h;
    const ch = [[0, 1, () => { for (let i = 0; i < w; i++) if (!isLand(x + i, y + h)) return true; return false; }], [1, 0, () => { for (let j = 0; j < h; j++) if (!isLand(x + w, y + j)) return true; return false; }], [-1, 0, () => { for (let j = 0; j < h; j++) if (!isLand(x - 1, y + j)) return true; return false; }], [0, -1, () => { for (let i = 0; i < w; i++) if (!isLand(x + i, y - 1)) return true; return false; }]];
    return (ch.find((q) => q[2]()) ?? ch[0]).slice(0, 2);
  }
  function drawBoat(b, t) {
    const B = BUILDINGS[b.k], [dx, dy] = seaDir(b), cx = (b.x + B.w / 2) * T + dx * T * (B.w / 2 + 1.0), cy = (b.y + B.h) * T - T * 0.1 + dy * T * 1.15 + (dx ? -T * 0.2 : 0);
    c.save(); c.translate(cx, cy + Math.sin(t * 1.6) * 2.4); c.rotate(Math.sin(t * 1.3) * 0.04);
    c.fillStyle = 'rgba(0,50,80,.3)'; c.beginPath(); c.ellipse(2, 8, 30, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#7a4a22'; c.strokeStyle = '#3f2410'; c.lineWidth = 2; c.beginPath(); c.moveTo(-28, -4); c.lineTo(28, -4); c.lineTo(20, 9); c.lineTo(-20, 9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#c0392b'; c.fillRect(-26, -4, 52, 4);
    c.strokeStyle = '#4a2c10'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -44); c.stroke();
    c.fillStyle = '#fff'; c.strokeStyle = '#9fb0bf'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(2, -42); c.quadraticCurveTo(24 + Math.sin(t * 2) * 2, -26, 22, -9); c.lineTo(2, -9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(0, -44); c.lineTo(-12, -40); c.lineTo(0, -36); c.fill();
    if (shipState(shown).st === 'ready') { c.fillStyle = '#c8873d'; c.fillRect(-20, -14, 12, 10); c.fillRect(-7, -12, 10, 8); }
    c.restore();
  }
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
    // eaux peu profondes autour de l'île, ombre portée, falaise, écume
    for (const [pad, al] of [[26, 0.13], [14, 0.2]]) { c.fillStyle = `rgba(170,240,240,${al})`; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isLand(x, y)) { rr(x * T - pad, y * T - pad, T + pad * 2, T + pad * 2 + 8, pad + 4); c.fill(); } }
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
      c.drawImage(isSand(x, y) ? sandT(v) : isCleared(shown, x, y) ? grass(Math.floor(hash(x, y) * 4) % 4, hash(x + 9, y + 4) > 0.93) : forest(), px, py, T + 0.5, T + 0.5);
      
      if (shown.owned.includes(`${x},${y}`) && !shown.plots[`${x},${y}`]) c.drawImage(soil(), px, py, T, T);
    }
    if (mode && shown === mine) { c.fillStyle = 'rgba(255,255,255,.3)'; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mode.t === 'decor' || mode.t === 'parcel' ? free(mine, x, y) : canPlace(mine, mode.k, x, y)) c.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
    const items = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isTree(shown, x, y)) items.push({ y: y + 1, f: () => drawTree(x, y, t) });
    for (const [kk, p] of Object.entries(shown.plots)) { const [x, y] = kk.split(',').map(Number); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { const s = plotState(shown, p); items.push({ y: y + 0.5, f: () => caneDraw(x * T, y * T, s.pct, s.ready, t) }); } }
    for (const o of shown.decor) items.push({ y: o.y + 1, f: () => drawDecor(o, t) });
    for (const b of shown.blds) { const B = BUILDINGS[b.k]; if (B.animal) { items.push({ y: b.y + 0.4, f: () => drawBuilding(b, t, 0) }); items.push({ y: b.y + B.h, f: () => drawBuilding(b, t, 1) }); } else items.push({ y: b.y + B.h, f: () => drawBuilding(b, t, 2) }); }
    items.push({ y: FA.house.y + FA.house.h, f: () => drawHouse(t) });
    stepAnimals(); for (const a of anims) items.push({ y: a.y / T, f: () => drawAnimal(a) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.f());
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life++; if (q.life > q.max) { parts.splice(i, 1); continue; }
      const a = 1 - q.life / q.max;
      if (q.k === 't') { q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); c.font = '800 18px system-ui'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(q.txt, q.x, q.y); c.fillStyle = q.col; c.fillText(q.txt, q.x, q.y); c.globalAlpha = 1; }
      else { q.vy += 0.12; q.x += q.vx; q.y += q.vy; c.globalAlpha = a; c.fillStyle = q.col; c.fillRect(q.x, q.y, 4, 4); c.globalAlpha = 1; }
    }
    c.restore();
    // lumière : soleil en haut à gauche, bords légèrement assombris
    const sun = c.createLinearGradient(0, 0, W, H); sun.addColorStop(0, 'rgba(255,244,190,.16)'); sun.addColorStop(0.5, 'rgba(255,244,190,0)'); c.fillStyle = sun; c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.85); vg.addColorStop(0, 'rgba(0,30,60,0)'); vg.addColorStop(1, 'rgba(0,30,60,.3)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }

  ctx.load().then((d) => { if (destroyed) return; mine = shown = normalize(d); loaded = true; initAnimals(); resolveChops(); if (!tutoSeen()) setTimeout(() => { if (!destroyed && view === 'home') showTuto(0); }, 500); drawUI(); }).catch((e) => { toast(e.message || 'Ferme indisponible.'); });
  home0(); drawUI();
  const sumTimer = setInterval(() => { if (!paused && shown === mine && !mode && $sheet.hidden && $bub.hidden) drawUI(); }, 15000);
  raf = requestAnimationFrame(render);
  const onVis = () => { if (document.hidden) flush(); }; document.addEventListener('visibilitychange', onVis);
  return { pause() { paused = true; flush(); }, resume() { paused = false; }, destroy() { destroyed = true; cancelAnimationFrame(raf); clearInterval(sumTimer); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', fit); flush(); } };
}

// Petites icônes pour les menus (SVG)
const S = (inner, v = '0 0 40 40') => `<svg viewBox="${v}" width="40" height="40" aria-hidden="true">${inner}</svg>`;
function buildIcon(k) {
  if (k === 'parcelle') return S('<path d="M3 28l9-12h25l-9 12z" fill="#8b5a2b" stroke="#4e2f15" stroke-width="2"/><path d="M10 26l7-9M19 26l7-9M28 26l7-9" stroke="#5a3414" stroke-width="2"/><path d="M20 4v8M16 8h8" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/>');
  if (k === 'arbre') return S('<rect x="17" y="24" width="6" height="12" fill="#8a5a2b"/><circle cx="20" cy="16" r="12" fill="#3fb057" stroke="#1f7a39" stroke-width="2"/><circle cx="15" cy="13" r="4.5" fill="#7fdc8a"/>');
  if (k === 'chevrerie') return S('<rect x="4" y="18" width="32" height="16" rx="3" fill="#dcc78a" stroke="#8a6a2a" stroke-width="2"/><path d="M6 18v-6M14 18v-6M22 18v-6M30 18v-6M4 14h32" stroke="#8a6a2a" stroke-width="2"/><ellipse cx="17" cy="27" rx="7" ry="4.5" fill="#fffaf0" stroke="#8a7a55" stroke-width="1.6"/><circle cx="24.5" cy="23.5" r="3.4" fill="#fffaf0" stroke="#8a7a55" stroke-width="1.6"/><path d="M24 20.5q-2-4-5-3.5" stroke="#8a7a55" stroke-width="1.6" fill="none"/>');
  if (k === 'porcherie') return S('<rect x="4" y="18" width="32" height="16" rx="3" fill="#b98355" stroke="#6e4423" stroke-width="2"/><path d="M6 18v-6M14 18v-6M22 18v-6M30 18v-6M4 14h32" stroke="#6e4423" stroke-width="2"/><ellipse cx="17" cy="27" rx="8" ry="5" fill="#ffb3c1" stroke="#c0607a" stroke-width="1.6"/><circle cx="25" cy="25.5" r="4" fill="#ffb3c1" stroke="#c0607a" stroke-width="1.6"/><ellipse cx="28" cy="26.5" rx="2" ry="1.6" fill="#f29bb0"/>');
  if (k === 'quai') return S('<rect x="3" y="26" width="30" height="7" fill="#b9803f" stroke="#6e4a1e" stroke-width="2"/><path d="M7 26V17M29 26V17" stroke="#6e4a1e" stroke-width="3"/><path d="M33 31l6-5-1 8h-8z" fill="#fff" stroke="#4b6a7a" stroke-width="1.8"/><path d="M7 19q11 6 22 0" stroke="#e8d3a2" stroke-width="2" fill="none"/>');
  if (k === 'entrepot') return S('<path d="M4 18L20 7l16 11z" fill="#b5473c" stroke="#5e1f1a" stroke-width="2"/><rect x="6" y="18" width="28" height="16" fill="#b9c8d6" stroke="#41505f" stroke-width="2"/><rect x="13" y="22" width="14" height="12" fill="#6a7b8c" stroke="#34414e" stroke-width="1.6"/>');
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

