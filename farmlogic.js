// Colo-Ferme v2 : règles et données (pures, sans dessin). L'état d'une ferme est un petit objet JSON gardé en base (table farm2).
// Monnaie du jeu = canne à sucre. Les bâtiments rapportent des colocoins (utilisables partout dans l'appli).
export const FA = {
  N: 30, T: 44, cx: 15, cy: 15, R: 13.4,
  start: { x0: 11, x1: 19, y0: 8, y1: 16 },        // zone dégagée au départ
  house: { x: 14, y: 9, w: 3, h: 3 },
  growS: 120, yield: 2, startCane: 0,               // une canne pousse en 2 minutes, rapporte 2 cannes ; on commence sans canne
  parcelCost: (n) => (n < 3 ? 0 : n - 2),             // les 3 premières parcelles sont gratuites, puis 1, 2, 3… colocoins (achat en boutique)
  maxChop: 3,                                         // 3 arbres coupés en même temps au maximum
  ship: { cane: 25, hours: 3, coins: 12 },            // export par bateau : on charge 25 cannes, retour en 3 h avec 12 colocoins
  treeMin: (cut) => Math.min(60, 5 + cut * 2),        // couper un arbre demande du temps (en minutes), pas de canne
  houseUp: [0, 60, 150],                              // coût pour passer niveau 1 → 2 → 3 (index = niveau visé − 1)
  toolsUp: [0, 40, 100],
  houseBonus: 0.2,                                    // +20 % de colocoins par niveau de maison au-dessus de 1
  toolGrow: 0.15,                                     // −15 % de temps de pousse par niveau d'outils au-dessus de 1 (et +1 canne par récolte)
  maxStore: 2,                                        // un bâtiment stocke 2 cycles au maximum
};
export const BUILDINGS = {
  poulailler: { name: 'Poulailler', w: 2, h: 2, cost: 30, cycleH: 4, coins: [3, 5, 8], up: [60, 120], text: 'Des poules qui pondent : des colocoins toutes les 4 h.' },
  brasserie: { name: 'Brasserie de rhum', w: 3, h: 2, cost: 90, cycleH: 6, coins: [10, 16, 24], up: [180, 360], text: 'Le rhum de canne se vend bien : des colocoins toutes les 6 h.' },
  raffinerie: { name: 'Raffinerie de sucre', w: 2, h: 2, cost: 60, cycleH: 5, coins: [6, 10, 15], up: [120, 240], text: 'Du sucre roux : des colocoins toutes les 5 h.' },
  chevrerie: { name: 'Enclos à chèvres', w: 3, h: 2, cost: 45, cycleH: 5, coins: [5, 8, 12], up: [90, 180], animal: 'chevre', text: 'Des chèvres et leur lait : des colocoins toutes les 5 h.' },
  porcherie: { name: 'Enclos à cochons', w: 3, h: 2, cost: 70, cycleH: 6, coins: [8, 13, 19], up: [140, 280], animal: 'cochon', text: 'Des cochons bien nourris : des colocoins toutes les 6 h.' },
  quai: { name: 'Quai', w: 2, h: 1, cost: 80, sand: true, port: true, text: 'Se construit sur la plage. Avec l\'entrepôt, il ouvre l\'accès à la mer.' },
  entrepot: { name: 'Entrepôt d\'export', w: 2, h: 2, cost: 100, port: true, text: 'Stocke la marchandise à exporter. Avec le quai, il ouvre l\'accès à la mer.' },
};
export const DECORS = {
  palmier: { name: 'Palmier', cost: 12 }, fleurs: { name: 'Parterre de fleurs', cost: 8 }, fontaine: { name: 'Fontaine', cost: 40 },
  lanterne: { name: 'Lanterne', cost: 15 }, banc: { name: 'Banc', cost: 20 }, barriere: { name: 'Barrière', cost: 6 }, tonneau: { name: 'Tonneau', cost: 10 },
};
const key = (x, y) => `${x},${y}`;
export const newFarm = () => ({ v: 3, cane: FA.startCane, cleared: [], owned: [], chop: {}, ship: null, plots: {}, blds: [], decor: [], house: 1, tools: 1, st: { harvests: 0, builds: 0, trees: 0, decor: 0, cash: 0 } });
export const normalize = (d) => ({ ...newFarm(), ...(d && d.v === 3 ? d : {}), st: { ...newFarm().st, ...(d?.st ?? {}) } });
// Forme de l'île : un disque irrégulier
export const dist = (x, y) => Math.hypot(x - FA.cx + 0.5, y - FA.cy + 0.5) / FA.R;
export const wob = (x, y) => 0.06 * Math.sin(x * 1.7 + y * 0.9) + 0.05 * Math.cos(y * 1.3 - x * 0.6);
export const isLand = (x, y) => x >= 0 && y >= 0 && x < FA.N && y < FA.N && dist(x, y) + wob(x, y) <= 1;
export const isSand = (x, y) => isLand(x, y) && dist(x, y) + wob(x, y) > 0.83;
export const inStart = (x, y) => x >= FA.start.x0 && x <= FA.start.x1 && y >= FA.start.y0 && y <= FA.start.y1;
export const isCleared = (d, x, y) => inStart(x, y) || d.cleared.includes(key(x, y));
export const isTree = (d, x, y) => isLand(x, y) && !isSand(x, y) && !isCleared(d, x, y);
export const onHouse = (x, y) => x >= FA.house.x && x < FA.house.x + FA.house.w && y >= FA.house.y && y < FA.house.y + FA.house.h;
export const bldAt = (d, x, y) => d.blds.find((b) => x >= b.x && x < b.x + BUILDINGS[b.k].w && y >= b.y && y < b.y + BUILDINGS[b.k].h);
export const decorAt = (d, x, y) => d.decor.find((o) => o.x === x && o.y === y);
export const isOwned = (d, x, y) => d.owned.includes(key(x, y));
export const free = (d, x, y) => isLand(x, y) && isCleared(d, x, y) && !isSand(x, y) && !onHouse(x, y) && !bldAt(d, x, y) && !decorAt(d, x, y) && !d.plots[key(x, y)] && !isOwned(d, x, y);   // libre pour un bâtiment ou un décor (ni parcelle ni cultures)
export const buyable = (d, x, y) => free(d, x, y);   // une parcelle s'achète sur un terrain dégagé libre
export const chopMs = (cut) => FA.treeMin(cut) * 60000;
const freeSand = (d, x, y) => isLand(x, y) && isSand(x, y) && !bldAt(d, x, y) && !decorAt(d, x, y);
export const canPlace = (d, k, x, y) => { const B = BUILDINGS[k]; if (B.port && d.blds.some((b) => b.k === k)) return false; for (let i = 0; i < B.w; i++) for (let j = 0; j < B.h; j++) if (!(B.sand ? freeSand(d, x + i, y + j) : free(d, x + i, y + j))) return false;
  if (B.sand) { let sea = false; for (let i = 0; i < B.w; i++) for (let j = 0; j < B.h; j++) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isLand(x + i + a, y + j + b)) sea = true; if (!sea) return false; }   // le quai touche l'eau
  return true; };
export const hasPort = (d) => d.blds.some((b) => b.k === 'quai') && d.blds.some((b) => b.k === 'entrepot');   // quai + entrepôt = accès à la mer
export const shipState = (d, now = Date.now()) => !d.ship ? { st: 'idle' } : now - d.ship.t >= FA.ship.hours * 3600000 ? { st: 'ready' } : { st: 'away', pct: (now - d.ship.t) / (FA.ship.hours * 3600000), left: FA.ship.hours * 3600000 - (now - d.ship.t) };
export const shipCoins = (d) => Math.round(FA.ship.coins * (1 + FA.houseBonus * (d.house - 1)));
export const frontier = (d, x, y) => isTree(d, x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => (isCleared(d, x + a, y + b) && isLand(x + a, y + b)));
export const growMs = (d) => FA.growS * 1000 * (1 - FA.toolGrow * (d.tools - 1));
export const yieldN = (d) => FA.yield + (d.tools - 1);
export const plotState = (d, p, now = Date.now()) => { const g = growMs(d), t = now - p.t; return t >= g ? { ready: true, pct: 1 } : { ready: false, pct: Math.max(0, t / g) }; };
export const cycleMs = (b) => (BUILDINGS[b.k].cycleH || 1) * 3600000;
export const bldCycles = (b, now = Date.now()) => !BUILDINGS[b.k].cycleH ? 0 : Math.min(FA.maxStore, Math.floor((now - b.t) / cycleMs(b)));
export const bldCoins = (d, b, now = Date.now()) => Math.round(bldCycles(b, now) * BUILDINGS[b.k].coins[b.lvl - 1] * (1 + FA.houseBonus * (d.house - 1)));
export const summary = (d, now = Date.now()) => ({
  plots: Object.values(d.plots).filter((p) => plotState(d, p, now).ready).length,
  blds: d.blds.filter((b) => bldCycles(b, now) > 0).length + (shipState(d, now).st === 'ready' ? 1 : 0),
});
