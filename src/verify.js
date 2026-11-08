// The safety net: input and output are parsed by JuliaSyntax and compared in a strict
// normal form, ported from topiary-julia's verifier (src/jlparse.rs, `sem_tree`).
//
// Dropped: trivia (whitespace, comments, punctuation and keywords implied by the node kind;
// error tokens are kept) and TOMBSTONEs. Kept: node kinds, leaf text (exact), and all flags
// except TRIVIA (bit 0), NON_TERMINAL (bit 7), TOPLEVEL_SEMICOLONS on `toplevel` (`a; b` may
// become two lines) and the trailing-comma flag (bit 9) on call-like list kinds (`f(a, b,)` ≡
// `f(a, b)` as an Expr), and on tuples of more than one element. On a one-element `tuple` the
// flag is compared: `((x, y),) -> …` takes one argument, `((x, y)) -> …` two.
// Operator and identifier leaves compare by text alone (JuliaSyntax lexes `<:` as either).
// Comments must survive in order (compared with trailing whitespace trimmed).
import { parseTree, CLASS, hasErrors, isErrorDiagnostic } from './tree.js';

const LIST_KINDS = new Set(['call', 'dotcall', 'curly', 'ref', 'vect', 'braces', 'parameters', 'macrocall']);

function semFlags(kind, flags) {
  let f = flags & ~(1 | (1 << 7));
  if (kind === 'toplevel') f &= ~(1 << 8);
  if (LIST_KINDS.has(kind)) f &= ~(1 << 9);
  return f;
}

/** Normal form: arrays of { k, f, t?, c?, n } (n = the original node, for spans). */
export function semTree(root) {
  const out = [];
  for (const c of root.children) push(c, '', out);
  return out;
}

function push(n, parent, out) {
  if (n.text !== undefined) {
    const err = n.cls & CLASS.ERROR;
    if ((!err && (n.cls & (CLASS.TRIVIA | CLASS.WHITESPACE))) || n.kind === 'TOMBSTONE') return;
    const k = n.cls & (CLASS.OPERATOR | CLASS.IDENTIFIER) ? '#id' : n.kind;
    out.push({ k, f: semFlags(n.kind, n.flags), t: n.text, n });
    return;
  }
  if (n.kind === 'toplevel' && parent === 'toplevel') {
    for (const c of n.children) push(c, parent, out);
    return;
  }
  const c = [];
  for (const ch of n.children) push(ch, n.kind, c);
  let f = semFlags(n.kind, n.flags);
  // A tuple's trailing comma only matters with one element: `((x, y),) -> …` takes one
  // argument, `((x, y)) -> …` two; `(a, b,)` ≡ `(a, b)` and `(; a=1,)` ≡ `(; a=1)`.
  if (n.kind === 'tuple' && !(c.length === 1 && c[0].k !== 'parameters')) f &= ~(1 << 9);
  out.push({ k: n.kind, f, c, n });
}

const show = s => s.t !== undefined ? `${s.k === '#id' ? s.n.kind : s.k} ${JSON.stringify(s.t)}`
  : `(${s.k}${s.c.map(x => ' ' + show(x)).join('')})`;
const brief = s => { const t = show(s); return t.length > 120 ? t.slice(0, 117) + '...' : t; };

function same(x, y) {
  if (x.k !== y.k || x.f !== y.f || x.t !== y.t) return false;
  if (x.c === undefined) return y.c === undefined;
  if (y.c === undefined || x.c.length !== y.c.length) return false;
  for (let i = 0; i < x.c.length; i++) if (!same(x.c[i], y.c[i])) return false;
  return true;
}

/** First difference: { message, node } with `node` the innermost differing input node. */
export function firstDifference(a, b, parentNode = null) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x && !y) return { message: `missing after formatting: ${brief(x)}`, node: x.n };
    if (!x && y) return { message: `added by formatting: ${brief(y)}`, node: parentNode };
    if (!same(x, y)) {
      if (x.k === y.k && x.f === y.f && x.c && y.c) return firstDifference(x.c, y.c, x.n);
      return { message: `${brief(x)} became ${brief(y)}`, node: x.n };
    }
  }
  return null;
}

export function commentsOf(root) {
  const out = [];
  const walk = n => {
    if (n.text !== undefined) { if (n.kind === 'Comment') out.push({ text: n.text.trimEnd(), n }); }
    else for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Check that `output` means the same as the already-parsed input.
 * Returns null when equivalent, else { message, node } (node: input node to protect, may be null).
 */
export function verify(input, output) {
  const b = parseTree(output);
  if (hasErrors(b)) {
    const d = b.diagnostics.find(isErrorDiagnostic);
    // Locate it in the input through the first difference of the (error-recovered) trees.
    const diff = firstDifference(semTree(input.root), semTree(b.root), null);
    return { message: `output does not parse: ${d.message} (output ${d.loc.line}:${d.loc.column + 1})`, node: diff?.node ?? null };
  }
  const d = firstDifference(semTree(input.root), semTree(b.root), null);
  if (d) return d;
  const ca = commentsOf(input.root), cb = commentsOf(b.root);
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    if (ca[i]?.text !== cb[i]?.text) {
      return { message: `comment ${i + 1}: ${JSON.stringify(ca[i]?.text ?? '(none)')} became ${JSON.stringify(cb[i]?.text ?? '(none)')}`,
        node: ca[i]?.n ?? null };
    }
  }
  return null;
}
