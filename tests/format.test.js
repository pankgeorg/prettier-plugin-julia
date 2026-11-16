// Snapshot tests: tests/format/NAME.jl -> tests/format/NAME.out.jl.
// Each output must verify (no protected regions), and formatting it again must not change it.
// UPDATE=1 node --test tests/ rewrites the .out.jl files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { formatJulia } from '../src/format.js';

const dir = new URL('./format/', import.meta.url);
const inputs = readdirSync(dir)
  .filter((f) => f.endsWith('.jl') && !f.endsWith('.out.jl'))
  .sort();

for (const name of inputs) {
  test(`format ${name}`, () => {
    const input = readFileSync(new URL(name, dir), 'utf8');
    const outUrl = new URL(name.replace(/\.jl$/, '.out.jl'), dir);
    const r = formatJulia(input);
    assert.equal(r.whole, null, `whole file kept: ${r.whole}`);
    assert.deepEqual(r.regions, [], 'no protected regions');
    if (process.env.UPDATE || !existsSync(outUrl)) writeFileSync(outUrl, r.output);
    assert.equal(r.output, readFileSync(outUrl, 'utf8'));
    const again = formatJulia(r.output);
    assert.equal(again.output, r.output, 'idempotent');
  });
}
