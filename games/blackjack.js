// Blackjack : une main contre la banque (elle tire jusqu'à 17). Le résultat est envoyé à la fin de chaque main :
//   0 = perdu · 1 = égalité · 2 = gagné · 3 = blackjack (21 avec les 2 premières cartes)
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const newDeck = () => {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const value = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r));
// Meilleur total sans dépasser 21 (un as vaut 11 ou 1)
export function total(hand) {
  let t = hand.reduce((a, c) => a + value(c), 0), aces = hand.filter((c) => c.r === 'A').length;
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
const isBlackjack = (h) => h.length === 2 && total(h) === 21;

export function mount(root, { onEnd }) {
  let deck = [], player = [], dealer = [], phase = 'idle', msg = '', result = null, destroyed = false;
  const card = (c, hidden) => hidden
    ? '<div class="pc back"></div>'
    : `<div class="pc ${c.s === '♥' || c.s === '♦' ? 'red' : ''}"><b>${c.r}</b><i>${c.s}</i></div>`;

  function draw() {
    if (destroyed) return;
    const hide = phase === 'player';
    root.innerHTML = `<div class="bj">
      <div class="bj-side"><div class="bj-lab">Banque <b>${hide ? '?' : dealer.length ? total(dealer) : ''}</b></div>
        <div class="bj-hand">${dealer.map((c, i) => card(c, hide && i === 1)).join('')}</div></div>
      <div class="bj-msg ${result === 0 ? 'lose' : result >= 2 ? 'win' : ''}">${msg}</div>
      <div class="bj-side"><div class="bj-lab">Toi <b>${player.length ? total(player) : ''}</b></div>
        <div class="bj-hand">${player.map((c) => card(c)).join('')}</div></div>
      <div class="bj-btns">${phase === 'player'
        ? '<button class="bj-b" data-act="hit">Tirer</button><button class="bj-b alt" data-act="stand">Rester</button>'
        : `<button class="bj-b" data-act="deal">${phase === 'idle' ? 'Distribuer' : 'Nouvelle main'}</button>`}</div>
    </div>`;
  }

  function finish(score, text) {
    phase = 'done'; result = score; msg = text;
    draw();
    onEnd?.({ score });
  }
  function deal() {
    deck = newDeck(); player = [deck.pop(), deck.pop()]; dealer = [deck.pop(), deck.pop()]; result = null; msg = '';
    phase = 'player';
    if (isBlackjack(player) || isBlackjack(dealer)) {
      phase = 'reveal';
      if (isBlackjack(player) && isBlackjack(dealer)) return finish(1, 'Double blackjack : égalité');
      return isBlackjack(player) ? finish(3, '🃏 Blackjack !') : finish(0, 'La banque a un blackjack');
    }
    draw();
  }
  function stand() {
    phase = 'reveal';
    while (total(dealer) < 17) dealer.push(deck.pop());
    const p = total(player), d = total(dealer);
    if (d > 21) finish(2, 'La banque dépasse 21 : gagné !');
    else if (p > d) finish(2, `Gagné ! ${p} contre ${d}`);
    else if (p === d) finish(1, `Égalité à ${p}`);
    else finish(0, `Perdu… ${p} contre ${d}`);
  }
  function hit() {
    player.push(deck.pop());
    if (total(player) > 21) { phase = 'reveal'; return finish(0, `Tu dépasses 21 (${total(player)})`); }
    if (total(player) === 21) return stand();
    draw();
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'deal' && phase !== 'player') deal();
    else if (a === 'hit' && phase === 'player') hit();
    else if (a === 'stand' && phase === 'player') stand();
  });
  draw();
  return { destroy() { destroyed = true; } };
}
