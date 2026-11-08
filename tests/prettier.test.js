// Through Prettier itself: language registration, options, Markdown embed, errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as prettier from 'prettier';
import * as plugin from '../src/index.js';

const opts = extra => ({ plugins: [plugin], ...extra });

test('.jl files are inferred and formatted with 4-space indent and width 92 by default', async () => {
  const out = await prettier.format('function f(x,y)\n  x+y\nend\n', opts({ filepath: 'a.jl' }));
  assert.equal(out, 'function f(x, y)\n    x + y\nend\n');
  const info = await prettier.getSupportInfo({ plugins: [plugin] });
  const julia = info.languages.find(l => l.name === 'Julia');
  assert.deepEqual(julia.extensions, ['.jl']);
});

test('Prettier options are honoured (printWidth, tabWidth, useTabs, endOfLine)', async () => {
  const src = 'f(aaaa, bbbb, cccc)\nfunction g()\nx\nend\n';
  const out = await prettier.format(src, opts({ parser: 'julia', printWidth: 12, useTabs: true, endOfLine: 'crlf' }));
  assert.equal(out, 'f(\r\n\taaaa,\r\n\tbbbb,\r\n\tcccc,\r\n)\r\nfunction g()\r\n\tx\r\nend\r\n');
});

test('```julia blocks in Markdown are formatted through the plugin', async () => {
  const md = '# T\n\n```julia\nf(x)=x+1\n```\n\n```julia\nbroken(\n```\n';
  const out = await prettier.format(md, opts({ parser: 'markdown' }));
  assert.equal(out, '# T\n\n```julia\nf(x) = x + 1\n```\n\n```julia\nbroken(\n```\n');
});

test('Markdown blocks use 4-space indent and 92 columns, not the Markdown defaults', async () => {
  const md = '- item\n\n```julia\nfunction g()\nx\nend\n```\n';
  const out = await prettier.format(md, opts({ parser: 'markdown' }));
  assert.equal(out, '- item\n\n```julia\nfunction g()\n    x\nend\n```\n');
});

test('syntax errors surface as Prettier errors with a location', async () => {
  await assert.rejects(prettier.format('f(x\n', opts({ parser: 'julia' })), e => /Expected/.test(e.message) && e.loc?.start?.line === 1);
});

test('juliaVerify and juliaReport options exist', async () => {
  const info = await prettier.getSupportInfo({ plugins: [plugin] });
  const names = info.options.map(o => o.name);
  assert.ok(names.includes('juliaVerify') && names.includes('juliaReport'));
});
