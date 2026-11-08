// Check other formatters' outputs with the same JuliaSyntax normal form the plugin uses.
// usage: node scripts/compare.mjs LIST OUTDIR TOOL...   (OUTDIR/TOOL/N.jl is file N of LIST, 1-based)
import { readFileSync, existsSync } from 'node:fs';
import { parseTree, hasErrors } from '../src/tree.js';
import { verify } from '../src/verify.js';
import { formatJulia } from '../src/format.js';
const [list, outdir, ...tools] = process.argv.slice(2);
const files = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const key = (m) =>
  m
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\d+/g, 'N')
    .slice(0, 100);
for (const tool of tools) {
  let same = 0,
    differ = 0,
    missing = 0,
    unchanged = 0;
  const kinds = new Map(),
    examples = [];
  files.forEach((f, i) => {
    const input = readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
    const p = `${outdir}/${tool}/${i + 1}.jl`;
    if (!existsSync(p)) {
      missing++;
      return;
    }
    const out = readFileSync(p, 'utf8');
    if (out === input) unchanged++;
    const tree = parseTree(input);
    if (hasErrors(tree)) return;
    const d = verify(tree, out);
    if (!d) {
      same++;
      return;
    }
    differ++;
    const k = key(d.message);
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    if (examples.length < 6) examples.push(`${f}: ${d.message.slice(0, 200)}`);
  });
  console.log(
    `\n${tool}: ${files.length} files, unchanged ${unchanged}, same tree ${same}, tree differs ${differ}, no output ${missing}`,
  );
  for (const [k, v] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(v).padStart(5), k);
  for (const e of examples) console.log('   e.g.', e);
}
// the plugin itself, sequentially, same files, for timing
let bytes = 0;
const t0 = performance.now();
for (const f of files) {
  const input = readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
  bytes += Buffer.byteLength(input);
  try {
    formatJulia(input);
  } catch {
    /* syntax error: nothing to time */
  }
}
const ms = performance.now() - t0;
console.log(
  `\nprettier-plugin-julia (sequential, one process, verification included): ${(ms / 1000).toFixed(2)} s for ${(bytes / 1e6).toFixed(1)} MB`,
);
