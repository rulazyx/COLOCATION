// Logos animés des jeux (écran de chargement + écran d'accueil). Le style est dans style.css (.gl-*).
const BIRD = '<svg viewBox="0 0 80 70" aria-hidden="true"><path d="M8 40q-6-10 0-18 4 10 12 14z" fill="#b91c1c"/><circle cx="40" cy="38" r="26" fill="#ef4444"/><ellipse cx="44" cy="48" rx="16" ry="10" fill="#fecaca"/><ellipse cx="30" cy="40" rx="13" ry="8" transform="rotate(-18 30 40)" fill="#b91c1c"/><circle cx="50" cy="28" r="8" fill="#fff"/><circle cx="52.5" cy="28" r="4" fill="#111"/><path d="M62 33l16 5-16 7z" fill="#f59e0b"/></svg>';

const FARMER = `<svg viewBox="0 0 120 140" aria-hidden="true">
  <g class="fm-body">
    <ellipse cx="60" cy="134" rx="30" ry="5" fill="rgba(0,0,0,.18)"/>
    <rect x="40" y="96" width="14" height="34" rx="5" fill="#2563eb"/><rect x="66" y="96" width="14" height="34" rx="5" fill="#2563eb"/>
    <rect x="38" y="126" width="18" height="8" rx="4" fill="#5b3a1e"/><rect x="64" y="126" width="18" height="8" rx="4" fill="#5b3a1e"/>
    <rect x="34" y="58" width="52" height="46" rx="14" fill="#dc2626"/>
    <path d="M42 66h36v38q0 6-6 6H48q-6 0-6-6z" fill="#2563eb"/><rect x="45" y="58" width="6" height="14" fill="#2563eb"/><rect x="69" y="58" width="6" height="14" fill="#2563eb"/>
    <circle cx="48" cy="74" r="2.6" fill="#fde047"/><circle cx="72" cy="74" r="2.6" fill="#fde047"/>
    <g class="fm-arm-l"><rect x="22" y="62" width="14" height="34" rx="7" fill="#dc2626"/><circle cx="29" cy="98" r="7" fill="#f5c9a0"/></g>
    <g class="fm-arm-r"><rect x="84" y="62" width="14" height="34" rx="7" fill="#dc2626"/><circle cx="91" cy="98" r="7" fill="#f5c9a0"/>
      <g class="fm-fork"><rect x="90" y="30" width="3" height="70" fill="#7c4a1e"/><path d="M84 30v-12M91.5 30v-16M99 30v-12M84 30h15" stroke="#9ca3af" stroke-width="3" stroke-linecap="round" fill="none"/></g></g>
    <circle cx="60" cy="42" r="22" fill="#f5c9a0"/>
    <circle cx="52" cy="42" r="3" fill="#1f2937"/><circle cx="68" cy="42" r="3" fill="#1f2937"/>
    <path d="M52 52q8 7 16 0" stroke="#7c2d12" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="46" cy="50" r="4" fill="#fca5a5" opacity=".7"/><circle cx="74" cy="50" r="4" fill="#fca5a5" opacity=".7"/>
    <ellipse cx="60" cy="27" rx="38" ry="8" fill="#facc15" stroke="#a16207" stroke-width="2"/><path d="M42 27q0-24 18-24t18 24z" fill="#fde047" stroke="#a16207" stroke-width="2"/><rect x="42" y="21" width="36" height="6" fill="#dc2626"/>
  </g></svg>`;

const MI = {
  pierre: '<path d="M8 30c0-9 6-16 15-16s17 6 17 15-6 13-15 13-17-3-17-12z"/><path d="M17 25c3-3 8-4 12-1M21 35c3 1 7 0 10-3"/>',
  feuille: '<path d="M11 6h19l8 8v28H11z"/><path d="M30 6v8h8M16 22h16M16 29h16M16 36h10"/>',
  ciseaux: '<circle cx="14" cy="36" r="6"/><circle cx="34" cy="36" r="6"/><path d="M18 31L35 6M30 31L13 6"/>',
};
export const moveIcon = (k, size = 40) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MI[k] ?? MI.pierre}</svg>`;

export function logoArt(id) {
  switch (id) {
    case 'flappy': return `<div class="gl-bird">${BIRD}</div><div class="gl-shadow"></div>`;
    case 'sudoku': {
      const d = [5, 3, 0, 0, 7, 0, 6, 0, 9];
      return `<div class="gl-sudo">${d.map((v, i) => `<i style="--i:${i}">${v || ['1', '8', '4', '2'][i % 4]}</i>`).join('')}</div>`;
    }
    case 'chifoumi':
      return `<div class="gl-chif">${['pierre', 'feuille', 'ciseaux'].map((k, i) => `<i style="--i:${i}">${moveIcon(k, 34)}</i>`).join('')}</div>`;
    case 'ferme': return `<div class="gl-farmer">${FARMER}</div>`;
    case 'blackjack':
      return `<div class="gl-cards"><div class="gl-card c1"><b>A</b><i>♠</i></div><div class="gl-card c2 red"><b>K</b><i>♥</i></div></div>`;
    default: return `<div class="gl-bird">${BIRD}</div>`;
  }
}
