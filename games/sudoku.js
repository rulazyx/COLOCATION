// Sudoku chronométré : une grille à solution unique, le chrono démarre au premier chiffre.
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

function candidates(grid, i) {
  const used = new Set(peers[i].map((p) => grid[p]));
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

// Compte les solutions (jusqu'à `limit`) ; remplit `grid` avec la première trouvée si fill = true
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
    if (rng) bestC.sort(() => rng() - 0.5);
    for (const v of bestC) { g[best] = v; rec(); if (count >= limit) break; }
    g[best] = 0;
  })();
  return { count, solution: first };
}

export function generate(rng = Math.random, givens = 36) {
  const { solution } = countSolutions(new Array(81).fill(0), 1, rng);
  const puzzle = solution.slice();
  const order = [...Array(81).keys()].sort(() => rng() - 0.5);
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

/* ---------- Interface ---------- */
export function mount(root, { onEnd }) {
  let puz, sol, grid, given, sel = -1, started = 0, elapsed = 0, finished = false, timer = 0, hiddenAt = 0;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function fresh() {
    ({ puzzle: puz, solution: sol } = generate());
    grid = puz.slice(); given = puz.map((v) => v !== 0);
    sel = -1; started = 0; elapsed = 0; finished = false;
    draw();
  }
  function tick() {
    if (started && !finished) { elapsed = Math.floor((Date.now() - started) / 1000); const t = root.querySelector('.stime'); if (t) t.textContent = fmt(elapsed); }
  }
  function draw() {
    const bad = conflicts(grid), selV = sel >= 0 ? grid[sel] : 0;
    let cells = '';
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const cls = ['sc', given[i] ? 'g' : '', i === sel ? 'sel' : '', sel >= 0 && peers[sel].includes(i) ? 'pe' : '',
        selV && grid[i] === selV && i !== sel ? 'same' : '', bad.has(i) ? 'bad' : '', c % 3 === 2 && c < 8 ? 'rb' : '', r % 3 === 2 && r < 8 ? 'bb' : ''].join(' ');
      cells += `<button class="${cls}" data-i="${i}" aria-label="Ligne ${r + 1} colonne ${c + 1}">${grid[i] || ''}</button>`;
    }
    root.innerHTML = `
      <div class="sbar"><span>⏱ <b class="stime">${fmt(elapsed)}</b></span><button class="mini" data-act="new">Nouvelle grille</button></div>
      <div class="sgrid">${cells}</div>
      <div class="spad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<button data-n="0" class="era">⌫</button></div>
      <div class="gover" ${finished ? '' : 'hidden'}><h2>Bravo ! 🎉</h2><p class="gscore">Terminé en ${fmt(elapsed)}</p><button class="btn primary" data-act="new">Nouvelle grille</button></div>`;
  }
  function put(n) {
    if (finished || sel < 0 || given[sel]) return;
    if (!started && n) started = Date.now();
    grid[sel] = n;
    if (grid.every((v) => v) && grid.every((v, i) => v === sol[i])) {
      finished = true; elapsed = Math.max(1, Math.floor((Date.now() - started) / 1000));
      draw(); onEnd?.({ score: elapsed });
    } else draw();
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.i !== undefined) { sel = Number(b.dataset.i); draw(); }
    else if (b.dataset.n !== undefined) put(Number(b.dataset.n));
    else if (b.dataset.act === 'new') fresh();
  });
  const onKey = (e) => {
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
  fresh();
  return { destroy() { clearInterval(timer); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); } };
}
