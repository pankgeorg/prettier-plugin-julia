// Summarize a corpus JSONL: node scripts/corpus-summary.mjs OUT.jsonl [--examples N]
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const ex = args.includes('--examples') ? Number(args[args.indexOf('--examples') + 1]) : 0;
const rows = readFileSync(args[0], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const by = s => rows.filter(r => r.status === s);
const bytes = rows.reduce((a, r) => a + (r.bytes ?? 0), 0);
const ms = rows.reduce((a, r) => a + (r.ms ?? 0), 0);
const ok = by('ok');
const withRegions = ok.filter(r => r.regions?.length);
const nRegions = ok.reduce((a, r) => a + (r.regions?.length ?? 0), 0);
const idemFail = rows.filter(r => r.idem === false);
console.log(`files ${rows.length}, ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`verified ${ok.length} (unchanged ${ok.filter(r => !r.changed).length}); with protected regions ${withRegions.length} (${nRegions} regions)`);
console.log(`whole file kept ${by('whole').length}; syntax errors ${by('syntax').length}; crashes ${by('crash').length}`);
console.log(`idempotence failures ${idemFail.length} (of ${rows.filter(r => r.idem !== undefined).length} checked)`);
console.log(`format time ${(ms / 1000).toFixed(1)} s total (per worker), ${(ms / (bytes / 1e6) / 1000).toFixed(2)} s/MB; median ${median(rows.map(r => r.ms ?? 0)).toFixed(1)} ms/file`);
const slow = [...rows].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 5);
console.log('slowest:', slow.map(r => `${r.file.split('/').slice(-3).join('/')} ${r.ms} ms ${r.bytes} B r${r.rounds}`).join('; '));
// reasons
const reasonKey = s => (s ?? '').replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 90);
const count = new Map();
for (const r of ok) for (const g of r.regions ?? []) count.set(reasonKey(g.reason), (count.get(reasonKey(g.reason)) ?? 0) + 1);
for (const r of by('whole')) count.set('WHOLE ' + reasonKey(r.whole), (count.get('WHOLE ' + reasonKey(r.whole)) ?? 0) + 1);
console.log('\ntop reasons:');
for (const [k, v] of [...count].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(v).padStart(6), k);
if (ex) {
  console.log('\nexamples:');
  for (const r of withRegions.slice(0, ex)) console.log(r.file, JSON.stringify(r.regions.slice(0, 3)));
  for (const r of by('whole').slice(0, ex)) console.log('WHOLE', r.file, r.whole);
  for (const r of by('crash').slice(0, ex)) console.log('CRASH', r.file, r.msg);
  for (const r of idemFail.slice(0, ex)) console.log('IDEM', r.file, JSON.stringify(r.idemAt));
}
function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; }
