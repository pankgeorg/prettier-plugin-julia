// Reproducers from an adversarial review (all fixed). Julia's evaluation of the lambda pair,
// for the record: `(((x,)) -> x)((1,))` is `(1,)`, `(((x,),) -> x)((1,))` is `1`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJulia, parseForFormat } from '../src/format.js';
import { verify } from '../src/verify.js';

const check = (a, b) => verify(parseForFormat(a).tree, b);

test('review: a comma in lambda parameters is part of the meaning', () => {
  assert.notEqual(check('(((x,)) -> x)((1,))', '(((x,),) -> x)((1,))'), null);
  assert.notEqual(check('((x, y)) -> x', '((x, y),) -> x'), null);
  assert.equal(check('f(a, b,)', 'f(a, b)'), null, 'call commas stay free');
});

test('review: breaking a lambda parameter list keeps its arity', () => {
  const name = 'a'.repeat(88);
  const input = `${name} = ((x,y)) -> x+y\n${name}(1,2)\n`;
  const r = formatJulia(input);
  assert.equal(r.whole, null);
  assert.deepEqual(r.regions, []);
  assert.equal(check(input, r.output), null);
  assert.ok(!/\),\n\) ->/.test(r.output), r.output);
  const narrow = formatJulia('f=((x,y))->x+y\nf(1,2)\n', { printWidth: 5 });
  assert.equal(check('f=((x,y))->x+y\nf(1,2)\n', narrow.output), null);
  assert.deepEqual(narrow.regions, []);
});

for (const [label, input] of [
  ['comment before a dotted power operator', 'a #=c=# .^ b'],
  ['comment before keyword semicolon', 'f(#=c=#; k=1)'],
  ['own-line comment before keyword semicolon', 'f(a\n# c\n; b=1)'],
  ['comment in a named tuple before semicolon', '(#=c=#;a=1,b=2)'],
  ['spaced unary minus before broadcast power', '- 2 .^ 2'],
  ['spaced unary minus before a typed literal', '- 2 :: Int'],
]) {
  test(`review: formats ${label} without protection`, () => {
    const r = formatJulia(input);
    assert.equal(r.whole, null);
    assert.deepEqual(r.regions, []);
    assert.equal(formatJulia(r.output).output, r.output, 'idempotent');
  });
}

test('review: a comment beside the keyword semicolon is idempotent', () => {
  const a = formatJulia('f(a # c\n; b=1)').output;
  assert.equal(formatJulia(a).output, a);
});

test('review: a spaced unary call keeps one space', () => {
  assert.equal(formatJulia('- (x)').output, '- (x)\n');
});
