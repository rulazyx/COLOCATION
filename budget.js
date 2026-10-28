// Onglet Budget (comme Tricount) : calculs purs, sans accès réseau — utilisés par l'écran et le mode démo.
export const eur = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const parseEuros = (txt) => {
  const n = Number(String(txt ?? '').replace(/\s/g, '').replace('€', '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

// Répartit un montant (en centimes) en parts égales. Les centimes qui restent vont aux premiers, en tournant d'une dépense à l'autre (seed = id).
export function splitCents(amount, ids, seed = 0) {
  const list = [...ids].sort((a, b) => a - b), n = list.length, out = {};
  if (!n) return out;
  const base = Math.floor(amount / n), rest = amount - base * n, start = Math.abs(seed) % n;
  list.forEach((id) => { out[id] = base; });
  for (let i = 0; i < rest; i++) out[list[(start + i) % n]] += 1;
  return out;
}

// Solde de chacun (centimes) : positif = on lui doit de l'argent, négatif = il doit de l'argent.
export function balances(expenses, shares, memberIds) {
  const bal = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    const parts = shares.filter((s) => s.expense_id === e.id).map((s) => s.member_id);
    const split = splitCents(e.amount_cents, parts, e.id);
    if (e.payer_id in bal) bal[e.payer_id] += e.amount_cents;
    for (const [id, c] of Object.entries(split)) if (id in bal) bal[id] -= c;
  }
  return bal;
}

// Moins de virements possible pour tout équilibrer : le plus endetté rembourse le plus créditeur, et ainsi de suite.
export function settle(bal) {
  const debt = [], cred = [];
  for (const [id, c] of Object.entries(bal)) { if (c < 0) debt.push([Number(id), -c]); else if (c > 0) cred.push([Number(id), c]); }
  debt.sort((a, b) => b[1] - a[1] || a[0] - b[0]); cred.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const c = Math.min(debt[i][1], cred[j][1]);
    out.push({ from: debt[i][0], to: cred[j][0], cents: c });
    debt[i][1] -= c; cred[j][1] -= c;
    if (!debt[i][1]) i++; if (!cred[j][1]) j++;
  }
  return out;
}
