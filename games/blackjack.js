// Blackjack : mises en trophées (colocoins), doubler, séparer, tirage animé.
// La banque tire jusqu'à 17. Le résultat de chaque main est envoyé à la fin :
//   onEnd({ bet, net, hands, wins, blackjack }) — net = trophées gagnés (+) ou perdus (−)
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
import { betsFor } from '../config.js';
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

const DEALER = `<svg class="dealer-svg" viewBox="0 0 220 120" aria-hidden="true">
  <rect x="0" y="96" width="220" height="24" fill="#2a1a10"/>
  <path d="M30 120 C30 84 64 72 110 72 C156 72 190 84 190 120Z" fill="#17171c"/>
  <path d="M92 74 L110 112 L128 74 C122 70 98 70 92 74Z" fill="#f4f1ea"/>
  <path d="M96 76 L110 120 L124 76 L110 98Z" fill="#7a1220"/>
  <path d="M100 79 L110 74 L120 79 L110 86Z" fill="#b31a30"/><circle cx="110" cy="80" r="3" fill="#7a1220"/>
  <rect x="99" y="58" width="22" height="18" rx="7" fill="#e4b890"/>
  <ellipse cx="110" cy="40" rx="24" ry="27" fill="#efc7a0"/>
  <path d="M86 36 C84 12 136 12 134 36 C128 24 116 20 110 20 C102 20 92 24 86 36Z" fill="#241a14"/>
  <circle cx="101" cy="42" r="2.6" fill="#222"/><circle cx="119" cy="42" r="2.6" fill="#222"/>
  <path d="M96 36 q5 -4 10 0 M114 36 q5 -4 10 0" stroke="#241a14" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M110 44 l-3 8 h6z" fill="#dba87f"/>
  <path d="M101 56 Q110 62 119 56" stroke="#8a3b2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M98 61 q12 6 24 0" stroke="#241a14" stroke-width="2" fill="none" opacity=".35"/>
  <g class="arm"><path d="M150 100 C168 96 176 84 170 78 C164 76 156 84 140 90Z" fill="#17171c"/><ellipse cx="170" cy="78" rx="8" ry="6" fill="#efc7a0"/></g>
  <g class="shoe"><rect x="178" y="84" width="38" height="30" rx="5" fill="#101014" stroke="#3b3b44" stroke-width="2"/><rect x="182" y="88" width="30" height="6" fill="#c9a24a"/></g>
</svg>`;
const TABLE_ARC = `<svg class="bj-arc" viewBox="0 0 300 60" aria-hidden="true"><path id="arc" d="M10 8 Q150 66 290 8" fill="none"/><text font-size="13" fill="#f3d98b" font-weight="700" letter-spacing="1.6" text-anchor="middle"><textPath href="#arc" startOffset="50%">BLACKJACK PAIE 3 POUR 2</textPath></text><text x="150" y="52" font-size="9" fill="#f3d98b" opacity=".85" text-anchor="middle" letter-spacing="1">LA BANQUE S'ARRÊTE À 17</text></svg>`;
const chipStack = (n) => (n > 0 ? `<span class="chipstack" aria-hidden="true"><i></i><i></i><i></i><b>${n}</b></span>` : '');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function mount(root, { onEnd, balance, quest }) {
  let streak = 0;
  let bal = Math.max(0, balance?.() ?? 0), bet = 1, deck = [], hands = [], dealer = [], active = 0, phase = 'bet', msg = '';
  let hideDealer = false, fresh = null, destroyed = false, busy = false, split = false;
  const stake = () => hands.reduce((a, h) => a + h.bet, 0);
  const afford = (extra) => bal >= stake() + extra;
  const bets = () => betsFor(bal);
  const fit = () => { const set = bets(); if (!set.includes(bet) || bet > bal) bet = set.find((b) => b <= bal) ?? 0; };

  const card = (c, key, hidden, dlr) => {
    const isNew = fresh === key;
    const cls = `${isNew ? (dlr ? 'in dlr' : 'in') : ''}`;
    return hidden ? `<div class="pc back ${cls}"></div>`
      : `<div class="pc ${c.s === '♥' || c.s === '♦' ? 'red' : ''} ${cls} ${key === 'flip' ? 'flip' : ''}"><b>${c.r}</b><i>${c.s}</i></div>`;
  };
  function draw() {
    if (destroyed) return;
    const dTot = dealer.length ? (hideDealer ? value(dealer[0]) : total(dealer)) : '';
    const handHTML = hands.map((h, i) => `<div class="bj-h ${hands.length > 1 && i === active && phase === 'player' ? 'act' : ''}">
      <div class="bj-hand">${h.cards.map((c, k) => card(c, `p${i}-${k}`)).join('')}</div>${chipStack(h.bet)}
      <div class="bj-hl">${h.cards.length ? total(h.cards) : ''}${h.bet ? ` · mise ${h.bet}` : ''}${h.result ? ` · ${h.result}` : ''}</div></div>`).join('');
    const cur = hands[active];
    const canDouble = phase === 'player' && !busy && cur && cur.cards.length === 2 && afford(cur.bet);
    const canSplit = phase === 'player' && !busy && !split && hands.length === 1 && cur.cards.length === 2 && value(cur.cards[0]) === value(cur.cards[1]) && afford(cur.bet);
    const controls = phase === 'player'
      ? `<div class="bj-btns"><button class="bj-b" data-act="hit" ${busy ? 'disabled' : ''}>Tirer</button><button class="bj-b alt" data-act="stand" ${busy ? 'disabled' : ''}>Rester</button></div>
         <div class="bj-btns"><button class="bj-b sm" data-act="double" ${canDouble ? '' : 'disabled'}>Doubler</button><button class="bj-b sm" data-act="split" ${canSplit ? '' : 'disabled'}>Séparer</button></div>`
      : phase === 'bet' || phase === 'over'
        ? `<div class="bj-bets">${bets().map((b) => `<button class="bj-chip ${b === bet ? 'sel' : ''}" data-bet="${b}" ${b > bal ? 'disabled' : ''}>${b}</button>`).join('')}</div>
           ${bal < bets()[0] ? `<div class="bj-msg lose" style="min-height:0">Il te faut au moins ${bets()[0]} colocoins pour jouer. Tu en reçois 50 chaque jour dans Défis.</div>` : ''}
           <div class="bj-btns"><button class="bj-b" data-act="deal" ${bal < bets()[0] || bet < 1 ? 'disabled' : ''}>${phase === 'bet' ? 'Distribuer' : 'Nouvelle main'}</button></div>`
        : '';
    root.innerHTML = `<div class="bj">
      <div class="dealer ${fresh && fresh !== 'flip' ? 'dealing' : ''}">${DEALER}</div>
      <div class="bj-bal">${bet ? `Mise : <b>${bet}</b>` : ''}</div>
      <div class="bj-side"><div class="bj-lab">Banque ${dealer.length ? `<b>${dTot}</b>` : ''}</div>
        <div class="bj-hand">${dealer.map((c, k) => card(c, k === 1 && !hideDealer && fresh === 'flip' ? 'flip' : `d${k}`, hideDealer && k === 1, true)).join('')}</div></div>
      ${TABLE_ARC}
      <div class="bj-msg ${msg.startsWith('Perdu') || msg.includes('dépasse') ? 'lose' : msg ? 'win' : ''}">${msg}</div>
      <div class="bj-side">${handHTML}</div>
      ${controls}
    </div>`;
  }
  async function give(target, key) {
    target.push(deck.pop()); fresh = key; draw(); await sleep(380); fresh = null;
  }
  async function deal() {
    if (busy) return;
    busy = true; split = false; msg = ''; deck = newDeck();
    fit(); if (bet < 1) { busy = false; return draw(); }
    hands = [{ cards: [], bet, result: '' }]; dealer = []; active = 0; hideDealer = true; phase = 'dealing'; draw();
    await sleep(250); if (destroyed) return;
    await give(hands[0].cards, 'p0-0'); if (destroyed) return;
    await give(dealer, 'd0'); if (destroyed) return;
    await sleep(180); if (destroyed) return;
    await give(hands[0].cards, 'p0-1'); if (destroyed) return;
    await sleep(180); if (destroyed) return;
    await give(dealer, 'd1');
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
    busy = true; phase = 'dealer'; draw(); await sleep(500);          // la banque réfléchit…
    if (destroyed) return;
    hideDealer = false; fresh = 'flip'; draw(); await sleep(450); fresh = null;
    const live = hands.some((h) => total(h.cards) <= 21) && !isNatural(hands[0].cards) && !(isNatural(dealer));
    if (live) while (total(dealer) < 17) { await sleep(350); if (destroyed) return; await give(dealer, `d${dealer.length}`); if (destroyed) return; }
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
    if (blackjack) quest?.('bj_bj');
    if (wins > losses) { streak++; quest?.('bj_streak', streak); } else streak = 0;
    if (hands.some((h) => h.result?.startsWith('gagné') && total(h.cards) <= 16)) quest?.('bj_low');
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
