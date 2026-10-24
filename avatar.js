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
};

export function avatarSVG(p = {}, size = 80) {
  const gender = p.gender === 'femme' ? 'femme' : 'homme';
  const skin = /^#[0-9a-f]{6}$/i.test(p.skin) ? p.skin : '#e0a878';
  const hair = /^#[0-9a-f]{6}$/i.test(p.hair) ? p.hair : '#5b3a29';
  const draw = OUTFIT_DRAW[p.outfit] ?? OUTFIT_DRAW.none;
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Personnage" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="avclip"><circle cx="50" cy="50" r="50"/></clipPath></defs>
    <circle cx="50" cy="50" r="50" fill="var(--avatar-bg, #e6ebf1)"/>
    <g clip-path="url(#avclip)">${draw({ gender, skin, hair })}</g></svg>`;
}
