// The safety net: a printer bug must never reach the output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJulia, parseForFormat } from '../src/format.js';
import { verify } from '../src/verify.js';

const src = (n, text) => text.slice(n.start, n.end);

test('a printer bug that changes meaning is caught, protected and reported', () => {
  const input = 'v = [a - b c]\nw = 1+2\n';
  // Bug: print the binary `a - b` inside a matrix row as `a -b` (two elements).
  const mutate = (n, text) => (n.kind === 'call' && src(n, text) === 'a - b' ? 'a -b' : undefined);
  const buggy = formatJulia(input, { juliaVerify: false }, { mutate });
  assert.equal(buggy.output, 'v = [a -b c]\nw = 1 + 2\n', 'without verification the bug reaches the output');
  const r = formatJulia(input, {}, { mutate });
  assert.equal(r.output, 'v = [a - b c]\nw = 1 + 2\n', 'the node is kept as written, the rest is formatted');
  assert.equal(r.whole, null);
  assert.equal(r.regions.length, 1);
  assert.equal(r.regions[0].line, 1);
  assert.match(r.regions[0].reason, /became/);
});

test('a printer bug that makes a syntax error is caught', () => {
  const input = 'f(x) = x\ng(y) = y+1\n';
  const mutate = (n, text) => (n.kind === 'call' && src(n, text) === 'y+1' ? 'y +)' : undefined);
  const r = formatJulia(input, {}, { mutate });
  assert.equal(r.output, 'f(x) = x\ng(y) = y+1\n');
  assert.equal(r.regions.length, 1);
  assert.match(r.regions[0].reason, /output does not parse/);
});

test('a printer bug that drops a comment is caught', () => {
  const input = 'x = f(a, # keep me\n      b)\n';
  const mutate = (n, text) => (n.kind === 'call' && src(n, text).startsWith('f(a') ? 'f(a, b)' : undefined);
  const r = formatJulia(input, {}, { mutate });
  assert.ok(r.output.includes('# keep me'));
  assert.equal(r.regions.length, 1);
  assert.match(r.regions[0].reason, /comment/);
});

test('a bug everywhere falls back to the whole file as written', () => {
  const input = 'x = 1\ny = 2\n';
  const mutate = (n) => (n.kind === 'Integer' ? '3' : undefined);
  const r = formatJulia(input, {}, { mutate });
  assert.equal(r.output, input);
  assert.equal(r.regions.length, 2);
});

test('syntax errors are reported, never formatted', () => {
  assert.throws(
    () => formatJulia('f(x\n'),
    (e) => e.name === 'SyntaxError' && e.loc.start.line === 1 && e.loc.start.column === 4,
  );
});

// Patterns that silently changed meaning in other formatters (topiary-julia's corpus runs).
const PITFALLS = [
  '[x -y]',
  '[x +y]',
  '[a ~b]',
  '[x+y +z]',
  '[x - y]',
  '[1:100 -1:-1:-100]',
  '"""doc""" f',
  '"""\n    doc\n"""\nf(x) = x',
  'x = - 2',
  'x = -2',
  'x = - (2)',
  'x = -(2)',
  'for i = 1 : n\nend',
  'y = [1 : n]',
  'x"s" in y',
  'import Base: ==',
  'import Base: +, -',
  '@test .√[3,4]',
  '(x=1;y=2)->x',
  'a ? b : c',
  'x = a ? -1 : +1',
  'f(x; k=1)',
  'f(x, ; k=1)',
  '(a,; b)',
  '(a; b)',
  'x.:+',
  'a.b',
  '2x',
  '2(x+1)',
  "x'",
  "x'y'",
  '[1 2\n 3 4]',
  '[1;; 2]',
  '@m[1]',
  '@NamedTuple{a::Int}',
  'f(@nospecialize x)',
  'g(x for x in y)',
  'g(x for x in y if x > 1)',
  'x = a : b',
  'r = a: :b',
  'a .+ b',
  '1 .+ 2',
  '(10 .^ [-1])[1]',
  'x::T where T',
  'A{<:Real}',
  'a = :sym',
  'b = :(:sym)',
  '$x',
  ':($x + 1)',
  'x === y',
  'a <: b',
  'f(a)(b)',
  '`cmd $x`',
  'using A: b, c',
  'export a, b',
  'const x = 1',
  'global y',
  'local z = 1',
  'return a, b',
  'x = (a, b)',
  'a, b = 1, 2',
  'f(;)',
  '[;]',
  '(;)',
  'f() do; end',
  'x = begin end',
];

for (const code of PITFALLS) {
  test(`keeps meaning: ${JSON.stringify(code)}`, () => {
    const parsed = parseForFormat(code + '\n');
    const r = formatJulia(code + '\n');
    assert.equal(r.whole, null);
    assert.equal(verify(parsed.tree, r.output), null, `output: ${r.output}`);
    assert.equal(formatJulia(r.output).output, r.output, 'idempotent');
  });
}
