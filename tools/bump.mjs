// Nouvelle version : node tools/bump.mjs  → augmente le numéro dans sw.js (cache), api.js et app.js (BUILD) d'un coup
import { readFileSync, writeFileSync } from 'node:fs';
const f = (p) => new URL('../' + p, import.meta.url);
const sw = readFileSync(f('sw.js'), 'utf8'), n = Number(sw.match(/coloc-v(\d+)/)[1]) + 1;
writeFileSync(f('sw.js'), sw.replace(/coloc-v\d+/, `coloc-v${n}`));
for (const p of ['api.js', 'app.js']) writeFileSync(f(p), readFileSync(f(p), 'utf8').replace(/const BUILD = \d+;|const BUILD = \d+;/, `const BUILD = ${n};`));
console.log('version', n);
