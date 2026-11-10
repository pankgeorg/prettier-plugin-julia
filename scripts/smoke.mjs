// Install the plugin into a fresh Julia project, the way docs/usage.md describes, and run the CLI.
// usage: node scripts/smoke.mjs SPEC [PRETTIER_VERSION]
//   SPEC: a tarball path (npm pack), a release URL, or github:pankgeorg/prettier-plugin-julia#v0.2.0
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const [spec, prettierVersion = '3'] = process.argv.slice(2);
if (!spec) {
  console.error('usage: node scripts/smoke.mjs SPEC [PRETTIER_VERSION]');
  process.exit(2);
}
const plugin = existsSync(spec) ? resolve(spec) : spec;
const dir = mkdtempSync(join(tmpdir(), 'prettier-julia-smoke-'));
const files = '"**/*.jl" "**/*.md"';
const run = (cmd) => {
  const r = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8' });
  console.log(`$ ${cmd}  → exit ${r.status}`);
  return r;
};

try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true }, null, 2) + '\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(dir, '.prettierrc'), '{ "plugins": ["prettier-plugin-julia"] }\n');
  const install = run(`npm install --save-dev --no-audit --no-fund prettier@${prettierVersion} "${plugin}"`);
  assert.equal(install.status, 0, install.stderr);

  writeFileSync(join(dir, 'a.jl'), 'function f(x,y=2;k=3)\nif x>y return x end\n[i^2 for i = 1:k]\nend\n');
  writeFileSync(join(dir, 'README.md'), '# Demo\n\n```julia\nf(x)=x+1\n```\n');

  const before = run(`npx prettier --check ${files}`);
  assert.equal(before.status, 1, 'unformatted files are reported\n' + before.stdout + before.stderr);
  assert.match(before.stdout + before.stderr, /a\.jl/);

  assert.equal(run(`npx prettier --write ${files}`).status, 0);
  assert.equal(
    readFileSync(join(dir, 'a.jl'), 'utf8'),
    'function f(x, y=2; k=3)\n    if x > y\n        return x\n    end\n    [i^2 for i in 1:k]\nend\n',
  );
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), '# Demo\n\n```julia\nf(x) = x + 1\n```\n');

  const after = run(`npx prettier --check ${files}`);
  assert.equal(after.status, 0, after.stdout + after.stderr);

  writeFileSync(join(dir, 'bad.jl'), 'f(x\n');
  const bad = run('npx prettier --check bad.jl');
  assert.equal(bad.status, 2, 'syntax errors fail with status 2');
  assert.match(bad.stderr, /SyntaxError/);

  const version = run('npx prettier --version').stdout.trim();
  console.log(`smoke test passed: prettier ${version}, plugin from ${spec}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
