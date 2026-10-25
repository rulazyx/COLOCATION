// Génère supabase/migration-v4.sql, migration-v5.sql et schema.sql à partir de config.js + challenges.js
// (pour que récompenses, niveaux et XP ne puissent pas se contredire).   Usage : node tools/build-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTFITS, START_COINS, DAILY_COINS, WHEEL_MIN, WHEEL_MAX, XP_RULES as X } from '../config.js';
import { CHALLENGES, rewardOf } from '../challenges.js';

const root = new URL('../', import.meta.url);
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const sub = (t) => t
  .replaceAll('__START_COINS__', START_COINS).replaceAll('__DAILY__', DAILY_COINS.join(', '))
  .replaceAll('__WHEEL_MIN__', WHEEL_MIN).replaceAll('__WHEEL_MAX__', WHEEL_MAX)
  .replaceAll('__XP_TASK__', X.taskPerTrophy).replaceAll('__XP_STOCK__', X.stock).replaceAll('__XP_DAILY__', X.daily)
  .replaceAll('__XP_WHEEL__', X.wheel).replaceAll('__XP_CHALLENGE__', X.challenge).replaceAll('__XP_SUDOKU__', X.sudoku)
  .replaceAll('__XP_DUEL_PLAY__', X.duelPlay).replaceAll('__XP_DUEL_WIN__', X.duelWin)
  .replaceAll('__XP_FLAPPY__', X.flappyPerObstacle).replaceAll('__XP_RAID__', X.raidPer50m).replaceAll('__XP_CAP__', X.gameCap);

const chal = CHALLENGES.map((c) => { const r = rewardOf(c.key); return `  (${q(c.key)}, ${r.coins}, ${q(r.skin)})`; }).join(',\n');
// v4 : prix de boutique (historique : la v5 supprime la boutique, on garde la table pour que v4 reste rejouable)
const shop = ['singe', 'pirate', 'ninja', 'astronaute', 'zippo'].map((k, i) => `  (${q(k)}, ${[30, 80, 100, 120, 150][i]})`).join(',\n');
const v4 = sub(read('supabase/v4.template.sql').replace('__CHALLENGES__', chal + ';').replace('__SHOP__', shop + ';'));
const skins = Object.entries(OUTFITS).filter(([, o]) => o.level).map(([k, o]) => `  (${q(k)}, ${o.level})`).join(',\n');
const v5 = sub(read('supabase/v5.template.sql').replace('__SKINS__', skins + ';'));
const v6 = sub(read('supabase/v6.template.sql').replace('__CHALLENGES__', chal));
writeFileSync(new URL('supabase/migration-v6.sql', root), v6);
writeFileSync(new URL('supabase/migration-v4.sql', root), v4);
writeFileSync(new URL('supabase/migration-v5.sql', root), v5);
writeFileSync(new URL('supabase/schema.sql', root), read('supabase/schema-v3.sql').trimEnd() + '\n\n\n' + v4 + '\n\n\n' + v5 + '\n\n\n' + v6);
console.log('ok');
