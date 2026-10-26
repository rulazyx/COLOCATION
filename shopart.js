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
    : b.acc === 'crown' ? '<path d="M28 20l4-12 7 8 6-10 6 10 7-8 3 12z" fill="#facc15" stroke="#b45309" stroke-width="1.5"/>' : '';
  return `<svg viewBox="0 0 80 70" width="${size}" height="${Math.round(size * 0.875)}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    ${b.rainbow ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset=".33" stop-color="#facc15"/><stop offset=".66" stop-color="#22c55e"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>` : ''}
    <path d="M8 40q-6-10 0-18 4 10 12 14z" fill="${b.wing}"/>
    <circle cx="40" cy="38" r="26" fill="${body}"/>
    <ellipse cx="44" cy="48" rx="16" ry="10" fill="${b.belly}"/>
    <ellipse cx="30" cy="40" rx="13" ry="8" transform="rotate(-18 30 40)" fill="${b.wing}"/>
    <circle cx="50" cy="28" r="8" fill="#fff"/><circle cx="52.5" cy="28" r="4" fill="#111"/>
    <path d="M62 33l16 5-16 7z" fill="#f59e0b"/>${acc}</svg>`;
}

// Icônes d'onglets : traits fins (couleur du texte), fonds blancs, un seul accent jaune
const NI = (inner) => `<svg class="nico" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const cleaner = NI(`
  <path d="M34 8L25 33"/><path d="M29 5h9" stroke-width="3"/>
  <path d="M15 35c-3-10 1-16 9-15 7 1 9 8 7 15z" class="f"/>
  <rect x="5" y="35" width="38" height="9" rx="3.5" class="f"/>
  <path d="M9 40.5h30" class="ys" stroke-width="3"/>
  <path d="M21 27h5" stroke-width="1.6"/>`);
const book = NI(`
  <path d="M5 11c6-3 13-3 19 1v28c-6-4-13-4-19-1z" class="f"/>
  <path d="M43 11c-6-3-13-3-19 1v28c6-4 13-4 19-1z" class="f"/>
  <path d="M10 18c3-1 7-1 10 .5M10 24c3-1 7-1 10 .5M10 30c3-1 7-1 10 .5" stroke-width="1.5"/>
  <path d="M33 5v17l4-3.4 4 3.4V8" class="y"/>
  <path d="M29 20h6M29 26h10" stroke-width="1.5"/>`);
const navBird = NI(`
  <path d="M9 24c-4-3-5-8-3-12 4 1 8 4 10 8" class="f"/>
  <circle cx="25" cy="26" r="15" class="f"/>
  <path d="M15 28c2 6 9 8 14 4" />
  <path d="M14 26c4-4 10-3 11 2-4 3-9 3-11-2z" class="y"/>
  <circle cx="31" cy="21" r="4.2" class="f"/><circle cx="32" cy="21" r="1.8" class="k"/>
  <path d="M39 24l8 3-8 4z" class="y"/>
  <path d="M16 12c1-3 3-4 5-4M21 9c1-2 3-3 5-3" stroke-width="1.5"/>`);
const podium = NI(`
  <rect x="4" y="26" width="12" height="16" rx="1.5" class="f"/>
  <rect x="18" y="16" width="12" height="26" rx="1.5" class="y"/>
  <rect x="32" y="31" width="12" height="11" rx="1.5" class="f"/>
  <path d="M24 3.5l2 4.2 4.6.6-3.4 3.2.9 4.5-4.1-2.3-4.1 2.3.9-4.5-3.4-3.2 4.6-.6z" class="f" stroke-width="1.6"/>
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
