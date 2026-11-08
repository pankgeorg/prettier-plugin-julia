// Verified formatting over a list of files, one JSON line per file.
// usage: node scripts/corpus.mjs LIST OUT.jsonl [--workers N] [--limit N] [--no-idem]
// Per file: status ok | syntax (JuliaSyntax rejects the input) | whole (kept as written) |
// crash; regions protected; idempotent (format(format(x)) == format(x)); ms; bytes.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const flagOn = name => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
  const workers = Number(opt('--workers', 4)), limit = Number(opt('--limit', Infinity));
  const noIdem = flagOn('--no-idem');
  const [list, out] = args;
  let files = readFileSync(list, 'utf8').split('\n').filter(Boolean).slice(0, limit);
  const done = new Set();
  if (existsSync(out)) for (const l of readFileSync(out, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).file);
  else writeFileSync(out, '');
  files = files.filter(f => !done.has(f));
  console.error(`${files.length} files to do (${done.size} already done), ${workers} workers`);
  let next = 0, finished = 0;
  const t0 = Date.now();
  for (let w = 0; w < Math.min(workers, files.length); w++) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { noIdem }, resourceLimits: { maxOldGenerationSizeMb: 2048 } });
    const feed = () => { if (next < files.length) worker.postMessage(files[next++]); else worker.postMessage(null); };
    worker.on('message', r => {
      appendFileSync(out, JSON.stringify(r) + '\n');
      if (++finished % 500 === 0) console.error(`${finished}/${files.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      feed();
    });
    worker.on('error', e => console.error('worker error', e));
    feed();
  }
} else {
  const { formatJulia } = await import('../src/format.js');
  parentPort.on('message', file => {
    if (file === null) { process.exit(0); }
    const r = { file };
    try {
      const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'); // as Prettier does before parsing
      r.bytes = Buffer.byteLength(text);
      const t = performance.now();
      let res;
      try { res = formatJulia(text, {}); } catch (e) {
        if (e.name === 'SyntaxError' || e.constructor?.name === 'JuliaSyntaxError') { r.status = 'syntax'; r.msg = e.message; r.ms = performance.now() - t; parentPort.postMessage(r); return; }
        throw e;
      }
      r.ms = +(performance.now() - t).toFixed(1);
      r.rounds = res.rounds;
      r.status = res.whole ? 'whole' : 'ok';
      if (res.whole) r.whole = res.whole.slice(0, 300);
      r.regions = res.regions.map(x => ({ line: x.line, col: x.column, len: x.end - x.start, reason: (x.reason ?? '').slice(0, 300) }));
      r.changed = res.output !== text;
      if (!workerData.noIdem && !res.whole) {
        const again = formatJulia(res.output, {});
        r.idem = again.output === res.output;
        if (!r.idem) {
          const a = res.output.split('\n'), b = again.output.split('\n');
          const k = a.findIndex((l, i) => l !== b[i]);
          r.idemAt = { line: k + 1, first: a[k]?.slice(0, 160), second: b[k]?.slice(0, 160) };
        }
      }
    } catch (e) {
      r.status = 'crash'; r.msg = String(e?.stack ?? e).slice(0, 500);
    }
    parentPort.postMessage(r);
  });
}
