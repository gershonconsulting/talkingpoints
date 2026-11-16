// Single source of truth: the VERSION file.
//   node scripts/version.mjs sync   -> rewrite every copy to match VERSION
//   node scripts/version.mjs check  -> exit 1 if any copy differs (this is the test)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const version = rd('VERSION').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('VERSION is not x.y.z:', version); process.exit(1); }

const html = ['admin', 'app', 'index', 'login', 'privacy', 'terms'].map((n) => `public/${n}.html`);
const V = '\\d+\\.\\d+\\.\\d+';
// [file, regex with the version in group 2, prefix group 1, suffix via $3]
const rules = [
  ['public/version.txt', new RegExp(`^()(${V})(\\s*)$`)],
  ['functions/_lib.js', new RegExp(`(export const VERSION = ')(${V})(')`)],
  ['public/app.js', new RegExp(`(const APP_VERSION = ')(${V})(')`)],
  ...html.flatMap((f) => [
    [f, new RegExp(`(\\.(?:css|js)\\?v=)(${V})()`, 'g')],
    [f, new RegExp(`(Talking Points v|· v|data-app-version[^>]*>v)(${V})()`, 'g')],
  ]),
];

const mode = process.argv[2] || 'check';
let bad = 0;
const cache = {};
for (const [file, re] of rules) {
  cache[file] ??= rd(file);
  const found = [...cache[file].matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  for (const m of found) if (m[2] !== version) { bad++; console.error(`${file}: ${m[2]} != ${version}`); }
  if (mode === 'sync') cache[file] = cache[file].replace(re, (_, a, _v, c) => `${a}${version}${c}`);
}
if (mode === 'sync') { for (const f in cache) writeFileSync(join(root, f), cache[f]); console.log('synced to', version); }
else if (bad) { console.error(`${bad} stale version reference(s)`); process.exit(1); }
else console.log('version check ok:', version);
