// Blackjack : mises en trophées (1, 5, 10, 25), doubler, séparer, tirage animé.
// La banque tire jusqu'à 17. Le résultat de chaque main est envoyé à la fin :
//   onEnd({ bet, net, hands, wins, blackjack }) — net = trophées gagnés (+) ou perdus (−)
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const BETS = [1, 5, 10, 25];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newDeck = () => {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const value = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r));
// Meilleur total sans dépasser 21 (un as vaut 11 ou 1)
export function total(cards) {
  let t = cards.reduce((a, c) => a + value(c), 0), aces = cards.filter((c) => c.r === 'A').length;
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
const isNatural = (cards) => cards.length === 2 && total(cards) === 21;

export function mount(root, { onEnd, balance }) {
  let bal = Math.max(0, balance?.() ?? 0), bet = 1, deck = [], hands = [], dealer = [], active = 0, phase = 'bet', msg = '';
  let hideDealer = false, fresh = null, destroyed = false, busy = false, split = false;
  const stake = () => hands.reduce((a, h) => a + h.bet, 0);
  const afford = (extra) => bal >= stake() + extra;
  const fit = () => { if (bet > bal) bet = [...BETS].reverse().find((b) => b <= bal) ?? 0; };

  const card = (c, key, hidden) => {
    const isNew = fresh === key;
    return hidden ? `<div class="pc back ${isNew ? 'in' : ''}"></div>`
      : `<div class="pc ${c.s === '♥' || c.s === '♦' ? 'red' : ''} ${isNew ? 'in' : ''} ${key === 'flip' ? 'flip' : ''}"><b>${c.r}</b><i>${c.s}</i></div>`;
  };
  function draw() {
    if (destroyed) return;
    const dTot = dealer.length ? (hideDealer ? value(dealer[0]) : total(dealer)) : '';
    const handHTML = hands.map((h, i) => `<div class="bj-h ${hands.length > 1 && i === active && phase === 'player' ? 'act' : ''}">
      <div class="bj-hand">${h.cards.map((c, k) => card(c, `p${i}-${k}`)).join('')}</div>
      <div class="bj-hl">${h.cards.length ? total(h.cards) : ''}${h.bet ? ` · mise ${h.bet}` : ''}${h.result ? ` · ${h.result}` : ''}</div></div>`).join('');
    const cur = hands[active];
    const canDouble = phase === 'player' && !busy && cur && cur.cards.length === 2 && afford(cur.bet);
    const canSplit = phase === 'player' && !busy && !split && hands.length === 1 && cur.cards.length === 2 && value(cur.cards[0]) === value(cur.cards[1]) && afford(cur.bet);
    const controls = phase === 'player'
      ? `<div class="bj-btns"><button class="bj-b" data-act="hit" ${busy ? 'disabled' : ''}>Tirer</button><button class="bj-b alt" data-act="stand" ${busy ? 'disabled' : ''}>Rester</button></div>
         <div class="bj-btns"><button class="bj-b sm" data-act="double" ${canDouble ? '' : 'disabled'}>Doubler</button><button class="bj-b sm" data-act="split" ${canSplit ? '' : 'disabled'}>Séparer</button></div>`
      : phase === 'bet' || phase === 'over'
        ? `<div class="bj-bets">${BETS.map((b) => `<button class="bj-chip ${b === bet ? 'sel' : ''}" data-bet="${b}" ${b > bal ? 'disabled' : ''}>${b}</button>`).join('')}</div>
           ${bal < 1 ? '<div class="bj-msg lose" style="min-height:0">Il te faut au moins 1 trophée pour jouer.</div>' : ''}
           <div class="bj-btns"><button class="bj-b" data-act="deal" ${bal < 1 || bet < 1 ? 'disabled' : ''}>${phase === 'bet' ? 'Distribuer' : 'Nouvelle main'}</button></div>`
        : '';
    root.innerHTML = `<div class="bj">
      <div class="bj-bal">Trophées : <b>${bal}</b>${bet ? ` · Mise : <b>${bet}</b>` : ''}</div>
      <div class="bj-side"><div class="bj-lab">Banque ${dealer.length ? `<b>${dTot}</b>` : ''}</div>
        <div class="bj-hand">${dealer.map((c, k) => card(c, k === 1 && !hideDealer && fresh === 'flip' ? 'flip' : `d${k}`, hideDealer && k === 1)).join('')}</div></div>
      <div class="bj-msg ${msg.startsWith('Perdu') || msg.includes('dépasse') ? 'lose' : msg ? 'win' : ''}">${msg}</div>
      <div class="bj-side">${handHTML}</div>
      ${controls}
    </div>`;
  }
  async function give(target, key) {
    target.push(deck.pop()); fresh = key; draw(); await sleep(420); fresh = null;
  }
  async function deal() {
    if (busy) return;
    busy = true; split = false; msg = ''; deck = newDeck();
    fit(); if (bet < 1) { busy = false; return draw(); }
    hands = [{ cards: [], bet, result: '' }]; dealer = []; active = 0; hideDealer = true; phase = 'dealing'; draw();
    await give(hands[0].cards, 'p0-0'); if (destroyed) return;
    await give(dealer, 'd0'); await give(hands[0].cards, 'p0-1'); await give(dealer, 'd1');
    if (destroyed) return;
    if (isNatural(hands[0].cards) || isNatural(dealer)) { busy = false; return settle(); }
    phase = 'player'; busy = false; draw();
  }
  async function hit() {
    if (busy) return; busy = true;
    const h = hands[active];
    await give(h.cards, `p${active}-${h.cards.length}`);
    busy = false;
    if (total(h.cards) >= 21) return next(); // 21 ou plus : la main s'arrête
    draw();
  }
  async function dbl() {
    if (busy) return; busy = true;
    const h = hands[active]; h.bet *= 2;
    await give(h.cards, `p${active}-${h.cards.length}`);
    busy = false; next();
  }
  async function doSplit() {
    if (busy) return; busy = true; split = true;
    const [a, b] = hands[0].cards, bt = hands[0].bet;
    hands = [{ cards: [a], bet: bt, result: '' }, { cards: [b], bet: bt, result: '' }]; active = 0; draw(); await sleep(250);
    await give(hands[0].cards, 'p0-1'); await give(hands[1].cards, 'p1-1');
    busy = false; draw();
  }
  function next() {
    if (active < hands.length - 1) { active++; draw(); return; }
    settle();
  }
  async function settle() {
    busy = true; phase = 'dealer'; draw(); await sleep(350);
    hideDealer = false; fresh = 'flip'; draw(); await sleep(520); fresh = null;
    const live = hands.some((h) => total(h.cards) <= 21) && !isNatural(hands[0].cards) && !(isNatural(dealer));
    if (live) while (total(dealer) < 17) { await give(dealer, `d${dealer.length}`); if (destroyed) return; }
    draw();
    const d = total(dealer), dNat = isNatural(dealer);
    let net = 0, wins = 0, losses = 0, blackjack = false;
    for (const h of hands) {
      const t = total(h.cards);
      if (!split && isNatural(h.cards)) {
        if (dNat) h.result = 'égalité';
        else { const g = Math.ceil(h.bet * 1.5); net += g; wins++; blackjack = true; h.result = `blackjack +${g}`; }
      } else if (t > 21) { net -= h.bet; losses++; h.result = `dépasse −${h.bet}`; }
      else if (dNat || d > t && d <= 21) { net -= h.bet; losses++; h.result = `perdu −${h.bet}`; }
      else if (d > 21 || t > d) { net += h.bet; wins++; h.result = `gagné +${h.bet}`; }
      else h.result = 'égalité';
    }
    msg = blackjack ? 'Blackjack !' : wins > losses ? 'Gagné !' : losses > wins ? (hands.every((h) => total(h.cards) > 21) ? 'Tu dépasses 21' : 'Perdu…') : 'Égalité';
    // la mise de base est celle choisie avant de doubler
    const betBase = bet;
    bal = Math.max(0, bal + (net < 0 ? -Math.min(-net, bal) : net));
    phase = 'over'; busy = false; draw();
    try { await onEnd?.({ bet: betBase, net, hands: hands.length, wins, blackjack }); } catch { /* le score est signalé par l'appli */ }
    if (!destroyed) { bal = Math.max(0, balance?.() ?? bal); fit(); draw(); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.bet !== undefined) { bet = Number(b.dataset.bet); draw(); return; }
    const a = b.dataset.act;
    if (a === 'deal' && (phase === 'bet' || phase === 'over')) deal();
    else if (a === 'hit' && phase === 'player') hit();
    else if (a === 'stand' && phase === 'player' && !busy) next();
    else if (a === 'double' && phase === 'player') dbl();
    else if (a === 'split' && phase === 'player') doSplit();
  });
  fit(); draw();
  return { destroy() { destroyed = true; } };
}
