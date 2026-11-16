// Check the vendored parser artifact against its manifest (hash, size, ABI) and smoke-parse.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync(new URL('../wasm/manifest.json', import.meta.url)));
const bytes = readFileSync(new URL('../wasm/parser.wasm', import.meta.url));
assert.equal(bytes.length, manifest.bytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
const module = new WebAssembly.Module(bytes);
assert.deepEqual(WebAssembly.Module.imports(module), []);
assert.deepEqual(
  WebAssembly.Module.exports(module)
    .map((e) => e.name)
    .sort(),
  [...manifest.abi.exports].sort(),
);
const { parseTree } = await import('../src/tree.js');
assert.equal(parseTree('α = 1').diagnostics.length, 0);
console.log(
  `parser.wasm ok: ${bytes.length} bytes, sha256 ${manifest.sha256.slice(0, 12)}…, JuliaSyntax of Julia ${manifest.versions.julia} (${process.version})`,
);
