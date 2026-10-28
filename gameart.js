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

// Pierre, feuille, ciseaux dessinés en couleur (tuile, accueil du chifoumi, choix du coup, révélation)
const MI = {
  pierre: '<path d="M7 31l3-11 10-7 12 1 8 9 1 11-7 7-15 1-9-4z" fill="#9aa3ad" stroke="#4b5563" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 20l10-7 12 1-4 7-11 2z" fill="#c3cad3"/><path d="M28 21l12 2M17 23l-4 12M30 30l-6 6" stroke="#6b7280" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M15 16l5-3" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>',
  feuille: '<g transform="rotate(-6 24 24)"><path d="M11 5h19l8 8v30H11z" fill="#fff" stroke="#64748b" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 5v8h8z" fill="#e2e8f0" stroke="#64748b" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 21h16M16 27h16M16 33h11" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/></g>',
  ciseaux: '<path d="M17 30L36 5" stroke="#475569" stroke-width="5.5" stroke-linecap="round"/><path d="M17 30L36 5" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/><path d="M31 30L12 5" stroke="#475569" stroke-width="5.5" stroke-linecap="round"/><path d="M31 30L12 5" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="21" r="2" fill="#475569"/><circle cx="14" cy="37" r="6.5" fill="none" stroke="#b91c1c" stroke-width="6"/><circle cx="14" cy="37" r="6.5" fill="none" stroke="#e5484d" stroke-width="3.6"/><circle cx="34" cy="37" r="6.5" fill="none" stroke="#b91c1c" stroke-width="6"/><circle cx="34" cy="37" r="6.5" fill="none" stroke="#e5484d" stroke-width="3.6"/>',
};
export const moveIcon = (k, size = 40) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${MI[k] ?? MI.pierre}</svg>`;

export function logoArt(id) {
  switch (id) {
    case 'flappy': return `<div class="gl-bird">${BIRD}</div><div class="gl-shadow"></div>`;
    case 'sudoku': {
      const d = [5, 3, 0, 0, 7, 0, 6, 0, 9];
      return `<div class="gl-sudo">${d.map((v, i) => `<i style="--i:${i}">${v || ['1', '8', '4', '2'][i % 4]}</i>`).join('')}</div>`;
    }
    case 'chifoumi':
      return `<div class="gl-chif">${['pierre', 'feuille', 'ciseaux'].map((k, i) => `<i style="--i:${i}">${moveIcon(k, 42)}</i>`).join('')}</div>`;
    case 'ferme': return `<div class="gl-farmer">${FARMER}</div>`;
    case 'blackjack':
      return `<div class="gl-cards"><div class="gl-card c1"><b>A</b><i>♠</i></div><div class="gl-card c2 red"><b>K</b><i>♥</i></div></div>`;
    default: return `<div class="gl-bird">${BIRD}</div>`;
  }
}

// Icônes des menus de jeux (trait simple, couleur du texte)
const GI = {
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/><path d="M10 19v-5h4v5"/>',
  quit: '<path d="M14 4h4.5v16H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  duel: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  sound: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
};
export const gIcon = (k, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GI[k] ?? ''}</svg>`;
