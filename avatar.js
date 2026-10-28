// Dessin du personnage en SVG (aucune image externe). Utilisation : avatarSVG({gender, skin, hair, outfit}, taille)
const INK = '#1f2229';

// éclaircit (amt > 0) ou assombrit (amt < 0) une couleur #rrggbb
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
}

const body = (fill, extra = '') =>
  `<path d="M14 100 C14 82 30 74 50 74 C70 74 86 82 86 100Z" fill="${fill}"/>${extra}`;
const neck = (skin) => `<rect x="42" y="60" width="16" height="18" rx="6" fill="${shade(skin, -0.1)}"/>`;
const headBase = (skin) => `
  <circle cx="29" cy="46" r="4.6" fill="${skin}"/><circle cx="71" cy="46" r="4.6" fill="${skin}"/>
  <ellipse cx="50" cy="44" rx="21.5" ry="23.5" fill="${skin}"/>`;
const eyes = (y = 47) => `
  <circle cx="42" cy="${y}" r="2.7" fill="${INK}"/><circle cx="58" cy="${y}" r="2.7" fill="${INK}"/>
  <circle cx="43" cy="${y - 1}" r=".9" fill="#fff"/><circle cx="59" cy="${y - 1}" r=".9" fill="#fff"/>`;
const lashes = (gender, y = 47) => gender === 'femme'
  ? `<path d="M38.5 ${y - 2} l-2.2 -1.6 M61.5 ${y - 2} l2.2 -1.6" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>` : '';
const mouth = `<path d="M44 56.5 Q50 61.5 56 56.5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="36" cy="54" r="3.2" fill="#ff7a8a" opacity=".28"/><circle cx="64" cy="54" r="3.2" fill="#ff7a8a" opacity=".28"/>`;
const hairBack = (gender, c) => gender === 'femme'
  ? `<path d="M26 46 C22 22 36 14 50 14 C64 14 78 22 74 46 C76 62 74 76 68 88 L60 74 L40 74 L32 88 C26 76 24 62 26 46Z" fill="${c}"/>` : '';
const hairFront = (gender, c) => gender === 'femme'
  ? `<path d="M28 42 C28 26 38 20 50 20 C62 20 72 26 72 42 C66 34 58 28 46 29 C40 30 33 35 28 42Z" fill="${c}"/>`
  : `<path d="M28 42 C27 24 38 17 50 17 C62 17 73 24 72 42 C69 33 62 27 50 27 C38 27 31 33 28 42Z" fill="${c}"/>`;

// Chaque tenue renvoie le dessin complet (de l'arrière vers l'avant)
const OUTFIT_DRAW = {
  none: ({ gender, skin, hair }) =>
    body('#2f9e6b', `<path d="M42 74 L50 85 L58 74Z" fill="${shade(skin, -0.1)}"/>`) + hairBack(gender, hair) + neck(skin) +
    headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair),

  chevalier: ({ skin }) =>
    body('#aab3bd', '<circle cx="24" cy="86" r="9" fill="#c2cad3"/><circle cx="76" cy="86" r="9" fill="#c2cad3"/><path d="M38 74 L50 82 L62 74Z" fill="#8f99a4"/>') +
    neck(skin) + headBase(skin) + mouth +
    '<path d="M28 52 L28 40 C28 24 38 17 50 17 C62 17 72 24 72 40 L72 52Z" fill="#b8c0c8"/>' +
    '<path d="M35 28 C39 22 45 20 50 20" stroke="#fff" opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<rect x="32" y="41" width="36" height="7" rx="3.5" fill="#2b2f36"/><circle cx="42" cy="44.5" r="1.8" fill="#fff"/><circle cx="58" cy="44.5" r="1.8" fill="#fff"/>' +
    '<path d="M50 17 C44 4 60 0 67 9 C59 8 54 11 52 17Z" fill="#e5484d"/>',

  singe: () => {
    const fur = '#8a5a3b', tan = '#ecd0a8';
    return body(fur, `<ellipse cx="50" cy="96" rx="15" ry="13" fill="${tan}"/>`) +
      `<rect x="42" y="60" width="16" height="18" rx="6" fill="${fur}"/>` +
      `<circle cx="25" cy="45" r="10" fill="${fur}"/><circle cx="75" cy="45" r="10" fill="${fur}"/>` +
      '<circle cx="25" cy="45" r="5.6" fill="#eaa5a0"/><circle cx="75" cy="45" r="5.6" fill="#eaa5a0"/>' +
      `<ellipse cx="50" cy="44" rx="21.5" ry="23.5" fill="${fur}"/>` +
      `<path d="M50 69 C37 69 31 58 33 49 C34 42 40 40 45 44 C47 45.5 49 46 50 46 C51 46 53 45.5 55 44 C60 40 66 42 67 49 C69 58 63 69 50 69Z" fill="${tan}"/>` +
      `<path d="M43 24 Q50 8 57 24 Q50 19 43 24Z" fill="${fur}"/>` +
      `<circle cx="43" cy="49" r="2.7" fill="${INK}"/><circle cx="57" cy="49" r="2.7" fill="${INK}"/>` +
      '<circle cx="44" cy="48" r=".9" fill="#fff"/><circle cx="58" cy="48" r=".9" fill="#fff"/>' +
      '<circle cx="47" cy="57" r="1.2" fill="#5a3a22"/><circle cx="53" cy="57" r="1.2" fill="#5a3a22"/>' +
      `<path d="M44 61 Q50 66 56 61" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  },

  pirate: ({ gender, skin, hair }) =>
    body('#7f1d1d', '<circle cx="50" cy="90" r="2" fill="#f5b301"/><circle cx="50" cy="97" r="2" fill="#f5b301"/><path d="M42 74 L50 85 L58 74Z" fill="#f1e4cf"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<path d="M29 37 L71 55" stroke="#111" stroke-width="1.6"/><circle cx="58" cy="47" r="5.4" fill="#111"/>' +
    '<ellipse cx="50" cy="32" rx="31" ry="6" fill="#23262d"/><path d="M22 32 C28 20 38 14 50 11 C62 14 72 20 78 32 C64 28 36 28 22 32Z" fill="#2f333b"/>' +
    '<circle cx="50" cy="22" r="3.2" fill="#f1f5f9"/><path d="M45 28 L55 25 M45 25 L55 28" stroke="#f1f5f9" stroke-width="1.4" stroke-linecap="round"/>',

  astronaute: ({ gender, skin, hair }) =>
    body('#e9eef5', '<rect x="39" y="85" width="22" height="10" rx="2.5" fill="#cbd5e1"/><circle cx="45" cy="90" r="2" fill="#e5484d"/><circle cx="55" cy="90" r="2" fill="#3b82f6"/>') +
    hairBack(gender, hair) + neck(skin) + '<rect x="30" y="68" width="40" height="9" rx="4.5" fill="#cfd8e3"/>' +
    headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<circle cx="50" cy="44" r="30" fill="#bfe3ff" fill-opacity=".28" stroke="#f1f5f9" stroke-width="4.5"/>' +
    '<path d="M32 30 Q36 24 44 22" stroke="#fff" stroke-width="3" opacity=".75" fill="none" stroke-linecap="round"/>',

  ninja: ({ skin }) =>
    body('#23262d', '<rect x="14" y="93" width="72" height="7" fill="#e5484d"/>') +
    '<rect x="42" y="60" width="16" height="18" rx="6" fill="#23262d"/>' +
    '<path d="M27 44 C27 25 37 17 50 17 C63 17 73 25 73 44 C73 62 64 71 50 71 C36 71 27 62 27 44Z" fill="#2b2f38"/>' +
    `<rect x="31" y="38" width="38" height="15" rx="7.5" fill="${skin}"/>` + eyes(46) +
    `<path d="M37 40.5 L46 43 M63 40.5 L54 43" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>` +
    '<rect x="27" y="29" width="46" height="6" fill="#e5484d"/><path d="M72 31 L87 25 M72 33 L89 37" stroke="#e5484d" stroke-width="3" stroke-linecap="round"/>',

  sorcier: ({ gender, skin, hair }) =>
    body('#5b21b6', '<path d="M50 86 l2 4.5 5 .6 -3.7 3.3 1 5 -4.3 -2.5 -4.3 2.5 1 -5 -3.7 -3.3 5 -.6z" fill="#f5b301"/><path d="M42 74 L50 84 L58 74Z" fill="#4c1d95"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<ellipse cx="50" cy="33" rx="30" ry="5.5" fill="#5b21b6"/><path d="M22 33 C36 30 46 18 52 3 C58 17 68 29 78 33 C62 29 38 29 22 33Z" fill="#6d28d9"/>' +
    '<path d="M25 32 C40 28 60 28 75 32" stroke="#f5b301" stroke-width="3.4" fill="none"/><circle cx="53" cy="20" r="2.2" fill="#f5b301"/><circle cx="46" cy="27" r="1.4" fill="#f5b301"/>',

  roi: ({ gender, skin, hair }) =>
    body('#b91c1c', '<path d="M16 88 C26 77 40 74 50 74 C60 74 74 77 84 88 C74 85 62 83 50 83 C38 83 26 85 16 88Z" fill="#f8fafc"/><circle cx="30" cy="84" r="1.2" fill="#23262d"/><circle cx="50" cy="80" r="1.2" fill="#23262d"/><circle cx="70" cy="84" r="1.2" fill="#23262d"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<path d="M31 29 L34 9 L43 20 L50 6 L57 20 L66 9 L69 29Z" fill="#f5b301"/><rect x="31" y="26" width="38" height="5.5" rx="2" fill="#e69f00"/>' +
    '<circle cx="34" cy="9" r="2" fill="#e5484d"/><circle cx="50" cy="6" r="2.2" fill="#3b82f6"/><circle cx="66" cy="9" r="2" fill="#e5484d"/>',

  // ---------- v4 ----------
  poussin: () => {
    const y = '#ffd84d', wing = '#f4bd2a', o = '#f59e0b';
    return body(y) +
      `<path d="M14 100 C13 86 20 77 31 79 C28 87 28 94 31 100Z" fill="${wing}"/><path d="M86 100 C87 86 80 77 69 79 C72 87 72 94 69 100Z" fill="${wing}"/>` +
      `<ellipse cx="50" cy="45" rx="25" ry="25" fill="${y}"/>` +
      `<path d="M44 21 C41 9 47 7 49 14 C50 5 56 6 55 15 C59 10 63 14 56 22Z" fill="${y}"/>` +
      '<circle cx="34" cy="52" r="4.2" fill="#ff9d7a" opacity=".55"/><circle cx="66" cy="52" r="4.2" fill="#ff9d7a" opacity=".55"/>' +
      `<circle cx="41" cy="43" r="3.4" fill="${INK}"/><circle cx="59" cy="43" r="3.4" fill="${INK}"/>` +
      '<circle cx="42.2" cy="41.8" r="1.1" fill="#fff"/><circle cx="60.2" cy="41.8" r="1.1" fill="#fff"/>' +
      `<path d="M43 50 Q50 47 57 50 Q55 58 50 60 Q45 58 43 50Z" fill="${o}"/><path d="M45 53 Q50 55 55 53" stroke="#c97a08" stroke-width="1" fill="none"/>`;
  },

  cardinal: () => {
    const r = '#ef4444', dk = '#b91c1c', bel = '#fecaca', o = '#f59e0b';
    return body(r) +
      `<path d="M14 100 C13 86 20 77 31 79 C28 87 28 94 31 100Z" fill="${dk}"/><path d="M86 100 C87 86 80 77 69 79 C72 87 72 94 69 100Z" fill="${dk}"/>` +
      `<ellipse cx="50" cy="45" rx="25" ry="25" fill="${r}"/>` +
      `<ellipse cx="50" cy="58" rx="14" ry="9" fill="${bel}"/>` +
      `<path d="M43 21 C39 8 46 3 50 12 C52 4 59 6 57 16 C60 12 64 16 57 23Z" fill="${dk}"/>` +
      '<circle cx="40" cy="42" r="6" fill="#fff"/><circle cx="60" cy="42" r="6" fill="#fff"/>' +
      `<circle cx="41.5" cy="42.5" r="3.2" fill="${INK}"/><circle cx="58.5" cy="42.5" r="3.2" fill="${INK}"/>` +
      `<path d="M43 50 Q50 47 57 50 Q55 58 50 60 Q45 58 43 50Z" fill="${o}"/>`;
  },

  detective: ({ gender, skin, hair }) =>
    body('#9a7b57', '<path d="M38 74 L50 96 L62 74 L56 74 L50 84 L44 74Z" fill="#7d6244"/><path d="M42 74 L50 85 L58 74Z" fill="#f1e4cf"/><rect x="20" y="92" width="60" height="4" fill="#7d6244"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<ellipse cx="50" cy="31" rx="31" ry="6.5" fill="#5a4630"/><path d="M29 31 C29 17 38 10 50 10 C62 10 71 17 71 31 C60 27 40 27 29 31Z" fill="#6e563b"/>' +
    '<path d="M29.5 28 C42 24.5 58 24.5 70.5 28" stroke="#b91c1c" stroke-width="3.2" fill="none"/>' +
    '<circle cx="77" cy="84" r="8.5" fill="#bfe3ff" fill-opacity=".45" stroke="#d4a017" stroke-width="2.6"/><path d="M83 90 L92 99" stroke="#d4a017" stroke-width="3.4" stroke-linecap="round"/>',

  zeus: ({ skin }) => {
    const white = '#f1f5f9', gold = '#f5b301';
    return '<path d="M20 52 C16 20 34 8 50 8 C66 8 84 20 80 52 C82 70 76 86 66 96 L34 96 C24 86 18 70 20 52Z" fill="#e2e8f0"/>' +
      body('#f8fafc', `<path d="M14 100 C14 84 26 76 34 75 L66 75 C74 76 86 84 86 100" fill="none" stroke="${gold}" stroke-width="2.4"/><circle cx="68" cy="82" r="3" fill="${gold}"/>`) +
      neck(skin) + headBase(skin) +
      `<path d="M31 55 C30 74 42 86 50 86 C58 86 70 74 69 55 C62 62 56 60 50 61 C44 60 38 62 31 55Z" fill="${white}" stroke="#cbd5e1" stroke-width="1"/>` +
      `<path d="M41 57 Q50 53 59 57 Q50 62 41 57Z" fill="${white}" stroke="#cbd5e1" stroke-width=".8"/>` +
      eyes(45) + `<path d="M36 40.5 L46 42.5 M64 40.5 L54 42.5" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M27 42 C26 24 37 16 50 16 C63 16 74 24 73 42 C68 32 60 27 50 27 C40 27 32 32 27 42Z" fill="#e2e8f0"/>` +
      `<path d="M28 30 C36 22 64 22 72 30" stroke="${gold}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      '<path d="M32 27 l-5 -3 M38 23 l-3 -5 M68 27 l5 -3 M62 23 l3 -5" stroke="#3f8f4a" stroke-width="2.4" stroke-linecap="round"/>' +
      `<path d="M84 76 L76 90 L82 90 L77 100 L90 84 L84 84 L89 76Z" fill="${gold}" stroke="#d99a00" stroke-width="1"/>`;
  },

  // Agent d'entretien : bob bleu, gants jaunes, spray et bulles (dessin original)
  nickel: ({ gender, skin, hair }) =>
    body('#f8fafc', '<path d="M30 76 L36 100 M70 76 L64 100" stroke="#2563eb" stroke-width="5"/><path d="M34 88 L66 88 L66 100 L34 100Z" fill="#2563eb"/><rect x="42" y="91" width="16" height="9" rx="2" fill="#1d4ed8"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth +
    '<ellipse cx="50" cy="31" rx="32" ry="6.5" fill="#0d9488"/><path d="M28 31 C28 17 38 11 50 11 C62 11 72 17 72 31 C60 27 40 27 28 31Z" fill="#14b8a6"/>' +
    '<circle cx="50" cy="20" r="3.2" fill="#ccfbf1"/><circle cx="41" cy="23" r="2" fill="#ccfbf1"/><circle cx="59" cy="23" r="2" fill="#ccfbf1"/>' +
    '<rect x="75" y="76" width="9" height="16" rx="3" fill="#ef4444"/><path d="M75 78 L69 76 L69 80 L75 82" fill="#475569"/><rect x="77" y="72" width="5" height="5" fill="#475569"/>' +
    '<path d="M13 84 C12 78 20 76 22 82 L24 92 C20 96 14 92 13 84Z" fill="#facc15"/><path d="M82 90 C86 88 92 90 92 96 C88 100 84 98 82 94Z" fill="#facc15"/>' +
    '<circle cx="10" cy="64" r="4.5" fill="#bae6fd" fill-opacity=".6" stroke="#7dd3fc"/><circle cx="19" cy="55" r="3" fill="#bae6fd" fill-opacity=".6" stroke="#7dd3fc"/><circle cx="90" cy="60" r="3.6" fill="#bae6fd" fill-opacity=".6" stroke="#7dd3fc"/>',

  fee: ({ gender, skin, hair }) =>
    '<ellipse cx="14" cy="66" rx="13" ry="25" transform="rotate(-24 14 66)" fill="#cfe9ff" fill-opacity=".8" stroke="#fff" stroke-width="2"/>' +
    '<ellipse cx="86" cy="66" rx="13" ry="25" transform="rotate(24 86 66)" fill="#cfe9ff" fill-opacity=".8" stroke="#fff" stroke-width="2"/>' +
    '<ellipse cx="22" cy="86" rx="8" ry="14" transform="rotate(-30 22 86)" fill="#e9d5ff" fill-opacity=".8"/><ellipse cx="78" cy="86" rx="8" ry="14" transform="rotate(30 78 86)" fill="#e9d5ff" fill-opacity=".8"/>' +
    body('#c026d3', '<path d="M38 74 L50 84 L62 74Z" fill="#f5d0fe"/><circle cx="34" cy="92" r="1.6" fill="#fde68a"/><circle cx="66" cy="90" r="1.6" fill="#fde68a"/><circle cx="50" cy="96" r="1.6" fill="#fde68a"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth + hairFront(gender, hair) +
    '<path d="M37 24 L40 13 L46 20 L50 9 L54 20 L60 13 L63 24Z" fill="#fde047" stroke="#f59e0b" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M82 62 L74 88" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round"/><path d="M83 50 l2.6 5.4 5.8.8 -4.2 4 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.2 -4 5.8 -.8z" fill="#fde047" stroke="#f59e0b" stroke-width="1"/>' +
    '<circle cx="20" cy="30" r="1.8" fill="#fde047"/><circle cx="14" cy="42" r="1.2" fill="#fff"/><circle cx="88" cy="28" r="1.4" fill="#fff"/>',

  creole: ({ gender, skin, hair }) =>
    body('#15803d', '<circle cx="30" cy="88" r="3.2" fill="#f472b6"/><circle cx="30" cy="88" r="1.2" fill="#fde047"/><circle cx="66" cy="92" r="3.2" fill="#fb923c"/><circle cx="66" cy="92" r="1.2" fill="#fde047"/><circle cx="48" cy="97" r="3" fill="#f472b6"/><circle cx="48" cy="97" r="1.1" fill="#fde047"/><path d="M42 74 L50 85 L58 74Z" fill="#fde68a"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth +
    '<path d="M27 41 C26 22 37 14 50 14 C63 14 74 22 73 41 C66 31 58 28 50 28 C42 28 34 31 27 41Z" fill="#f59e0b"/>' +
    '<path d="M31 32 L44 18 M40 36 L56 16 M52 33 L66 19 M62 34 L71 26" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round"/>' +
    '<path d="M28 36 L68 22 M30 30 L60 17" stroke="#7f1d1d" stroke-width="1" opacity=".5"/>' +
    '<path d="M70 24 L82 12 L80 28Z" fill="#f59e0b"/><path d="M72 24 L80 17" stroke="#dc2626" stroke-width="2.4"/>' +
    '<circle cx="31" cy="30" r="3.6" fill="#f472b6"/><circle cx="31" cy="30" r="1.3" fill="#fde047"/>',

  docteur: ({ gender, skin, hair }) =>
    body('#f8fafc', '<path d="M50 74 L38 100 M50 74 L62 100" stroke="#cbd5e1" stroke-width="2"/><path d="M44 74 L50 90 L56 74Z" fill="#38bdf8"/><rect x="62" y="86" width="9" height="7" rx="1.4" fill="#e2e8f0"/><path d="M65 86 v-3 M68 86 v-3" stroke="#64748b" stroke-width="1.2"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth +
    '<path d="M28 41 C27 24 38 16 50 16 C62 16 73 24 72 41 C65 33 36 33 28 41Z" fill="#38bdf8"/><path d="M31 34 C40 26 60 26 69 34" stroke="#7dd3fc" stroke-width="2" fill="none"/>' +
    '<path d="M34 74 C30 90 40 98 48 92 M66 74 C70 90 60 98 52 92" stroke="#334155" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="50" cy="94" r="3.4" fill="#cbd5e1" stroke="#334155" stroke-width="1.6"/>' +
    '<rect x="46.5" y="19" width="7" height="7" rx="1.2" fill="#fff"/><path d="M50 20 v5 M47.6 22.5 h4.8" stroke="#e5484d" stroke-width="1.6"/>',

  tortue: () => {
    const g = '#5fb04a', dg = '#3f8a33', shell = '#9a6a2f';
    return `<path d="M8 100 C8 70 28 58 50 58 C72 58 92 70 92 100Z" fill="${shell}"/>` +
      `<path d="M50 58 V100 M26 68 L38 82 L26 100 M74 68 L62 82 L74 100 M38 82 H62" stroke="#6e4a1d" stroke-width="2" fill="none"/>` +
      `<path d="M24 100 C24 86 34 78 50 78 C66 78 76 86 76 100Z" fill="${g}"/><ellipse cx="50" cy="96" rx="14" ry="11" fill="#e8e0a0"/>` +
      `<rect x="43" y="58" width="14" height="22" rx="6" fill="${g}"/>` +
      `<ellipse cx="50" cy="42" rx="22" ry="22" fill="${g}"/><path d="M33 30 Q50 18 67 30" stroke="${dg}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<circle cx="41" cy="40" r="4.6" fill="#fff"/><circle cx="59" cy="40" r="4.6" fill="#fff"/><circle cx="42" cy="41" r="2.6" fill="${INK}"/><circle cx="58" cy="41" r="2.6" fill="${INK}"/>` +
      `<circle cx="47" cy="49" r="1.1" fill="${dg}"/><circle cx="53" cy="49" r="1.1" fill="${dg}"/>` +
      `<path d="M41 55 Q50 62 59 55" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="35" cy="50" r="3" fill="#ff9d7a" opacity=".4"/><circle cx="65" cy="50" r="3" fill="#ff9d7a" opacity=".4"/>`;
  },

  lion: () => {
    const mane = '#b8691f', dm = '#8f4d12', face = '#f2c27b';
    let curls = '';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; curls += `<circle cx="${(50 + 33 * Math.cos(a)).toFixed(1)}" cy="${(46 + 33 * Math.sin(a)).toFixed(1)}" r="11" fill="${i % 2 ? mane : dm}"/>`; }
    return body('#e0a75e', `<ellipse cx="50" cy="96" rx="15" ry="12" fill="#f6dba6"/>`) + curls +
      `<circle cx="50" cy="46" r="31" fill="${mane}"/>` +
      `<circle cx="31" cy="26" r="8" fill="${face}"/><circle cx="69" cy="26" r="8" fill="${face}"/><circle cx="31" cy="26" r="4" fill="#e89a8a"/><circle cx="69" cy="26" r="4" fill="#e89a8a"/>` +
      `<ellipse cx="50" cy="48" rx="21" ry="23" fill="${face}"/>` +
      `<ellipse cx="50" cy="58" rx="12" ry="9" fill="#fbe9c6"/>` +
      `<circle cx="41" cy="44" r="2.8" fill="${INK}"/><circle cx="59" cy="44" r="2.8" fill="${INK}"/><circle cx="42" cy="43" r=".9" fill="#fff"/><circle cx="60" cy="43" r=".9" fill="#fff"/>` +
      `<path d="M45 52 L55 52 L50 58Z" fill="#8a3b2b"/><path d="M50 58 V61 M50 61 Q45 66 41 62 M50 61 Q55 66 59 62" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
      '<circle cx="42" cy="58" r=".9" fill="#8a5a2a"/><circle cx="46" cy="60" r=".9" fill="#8a5a2a"/><circle cx="58" cy="58" r=".9" fill="#8a5a2a"/><circle cx="54" cy="60" r=".9" fill="#8a5a2a"/>';
  },

  dino: () => {
    const g = '#4cc16b', dg = '#2f9a4d', belly = '#d9f5b8', sp = '#f59e0b';
    return body(g, `<ellipse cx="50" cy="95" rx="15" ry="12" fill="${belly}"/>`) +
      `<path d="M34 72 L30 60 L40 66Z M66 72 L70 60 L60 66Z" fill="${sp}"/>` +
      `<rect x="42" y="58" width="16" height="20" rx="6" fill="${g}"/>` +
      `<path d="M36 28 L40 14 L45 26Z M46 24 L50 8 L55 24Z M56 26 L60 14 L64 28Z" fill="${sp}"/>` +
      `<ellipse cx="50" cy="42" rx="23" ry="22" fill="${g}"/><ellipse cx="50" cy="54" rx="21" ry="14" fill="${g}"/><ellipse cx="50" cy="56" rx="17" ry="10" fill="${belly}"/>` +
      `<circle cx="43" cy="51" r="1.6" fill="${dg}"/><circle cx="57" cy="51" r="1.6" fill="${dg}"/>` +
      `<circle cx="40" cy="38" r="4.8" fill="#fff"/><circle cx="60" cy="38" r="4.8" fill="#fff"/><circle cx="41.5" cy="38.5" r="2.7" fill="${INK}"/><circle cx="58.5" cy="38.5" r="2.7" fill="${INK}"/>` +
      `<path d="M40 60 Q50 66 60 60" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M44 61.5 l1.6 3 1.6 -2 M52.8 62 l1.6 -2.6 1.6 2.6" fill="#fff" stroke="#fff" stroke-width="1"/>` +
      `<circle cx="32" cy="48" r="3.2" fill="#fb7185" opacity=".35"/><circle cx="68" cy="48" r="3.2" fill="#fb7185" opacity=".35"/>`;
  },

  clochard: ({ gender, skin, hair }) =>
    body('#6b5b4b', '<rect x="26" y="84" width="11" height="9" fill="#a3866a"/><rect x="62" y="80" width="10" height="10" fill="#4f6b8a"/><path d="M42 74 L50 84 L58 74Z" fill="#8a7662"/><path d="M14 100 L19 96 L24 100 L30 95 L36 100" stroke="#4a3d31" stroke-width="2" fill="none"/>') +
    hairBack(gender, hair) + neck(skin) + headBase(skin) +
    `<circle cx="42" cy="48" r="2.5" fill="${INK}"/><circle cx="58" cy="48" r="2.5" fill="${INK}"/>` +
    '<path d="M38 43 L46 44.5 M62 43 L54 44.5" stroke="#1f2229" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M34 54 C36 66 44 70 50 70 C56 70 64 66 66 54 C62 58 58 58 50 58 C42 58 38 58 34 54Z" fill="#3b3028" opacity=".38"/>' +
    '<path d="M45 61.5 L55 61.5" stroke="#1f2229" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M28 38 C28 20 38 13 50 13 C62 13 72 20 72 38 C60 33 40 33 28 38Z" fill="#5b6470"/><rect x="27" y="34" width="46" height="7" rx="3.5" fill="#475058"/>' +
    '<path d="M36 74 C44 80 56 80 64 74" stroke="#b45309" stroke-width="5" fill="none" stroke-linecap="round"/>',
};

// Copies à redessiner à ta guise : « Hugo Deck » (copie du chevalier) et « Zippo » (copie du singe)
// Papangue : rapace de La Réunion (plumage brun, disque facial clair, bec crochu)
OUTFIT_DRAW.papangue = () => {
  const br = '#6b4a2f', dk = '#4a3220', lt = '#c9a77c', cream = '#efe0c4';
  return body(br, `<path d="M26 100 C28 90 36 84 50 84 C64 84 72 90 74 100Z" fill="${cream}"/>` +
      `<path d="M36 92 l4 5 l4 -5 M46 92 l4 5 l4 -5 M56 92 l4 5 l4 -5" stroke="${lt}" stroke-width="2" fill="none" stroke-linecap="round"/>`) +
    `<path d="M14 100 C12 88 20 80 30 78 L36 90Z" fill="${dk}"/><path d="M86 100 C88 88 80 80 70 78 L64 90Z" fill="${dk}"/>` +
    `<path d="M32 22 C34 10 44 6 50 14 C56 6 66 10 68 22Z" fill="${dk}"/>` +
    `<ellipse cx="50" cy="44" rx="23" ry="25" fill="${br}"/>` +
    `<path d="M50 24 C36 24 30 36 32 50 C34 62 42 68 50 68 C58 68 66 62 68 50 C70 36 64 24 50 24Z" fill="${lt}"/>` +
    `<path d="M33 36 Q42 30 48 38 M67 36 Q58 30 52 38" stroke="${dk}" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
    '<circle cx="41" cy="43" r="5.4" fill="#ffd23f"/><circle cx="59" cy="43" r="5.4" fill="#ffd23f"/>' +
    `<circle cx="41.6" cy="43.4" r="2.6" fill="${INK}"/><circle cx="58.4" cy="43.4" r="2.6" fill="${INK}"/>` +
    '<circle cx="42.4" cy="42.2" r=".9" fill="#fff"/><circle cx="59.2" cy="42.2" r=".9" fill="#fff"/>' +
    '<path d="M44 52 C44 48 56 48 56 52 C56 60 52 66 50 70 C48 66 44 60 44 52Z" fill="#f2b705"/>' +
    '<path d="M50 70 C54 68 56 64 56 60" stroke="#b07f00" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    '<circle cx="48" cy="55" r=".9" fill="#8a6200"/><circle cx="52" cy="55" r=".9" fill="#8a6200"/>';
};
// Ptérodactyle : crête en arrière, grand bec, ailes membraneuses
OUTFIT_DRAW.pterodactyl = () => {
  const sk = '#7aa05a', dk = '#55763c', lt = '#b9d08f', mem = '#a3b87a';
  return body(sk, `<path d="M30 100 C32 90 40 86 50 86 C60 86 68 90 70 100Z" fill="${lt}"/>`) +
    `<path d="M2 96 L12 58 L22 76 L30 52 L38 84Z" fill="${mem}" stroke="${dk}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M98 96 L88 58 L78 76 L70 52 L62 84Z" fill="${mem}" stroke="${dk}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M58 22 C74 2 92 6 98 12 C84 12 72 18 66 32Z" fill="${dk}"/>` +
    `<ellipse cx="46" cy="44" rx="22" ry="24" fill="${sk}"/>` +
    `<path d="M50 56 C52 50 80 40 98 50 C84 54 66 58 52 66Z" fill="#c9db9d" stroke="${dk}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M52 61 C66 57 84 52 96 50" stroke="${dk}" stroke-width="1.6" fill="none"/>` +
    '<circle cx="42" cy="40" r="5.4" fill="#fff"/><circle cx="43" cy="40.4" r="2.8" fill="#111"/><circle cx="44" cy="39.2" r=".9" fill="#fff"/>' +
    `<path d="M32 30 Q40 25 48 32" stroke="${dk}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<circle cx="62" cy="52" r="1.2" fill="${dk}"/>`;
};
// Fermier : chapeau de paille, salopette
OUTFIT_DRAW.fermier = ({ skin, hair, gender }) =>
  body('#3b6fb6', '<rect x="30" y="76" width="40" height="30" rx="6" fill="#2d5a9c"/><rect x="36" y="76" width="6" height="22" fill="#e7c84f"/><rect x="58" y="76" width="6" height="22" fill="#e7c84f"/><circle cx="39" cy="86" r="2.4" fill="#f4d76b"/><circle cx="61" cy="86" r="2.4" fill="#f4d76b"/>') +
  hairBack(gender, hair) + neck(skin) + headBase(skin) + eyes() + lashes(gender) + mouth +
  '<ellipse cx="50" cy="29" rx="40" ry="9" fill="#e4c070" stroke="#b8913d" stroke-width="2"/>' +
  '<path d="M32 29 C32 12 68 12 68 29Z" fill="#edcd7e" stroke="#b8913d" stroke-width="2"/><rect x="32" y="23" width="36" height="5" fill="#c0392b"/>';
OUTFIT_DRAW.zippo = () =>
  body('#F4F4F5', '') +
  // Oreilles noires
  '<path d="M27 30 C10 26 8 47 18 59 C24 62 29 49 31 39Z" fill="#1C1917"/>' +
  '<path d="M73 30 C90 26 92 47 82 59 C76 62 71 49 69 39Z" fill="#1C1917"/>' +
  // Tête blanche
  '<path d="M29 33 C27 53 36 66 50 67 C64 66 73 53 71 33 C69 17 31 17 29 33Z" fill="#FFFFFF"/>' +
  // Côtés noirs et large bande blanche centrale
  '<path d="M50 20 C39 20 30 25 29 34 C27 46 31 55 39 60 C45 53 46 42 46 33 C46 27 48 23 50 20Z" fill="#1C1917"/>' +
  '<path d="M50 20 C61 20 70 25 71 34 C73 46 69 55 61 60 C55 53 54 42 54 33 C54 27 52 23 50 20Z" fill="#1C1917"/>' +
  // Sourcils gris clair identiques
  '<ellipse cx="40" cy="34" rx="3.5" ry="1.6" fill="#E4E4E7" transform="rotate(-15 40 34)"/>' +
  '<ellipse cx="60" cy="34" rx="3.5" ry="1.6" fill="#E4E4E7" transform="rotate(15 60 34)"/>' +
  // Yeux noirs avec éclats blancs
  '<circle cx="40" cy="41" r="4" fill="#000000"/>' +
  '<circle cx="39" cy="40" r="1.4" fill="#FFFFFF"/>' +
  '<circle cx="60" cy="41" r="4" fill="#000000"/>' +
  '<circle cx="59" cy="40" r="1.4" fill="#FFFFFF"/>' +
  // Museau
  '<ellipse cx="50" cy="53" rx="12" ry="9" fill="#F4F4F5"/>' +
  // Truffe et reflet
  '<path d="M44 49 C44 46 56 46 56 49 C56 53 52 55 50 55 C48 55 44 53 44 49Z" fill="#18181B"/>' +
  '<ellipse cx="47.5" cy="48.5" rx="1.5" ry=".8" fill="#52525B"/>' +
  // Bouche
  '<path d="M47 56 Q50 59 50 56 Q50 59 53 56" fill="none" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>' +
  // Joues roses
  '<ellipse cx="33.5" cy="51" rx="2.5" ry="1.6" fill="#FECDD3" opacity=".7"/>' +
  '<ellipse cx="66.5" cy="51" rx="2.5" ry="1.6" fill="#FECDD3" opacity=".7"/>' +
  // Collier orange
  '<path d="M35 65 Q50 72 65 65 L64 70 Q50 77 36 70Z" fill="#E65100"/>' +
  '<rect x="46" y="68" width="8" height="5" rx="1.5" fill="#9E9E9E"/>' +
  '<rect x="47.5" y="69" width="5" height="3" rx=".7" fill="#BDBDBD"/>' +
  '<circle cx="50" cy="75" r="1.8" fill="none" stroke="#BDBDBD" stroke-width="1.2"/>';

export function avatarSVG(p = {}, size = 80) {
  const gender = p.gender === 'femme' ? 'femme' : 'homme';
  const skin = /^#[0-9a-f]{6}$/i.test(p.skin) ? p.skin : '#e0a878';
  const hair = /^#[0-9a-f]{6}$/i.test(p.hair) ? p.hair : '#5b3a29';
  const draw = OUTFIT_DRAW[p.outfit] ?? OUTFIT_DRAW.none;
  // couleur de fond choisie dans le profil (la valeur par défaut suit le mode clair/sombre)
  const bg = /^#[0-9a-f]{6}$/i.test(p.bg) && p.bg.toLowerCase() !== '#e6ebf1' ? p.bg : 'var(--avatar-bg, #e6ebf1)';
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Personnage" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="avclip"><circle cx="50" cy="50" r="50"/></clipPath></defs>
    <circle cx="50" cy="50" r="50" fill="${bg}"/>
    <g clip-path="url(#avclip)">${draw({ gender, skin, hair })}</g></svg>`;
}
