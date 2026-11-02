// Cardinal dans La Kaz : le jeu d'origine (graphismes, 16 décors, 22 oiseaux) sans amis, classement, niveau/EXP, cadres ni pubs.
import { mount as engine, birdPreview, STAGE_AT } from './flappy.js';
import { gIcon } from '../gameart.js';
import { SHOP, BIRD_CRATE, birdRarity, CARDINAL_STAGES as ST, CARDINAL_QUESTS, CARDINAL_QUEST_BONUS } from '../config.js';
const COIN = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#f6b91d" stroke="#9a6209" stroke-width="1.6"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#fde68a" stroke-width="1.5"/></svg>';
const CRATE = (size = 96) => `<svg viewBox="0 0 96 90" width="${size}" height="${Math.round(size * 0.94)}" aria-hidden="true">
  <ellipse cx="48" cy="84" rx="38" ry="5" fill="rgba(0,0,0,.18)"/>
  <rect x="10" y="26" width="76" height="56" rx="5" fill="#c98a4b" stroke="#4a2c12" stroke-width="3"/>
  <path d="M10 44h76M10 62h76" stroke="#4a2c12" stroke-width="2" opacity=".5"/>
  <rect x="6" y="16" width="84" height="16" rx="4" fill="#e2a35c" stroke="#4a2c12" stroke-width="3"/>
  <path d="M30 26v56M66 26v56" stroke="#4a2c12" stroke-width="2.5" opacity=".6"/>
  <circle cx="48" cy="56" r="15" fill="#ffd23f" stroke="#4a2c12" stroke-width="3"/>
  <path d="M43 51a5.5 5.5 0 1 1 8 5c-2 1.4-3 2.4-3 4.5M48 66.5v.5" fill="none" stroke="#4a2c12" stroke-width="3.4" stroke-linecap="round"/></svg>`;
const HANGER = (size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 17v-3a4.5 4.5 0 1 0-4.5-4.5" stroke="#6b4a2b" stroke-width="2.6"/><path d="M24 17 5 33a3 3 0 0 0 2 5.3h34A3 3 0 0 0 43 33z" fill="#e2a35c" stroke="#6b4a2b" stroke-width="2.4"/><path d="M10 34h28" stroke="#fde7c3" stroke-width="2.2"/></svg>`;
const SCROLL = (size = 30) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="#7c4a12" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8h26a4 4 0 0 1 0 8h-4v22a4 4 0 0 1-4 4H10a4 4 0 0 1 0-8h4V12a4 4 0 0 1 4-4" fill="#fde7b0"/><path d="M14 34h12a4 4 0 0 1-4 8M20 18h8M20 25h8"/><path d="M38 8a4 4 0 0 0-4 4v4" /></svg>`;

// ---------- Cardinal : accueil, vestiaire, quêtes et boîte mystère autour du moteur (games/flappy.js) ----------
// Les colocoins, les oiseaux possédés et l'oiseau équipé viennent de La Kaz (via ctx) ; les quêtes se gardent sur l'appareil.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RAR = { 'Commun': 'rar-c', 'Rare': 'rar-r', 'Épique': 'rar-e', 'Légendaire': 'rar-l' };
const imgCache = {};
const birdImg = (k, size) => `<img class="bimg" src="${imgCache[k ?? 'cardinal'] ??= birdPreview(k ?? 'cardinal', 160)}" width="${size}" height="${size}" alt="">`;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const questOf = (key) => CARDINAL_QUESTS.find((q) => q.key === key);

export function mount(root, ctx) {
  if (!document.getElementById('cd-css')) {
    const l = document.createElement('link'); l.id = 'cd-css'; l.rel = 'stylesheet'; l.href = new URL('./cardinal.css', import.meta.url).href; document.head.appendChild(l);
  }
  const KEY = `kaz-cardinal-${ctx.meId}`;
  let q = {};
  try { q = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { q = {}; }
  const saveQ = () => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* stockage bloqué */ } };
  function roll() {
    if (q.day === dayOf() && q.list?.length) return;
    const keys = [...CARDINAL_QUESTS].sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.key);
    q = { day: dayOf(), list: keys.map((key) => ({ key, p: 0, claimed: false })), claims: 0, bonus: false }; saveQ();
  }
  function track(stat, v) {
    roll();
    for (const x of q.list) { const m = questOf(x.key); if (m.stat === stat && !x.claimed) x.p = stat === 'best' ? Math.max(x.p, v) : x.p + v; }
    saveQ();
  }
  const prog = (x) => Math.min(questOf(x.key).goal, x.p);
  const toClaim = () => { roll(); return q.list.filter((x) => !x.claimed && prog(x) >= questOf(x.key).goal).length + (!q.bonus && q.claims >= 3 ? 1 : 0); };

  root.innerHTML = '<div class="cd"><div class="cd-game"></div><div class="cd-ui"></div></div>';
  const gameEl = root.querySelector('.cd-game'), ui = root.querySelector('.cd-ui'), wrap = root.querySelector('.cd');
  let mode = 'home', sheet = null, run = null, over = null, destroyed = false, toastT = 0;
  const fresh = () => ({ started: false, flaps: 0, counted: 0, coins: 0, record: false });

  const game = engine(gameEl, {
    bird: ctx.bird(),
    onFlap() {
      if (mode !== 'play') return false;
      if (!run.started) { run.started = true; track('games', 1); }
      run.flaps++; return true;
    },
    onStage(i) {
      const c = ST.coins[i] ?? 0;
      toast(`<b>${esc(ST.names[i])}</b><span>Palier ${STAGE_AT[i]}${c ? ` · +${c} colocoin${c > 1 ? 's' : ''}` : ''}</span>`);
    },
    onOver({ score }) { gameOver(score); },
  });

  function play() { sheet = null; mode = 'play'; over = null; run = fresh(); game.restart(); game.resume(); render(); }

  async function gameOver(score) {
    if (destroyed) return;
    mode = 'over';
    track('cols', score - run.counted); run.counted = score; track('best', score); track('flaps', run.flaps); run.flaps = 0;
    run.record = score > ctx.best();
    over = { score, gain: score > 0 ? undefined : 0 };
    render();
    if (score > 0) {
      try { const r = await ctx.reportRun(score); over.gain = r?.coins ?? 0; } catch { over.gain = null; }
      if (!destroyed && mode === 'over') render();
    }
  }

  function toast(html) {
    wrap.querySelector('.cd-toast')?.remove();
    const el = document.createElement('div'); el.className = 'cd-toast'; el.innerHTML = html; wrap.appendChild(el);
    clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2400);
  }

  const topbar = () => `<div class="cd-top"><button class="cd-round" data-a="leave" aria-label="Retour à La Kaz">‹</button><span class="cd-pill">${COIN}<b>${ctx.coins()}</b></span><button class="cd-round cd-help" data-gh="tuto" aria-label="Comment jouer">?</button></div>`;
  function homeHTML() {
    const n = toClaim(), owned = ctx.owned(), pool = SHOP.bird.filter((b) => !owned.has(b.key));
    return `${topbar()}<div class="cd-home">
      <div class="cd-logo"><div class="cd-hop">${birdImg(ctx.bird(), 140)}</div><div class="cd-shadow"></div></div>
      <h1>Cardinal</h1><p class="cd-best">RECORD : <b>${ctx.best()}</b></p>
      <div class="cd-row"><button class="cd-btn go big" data-a="play">${gIcon('play')}Jouer</button><button class="cd-btn big white side" data-a="wardrobe" aria-label="Oiseaux">${HANGER(34)}</button></div>
      <button class="cd-btn big white wide ${n ? 'ready' : ''}" data-a="quests">${SCROLL(30)}Quêtes${n ? `<i class="cd-dot">${n}</i>` : ''}</button>
      <button class="cd-btn big white wide" data-a="crate">${CRATE(30)}Boîte mystère${pool.length && ctx.coins() >= BIRD_CRATE.price ? '<i class="cd-dot ok">!</i>' : ''}</button></div>`;
  }
  function overHTML() {
    const g = over.gain;
    return `<div class="cd-panel center"><h2>${run.record ? 'Nouveau record !' : 'Partie terminée'}</h2><p class="cd-big">${over.score}</p>
      <p class="cd-sub">Record : ${Math.max(ctx.best(), over.score)}</p>
      <p class="cd-gain">${g === undefined ? '<small>Calcul des gains…</small>' : g === null ? '<small>Gains non enregistrés</small>' : g > 0 ? `+${g} ${COIN}` : '<small>Aucun colocoin cette fois</small>'}</p>
      <div class="cd-two"><button class="cd-btn" data-a="play">${gIcon('replay')}Rejouer</button><button class="cd-btn" data-a="home">${gIcon('home')}Menu</button></div></div>`;
  }
  const tabs = (cur, list) => `<div class="cd-tabs">${list.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div>`;
  function sheetHTML() {
    const close = '<button class="cd-x" data-a="close" aria-label="Fermer">✕</button>';
    const owned = ctx.owned();
    if (sheet.type === 'wardrobe') {
      const all = [{ key: null, name: 'Cardinal', w: 99 }, ...SHOP.bird], cur = ctx.bird() ?? null;
      return `<div class="cd-panel">${close}<h2>Oiseaux</h2><p class="cd-sub">${all.filter((b) => !b.key || owned.has(b.key)).length} / ${all.length} oiseaux débloqués</p><div class="cd-birds">${all.map((b) => {
        const mine = !b.key || owned.has(b.key), eq = cur === b.key;
        return `<button class="cd-bird ${mine ? '' : 'lock'} ${eq ? 'eq' : ''}" ${mine ? `data-a="equip" data-k="${b.key ?? ''}"` : 'disabled'}>${mine ? birdImg(b.key, 56) : '<span class="q">?</span>'}<small>${mine ? esc(b.name) : '???'}</small>${b.key ? `<span class="cd-rar ${RAR[birdRarity(b.w)]}">${birdRarity(b.w)}</span>` : ''}${eq ? '<em>Équipé</em>' : ''}</button>`;
      }).join('')}</div></div>`;
    }
    if (sheet.type === 'crate') {
      const pool = SHOP.bird.filter((b) => !owned.has(b.key));
      if (sheet.phase === 'shake') return `<div class="cd-panel center"><div class="cd-shake">${CRATE(150)}</div><p class="cd-sub">Ouverture…</p></div>`;
      if (sheet.phase === 'won') {
        const b = sheet.bird, r = birdRarity(b.w);
        return `<div class="cd-panel center pop"><span class="cd-rar ${RAR[r]}">${r}</span><div class="cd-bigbird">${birdImg(b.key, 150)}</div><h2>${esc(b.name)}</h2><p class="cd-sub">Nouvel oiseau débloqué !</p>
          <div class="cd-two"><button class="cd-btn go" data-a="equip" data-k="${b.key}">Équiper</button><button class="cd-btn" data-a="crate">Fermer</button></div></div>`;
      }
      return `<div class="cd-panel center">${close}<h2>Boîte mystère</h2>${CRATE(120)}
        <p class="cd-sub">Un oiseau au hasard parmi ceux que tu n'as pas encore. Les oiseaux de couleur sont les plus fréquents.</p>
        ${pool.length ? `<button class="cd-btn go" data-a="crate-buy" ${ctx.coins() >= BIRD_CRATE.price ? '' : 'disabled'}>Ouvrir · ${BIRD_CRATE.price} ${COIN}</button>` : '<p><b>Tous les oiseaux sont débloqués !</b></p>'}
        <p class="cd-hint">Tu as ${ctx.coins()} ${COIN}. Chaque nouveau décor atteint en partie rapporte des colocoins.</p></div>`;
    }
    if (sheet.type === 'quests') {
      const tab = sheet.tab ?? 'defis';
      if (tab === 'decors') {
        return `<div class="cd-panel">${close}<h2>Quêtes</h2>${tabs(tab, [['defis', 'Défis du jour'], ['decors', 'Décors']])}<p class="cd-sub">Seul le passage d'un palier rapporte des colocoins (jusqu'à ${ST.dayCap} par jour).</p>
          <ol class="cd-decors">${ST.names.map((n, i) => `<li class="${ctx.best() >= STAGE_AT[i] ? 'seen' : ''}"><b>${esc(n)}</b><span>${i ? `${STAGE_AT[i]} · ${ST.coins[i]} ${COIN}` : 'Départ'}</span></li>`).join('')}</ol></div>`;
      }
      roll();
      const list = q.list.map((x) => {
        const m = questOf(x.key), p = prog(x), done = p >= m.goal;
        if (x.claimed) return `<div class="cd-mission over"><div><b>Quête terminée</b><small>Une nouvelle quête arrive demain</small></div><span class="cd-check">✓</span></div>`;
        return `<div class="cd-mission"><div><b>${esc(m.text)}</b><div class="cd-bar"><i style="width:${(p / m.goal) * 100}%"></i></div><small>${p} / ${m.goal} · +${m.coins} ${COIN}</small></div>
          <button class="cd-btn mini go" data-a="claim" data-k="${x.key}" ${done ? '' : 'disabled'}>Récupérer</button></div>`;
      }).join('');
      return `<div class="cd-panel">${close}<h2>Quêtes</h2>${tabs(tab, [['defis', 'Défis du jour'], ['decors', 'Décors']])}<p class="cd-sub">Nouveaux défis chaque jour à minuit.</p>${list}
        <div class="cd-mission bonus"><div><b>Coffre des 3 défis</b><small>${Math.min(3, q.claims)} / 3 · +${CARDINAL_QUEST_BONUS} ${COIN}</small></div>${q.bonus ? '<span class="cd-check">✓</span>' : `<button class="cd-btn mini go" data-a="claim-bonus" ${q.claims >= 3 ? '' : 'disabled'}>Ouvrir</button>`}</div></div>`;
    }
    if (sheet.type === 'pause') {
      return `<div class="cd-panel center"><h2>Pause</h2><p class="cd-sub">Score : ${game.score}</p><button class="cd-btn go" data-a="resume">${gIcon('play')}Reprendre</button>
        <button class="cd-snd ${game.muted ? '' : 'on'}" data-a="mute" role="switch" aria-checked="${!game.muted}"><span>Son ${game.muted ? 'désactivé' : 'activé'}</span><b class="sw"><i></i></b></button>
        <button class="cd-btn" data-a="quit">${gIcon('home')}Quitter la partie</button></div>`;
    }
    return '';
  }
  function render() {
    if (destroyed) return;
    wrap.classList.toggle('dim', mode !== 'play');
    ui.className = `cd-ui m-${mode}`;
    game.menu(mode === 'home');
    if (mode === 'home' && !sheet) game.resume();
    let h = mode === 'home' ? homeHTML() : mode === 'over' ? overHTML() : sheet?.type === 'pause' ? '' : '<button class="cd-pausebtn" data-a="pause" aria-label="Pause"><i></i><i></i></button>';
    if (sheet) h += `<div class="cd-sheet">${sheetHTML()}</div>`;
    ui.innerHTML = h;
  }

  async function act(a, el) {
    switch (a) {
      case 'leave': ctx.quit(); break;
      case 'play': play(); break;
      case 'home': mode = 'home'; sheet = null; game.restart(); render(); break;
      case 'close': sheet = null; render(); break;
      case 'pause': if (mode === 'play') { game.pause(); sheet = { type: 'pause' }; render(); } break;
      case 'resume': sheet = null; render(); game.resume(); break;
      case 'quit': sheet = null; game.resume(); gameOver(game.score); break;
      case 'mute': {
        const on = !game.toggleMute();
        el.classList.toggle('on', on); el.setAttribute('aria-checked', on); el.querySelector('span').textContent = `Son ${on ? 'activé' : 'désactivé'}`;
        break;
      }
      case 'wardrobe': case 'quests': sheet = { type: a, tab: el.dataset.k }; render(); break;
      case 'tab': sheet.tab = el.dataset.k; render(); break;
      case 'equip': {
        const key = el.dataset.k || null;
        game.setBird(key); sheet = { type: 'wardrobe' }; render();
        try { await ctx.equip(key); } catch { toast('<b>Oiseau non enregistré</b><span>Vérifie ta connexion.</span>'); }
        if (!destroyed) render();
        break;
      }
      case 'crate': sheet = { type: 'crate' }; render(); break;
      case 'crate-buy': {
        el.disabled = true;
        try {
          const key = await ctx.buyCrate(), b = SHOP.bird.find((x) => x.key === key);
          sheet = { type: 'crate', phase: 'shake' }; render();
          setTimeout(() => { if (destroyed) return; sheet = { type: 'crate', phase: 'won', bird: b }; render(); }, 1300);
        } catch (e) { toast(`<b>Impossible</b><span>${esc(e.message || 'Ouverture impossible.')}</span>`); el.disabled = false; }
        break;
      }
      case 'claim': {
        const x = q.list.find((y) => y.key === el.dataset.k), m = questOf(el.dataset.k);
        if (!x || x.claimed || prog(x) < m.goal) break;
        x.claimed = true; q.claims++; saveQ(); render();
        ctx.quest(m.coins).then((got) => { toast(`<b>Défi réussi</b><span>+${got} colocoin${got > 1 ? 's' : ''}</span>`); if (!destroyed) render(); }).catch(() => toast('<b>Gain non enregistré</b><span>Vérifie ta connexion.</span>'));
        break;
      }
      case 'claim-bonus': {
        if (q.bonus || q.claims < 3) break;
        q.bonus = true; saveQ(); render();
        ctx.quest(CARDINAL_QUEST_BONUS).then((got) => { toast(`<b>Coffre ouvert</b><span>+${got} colocoin${got > 1 ? 's' : ''}</span>`); if (!destroyed) render(); }).catch(() => toast('<b>Gain non enregistré</b><span>Vérifie ta connexion.</span>'));
        break;
      }
    }
  }
  ui.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a, b); });
  roll(); render();
  return {
    pause() { if (mode === 'play' && !sheet) { game.pause(); sheet = { type: 'pause' }; render(); } },
    resume() { /* la reprise se fait depuis le menu pause du jeu */ },
    destroy() { destroyed = true; clearTimeout(toastT); game.destroy(); },
  };
}
