// Compare the vendored parser layer with an eslint-plugin-julia checkout.
// usage: node scripts/check-vendored.mjs PATH/TO/eslint-plugin-julia
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const up = process.argv[2];
if (!up) {
  console.error('usage: node scripts/check-vendored.mjs PATH/TO/eslint-plugin-julia');
  process.exit(2);
}
const here = new URL('..', import.meta.url).pathname;
const pairs = [
  ...['wasm-host.js', 'green-tree.js', 'positions.js', 'flags.js'].map((f) => [`src/parser/${f}`, `src/parser/${f}`]),
  ['wasm/parser.wasm', 'wasm/parser.wasm'],
  ['wasm/manifest.json', 'wasm/manifest.json'],
  ...readdirSync(join(here, 'wasm/LICENSES')).map((f) => [`wasm/LICENSES/${f}`, `wasm/LICENSES/${f}`]),
  ...['build-parser.jl', 'build-parser.md', 'parser.jl'].map((f) => [`scripts/parser/${f}`, `scripts/${f}`]),
];
let bad = 0;
for (const [mine, theirs] of pairs) {
  const same = readFileSync(join(here, mine)).equals(readFileSync(join(up, theirs)));
  if (!same) {
    bad++;
    console.log(`differs: ${mine} vs ${theirs}`);
  }
}
console.log(bad ? `${bad} file(s) differ` : `all ${pairs.length} vendored files match`);
process.exit(bad ? 1 : 0);
