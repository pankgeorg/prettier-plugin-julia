// Stage-by-stage timing of the format pipeline, warm, median of N runs.
// usage: node scripts/bench.mjs (LIST | --file F) [--wasm parser.wasm] [--runs 3] [--json]
//        node scripts/bench.mjs (LIST | --file F) --same-trees other.wasm   (compare raw parser output)
// Stages: wasm parse (parse_src), wasm readout (copying source in, nodes and diagnostics out),
// tree (placement, UTF-16 offsets, node objects, trivia hoisting), print (doc building),
// render (Prettier's line fitting), verify (output parse + normal forms + comparison).
import { readFileSync } from 'node:fs';
import { createWasmHost } from '../src/parser/wasm-host.js';
import { parseTree, setReader } from '../src/tree.js';
import { normalizeTree, printJulia } from '../src/printer.js';
import { render } from '../src/format.js';
import { verify } from '../src/verify.js';

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : d;
};
const wasmPath = opt('--wasm', new URL('../wasm/parser.wasm', import.meta.url).pathname);
const runs = Number(opt('--runs', 3));
const file = opt('--file', null);
const other = opt('--same-trees', null);
const asJson = args.includes('--json');
const list = args.filter((a) => !a.startsWith('--'))[0];
const files = file ? [file] : readFileSync(list, 'utf8').split('\n').filter(Boolean);
const texts = files.map((f) => readFileSync(f, 'utf8').replace(/\r\n?/g, '\n'));
const bytes = texts.reduce((a, t) => a + Buffer.byteLength(t), 0);

function host(path, timers) {
  const module = new WebAssembly.Module(readFileSync(path));
  return createWasmHost(() => {
    const e = new WebAssembly.Instance(module, {}).exports;
    if (!timers) return { exports: e };
    const w = { ...e };
    w.parse_src = (...a) => {
      const t = performance.now();
      const r = e.parse_src(...a);
      timers.parse += performance.now() - t;
      return r;
    };
    return { exports: w };
  });
}

if (other) {
  // Same raw parser output (kinds, spans, flags, classes, diagnostics) from both modules?
  const a = host(wasmPath),
    b = host(other);
  let diff = 0;
  files.forEach((f, i) => {
    const x = JSON.stringify(a(texts[i])),
      y = JSON.stringify(b(texts[i]));
    if (x !== y) {
      diff++;
      if (diff <= 5) console.log('differs:', f);
    }
  });
  console.log(
    `${files.length} files: ${files.length - diff} identical parser outputs, ${diff} differ (${wasmPath} vs ${other})`,
  );
  process.exit(diff ? 1 : 0);
}

const T = { parse: 0 };
const read = host(wasmPath, T);
let readTotal = 0;
setReader((text) => {
  const t = performance.now();
  const r = read(text);
  readTotal += performance.now() - t;
  return r;
});

function once() {
  const s = { parse: 0, readout: 0, tree: 0, print: 0, render: 0, verifyParse: 0, verifyCompare: 0 };
  for (const text of texts) {
    T.parse = 0;
    readTotal = 0;
    let t = performance.now();
    const tree = parseTree(text);
    normalizeTree(tree.root);
    const tTree = performance.now() - t;
    s.parse += T.parse;
    s.readout += readTotal - T.parse;
    s.tree += tTree - readTotal;
    t = performance.now();
    const doc = printJulia(tree, text, new Set());
    s.print += performance.now() - t;
    t = performance.now();
    const out = render(doc, {});
    s.render += performance.now() - t;
    T.parse = 0;
    readTotal = 0;
    t = performance.now();
    verify(tree, out);
    const tv = performance.now() - t;
    s.verifyParse += readTotal;
    s.verifyCompare += tv - readTotal;
  }
  return s;
}

once(); // warm-up
const samples = Array.from({ length: runs }, once);
const med = (k) => samples.map((x) => x[k]).sort((a, b) => a - b)[runs >> 1];
const keys = ['parse', 'readout', 'tree', 'print', 'render', 'verifyParse', 'verifyCompare'];
const m = Object.fromEntries(keys.map((k) => [k, med(k)]));
const total = keys.reduce((a, k) => a + m[k], 0);
const noVerify = total - m.verifyParse - m.verifyCompare;
const mb = bytes / 1e6;
if (asJson) {
  console.log(JSON.stringify({ wasm: wasmPath, files: files.length, bytes, ms: m, total, noVerify }));
  process.exit(0);
}
console.log(
  `${files.length} file(s), ${mb.toFixed(2)} MB, ${wasmPath.split('/').slice(-2).join('/')}, median of ${runs} warm runs`,
);
const label = {
  parse: 'wasm parse (parse_src)',
  readout: 'wasm readout (copy in/out)',
  tree: 'tree build + hoist',
  print: 'doc building (printer)',
  render: 'doc printing (line fitting)',
  verifyParse: 'verify: output wasm parse+readout',
  verifyCompare: 'verify: output tree + compare',
};
for (const k of keys)
  console.log(
    `${label[k].padEnd(32)} ${(m[k] / 1000 / mb).toFixed(3)} s/MB ${((100 * m[k]) / total).toFixed(1).padStart(5)} %`,
  );
console.log(`${'total (verify on)'.padEnd(32)} ${(total / 1000 / mb).toFixed(3)} s/MB`);
console.log(`${'total (juliaVerify: false)'.padEnd(32)} ${(noVerify / 1000 / mb).toFixed(3)} s/MB`);
