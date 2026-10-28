// Génère supabase/migration-v8.sql et supabase/schema.sql à partir de config.js + challenges.js
// (pour que récompenses, niveaux et XP ne puissent pas se contredire).   Usage : node tools/build-sql.mjs
// Les migrations v2 à v7 sont figées (déjà lancées) ; seule la v8 est générée.
import { readFileSync, writeFileSync } from 'node:fs';
import { SHOP, BIRD_CRATE, OUTFITS, DAILY_XP, WHEEL_MIN, WHEEL_MAX, XP_RULES as X, LEVEL_K, LEVEL_BASE, MILESTONES, TASK_KINDS, GOOSE, BJ_BETS, MESSAGE_MAX, DICE_PRICES, DICE_MAX_DAY, PERKS, DAILY, SOAP_EXCHANGE, LEVEL_BONUS, FARM, ALL_QUESTS } from '../config.js';
import { CHALLENGES, rewardOf } from '../challenges.js';

const root = new URL('../', import.meta.url);
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const list = (a) => a.join(', ');
const subs = {
  __LEVEL_K__: LEVEL_K, __DAILY__: list(DAILY_XP), __WHEEL_MIN__: WHEEL_MIN, __WHEEL_MAX__: WHEEL_MAX,
  __XP_TASK__: X.taskPerSoap, __XP_VALIDATE__: X.validate, __XP_SUDOKU__: X.sudoku,
  __XP_DUEL_PLAY__: X.duelPlay, __XP_DUEL_WIN__: X.duelWin, __DUEL_T__: X.duelWinTrophies, __DUEL_T_CAP__: X.duelTrophyCapPerDay,
  __XP_FLAPPY__: X.flappyPerObstacle, __XP_RAID__: X.raidPer50m, __XP_CAP__: X.gameCap,
  __XP_BJ_PLAY__: X.bjPlay, __XP_BJ_WIN__: X.bjWin, __XP_BJ_BLACKJACK__: X.bjBlackjack,
  __BJ_T_WIN__: X.bjTrophyWin, __BJ_T_BLACKJACK__: X.bjTrophyBlackjack, __BJ_T_CAP__: X.bjTrophyCapPerDay,
  __MS_FLAPPY_AT__: list(MILESTONES.flappy.at), __MS_FLAPPY_XP__: list(MILESTONES.flappy.xp),
  __MS_RAID_AT__: list(MILESTONES.raid.at), __MS_RAID_XP__: list(MILESTONES.raid.xp),
  __MS_SUDOKU_AT__: list(MILESTONES.sudoku.at), __MS_SUDOKU_XP__: list(MILESTONES.sudoku.xp),
  __TASK_KINDS__: Object.entries(TASK_KINDS).filter(([, t]) => !t.legacy).map(([k, t]) => `  (${q(k)}, ${t.soap}, ${t.cooldownH})`).join(',\n'),
  __BIRD_ODDS__: SHOP.bird.map((b) => `  (${q(b.key)}, ${b.w})`).join(',\n'), __CRATE_PRICE__: BIRD_CRATE.price,
  __LB_EVERY__: LEVEL_BONUS.every, __LB_CHIPS__: LEVEL_BONUS.chips, __WEEK_WIN__: GOOSE.weekWin,
  __FARM_CROPS__: FARM.crops.map((c) => `  (${q(c.key)}, ${c.hours}, ${c.cost}, ${c.sell * FARM.yield}, ${c.level}, ${c.sell})`).join(',\n'), __FARM_BASE__: FARM.baseSlots, __FARM_SLOT_COSTS__: FARM.slotCosts.join(', '), __FARM_MAX__: FARM.slotCosts.length,
  __FARM_ITEMS__: FARM.items.map((i) => `  (${q(i.key)}, '${i.kind}', '${JSON.stringify(i.cost)}'::jsonb)`).join(',\n'), __FARM_YIELD__: FARM.yield, __FARM_WELL__: FARM.perks.wellCut, __FARM_STALL__: FARM.perks.stallBonus, __FARM_SILO__: FARM.perks.siloCap, __FARM_GH__: FARM.perks.greenhouseUnits, __FARM_SB__: FARM.spots.b, __FARM_SD__: FARM.spots.d,
  __FARM_CAP__: FARM.capPerDay, __FARM_WITHER__: FARM.witherH, __FARM_CUT__: FARM.waterCut, __FARM_WR__: FARM.waterReward, __FARM_WRMAX__: FARM.waterRewardMaxPerDay, __FARM_BOOST__: FARM.taskBoost,
  __GAME_QUESTS__: ALL_QUESTS.map((x) => `  (${q(x.key)}, ${q(x.game)}, ${x.target}, ${x.reward}, ${q(x.mode)})`).join(',\n'),
  __GOOSE_SIZE__: GOOSE.size, __GOOSE_FIN_XP__: GOOSE.finish.xp, __GOOSE_FIN_TR__: GOOSE.finish.trophy,
  __GOOSE_CELLS__: Object.entries(GOOSE.cells).map(([cell, c]) => { const kind = c.xp ? 'xp' : c.chips ? 'chips' : c.back ? 'back' : 'goose'; return `  (${cell}, '${kind}', ${c.xp ?? c.chips ?? c.back ?? 0})`; }).join(',\n') + ';',
  __DICE_PRICES__: DICE_PRICES.join(', '), __DICE_N__: DICE_PRICES.length, __DICE_MAX__: DICE_MAX_DAY, __PERK_KINDS__: PERKS.map((k) => `'${k.key}'`).join(', '), __PERK_N__: PERKS.length, __PERK_CONFIRM__: PERKS.filter((k) => k.confirm).map((k) => `'${k.key}'`).join(', '),
  __DUEL_STAKE__: X.duelStake, __BJ_BETS__: [...new Set([...BJ_BETS.low, ...BJ_BETS.mid, ...BJ_BETS.high])].join(', '), __LEVEL_BASE__: LEVEL_BASE, __INTRO_XP__: X.introXp, __FIRST_GAME_XP__: X.firstGameXp, __EXCHANGE_CASE__: SOAP_EXCHANGE.map((o) => `when ${o.soap} then ${o.coins}`).join(' '), __SHOP_VALUES__: Object.entries(SHOP).filter(([slot]) => slot !== 'bird').flatMap(([slot, list]) => list.map((i) => `('${slot}:${i.key}', '${slot}', ${i.price})`)).join(',\n  '), __DAILY_CHIPS__: DAILY.chips, __DAILY_XP__: DAILY.xp, __MESSAGE_MAX__: MESSAGE_MAX,
  __CHALLENGES__: CHALLENGES.map((c) => { const r = rewardOf(c.key); return `  (${q(c.key)}, 0, ${q(r.skin)}, ${r.xp})`; }).join(',\n') + ';',
};
const gen = (name) => {
  let t = read(`supabase/${name}.template.sql`);
  for (const [k, v] of Object.entries(subs)) t = t.replaceAll(k, v);
  const left = t.match(/__[A-Z_0-9]+__/g);
  if (left) throw new Error('Placeholders non remplacés : ' + [...new Set(left)].join(', '));
  return t;
};
const v8 = gen('v8');
writeFileSync(new URL('supabase/migration-v8.sql', root), v8);
const sep = '\n\n\n';
writeFileSync(new URL('supabase/schema.sql', root), [read('supabase/schema-v3.sql'), read('supabase/migration-v4.sql'), read('supabase/migration-v5.sql'), read('supabase/migration-v6.sql'), read('supabase/migration-v7.sql'), v8].map((x) => x.trimEnd()).join(sep) + '\n');
console.log('ok');
