// Icônes des tâches (SVG, sans emoji) : traits de la couleur du texte, fonds légèrement teintés
const I = (inner) => `<svg class="tico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const T = 'fill="currentColor" fill-opacity=".22"';
const bin = (fill) => I(`<path d="M12 15h24l-2.4 26a3 3 0 0 1-3 2.7H17.4a3 3 0 0 1-3-2.7z" ${fill ? `fill="${fill}" stroke-opacity=".95"` : T}/><path d="M9 15h30M19 15v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4M20 22v14M28 22v14"/>`);

export const TASK_ICONS = {
  // Catégories
  net: I(`<rect x="7" y="20" width="30" height="18" rx="5" ${T} transform="rotate(-14 22 29)"/><path d="M10 27.5l27-6.7" transform="rotate(0)"/><circle cx="34" cy="10" r="4"/><circle cx="41" cy="18" r="2.6"/><circle cx="25" cy="8" r="2.2"/>`),
  asp: I(`<path d="M30 5l-8 28"/><rect x="8" y="33" width="26" height="9" rx="4.5" ${T}/><path d="M13 42v1M29 42v1"/><path d="M27 6h7"/>`),
  ser: I(`<path d="M11 21h22l-3 21H14z" ${T}/><path d="M11 21c0-6 5-10 11-10s11 4 11 10"/><path d="M38 4L30 30"/><path d="M26 32l8 2-2 6-8-2z" ${T}/>`),
  poub: bin(),
  cuis: I(`<circle cx="20" cy="26" r="13" ${T}/><path d="M32 22l12-6"/><ellipse cx="20" cy="26" rx="6" ry="5" fill="#fff" stroke="none"/><circle cx="20" cy="26" r="2.6" fill="#fbbf24" stroke="none"/>`),
  // Pièces
  cuisine: I(`<rect x="7" y="8" width="34" height="34" rx="5" ${T}/><circle cx="17" cy="18" r="4.5"/><circle cx="31" cy="18" r="4.5"/><path d="M7 28h34M15 35h18"/>`),
  salon: I(`<path d="M10 24v-6a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v6" ${T}/><path d="M6 24a3 3 0 0 1 6 0v5h24v-5a3 3 0 0 1 6 0v12H6z" ${T}/><path d="M10 36v4M38 36v4"/>`),
  sdb: I(`<path d="M5 24h38v4a10 10 0 0 1-10 10H15A10 10 0 0 1 5 28z" ${T}/><path d="M11 24V11a4 4 0 0 1 8 0"/><path d="M19 14h-4M14 38l-2 4M34 38l2 4"/><path d="M28 12v3M33 10v3M31 17v2"/>`),
  wc: I(`<rect x="10" y="5" width="16" height="12" rx="3" ${T}/><path d="M8 21h30c0 6-5 11-13 11h-4C13 32 8 27 8 21z" ${T}/><path d="M15 31l-2 11h18l-2-10M18 17v4"/>`),
  maison: I(`<path d="M6 22L24 7l18 15" /><path d="M11 18v24h26V18" ${T}/><path d="M20 42V30h8v12"/>`),
  // Poubelles
  poub_verte: bin('#22c55e'),
  poub_jaune: bin('#facc15'),
  poub_portail: I(`<path d="M6 42V12M42 42V12"/><path d="M6 16h36M6 26h36" /><path d="M12 16v26M18 16v26M24 16v26M30 16v26M36 16v26" stroke-width="2"/><path d="M6 42h36"/>`),
  poub_remplace: I(`<path d="M13 18h22l3 24H10z" ${T}/><path d="M18 18c0-5 2.7-8 6-8s6 3 6 8"/><path d="M19 28l4 4 7-8"/>`),
  // Cuisiner
  cuis_patisserie: I(`<path d="M12 26h24l-4 16H16z" ${T}/><path d="M10 26c0-7 6-13 14-13s14 6 14 13z" ${T}/><path d="M24 13c0-4 2-6 5-7"/><path d="M19 26l1.5 16M29 26l-1.5 16" stroke-width="2"/>`),
  cuis_repas: I(`<path d="M8 22h32v12a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z" ${T}/><path d="M4 24h4M40 24h4M8 22h32"/><path d="M18 15c-2-3 2-4 0-8M25 15c-2-3 2-4 0-8M32 15c-2-3 2-4 0-8"/>`),
  cuis_vaisselle: I(`<circle cx="24" cy="25" r="15" ${T}/><circle cx="24" cy="25" r="8"/><path d="M5 9v11M3 9v6a2 2 0 0 0 4 0V9M43 9c-3 2-4 6-4 10h4v23"/>`),
  courses: I(`<path d="M4 8h6l5 22h22l5-15H13" ${T}/><circle cx="18" cy="38" r="3"/><circle cx="34" cy="38" r="3"/>`),
};
// Icône d'une tâche : la pièce (cuisine, salon…), sinon la clé, sinon la catégorie
export const taskIcon = (key, K) => TASK_ICONS[key] ?? TASK_ICONS[key?.split('_').slice(1).join('_')] ?? TASK_ICONS[K?.group] ?? '';

export const CART_ICON = I(`<path d="M4 8h6l5 22h22l5-15H13" ${T}/><circle cx="18" cy="38" r="3"/><circle cx="34" cy="38" r="3"/><path d="M22 20h12M24 25h8" stroke-width="2"/>`);
export const GIFT_ICON = I(`<rect x="7" y="19" width="34" height="9" rx="2" ${T}/><path d="M10 28h28v14H10z" ${T}/><path d="M24 19v23"/><path d="M24 19c-3-6-11-9-12-4s7 4 12 4zM24 19c3-6 11-9 12-4s-7 4-12 4z"/>`);
