// Génère supabase/migration-v4.sql et supabase/schema.sql à partir de config.js + challenges.js
// (pour que les prix, récompenses et pièces de départ ne puissent pas se contredire).
// Usage : node tools/build-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTFITS, START_COINS, DAILY_COINS, WHEEL_MIN, WHEEL_MAX } from '../config.js';
import { CHALLENGES, rewardOf } from '../challenges.js';

const root = new URL('../', import.meta.url);
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const chal = CHALLENGES.map((c) => { const r = rewardOf(c.key); return `  (${q(c.key)}, ${r.coins}, ${q(r.skin)})`; }).join(',\n');
const shop = Object.entries(OUTFITS).filter(([, o]) => o.price > 0).map(([k, o]) => `  (${q(k)}, ${o.price})`).join(',\n');
const v4 = readFileSync(new URL('supabase/v4.template.sql', root), 'utf8')
  .replace('__START_COINS__', START_COINS).replace('__CHALLENGES__', chal + ';').replace('__SHOP__', shop + ';')
  .replace('__DAILY__', DAILY_COINS.join(', ')).replaceAll('__WHEEL_MIN__', WHEEL_MIN).replaceAll('__WHEEL_MAX__', WHEEL_MAX);
writeFileSync(new URL('supabase/migration-v4.sql', root), v4);
const base = readFileSync(new URL('supabase/schema-v3.sql', root), 'utf8');
writeFileSync(new URL('supabase/schema.sql', root), base.trimEnd() + '\n\n\n' + v4);
console.log('ok');
