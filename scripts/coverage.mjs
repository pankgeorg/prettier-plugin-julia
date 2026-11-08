// Which node kinds reach the generic token printer, over a file list (debugging aid).
// usage: node scripts/coverage.mjs LIST [--limit N]
import { readFileSync } from 'node:fs';
import { tokenPrinterStats } from '../src/printer.js';
import { formatJulia } from '../src/format.js';
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const files = readFileSync(args[0], 'utf8').split('\n').filter(Boolean).slice(0, limit);
tokenPrinterStats.enabled = true;
for (const f of files) {
  const text = readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
  try {
    formatJulia(text, { juliaVerify: false });
  } catch {
    /* syntax error: skip */
  }
}
const total = [...tokenPrinterStats.kinds.values()].reduce((a, b) => a + b, 0);
console.log(`token-printer nodes: ${total}`);
for (const [k, v] of [...tokenPrinterStats.kinds].sort((a, b) => b[1] - a[1]).slice(0, 40))
  console.log(String(v).padStart(8), k);
