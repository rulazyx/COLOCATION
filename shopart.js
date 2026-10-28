// Dessins SVG : oiseau (boutique) et icônes de la barre d'onglets
import { SHOP } from './config.js';
import { avatarSVG } from './avatar.js';

const BASE_BIRD = { body: '#ef4444', belly: '#fecaca', wing: '#b91c1c' };
export const birdLook = (key) => ({ ...BASE_BIRD, ...(SHOP.bird.find((b) => b.key === key) ?? {}) });

// Oiseau vu de profil (aperçu boutique, icône « Jeux »)
export function birdSVG(key, size = 64) {
  const b = birdLook(key), id = `bg${Math.random().toString(36).slice(2, 7)}`;
  const body = b.rainbow ? `url(#${id})` : b.body;
  const acc = b.acc === 'shades' ? '<rect x="40" y="26" width="22" height="9" rx="3" fill="#111"/><rect x="38" y="29" width="6" height="2" fill="#111"/>'
    : b.acc === 'band' ? '<path d="M18 30Q40 18 62 28v6Q40 26 18 36z" fill="#dc2626"/><path d="M18 33l-8 6 10 0z" fill="#dc2626"/>'
    : b.acc === 'knight' ? '<path d="M26 40C26 20 38 14 46 14s20 6 20 26z" fill="#aab3bd"/><rect x="42" y="26" width="24" height="7" rx="3" fill="#2b2f36"/><path d="M34 16C30 4 14 6 10 16 20 12 28 14 36 22z" fill="#e5484d"/>'
    : b.acc === 'dark' ? '<path d="M30 16l4-10 5 8 5-10 5 10 4-8 3 10z" fill="#0b0910"/>'
    : b.acc === 'duck' ? '<path d="M58 34Q80 32 80 40Q80 47 58 46z" fill="#f59e0b" stroke="#b86a06" stroke-width="1.5"/><circle cx="36" cy="12" r="4" fill="#ffd23f"/><circle cx="31" cy="14" r="3.4" fill="#ffd23f"/>'
    : b.acc === 'pigeon' ? '<ellipse cx="44" cy="54" rx="17" ry="8" transform="rotate(14 44 54)" fill="#2f9e8a" opacity=".9"/><ellipse cx="48" cy="58" rx="10" ry="5" transform="rotate(14 48 58)" fill="#8a5fb0" opacity=".8"/><circle cx="52.5" cy="28" r="6.6" fill="#f97316"/><circle cx="53.5" cy="28" r="3" fill="#111"/>'
    : b.acc === 'clodo' ? '<path d="M26 22C26 2 58 0 62 22z" fill="#6b4e3d"/><rect x="24" y="20" width="40" height="7" rx="3" fill="#4a362b"/><circle cx="43" cy="3" r="5" fill="#4a362b"/><rect x="26" y="50" width="12" height="10" fill="#b4895a" stroke="#6b4e3d" stroke-dasharray="2 2"/><g fill="#40301f" opacity=".6"><circle cx="58" cy="46" r="1"/><circle cx="62" cy="50" r="1"/><circle cx="54" cy="52" r="1"/><circle cx="60" cy="55" r="1"/></g>'
    : b.acc === 'ptero' ? '<path d="M36 14L10 0L22 24z" fill="#4a5f2f" stroke="#2f3d1c" stroke-width="1.5"/><path d="M60 31L80 38L60 45z" fill="#c9a24a" stroke="#7a5e1a" stroke-width="1.5"/><path d="M18 44L2 56L14 54L6 66L26 54z" fill="#4a5f2f"/>'
    : b.acc === 'crown' ? '<path d="M28 20l4-12 7 8 6-10 6 10 7-8 3 12z" fill="#facc15" stroke="#b45309" stroke-width="1.5"/>' : '';
  return `<svg viewBox="0 0 80 70" width="${size}" height="${Math.round(size * 0.875)}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    ${b.rainbow ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset=".33" stop-color="#facc15"/><stop offset=".66" stop-color="#22c55e"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>` : ''}
    <path d="M8 40q-6-10 0-18 4 10 12 14z" fill="${b.wing}"/>
    <circle cx="40" cy="38" r="26" fill="${body}"/>
    <ellipse cx="44" cy="48" rx="16" ry="10" fill="${b.belly}"/>
    <ellipse cx="30" cy="40" rx="13" ry="8" transform="rotate(-18 30 40)" fill="${b.wing}"/>
    <circle cx="50" cy="28" r="8" fill="${b.eyeBg ?? '#fff'}"/><circle cx="52.5" cy="28" r="${b.eye ? 5 : 4}" fill="${b.eye ?? '#111'}"${b.eye ? ' style="filter:drop-shadow(0 0 3px #f00)"' : ''}/>
    <path d="M62 33l16 5-16 7z" fill="#f59e0b"/>${acc}</svg>`;
}

// Icônes d'onglets : traits fins (couleur du texte), fonds blancs, un seul accent jaune
const NI = (inner) => `<svg class="nico" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const cleaner = NI(`
  <g transform="rotate(-14 24 31)">
    <rect x="6" y="21" width="36" height="20" rx="8" class="f"/>
    <path d="M14 26.5h20" stroke-width="1.6"/>
    <rect x="9" y="23.5" width="30" height="4.5" rx="2.2" class="y" stroke="none"/>
    <rect x="6" y="21" width="36" height="20" rx="8" fill="none"/>
    <path d="M13 34h12" stroke-width="1.6"/>
  </g>
  <circle cx="14" cy="11" r="5" class="f"/><circle cx="27" cy="7" r="3.2" class="f"/><circle cx="36" cy="13" r="4.2" class="f"/>
  <path d="M12.2 9.5a2.6 2.6 0 0 1 1.8-1.2M35 11.6a2 2 0 0 1 1.2-.8" stroke-width="1.2"/>`);
const book = NI(`
  <path d="M5 11c6-3 13-3 19 1v28c-6-4-13-4-19-1z" class="f"/>
  <path d="M43 11c-6-3-13-3-19 1v28c6-4 13-4 19-1z" class="f"/>
  <path d="M10 18c3-1 7-1 10 .5M10 24c3-1 7-1 10 .5M10 30c3-1 7-1 10 .5" stroke-width="1.5"/>
  <path d="M33 5v17l4-3.4 4 3.4V8" class="y"/>
  <path d="M29 20h6M29 26h10" stroke-width="1.5"/>`);
const navBird = NI(`
  <path d="M14 14h20c6 0 9 4 11 12l2 9c1 5-3 8-7 6-3-1-5-4-7-6H15c-2 2-4 5-7 6-4 2-8-1-7-6l2-9c2-8 5-12 11-12z" class="f"/>
  <path d="M15 21v8M11 25h8" stroke-width="2.4"/>
  <circle cx="33" cy="22" r="2.2" class="y"/><circle cx="38" cy="27" r="2.2" class="y"/>
  <path d="M22 24h4" stroke-width="2"/>
  <path d="M20 14v-3h8v3" />`);
const podium = NI(`
  <rect x="4" y="26" width="12" height="16" rx="1.5" class="f"/>
  <rect x="18" y="16" width="12" height="26" rx="1.5" class="y"/>
  <rect x="32" y="31" width="12" height="11" rx="1.5" class="f"/>
  <g stroke="none" fill="currentColor" font-family="system-ui,sans-serif" font-weight="800" font-size="10" text-anchor="middle"><text x="10" y="38">2</text><text x="24" y="31">1</text><text x="38" y="40">3</text></g>`);
const persoSVG = () => NI(`
  <circle cx="24" cy="17" r="9" class="f"/>
  <path d="M6 43c1-10 8-15 18-15s17 5 18 15z" class="f"/>
  <path d="M20 17h.01M28 17h.01" stroke-width="3"/>`);

export const NAV_ICONS = {
  tasks: () => cleaner, defis: () => book, games: () => navBird, rank: () => podium, me: persoSVG,
};
export const CART_SVG = `<svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 6h6l4 18h18l4-13H11" fill="#fde68a" stroke="#b45309" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="16" cy="32" r="3.2" fill="#475569"/><circle cx="29" cy="32" r="3.2" fill="#475569"/><path d="M15 15h16M16 20h14" stroke="#f59e0b" stroke-width="2"/></svg>`;

export const GEAR_SVG = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="4.2"/>
  <path d="M13.4 3.5h5.2l.8 3.3 2.3 1 2.9-1.8 3.7 3.7-1.8 2.9 1 2.3 3.3.8v5.2l-3.3.8-1 2.3 1.8 2.9-3.7 3.7-2.9-1.8-2.3 1-.8 3.3h-5.2l-.8-3.3-2.3-1-2.9 1.8-3.7-3.7 1.8-2.9-1-2.3-3.3-.8v-5.2l3.3-.8 1-2.3-1.8-2.9 3.7-3.7 2.9 1.8 2.3-1z" transform="scale(.82) translate(3.5 3.5)"/></svg>`;

export const SUGGEST_SVG = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 3.5a8.5 8.5 0 0 0-4.6 15.7c.8.6 1.1 1.3 1.1 2.3v1h7v-1c0-1 .3-1.7 1.1-2.3A8.5 8.5 0 0 0 16 3.5z"/><path d="M12.5 26h7M13.8 29h4.4"/></svg>`;

export const CAL_SVG = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <rect x="4.5" y="6" width="23" height="21" rx="4"/><path d="M4.5 12.5h23M10.5 3.5v5M21.5 3.5v5"/><path d="M10 18h2.5M15 18h2.5M20 18h2.5M10 22.5h2.5M15 22.5h2.5"/></svg>`;

export const CRATE_SVG = (size = 96) => `<svg viewBox="0 0 96 90" width="${size}" height="${Math.round(size * 0.94)}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="48" cy="84" rx="38" ry="5" fill="rgba(0,0,0,.18)"/>
  <rect x="10" y="26" width="76" height="56" rx="5" fill="#c98a4b" stroke="#4a2c12" stroke-width="3"/>
  <path d="M10 44h76M10 62h76" stroke="#4a2c12" stroke-width="2" opacity=".5"/>
  <rect x="6" y="16" width="84" height="16" rx="4" fill="#e2a35c" stroke="#4a2c12" stroke-width="3"/>
  <path d="M30 26v56M66 26v56" stroke="#4a2c12" stroke-width="2.5" opacity=".6"/>
  <circle cx="48" cy="56" r="15" fill="#ffd23f" stroke="#4a2c12" stroke-width="3"/>
  <path d="M43 51a5.5 5.5 0 1 1 8 5c-2 1.4-3 2.4-3 4.5M48 66.5v.5" fill="none" stroke="#4a2c12" stroke-width="3.4" stroke-linecap="round"/></svg>`;

export const QUEST_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M8.5 9l1.5 1.5L13 7.5M8.5 15.5h7"/></svg>`;
export const COIN_SVG = `<svg viewBox="0 0 20 20" width="14" height="14" style="vertical-align:-2px" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="9" fill="#f6b91d" stroke="#9a6209" stroke-width="1.6"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#fde68a" stroke-width="1.5"/></svg>`;

// Illustrations « pixel art » (rectangles) pour la fenêtre surprise
const px = (w, h, rects) => `<svg viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" shape-rendering="crispEdges" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${rects.map(([x, y, rw, rh, c]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"/>`).join('')}</svg>`;
export const PX_CAKE = px(16, 16, [[7,1,2,2,'#ffd23f'],[7,3,2,1,'#ff9f1c'],[3,6,10,2,'#ff7aa8'],[3,5,10,1,'#fff'],[2,8,12,5,'#c98a4b'],[2,8,12,1,'#fff'],[2,13,12,1,'#8a5a2b'],[4,10,2,1,'#fff'],[8,10,2,1,'#fff'],[11,10,2,1,'#fff'],[1,14,14,1,'#5b3a1c']]);
export const PX_MUG = px(10, 10, [[1,1,6,1,'#fff'],[1,2,6,6,'#ffbf1f'],[1,2,6,1,'#fff7c2'],[7,3,2,1,'#e8e8e8'],[8,4,1,2,'#e8e8e8'],[7,6,2,1,'#e8e8e8'],[1,8,6,1,'#b8860b']]);
export const PX_FOOD = px(10, 10, [[1,3,8,1,'#d9a15b'],[1,4,8,1,'#5fbf4a'],[1,5,8,1,'#c0392b'],[1,6,8,1,'#7a4a21'],[1,7,8,2,'#d9a15b'],[2,2,6,1,'#e8b46a']]);
export const PX_PAD = px(12, 10, [[1,3,10,5,'#7c4dff'],[0,4,1,3,'#7c4dff'],[11,4,1,3,'#7c4dff'],[2,5,3,1,'#fff'],[3,4,1,3,'#fff'],[8,4,1,1,'#ff4d6d'],[9,5,1,1,'#3be8b0'],[7,5,1,1,'#ffd23f'],[8,6,1,1,'#4cc9f0']]);
export const PX_GIFT = px(10, 10, [[1,4,8,5,'#ff4d6d'],[0,3,10,2,'#ff7a93'],[4,3,2,6,'#ffd23f'],[3,1,2,2,'#ffd23f'],[5,1,2,2,'#ffd23f']]);
export const PX_FISH = px(12, 10, [[2,3,6,4,'#4cc9f0'],[1,4,1,2,'#4cc9f0'],[8,2,2,2,'#2aa3d1'],[8,6,2,2,'#2aa3d1'],[3,4,1,1,'#fff'],[3,4,1,1,'#06243a'],[5,5,2,1,'#2aa3d1']]);
export const PX_MASK = px(12, 10, [[1,3,10,5,'#1b8fd1'],[2,4,3,3,'#bdeaff'],[7,4,3,3,'#bdeaff'],[5,5,2,1,'#0d5c8a'],[0,5,1,2,'#0d5c8a'],[11,5,1,2,'#0d5c8a']]);
