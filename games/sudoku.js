// Sudoku : grille de la semaine (chronométrée, la même pour tous) + grilles aléatoires (facile / moyen / expert).
// Logique pure en haut (générateur + solveur), interface en bas.
const idx = (r, c) => r * 9 + c;
const peers = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9), c = i % 9, set = new Set();
  for (let k = 0; k < 9; k++) { set.add(idx(r, k)); set.add(idx(k, c)); }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) set.add(idx(br + a, bc + b));
  set.delete(i);
  return [...set];
});

// Générateur pseudo-aléatoire à graine : la grille de la semaine est identique sur tous les téléphones
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
// Mélange de Fisher-Yates (le tri avec un comparateur aléatoire donne des résultats différents selon le navigateur)
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function candidates(grid, i) {
  const used = new Set(peers[i].map((p) => grid[p]));
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

// Compte les solutions (jusqu'à `limit`)
export function countSolutions(grid, limit = 2, rng = null) {
  const g = grid.slice();
  let count = 0, first = null;
  (function rec() {
    if (count >= limit) return;
    let best = -1, bestC = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const c = candidates(g, i);
      if (c.length === 0) return;
      if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length === 1) break; }
    }
    if (best === -1) { count++; if (!first) first = g.slice(); return; }
    if (rng) shuffle(bestC, rng);
    for (const v of bestC) { g[best] = v; rec(); if (count >= limit) break; }
    g[best] = 0;
  })();
  return { count, solution: first };
}

export function generate(rng = Math.random, givens = 36) {
  const { solution } = countSolutions(new Array(81).fill(0), 1, rng);
  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()], rng);
  let filled = 81;
  for (const i of order) {
    if (filled <= givens) break;
    const keep = puzzle[i]; puzzle[i] = 0;
    if (countSolutions(puzzle, 2).count !== 1) puzzle[i] = keep; else filled--;
  }
  return { puzzle, solution };
}

export const conflicts = (grid) => {
  const bad = new Set();
  for (let i = 0; i < 81; i++) if (grid[i] && peers[i].some((p) => grid[p] === grid[i])) bad.add(i);
  return bad;
};

// Modes : « givens » = chiffres déjà donnés (moins = plus dur). Les gains (coins / xp) sont validés côté serveur : ici ils ne servent qu'à l'affichage.
export const MODES = {
  week: { label: 'Grille de la semaine', givens: 40 },
  easy: { label: 'Facile', givens: 40, coins: 1, emoji: '🌱' },
  mid:  { label: 'Moyen', givens: 32, coins: 2, emoji: '🔥' },
  hard: { label: 'Expert', givens: 25, coins: 4, emoji: '💀' },
};

/* ---------- Interface ---------- */
export function mount(root, ctx = {}) {
  const S = ctx.sudoku ?? {};
  // Fond du jeu : des chiffres qui flottent et réagissent au doigt (menu) ; l'interface se redessine dans `ui`
  root.classList.add('sdk-root');
  const bg = document.createElement('div'); bg.className = 'sdk-bg';
  const ui = document.createElement('div'); ui.className = 'sdk-ui';
  root.append(bg, ui);
  let view = 'menu', mode = 'week', puz, sol, grid, given, sel = -1, started = 0, elapsed = 0, finished = false, timer = 0, hiddenAt = 0, lives = 3, wrong = new Set(), lost = false;
  let doneRows = new Set(), doneCols = new Set(), doneBoxes = new Set(), fx = null, result = null, loading = false, board = null, destroyed = false, confetti = '';
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ----- Fond interactif : chiffres qui flottent, fuient le doigt et éclatent au toucher ----- */
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dig = []; let raf = 0, bw = 0, bh = 0, ptr = null, last = 0;
  function spawn(d, anywhere) {
    d.v = 1 + Math.floor(Math.random() * 9); d.s = 22 + Math.random() * 36; d.x = Math.random() * bw; d.y = anywhere ? Math.random() * bh : bh + d.s;
    d.base = -(16 + Math.random() * 28); d.vy = d.base; d.vx = (Math.random() - 0.5) * 12; d.r = (Math.random() - 0.5) * 50; d.vr = (Math.random() - 0.5) * 24; d.o = 0.2 + Math.random() * 0.3; d.pop = 0;
    d.el.textContent = d.v; d.el.style.fontSize = `${d.s}px`;
  }
  function bgLoop(t) {
    raf = requestAnimationFrame(bgLoop);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    for (const d of dig) {
      if (d.pop > 0) {
        d.pop -= dt * 2.6;
        if (d.pop <= 0) { spawn(d, false); }
        else { d.el.style.transform = `translate(${d.x}px,${d.y}px) rotate(${d.r}deg) scale(${1 + (1 - d.pop) * 2.2})`; d.el.style.opacity = String(d.pop * 0.8); continue; }
      }
      if (ptr) {
        const dx = d.x - ptr.x, dy = d.y - ptr.y, dist = Math.hypot(dx, dy) || 1;
        if (dist < 110) { const k = (1 - dist / 110) * 520 * dt; d.vx += (dx / dist) * k; d.vy += (dy / dist) * k; d.vr += (dx > 0 ? 1 : -1) * k * 2; }
      }
      d.vy += (d.base - d.vy) * dt * 0.9; d.vx -= d.vx * dt * 0.8; d.vr -= d.vr * dt * 0.6;
      d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt;
      if (d.y < -d.s * 1.5 || d.x < -d.s * 2 || d.x > bw + d.s * 2) spawn(d, false);
      d.el.style.transform = `translate(${d.x}px,${d.y}px) rotate(${d.r}deg)`; d.el.style.opacity = String(d.o);
    }
  }
  function startBg() {
    if (reduce || raf) return;
    bw = root.clientWidth || 360; bh = root.clientHeight || 640;
    if (!dig.length) for (let i = 0; i < 26; i++) { const el = document.createElement('i'); bg.appendChild(el); const d = { el }; spawn(d, true); dig.push(d); }
    last = performance.now(); raf = requestAnimationFrame(bgLoop);
  }
  function stopBg() { cancelAnimationFrame(raf); raf = 0; }
  const local = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onMove = (e) => { if (view === 'menu') ptr = local(e); };
  const onLeave = () => { ptr = null; };
  const onDown = (e) => {
    if (view !== 'menu') return;
    const p = local(e); ptr = p;
    for (const d of dig) if (!d.pop && Math.hypot(d.x - p.x, d.y - p.y) < 34 + d.s * 0.5) d.pop = 1;
  };
  root.addEventListener('pointermove', onMove); root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onLeave); root.addEventListener('pointerleave', onLeave);
  function showBg(on) { bg.style.display = on ? '' : 'none'; if (on) startBg(); else stopBg(); }

  /* ----- Menu ----- */
  function drawMenu() {
    showBg(true);
    const mine = board?.find((r) => r.member_id === S.me);
    ui.innerHTML = `<div class="sdk-menu">
      <div class="sdk-logo">SUDOKU</div>
      <button class="sdk-mode week" data-act="mode" data-m="week"><span class="sdk-e">📅</span><span><b>Grille de la semaine</b><small>La même grille pour tout le monde · chrono${mine ? ` · ton temps : ${fmt(mine.seconds)}` : ''}</small></span></button>
      <h3 class="sdk-h">Grilles aléatoires</h3>
      ${['easy', 'mid', 'hard'].map((k) => `<button class="sdk-mode ${k}" data-act="mode" data-m="${k}"><span class="sdk-e">${MODES[k].emoji}</span><span><b>${MODES[k].label}</b><small>+${MODES[k].coins} 🪙 par grille réussie</small></span></button>`).join('')}
    </div>`;
  }
  function loadBoard() { Promise.resolve(S.board?.()).then((rows) => { if (destroyed) return; board = rows ?? []; if (view === 'menu') drawMenu(); }).catch(() => { board = []; }); }

  /* ----- Partie ----- */
  function start(m) {
    mode = m; view = 'play'; loading = true; result = null; draw();
    setTimeout(() => {         // laisse l'écran « Création de la grille » s'afficher avant le calcul
      if (destroyed) return;
      const rng = m === 'week' ? mulberry(hash(`kaz-sudoku-${S.week ?? 'demo'}`)) : Math.random;
      ({ puzzle: puz, solution: sol } = generate(rng, MODES[m].givens));
      grid = puz.slice(); given = puz.map((v) => v !== 0);
      sel = -1; started = 0; elapsed = 0; finished = false; lives = 3; wrong = new Set(); lost = false; fx = null; confetti = '';
      doneRows = new Set(); doneCols = new Set(); doneBoxes = new Set();
      // lignes / colonnes / carrés déjà complets au départ : pas d'animation
      for (let k = 0; k < 9; k++) { if (unitDone('r', k)) doneRows.add(k); if (unitDone('c', k)) doneCols.add(k); if (unitDone('b', k)) doneBoxes.add(k); }
      loading = false; draw();
    }, 40);
  }
  const unitCells = (kind, k) => {
    const out = [];
    for (let j = 0; j < 9; j++) out.push(kind === 'r' ? idx(k, j) : kind === 'c' ? idx(j, k) : idx(Math.floor(k / 3) * 3 + Math.floor(j / 3), (k % 3) * 3 + (j % 3)));
    return out;
  };
  const unitDone = (kind, k) => unitCells(kind, k).every((i) => grid[i] === sol[i]);
  function tick() {
    if (view === 'play' && started && !finished && !lost) { elapsed = Math.floor((Date.now() - started) / 1000); const t = ui.querySelector('.stime'); if (t) t.textContent = fmt(elapsed); }
  }
  function draw() {
    if (view === 'menu') return drawMenu();
    showBg(false);
    const m = MODES[mode];
    if (loading) { ui.innerHTML = `<div class="sdk-load"><div class="sdk-spin">🔢</div><b>Création de la grille…</b><small>${m.label}</small></div>`; return; }
    const bad = conflicts(grid), selV = sel >= 0 ? grid[sel] : 0, f = fx; fx = null;
    let cells = '';
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9, e = f?.cells?.get(i);
      const cls = ['sc', given[i] ? 'g' : '', i === sel ? 'sel' : '', sel >= 0 && peers[sel].includes(i) ? 'pe' : '',
        selV && grid[i] === selV && i !== sel ? 'same' : '', bad.has(i) || wrong.has(i) ? 'bad' : '', c % 3 === 2 && c < 8 ? 'rb' : '', r % 3 === 2 && r < 8 ? 'bb' : '',
        f?.err === i ? 'shake' : '', f?.pop === i ? 'pop' : '', e ? `fx-${e.kind}` : '', f?.win ? 'fx-win' : ''].join(' ');
      const delay = f?.win ? (r + c) * 45 : e ? e.delay : 0;
      cells += `<button class="${cls}" ${delay ? `style="--d:${delay}ms"` : ''} data-i="${i}" aria-label="Ligne ${r + 1} colonne ${c + 1}">${grid[i] || ''}</button>`;
    }
    const hearts = [0, 1, 2].map((i) => `<i class="${i < lives ? 'on' : ''} ${f?.lose === i ? 'lose' : ''}">♥</i>`).join('');
    ui.innerHTML = `
      <div class="sbar"><span class="sdk-title">${m.emoji ?? '📅'} ${m.label}</span>${mode === 'week' ? `<span>⏱ <b class="stime">${fmt(elapsed)}</b></span>` : ''}<span class="lives" aria-label="${lives} vies">${hearts}</span></div>
      <div class="sgrid ${f?.err !== undefined ? 'gshake' : ''}">${cells}</div>
      <div class="spad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<button data-n="0" class="era">⌫</button></div>
      ${lost ? `<div class="sdk-over"><h2>Plus de vies 💔</h2><p>Trois erreurs : la grille est perdue.</p>${mode === 'week' ? '<button class="btn primary" data-act="mode" data-m="week">Réessayer la grille de la semaine</button>' : `<button class="btn primary" data-act="mode" data-m="${mode}">Nouvelle grille</button>`}<button class="btn" data-act="menu">Choisir un mode</button></div>` : ''}
      ${finished ? `<div class="sdk-over win"><h2>Bravo ! 🎉</h2>${mode === 'week' ? `<p>Terminé en <b>${fmt(elapsed)}</b></p>` : '<p>Grille terminée !</p>'}${resultHTML()}${mode === 'week' ? '<button class="btn primary" data-act="mode" data-m="week">Retenter pour battre ton temps</button>' : `<button class="btn primary" data-act="mode" data-m="${mode}">Nouvelle grille</button>`}<button class="btn" data-act="menu">Choisir un mode</button></div>${confetti}` : ''}`;
  }
  function resultHTML() {
    if (!result) return '<div class="sdk-gain"><small>Calcul des gains…</small></div>';
    if (result.error) return '<div class="sdk-gain"><small>Gains non enregistrés (réseau)</small></div>';
    const parts = [];
    if (result.xp > 0) parts.push(`<span class="gx">+${result.xp} XP</span>`);
    if (result.coins > 0) parts.push(`<span class="gc">+${result.coins} 🪙</span>`);
    return `<div class="sdk-gain">${parts.join('') || '<small>Pas de gain cette fois (plafond du jour atteint)</small>'}${result.record ? '<div class="sdk-rec">🏆 Meilleur temps de la semaine pour toi !</div>' : ''}</div>`;
  }
  function makeConfetti() {
    const cols = ['#ffc928', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'];
    return `<div class="sdk-conf" aria-hidden="true">${Array.from({ length: 34 }, (_, i) => `<i style="left:${Math.round(Math.random() * 100)}%;background:${cols[i % cols.length]};--d:${Math.round(Math.random() * 700)}ms;--t:${1400 + Math.round(Math.random() * 1200)}ms;--x:${Math.round(Math.random() * 120 - 60)}px"></i>`).join('')}</div>`;
  }
  function put(n) {
    if (view !== 'play' || loading || finished || lost || sel < 0 || given[sel]) return;
    if (!started && n) started = Date.now();
    grid[sel] = n;
    wrong.delete(sel);
    if (n && n !== sol[sel]) {            // erreur : une vie en moins
      wrong.add(sel); lives--;
      fx = { err: sel, lose: lives };
      if (lives <= 0) { lost = true; }
      return draw();
    }
    if (grid.every((v) => v) && grid.every((v, i) => v === sol[i])) {
      finished = true; elapsed = Math.max(1, Math.floor((Date.now() - started) / 1000));
      fx = { win: true }; confetti = makeConfetti(); result = null;
      draw();
      Promise.resolve(S.report?.(mode, elapsed)).then((r) => { result = r ?? {}; if (!destroyed && finished) draw(); loadBoard(); }).catch(() => { result = { error: true }; if (!destroyed && finished) draw(); });
      return;
    }
    // animations : ligne / colonne / carré qui vient d'être complété
    fx = { pop: n ? sel : undefined, cells: new Map() };
    if (n) {
      const r = Math.floor(sel / 9), c = sel % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const mark = (set, k, kind) => { if (!set.has(k) && unitDone(kind, k)) { set.add(k); unitCells(kind, k).forEach((i, j) => { if (!fx.cells.has(i)) fx.cells.set(i, { kind: kind === 'b' ? 'box' : 'line', delay: j * 55 }); }); } };
      mark(doneRows, r, 'r'); mark(doneCols, c, 'c'); mark(doneBoxes, b, 'b');
    }
    draw();
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'mode') start(b.dataset.m);
    else if (b.dataset.act === 'menu') { view = 'menu'; loading = false; loadBoard(); drawMenu(); }
    else if (view !== 'play' || loading) return;
    else if (b.dataset.i !== undefined) { sel = Number(b.dataset.i); draw(); }
    else if (b.dataset.n !== undefined) put(Number(b.dataset.n));
  });
  const onKey = (e) => {
    if (view !== 'play') return;
    if (/^[1-9]$/.test(e.key)) put(Number(e.key));
    else if (['Backspace', 'Delete', '0'].includes(e.key)) put(0);
    else if (e.key.startsWith('Arrow') && sel >= 0) {
      e.preventDefault();
      const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      const n = sel + d; if (n >= 0 && n < 81 && !(d === 1 && n % 9 === 0) && !(d === -1 && sel % 9 === 0)) { sel = n; draw(); }
    }
  };
  window.addEventListener('keydown', onKey);
  // Le chrono s'arrête quand l'appli passe en arrière-plan
  const onVis = () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && started) { started += Date.now() - hiddenAt; hiddenAt = 0; }
  };
  document.addEventListener('visibilitychange', onVis);
  timer = setInterval(tick, 500);
  drawMenu(); loadBoard();
  let pausedAt = 0;
  return { pause() { if (!pausedAt) pausedAt = Date.now(); }, resume() { if (pausedAt && started) started += Date.now() - pausedAt; pausedAt = 0; }, destroy() { destroyed = true; stopBg(); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointerup', onLeave); root.removeEventListener('pointerleave', onLeave); clearInterval(timer); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); } };
}
