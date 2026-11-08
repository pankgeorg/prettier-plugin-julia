// The Prettier doc printer for the full JuliaSyntax tree (src/tree.js).
//
// The printer walks the tree itself with a small context and returns one Prettier doc.
// Every kind without a dedicated printer goes through `printTokens`: all tokens in order,
// whitespace between them normalized (runs of spaces -> one space or none as written, line
// breaks kept, continuation lines re-indented). Nodes the verifier protected, `# prettier-ignore`
// statements and `#! format: off` regions are printed verbatim.
//
// Line breaks are only introduced where Julia reads them as whitespace or continuation:
// after `(`/`[`/`{` and commas inside brackets, after binary and assignment operators
// outside space-sensitive contexts (matrix rows, macro arguments), and between statements.
import { builders } from 'prettier/doc';
import { utils as docUtils } from 'prettier/doc';
import { CLASS } from './tree.js';

const { group, indent, dedent, line, softline, hardline, join, ifBreak, lineSuffix, breakParent,
  indentIfBreak, hardlineWithoutBreakParent, literallineWithoutBreakParent } = builders;

// ─── Tree helpers ──────────────────────────────────────────────────────

const isLeaf = n => n.text !== undefined;
const isWs = n => isLeaf(n) && (n.kind === 'Whitespace' || n.kind === 'NewlineWs');
const isComment = n => isLeaf(n) && n.kind === 'Comment';
const isTriviaLeaf = n => isLeaf(n) && Boolean(n.cls & CLASS.TRIVIA) && !(n.cls & CLASS.ERROR);
const isLineComment = n => isComment(n) && !n.text.startsWith('#=');
const tok = (n, text) => isLeaf(n) && isTriviaLeaf(n) && n.text === text;
const STATEMENT_LISTS = new Set(['block', 'toplevel', 'toplevel-file']);
const VERBATIM_KINDS = new Set(['string', 'cmdstring', 'char', 'Char']);
const flag = (n, bit) => Boolean(n.flags & bit);
const isInfixCall = n => (n.kind === 'call' || n.kind === 'dotcall') && (n.flags & 24) === 8;
const isPrefixOpCall = n => (n.kind === 'call' || n.kind === 'dotcall') && (n.flags & 24) === 16;
const isPostfixOpCall = n => (n.kind === 'call' || n.kind === 'dotcall') && (n.flags & 24) === 24;
const isNumber = n => isLeaf(n) && ['Integer', 'Float', 'Float32', 'BinInt', 'HexInt', 'OctInt'].includes(n.kind);

/**
 * Move leading/trailing whitespace and comments out of interior nodes into their parent
 * (except out of statement lists and verbatim kinds), so trivia sits between siblings.
 * Also records parents (for escalating protected regions).
 */
export function normalizeTree(root) {
  const parents = new Map();
  const visit = n => {
    if (isLeaf(n)) return;
    for (const c of n.children) { parents.set(c, n); visit(c); }
    if (VERBATIM_KINDS.has(n.kind) || isStringMacro(n)) return;
    const out = [];
    for (const c of n.children) {
      if (isLeaf(c) || STATEMENT_LISTS.has(c.kind) || VERBATIM_KINDS.has(c.kind) || isStringMacro(c)) { out.push(c); continue; }
      let i = 0, j = c.children.length;
      while (i < j && (isWs(c.children[i]) || isComment(c.children[i]))) i++;
      while (j > i && (isWs(c.children[j - 1]) || isComment(c.children[j - 1]))) j--;
      if (i === j) { out.push(c); continue; }
      const lead = c.children.slice(0, i), trail = c.children.slice(j);
      if (lead.length || trail.length) {
        c.children = c.children.slice(i, j);
        c.start = c.children[0].start; c.end = c.children.at(-1).end;
        for (const t of lead.concat(trail)) parents.set(t, n);
      }
      out.push(...lead, c, ...trail);
    }
    n.children = out;
  };
  visit(root);
  return parents;
}

function isStringMacro(n) {
  return !isLeaf(n) && n.kind === 'macrocall' && n.children.length > 0 && isLeaf(n.children[0])
    && (n.children[0].kind === 'StrMacroName' || n.children[0].kind === 'CmdMacroName');
}

// ─── Entry point ───────────────────────────────────────────────────────

/**
 * @param tree   { root } from parseTree, already normalized
 * @param text   the source
 * @param protect Set of nodes to print verbatim
 */
export function printJulia(tree, text, protect = new Set()) {
  const ctx = { text, protect, flat: false, compact: false, parent: null };
  const { doc, empty } = printStatements(tree.root.children, ctx, { top: true });
  return empty ? '' : [doc, hardline];
}

const sub = (ctx, patch) => ({ ...ctx, ...patch });

function print(n, ctx, parent = null) {
  const c = parent === ctx.parent ? ctx : sub(ctx, { parent });
  if (ctx.protect.has(n)) return printVerbatim(n, ctx);
  if (isLeaf(n)) return printLeaf(n, ctx);
  const f = PRINTERS[n.kind];
  if (f) {
    const d = f(n, c);
    if (d !== null && d !== undefined) return d;
  }
  if (n.kind === 'call' || n.kind === 'dotcall') {
    const d = printCall(n, c);
    if (d) return d;
  }
  return printTokens(n, c);
}

function printLeaf(n, ctx) {
  if (isComment(n)) return printCommentInline(n, ctx);
  if (n.kind === 'for' || n.kind === 'in' || n.kind === 'where') return n.text;
  return n.text.includes('\n') ? literalText(n.text) : n.text;
}

function printCommentInline(n, ctx) {
  if (isLineComment(n)) return [lineSuffix(' ' + n.text.trimEnd()), breakParent];
  return n.text.includes('\n') ? literalText(n.text) : n.text;
}

const literalText = s => join(literallineWithoutBreakParent, s.split('\n'));

// ─── Verbatim ──────────────────────────────────────────────────────────

/** The original text of a node; re-indented by its first line's indentation when safe. */
function printVerbatim(n, ctx) {
  return verbatimSlice(ctx.text, n.start, n.end, n);
}

function lineStart(text, i) {
  const k = text.lastIndexOf('\n', i - 1);
  return k + 1;
}

function hasMultilineLeaf(n) {
  if (isLeaf(n)) return !isWs(n) && n.text.includes('\n');
  return n.children.some(hasMultilineLeaf);
}

function verbatimSlice(text, start, end, node) {
  const s = text.slice(start, end);
  if (!s.includes('\n')) return s;
  const lines = s.split('\n');
  const ls = lineStart(text, start);
  const indentStr = /^[ \t]*/.exec(text.slice(ls, start))[0];
  const literal = (node && hasMultilineLeaf(node)) || lines.slice(1).some(l => l.trim() !== '' && !l.startsWith(indentStr));
  if (literal) return literalText(s);
  return join(hardlineWithoutBreakParent, lines.map((l, i) => i === 0 ? l : l.trim() === '' ? '' : l.slice(indentStr.length)));
}

/** Triple-quoted strings: shift all continuation lines uniformly (the value is unchanged). */
function printString(n, ctx) {
  const s = ctx.text.slice(n.start, n.end);
  if (!s.includes('\n')) return s;
  const triple = flag(n, 0x100) || (isStringMacro(n) && n.children.some(c => !isLeaf(c) && flag(c, 0x100)));
  const lines = s.split('\n');
  if (!triple || lines.some(l => /[ \t]$/.test(l))) return literalText(s);
  const rest = lines.slice(1).filter(l => l.trim() !== '');
  let prefix = null;
  for (const l of rest) {
    const ws = /^[ \t]*/.exec(l)[0];
    if (prefix === null) prefix = ws;
    else { let k = 0; while (k < prefix.length && k < ws.length && prefix[k] === ws[k]) k++; prefix = prefix.slice(0, k); }
  }
  prefix ??= '';
  return join(hardlineWithoutBreakParent, lines.map((l, i) => i === 0 ? l : l.trim() === '' ? '' : l.slice(prefix.length)));
}

// ─── Statement lists ───────────────────────────────────────────────────

const countNl = s => { let k = 0; for (const ch of s) if (ch === '\n') k++; return k; };
const IGNORE_RE = /^#\s*prettier-ignore\s*$/;
const OFF_RE = /^#!\s*format\s*:\s*off\b/;
const ON_RE = /^#!\s*format\s*:\s*on\b/;

/**
 * Print a statement list (file, block body). Returns { doc, empty, headerComments }:
 * `headerComments` are comments on the line before the first statement (`if a # c`).
 */
function printStatements(children, ctx, { top = false, keepEdgeBlank = false } = {}) {
  const items = [];
  let nl = 0, semi = false, prev = null, prevEnd = null;
  const headerComments = [];
  let ignoreNext = false;
  const kids = flattenToplevel(children);
  for (let idx = 0; idx < kids.length; idx++) {
    const c = kids[idx];
    if (isWs(c)) { nl += countNl(c.text); continue; }
    if (isLeaf(c) && tok(c, ';')) { semi = true; continue; }
    if (isComment(c)) {
      if (prev === null && nl === 0 && !top) { headerComments.push({ c, gap: gapBefore(ctx.text, c) }); prevEnd = c.end; continue; }
      if (prev !== null && nl === 0 && prev.type === 'stmt') {
        prev.trailing.push({ c, gap: gapBefore(ctx.text, c) });
        prevEnd = c.end;
        continue;
      }
      if (OFF_RE.test(c.text)) {
        // Verbatim region up to the matching `#! format: on` (or the end of the list).
        let j = idx + 1, endPos = c.end;
        for (; j < kids.length; j++) {
          const k = kids[j];
          if (!isWs(k)) endPos = k.end;
          if (isComment(k) && ON_RE.test(k.text)) break;
        }
        const node = { type: 'raw', doc: literalText(ctx.text.slice(c.start, endPos)), blank: nl >= 2, trailing: [] };
        items.push(node);
        prev = node; nl = 0; semi = false; idx = j;
        continue;
      }
      const item = { type: 'comment', c, blank: nl >= 2, trailing: [] };
      items.push(item);
      if (IGNORE_RE.test(c.text)) ignoreNext = true;
      prev = item; nl = 0; semi = false;
      continue;
    }
    const item = { type: 'stmt', n: c, blank: nl >= 2, sameLine: prev !== null && nl === 0 && semi && prev.type === 'stmt',
      trailing: [], ignore: ignoreNext };
    ignoreNext = false;
    items.push(item);
    prev = item; nl = 0; semi = false;
  }
  if (!items.length) return { doc: '', empty: true, headerComments, trailingBlank: false };
  const parts = [];
  items.forEach((it, i) => {
    if (i > 0) parts.push(it.sameLine ? '; ' : it.blank ? [hardline, hardline] : hardline);
    else if (it.blank && keepEdgeBlank) parts.push(hardline);
    if (it.type === 'comment') parts.push(printOwnLineComment(it.c, ctx));
    else if (it.type === 'raw') parts.push(it.doc);
    else parts.push(it.ignore ? printVerbatim(it.n, ctx) : print(it.n, sub(ctx, { flat: false, compact: false }), null));
    for (const t of it.trailing) parts.push(trailingComment(t));
  });
  return { doc: parts, empty: false, headerComments, trailingBlank: nl >= 2 };
}

function flattenToplevel(children) {
  // A file is (toplevel-file (toplevel ...)); its statements are the inner toplevel's children.
  if (children.length === 1 && !isLeaf(children[0]) && children[0].kind === 'toplevel') return children[0].children;
  const out = [];
  for (const c of children) {
    if (!isLeaf(c) && c.kind === 'toplevel' && !flag(c, 0x100)) out.push(...c.children);
    else out.push(c);
  }
  return out;
}

function gapBefore(text, c) {
  const ls = lineStart(text, c.start);
  const m = /[ \t]*$/.exec(text.slice(ls, c.start))[0];
  return m.length ? m : ' ';
}

function trailingComment({ c, gap }) {
  if (isLineComment(c)) return [lineSuffix(gap + c.text.trimEnd()), breakParent];
  return [' ', c.text.includes('\n') ? literalText(c.text) : c.text];
}

function printOwnLineComment(c, ctx) {
  const t = c.text.trimEnd();
  return t.includes('\n') ? literalText(t) : t;
}

/**
 * A block body: [indent([hardline, statements]), hardline] or a single line break.
 * `header` is printed before it; `endKw` after.
 */
function blockBody(block, ctx, { endKw = 'end', keepEdgeBlank = false, noIndent = false, skipKw = [] } = {}) {
  let kids = block ? block.children : [];
  if (skipKw.length) kids = kids.filter(k => !(isLeaf(k) && isTriviaLeaf(k) && skipKw.includes(k.text)));
  const r = printStatements(kids, ctx, { keepEdgeBlank });
  const head = r.headerComments.map(trailingComment);
  if (r.empty) return [head, endKw === null ? '' : [hardline, endKw]];
  const body = [hardline, r.doc];
  const tail = keepEdgeBlank && r.trailingBlank ? [hardline] : [];
  return [head, noIndent ? body : indent(body), tail, endKw === null ? '' : [hardline, endKw]];
}

// ─── Token printer (generic) ───────────────────────────────────────────

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}', 'end']);

/** All tokens in order; whitespace normalized; line breaks kept; continuation indented. */
function printTokens(n, ctx) {
  const first = [], rest = [];
  let ws = null, prev = null, started = false, out = first;
  for (const c of n.children) {
    if (isWs(c)) { ws = (ws ?? '') + c.text; continue; }
    if (started) {
      const nls = ws ? countNl(ws) : 0;
      if (nls > 0 && !(prev && isLineComment(prev) && false)) {
        out = rest;
        const brk = nls >= 2 ? [hardline, hardline] : hardline;
        if (isLeaf(c) && CLOSERS.has(c.text) && isTriviaLeaf(c)) out.push(dedent([brk, printTokLeaf(c, ctx)]));
        else out.push(brk, printChild(c, n, ctx));
        prev = c; ws = null; continue;
      }
      out.push(spaceBetween(prev, c, ws, n, ctx));
    } else if (prev === null && isLeaf(c) && isLineComment(c)) {
      // a leading comment can't be first on a line it doesn't own; keep it as is
    }
    out.push(isLeaf(c) && isComment(c) && isLineComment(c) ? c.text.trimEnd() : printChild(c, n, ctx));
    prev = c; ws = null; started = true;
  }
  return rest.length ? [first, indent(rest)] : first;
}

function printTokLeaf(c, ctx) { return printLeaf(c, ctx); }

function printChild(c, parent, ctx) {
  if (isLeaf(c)) return ctx.protect.has(c) ? printVerbatim(c, ctx) : printLeaf(c, ctx);
  const opensBracket = parent.children.some(k => isLeaf(k) && isTriviaLeaf(k) && OPENERS.has(k.text));
  return print(c, opensBracket && !isMatrixKind(parent.kind) ? sub(ctx, { flat: false }) : ctx, parent);
}

function spaceBetween(prev, c, ws, parent, ctx) {
  const pt = isLeaf(prev) ? prev.text : null, ct = isLeaf(c) ? c.text : null;
  if (ct === ',' || ct === ';') return '';
  if (pt === ',' ) return ' ';
  if (pt === ';') return ws ? ' ' : '';
  if (pt !== null && OPENERS.has(pt) && isTriviaLeaf(prev)) return '';
  if (ct !== null && CLOSERS.has(ct) && ct !== 'end' && isTriviaLeaf(c)) return '';
  return ws ? ' ' : '';
}

const isMatrixKind = k => ['hcat', 'vcat', 'ncat', 'typed_hcat', 'typed_vcat', 'typed_ncat', 'row', 'nrow'].includes(k);

// ─── Helpers for dedicated printers ────────────────────────────────────

/** Non-whitespace children; comments are returned separately in order with their index. */
function parts(n) {
  const xs = [], comments = [];
  for (const c of n.children) {
    if (isWs(c)) continue;
    if (isComment(c)) { comments.push({ c, at: xs.length }); continue; }
    xs.push(c);
  }
  return { xs, comments };
}

/** Comments that end up at index `at` (before xs[at]) as line suffixes. */
const commentsAt = (comments, at) => comments.filter(k => k.at === at).map(k => printCommentInline(k.c));

const kw = (n, text) => isLeaf(n) && isTriviaLeaf(n) && n.text === text;

const ln = ctx => ctx.flat ? ' ' : line;
const sln = ctx => ctx.flat ? '' : softline;

// ─── Blocks and keyword constructs ─────────────────────────────────────

const PRINTERS = {
  'toplevel': (n, ctx) => {
    const r = printStatements(n.children, ctx);
    return r.empty ? '' : r.doc;
  },
  'block': printBlockNode,
  'function': printFunction,
  'macro': printFunction,
  'if': printIf,
  'while': (n, ctx) => printKeywordBlock(n, ctx, 'while'),
  'for': printFor,
  'let': printLet,
  'try': printTry,
  'struct': printStruct,
  'module': printModule,
  'baremodule': printModule,
  'do': printDo,
  'doc': printDoc,
  'string': printString,
  'cmdstring': printString,
  'macrocall': printMacrocall,
  'tuple': printTuple,
  'vect': (n, ctx) => printBracketList(n, ctx, '[', ']'),
  'braces': (n, ctx) => printBracketList(n, ctx, '{', '}'),
  'curly': printCalleeList,
  'ref': printCalleeList,
  'parens': printParens,
  '=': printAssignment,
  'op=': printAssignment,
  '.op=': printAssignment,
  '.=': printAssignment,
  ':=': printAssignment,
  '&&': printChain,
  '||': printChain,
  '->': (n, ctx) => printSpacedBinary(n, ctx, '->'),
  'where': printWhere,
  '?': printTernary,
  '::': printTight,
  '.': printTight,
  '...': printTight,
  '<:': printSubtype,
  '>:': printSubtype,
  'in': printIn,
  'const': printKeywordPrefix,
  'global': printKeywordPrefix,
  'local': printKeywordPrefix,
  'return': printKeywordPrefix,
  'hcat': printMatrix,
  'vcat': printMatrix,
  'ncat': printMatrix,
  'typed_hcat': printMatrix,
  'typed_vcat': printMatrix,
  'typed_ncat': printMatrix,
};

/** `begin … end`, `quote … end`; a bare block (e.g. `(a; b)`) goes to the token printer. */
function printBlockNode(n, ctx) {
  const { xs } = parts(n);
  const firstTok = xs[0], lastTok = xs.at(-1);
  if (!firstTok || !(kw(firstTok, 'begin') || kw(firstTok, 'quote')) || !kw(lastTok, 'end')) return null;
  const inner = n.children.slice(n.children.indexOf(firstTok) + 1, n.children.lastIndexOf(lastTok));
  const r = printStatements(inner, ctx);
  const head = r.headerComments.map(trailingComment);
  if (r.empty) return [firstTok.text, head, hasNewline(ctx.text, firstTok.end, lastTok.start) ? hardline : ' ', 'end'];
  return [firstTok.text, head, indent([hardline, r.doc]), hardline, 'end'];
}

const hasNewline = (text, a, b) => text.slice(a, b).includes('\n');

/** Generic "kw header… block end" printer: header parts joined with single spaces. */
function printKeywordBlock(n, ctx, word) {
  const { xs, comments } = parts(n);
  if (!kw(xs[0], word) || !kw(xs.at(-1), 'end')) return null;
  const block = xs.at(-2);
  if (!block || block.kind !== 'block') return null;
  const header = xs.slice(1, -2);
  const h = [word];
  header.forEach((x, i) => { h.push(' ', print(x, ctx, n), commentsAt(comments, i + 2)); });
  return [commentsAt(comments, 1), h, blockBody(block, ctx)];
}

function printFunction(n, ctx) {
  const { xs, comments } = parts(n);
  const word = n.kind;
  if (flag(n, 0x100)) {
    // short form: sig = body
    const eq = xs.findIndex(x => kw(x, '='));
    if (eq !== 1 || xs.length !== 3 || comments.length) return null;
    return assignmentLayout(print(xs[0], ctx, n), '=', xs[2], ctx, n);
  }
  if (!kw(xs[0], word) || !kw(xs.at(-1), 'end')) return null;
  if (xs.length === 3) return [word, ' ', print(xs[1], ctx, n), ' end', commentsAt(comments, 2)]; // `function f end`
  const block = xs.at(-2);
  if (block.kind !== 'block' || xs.length !== 4) return null;
  if (comments.some(k => k.at !== 3 && k.at !== 2)) return null;
  return [word, ' ', print(xs[1], ctx, n), comments.map(k => printCommentInline(k.c)), blockBody(block, ctx)];
}

function printIf(n, ctx) {
  const out = [];
  let cur = n, first = true;
  for (;;) {
    const { xs, comments } = parts(cur);
    if (comments.some(k => k.at !== 2 && k.at !== 3)) return null;
    const word = first ? 'if' : 'elseif';
    if (!kw(xs[0], word)) return null;
    const cond = xs[1], block = xs[2];
    if (!block || block.kind !== 'block') return null;
    out.push(word, ' ', print(cond, ctx, cur), comments.map(k => printCommentInline(k.c)), blockBody(block, ctx, { endKw: null }));
    let i = 3;
    const next = xs[i];
    if (next && !isLeaf(next) && next.kind === 'elseif') { out.push(hardline); cur = next; first = false; continue; }
    if (next && kw(next, 'else')) {
      const eb = xs[i + 1];
      if (!eb || eb.kind !== 'block') return null;
      out.push(hardline, 'else', blockBody(eb, ctx, { endKw: null }));
      i += 2;
    }
    if (first) {
      if (!kw(xs[i], 'end') || xs.length !== i + 1) return null;
    } else if (xs.length !== i) return null;
    break;
  }
  return [out, hardline, 'end'];
}

function printFor(n, ctx) {
  const { xs, comments } = parts(n);
  if (!kw(xs[0], 'for') || !kw(xs.at(-1), 'end') || xs.length !== 4 || xs[2].kind !== 'block') return null;
  if (comments.some(k => k.at !== 2 && k.at !== 3)) return null;
  return ['for ', print(xs[1], ctx, n), comments.map(k => printCommentInline(k.c)), blockBody(xs[2], ctx)];
}

/** `i in x`, `i = x`, `i ∈ x` in iterations; `=` becomes `in` (Runic does the same). */
function printIn(n, ctx) {
  const { xs, comments } = parts(n);
  if (xs.length !== 3 || comments.length) return null;
  const op = xs[1].text === '=' ? 'in' : xs[1].text;
  return [print(xs[0], ctx, n), ' ', op, ' ', print(xs[2], ctx, n)];
}

function printLet(n, ctx) {
  const { xs, comments } = parts(n);
  if (!kw(xs[0], 'let') || !kw(xs.at(-1), 'end') || xs.length !== 4 || comments.length) return null;
  const [_, binds, body] = xs;
  if (binds.kind !== 'block' || body.kind !== 'block') return null;
  const bp = parts(binds);
  if (bp.comments.length || binds.children.some(c => isWs(c) && c.text.includes('\n'))) return null;
  const items = bp.xs.filter(x => !kw(x, ','));
  if (bp.xs.some(x => isLeaf(x) && isTriviaLeaf(x) && x.text !== ',')) return null;
  const head = items.length ? ['let ', join(', ', items.map(x => print(x, ctx, binds)))] : 'let';
  return [head, blockBody(body, ctx)];
}

function printTry(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length || !kw(xs[0], 'try') || !kw(xs.at(-1), 'end') || xs[1]?.kind !== 'block') return null;
  const out = ['try', blockBody(xs[1], ctx, { endKw: null })];
  for (let i = 2; i < xs.length - 1; i++) {
    const x = xs[i];
    if (!isLeaf(x) && x.kind === 'catch') {
      const p = parts(x);
      if (p.comments.some(k => k.at !== 2 && k.at !== 3) || !kw(p.xs[0], 'catch') || p.xs.length !== 3 || p.xs[2].kind !== 'block') return null;
      const v = p.xs[1];
      const hasVar = !(isLeaf(v) && v.kind === 'Placeholder' && v.text === '');
      out.push(hardline, 'catch', hasVar ? [' ', print(v, ctx, x)] : '', p.comments.map(k => printCommentInline(k.c)), blockBody(p.xs[2], ctx, { endKw: null }));
    } else if (!isLeaf(x) && x.kind === 'finally') {
      const p = parts(x);
      if (p.comments.length || !kw(p.xs[0], 'finally') || p.xs.length !== 2) return null;
      out.push(hardline, 'finally', blockBody(p.xs[1], ctx, { endKw: null }));
    } else if (!isLeaf(x) && x.kind === 'else') {
      const p = parts(x);
      if (p.comments.length || !kw(p.xs[0], 'else') || p.xs.length !== 2) return null;
      out.push(hardline, 'else', blockBody(p.xs[1], ctx, { endKw: null }));
    } else if (kw(x, 'else') && xs[i + 1]?.kind === 'block') {
      out.push(hardline, 'else', blockBody(xs[i + 1], ctx, { endKw: null }));
      i++;
    } else return null;
  }
  return [out, hardline, 'end'];
}

function printStruct(n, ctx) {
  const { xs, comments } = parts(n);
  let i = 0;
  const head = [];
  if (kw(xs[i], 'mutable')) { head.push('mutable '); i++; }
  if (!kw(xs[i], 'struct')) return null;
  i++;
  if (xs.length !== i + 3 || xs[i + 1].kind !== 'block' || !kw(xs[i + 2], 'end')) return null;
  if (comments.some(k => k.at !== i + 1 && k.at !== i + 2)) return null;
  const block = xs[i + 1];
  head.push('struct ', print(xs[i], ctx, n), comments.map(k => printCommentInline(k.c)));
  const r = parts(block);
  if (!r.xs.length && !r.comments.length && !hasNewline(ctx.text, xs[i].end, xs[i + 2].start)) return [head, ' end'];
  return [head, blockBody(block, ctx)];
}

function printModule(n, ctx) {
  const { xs, comments } = parts(n);
  if (!kw(xs[0], n.kind) || !kw(xs.at(-1), 'end') || xs.length !== 4 || xs[2].kind !== 'block') return null;
  if (comments.some(k => k.at !== 2 && k.at !== 3)) return null;
  // Module bodies are not indented (Runic, BlueStyle); one blank line after the header and
  // before `end` is kept when written.
  return [n.kind, ' ', print(xs[1], ctx, n), comments.map(k => printCommentInline(k.c)),
    blockBody(xs[2], ctx, { keepEdgeBlank: true, noIndent: true })];
}

function printDo(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length || !kw(xs[0], 'do') || !kw(xs.at(-1), 'end')) return null;
  const block = xs.at(-2);
  if (!block || block.kind !== 'block') return null;
  const args = xs.slice(1, -2);
  if (args.length > 1) return null;
  const a = args.length && !(args[0].kind === 'tuple' && parts(args[0]).xs.length === 0) ? [' ', print(args[0], ctx, n)] : '';
  return ['do', a, blockBody(block, ctx)];
}

/** `"""doc""" f`: the docstring, then the documented expression on the next line (or same line as written). */
function printDoc(n, ctx) {
  const { xs, comments } = parts(n);
  if (xs.length !== 2 || comments.length) return null;
  const sameLine = !hasNewline(ctx.text, xs[0].end, xs[1].start);
  return [print(xs[0], ctx, n), sameLine ? ' ' : hardline, print(xs[1], ctx, n)];
}

function printKeywordPrefix(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length || !kw(xs[0], n.kind)) return null;
  if (xs.length === 1) return n.kind;
  if (xs.length !== 2) return null;
  return [n.kind, ' ', print(xs[1], ctx, n)];
}

// ─── Macros ────────────────────────────────────────────────────────────

function printMacrocall(n, ctx) {
  if (isStringMacro(n)) return printVerbatim(n, ctx);
  const { xs, comments } = parts(n);
  if (!xs.length) return null;
  const name = xs[0];
  if (flag(n, 0x100) || (xs[1] && kw(xs[1], '('))) {
    // `@m(a, b)` (with an optional do block)
    if (xs[1] && kw(xs[1], '(')) return printListAfter(n, ctx, 1, print(name, ctx, n));
    return null;
  }
  if (comments.length) return null;
  // `@m a b`: arguments separated by single spaces; no optional line breaks at this level.
  const flat = sub(ctx, { flat: true });
  const out = [print(name, ctx, n)];
  for (const a of xs.slice(1)) {
    if (isLeaf(a) && isTriviaLeaf(a)) return null;
    out.push(' ', print(a, flat, n));
  }
  return out;
}

// ─── Lists ─────────────────────────────────────────────────────────────

/**
 * Elements between an opening bracket at xs-index `openIdx` and its closer, with commas,
 * an optional `parameters` child (`; k=1`), comments and a trailing `do` block.
 */
function collectList(n, openIdx) {
  const kids = n.children;
  const openTok = parts(n).xs[openIdx];
  let i = kids.indexOf(openTok) + 1;
  const open = openTok.text, close = { '(': ')', '[': ']', '{': '}' }[open];
  const elems = [];
  let params = null, closeTok = null, pendingLead = [], lastSep = 'open', nlSince = false;
  for (; i < kids.length; i++) {
    const c = kids[i];
    if (isWs(c)) { if (c.text.includes('\n')) nlSince = true; continue; }
    if (isComment(c)) {
      const prevElem = elems.at(-1);
      if (!nlSince && prevElem && (lastSep === ',' || lastSep === 'elem')) prevElem.trailing.push(c);
      else if (params && !nlSince && params.elems.length) params.elems.at(-1).trailing.push(c);
      else pendingLead.push(c);
      continue;
    }
    nlSince = false;
    if (kw(c, close)) { closeTok = c; i++; break; }
    if (kw(c, ',')) { if (lastSep === ',' || lastSep === 'open') return null; lastSep = ','; continue; }
    if (!isLeaf(c) && c.kind === 'parameters') {
      if (params) return null;
      params = collectParams(c);
      if (!params) return null;
      if (pendingLead.length) params.lead = pendingLead.concat(params.lead), pendingLead = [];
      lastSep = 'params';
      continue;
    }
    if (isLeaf(c) && isTriviaLeaf(c)) return null;
    if (params || lastSep === 'elem') return null;
    elems.push({ n: c, lead: pendingLead, trailing: [] });
    pendingLead = []; lastSep = 'elem';
  }
  if (!closeTok) return null;
  const trailingComma = lastSep === ',';
  const after = kids.slice(i).filter(c => !isWs(c));
  return { elems, params, open, close, trailingComma, dangling: pendingLead, after };
}

function collectParams(p) {
  const kids = p.children;
  const elems = [];
  let lead = [], lastSep = null, nlSince = false, seenSemi = false;
  for (const c of kids) {
    if (isWs(c)) { if (c.text.includes('\n')) nlSince = true; continue; }
    if (isComment(c)) {
      if (!nlSince && elems.length) elems.at(-1).trailing.push(c); else lead.push(c);
      continue;
    }
    nlSince = false;
    if (kw(c, ';')) { if (seenSemi) return null; seenSemi = true; lastSep = ';'; continue; }
    if (kw(c, ',')) { lastSep = ','; continue; }
    if (isLeaf(c) && isTriviaLeaf(c)) return null;
    elems.push({ n: c, lead, trailing: [] }); lead = []; lastSep = 'elem';
  }
  if (!seenSemi) return null;
  if (lead.length) { if (!elems.length) return null; elems.at(-1).trailing.push(...lead); }
  return { elems, lead: [] };
}

function printElem(e, ctx, parent) {
  const lead = e.lead.map(c => [printOwnLineComment(c), hardline]);
  const trail = e.trailing.map(c => trailingComment({ c, gap: ' ' }));
  return { doc: [lead, print(e.n, ctx, parent)], trail };
}

/**
 * Print `open elems ; params close` after `prefix`, breaking one element per line with a
 * trailing comma when it doesn't fit.
 */
function printListBody(L, n, ctx, prefix, { forceComma = false, noTrailingComma = false } = {}) {
  const inner = sub(ctx, { flat: false, compact: false });
  const elems = L.elems.map(e => printElem(e, inner, n));
  const params = L.params ? L.params.elems.map(e => printElem(e, inner, n)) : null;
  const hasComments = L.elems.some(e => e.lead.length || e.trailing.length) || (L.params && L.params.elems.some(e => e.lead.length || e.trailing.length)) || L.dangling.length;
  const items = [];
  elems.forEach((e, i) => {
    const last = i === elems.length - 1;
    items.push([e.doc, last ? '' : ',', e.trail, last ? '' : line]);
  });
  const single = elems.length === 1 && !params;
  const lastIsGenerator = L.elems.length && ['generator', 'flatten'].includes(L.elems.at(-1).n.kind) && !params;
  let tail = '';
  if (forceComma && single) tail = ',';
  else if (!noTrailingComma && !lastIsGenerator && (elems.length || params?.length)) tail = ifBreak(',');
  const content = [];
  if (elems.length) content.push(items);
  if (params) {
    if (elems.length) content.push(';', line);
    else content.push(';', params.length ? line : '');
    params.forEach((e, i) => {
      const last = i === params.length - 1;
      content.push(e.doc, last ? '' : ',', e.trail, last ? '' : line);
    });
  }
  if (single && L.elems[0] && !L.elems[0].lead.length) {
    // the one element's own trailing comment goes after the (optional) comma
    const e = elems[0];
    content.length = 0;
    content.push(e.doc);
    const dangling = L.dangling.map(c => [hardline, printOwnLineComment(c)]);
    return [prefix, group([L.open, indent([softline, content, tail, e.trail, dangling]), softline, L.close]), printAfter(L, n, ctx)];
  }
  if (!elems.length && !params) {
    if (!L.dangling.length) return [prefix, L.open, L.close, printAfter(L, n, ctx)];
    return [prefix, L.open, indent(L.dangling.map(c => [hardline, printOwnLineComment(c)])), hardline, L.close, printAfter(L, n, ctx)];
  }
  // A last parameter's trailing comment comes after the trailing comma.
  const dangling = L.dangling.map(c => [hardline, printOwnLineComment(c)]);
  const doc = group([L.open, indent([softline, content, tail, dangling]), softline, L.close]);
  return [prefix, hasComments ? [breakParent, doc] : doc, printAfter(L, n, ctx)];
}

function printAfter(L, n, ctx) {
  if (!L.after.length) return '';
  if (L.after.length === 1 && L.after[0].kind === 'do') return [' ', print(L.after[0], ctx, n)];
  return null;
}

function printListAfter(n, ctx, openIdx, prefix, opts) {
  const L = collectList(n, openIdx);
  if (!L) return null;
  const d = printListBody(L, n, ctx, prefix, opts);
  if (d.at(-1) === null) return null;
  return d;
}

function printBracketList(n, ctx, open) {
  const { xs } = parts(n);
  if (!kw(xs[0], open)) return null;
  return printListAfter(n, ctx, 0, '');
}

function printCalleeList(n, ctx) {
  const { xs } = parts(n);
  if (xs.length < 3 || !(kw(xs[1], '{') || kw(xs[1], '['))) return null;
  if (hasWsBetween(n, xs[0], xs[1])) return null; // `A {T}`: keep as written
  return printListAfter(n, ctx, 1, print(xs[0], ctx, n));
}

function hasWsBetween(n, a, b) {
  const i = n.children.indexOf(a), j = n.children.indexOf(b);
  return n.children.slice(i + 1, j).some(c => isWs(c) || isComment(c));
}

function printTuple(n, ctx) {
  const { xs, comments } = parts(n);
  if (xs.length && kw(xs[0], '(')) return printListAfter(n, ctx, 0, '', { forceComma: true });
  // bare tuple `a, b` (assignment sides, `return a, b`, `for (a, b) in …` handled above)
  if (comments.length) return null;
  const items = [];
  for (const x of xs) {
    if (kw(x, ',')) continue;
    if (isLeaf(x) && isTriviaLeaf(x)) return null;
    items.push(print(x, ctx, n));
  }
  const trailing = xs.length && kw(xs.at(-1), ',');
  if (!items.length) return null;
  return [join(', ', items), trailing ? ',' : ''];
}

function printParens(n, ctx) {
  const { xs, comments } = parts(n);
  if (xs.length !== 3 || !kw(xs[0], '(') || !kw(xs[2], ')') || comments.length) return null;
  if (n.children.some(c => isWs(c) && c.text.includes('\n'))) return null;
  return ['(', print(xs[1], sub(ctx, { flat: false }), n), ')'];
}

// ─── Calls and operators ───────────────────────────────────────────────

// Infix operators printed without spaces (Runic: `:` `^`; `::` and `.` are node kinds).
const TIGHT_OPS = new Set([':', '^', '.^']);
const WORD_OPS = new Set(['in', 'isa', 'where']);
const OP_CHARS = /^[+\-*/\\^%<>=!~&|:$.'÷⊻∘√∛∜⋅×∈∉∋∌⊆⊇⊂⊃≤≥≠≡≢≈≉⊗⊕⊖⊙⊘→←↔⇒∪∩]/u;

function printCall(n, ctx) {
  const { xs, comments } = parts(n);
  if (isInfixCall(n)) return printInfix(n, xs, comments, ctx);
  if (isPrefixOpCall(n)) {
    if (comments.length) return null;
    let op = xs[0], i = 1, opText = op.text;
    if (n.kind === 'dotcall' && kw(xs[0], '.')) { opText = '.' + xs[1].text; i = 2; }
    if (xs.length !== i + 1 || !isLeaf(op)) return null;
    const operand = xs[i];
    const spaced = hasWsBetween(n, xs[i - 1], operand);
    // Keep `- 2` (a call; `-2` is a literal) and `- (x)` (≠ `-(x)`) as written.
    const keep = spaced && (isNumber(operand) || operand.kind === 'parens' || operand.kind === 'tuple' || OP_CHARS.test(ctx.text[operand.start]));
    return [opText, keep ? ' ' : '', print(operand, ctx, n)];
  }
  if (isPostfixOpCall(n)) return null;
  // f(args) / f.(args)
  if (xs.length < 3) return null;
  let open = 1, prefix;
  if (n.kind === 'dotcall') {
    if (!kw(xs[1], '.') || !kw(xs[2], '(')) return null;
    if (hasWsBetween(n, xs[0], xs[1]) || hasWsBetween(n, xs[1], xs[2])) return null;
    open = 2; prefix = [print(xs[0], ctx, n), '.'];
  } else {
    if (!kw(xs[1], '(')) return null;
    if (hasWsBetween(n, xs[0], xs[1])) return null;
    prefix = print(xs[0], ctx, n);
  }
  return printListAfter(n, ctx, open, prefix);
}

function printInfix(n, xs, comments, ctx) {
  // operand (op operand)+ ; in a dotcall the op is `.` followed by the operator
  const operands = [], ops = [];
  let i = 0;
  operands.push(xs[i++]);
  while (i < xs.length) {
    let op = xs[i];
    if (!isLeaf(op)) return null;
    let text = op.text;
    if (n.kind === 'dotcall' && kw(op, '.')) {
      if (!isLeaf(xs[i + 1])) return null;
      text = '.' + xs[i + 1].text; i++;
    }
    i++;
    if (i >= xs.length) return null;
    ops.push({ text, at: i });
    operands.push(xs[i++]);
  }
  if (!ops.length) return null;
  const opText = ops[0].text;
  if (ops.some(o => o.text !== opText && !(o.text === ':' && opText === ':'))) return null;
  const isRange = opText === ':';
  const tight = TIGHT_OPS.has(opText) || (ctx.compact && !WORD_OPS.has(opText) && !/^\p{L}/u.test(opText));
  const inner = isRange ? sub(ctx, { compact: true }) : ctx;
  const docs = operands.map(o => print(o, inner, n));
  // Comments inside an infix expression: keep each one at the end of its line.
  const cm = k => comments.filter(c => c.at === k).map(c => printCommentInline(c.c));
  if (tight) {
    const out = [docs[0]];
    ops.forEach((o, k) => {
      const l = operands[k], r = operands[k + 1];
      const needSpace = OP_CHARS.test(ctx.text[r.start]) || /[+\-*/\\^%<>=!~&|:.]$/u.test(ctx.text.slice(l.start, l.end))
        || (opText === ':' && (ctx.text[r.start] === ':' || ctx.text[l.end - 1] === ':'));
      const sp = needSpace ? ' ' : '';
      out.push(cm(o.at - 1), sp, o.text, sp, docs[k + 1], cm(o.at + 1));
    });
    return out;
  }
  // spaced, breakable after the operator
  const rest = ops.map((o, k) => [' ', o.text, cm(o.at - 1), ln(ctx), docs[k + 1], cm(o.at + 1)]);
  if (ctx.flat) return [docs[0], rest];
  return group([docs[0], indent(rest)]);
}

/** `a && b && c`, `a || b`: like spaced infix, flattening same-operator chains. */
function printChain(n, ctx) {
  const op = n.kind;
  const operands = [];
  const collect = m => {
    const { xs, comments } = parts(m);
    if (comments.length || xs.length !== 3 || !kw(xs[1], op)) return false;
    for (const x of [xs[0], xs[2]]) {
      if (!isLeaf(x) && x.kind === op && !ctx.protect.has(x)) { if (!collect(x)) return false; }
      else operands.push({ x, parent: m });
    }
    return true;
  };
  if (!collect(n)) return null;
  const docs = operands.map(o => print(o.x, ctx, o.parent));
  const rest = docs.slice(1).map(d => [' ', op, ln(ctx), d]);
  if (ctx.flat) return [docs[0], rest];
  return group([docs[0], indent(rest)]);
}

function printSpacedBinary(n, ctx, op) {
  const { xs, comments } = parts(n);
  if (xs.length !== 3 || comments.length || !kw(xs[1], op)) return null;
  return [print(xs[0], ctx, n), ' ', op, ' ', print(xs[2], ctx, n)];
}

function printWhere(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length || xs.length < 3 || !kw(xs[1], 'where')) return null;
  const rest = xs.slice(2);
  if (rest.length !== 1) return null;
  return [print(xs[0], ctx, n), ' where ', print(rest[0], ctx, n)];
}

function printTernary(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length || xs.length !== 5 || !kw(xs[1], '?') || !kw(xs[3], ':')) return null;
  const [c, , a, , b] = xs;
  const d = [print(c, ctx, n), ' ?', ln(ctx), print(a, ctx, n), ' :', ln(ctx), print(b, ctx, n)];
  return ctx.flat ? d : group(indent(d));
}

/** `x::T`, `a.b`, `x...`: no spaces (as Runic). */
function printTight(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length) return null;
  const out = [];
  for (const x of xs) out.push(isLeaf(x) && isTriviaLeaf(x) ? x.text : print(x, ctx, n));
  // keep a space where removing it would glue tokens (`a. b` is unusual; `x :: T` is fine)
  return out;
}

function printSubtype(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length) return null;
  if (xs.length === 2) return [xs[0].text, print(xs[1], ctx, n)]; // `<:T`
  if (xs.length !== 3) return null;
  const inBraces = ctx.parent && (ctx.parent.kind === 'curly' || ctx.parent.kind === 'braces');
  const sp = inBraces ? '' : ' ';
  return [print(xs[0], ctx, n), sp, xs[1].text, sp, print(xs[2], ctx, n)];
}

const KWARG_PARENTS = new Set(['call', 'dotcall', 'parameters', 'tuple', 'macrocall', 'curly', 'ref', 'vect', 'braces']);

function printAssignment(n, ctx) {
  const { xs, comments } = parts(n);
  if (comments.length) return null;
  // lhs, op tokens…, rhs
  const lhs = xs[0], rhs = xs.at(-1);
  if (xs.length < 3) return null;
  const opToks = xs.slice(1, -1);
  if (opToks.some(t => !isLeaf(t))) return null;
  const op = opToks.map(t => t.text).join('');
  const lhsDoc = print(lhs, ctx, n);
  if (op === '=' && ctx.parent && KWARG_PARENTS.has(ctx.parent.kind) && !(ctx.parent.kind === 'macrocall' && !flag(ctx.parent, 0x100) && !hasParen(ctx.parent))) {
    return [lhsDoc, '=', print(rhs, ctx, n)];
  }
  return assignmentLayout(lhsDoc, op, rhs, ctx, n);
}

const hasParen = m => parts(m).xs.some(x => kw(x, '('));

const BLOCKISH = new Set(['function', 'if', 'for', 'while', 'let', 'try', 'struct', 'module', 'macro', 'block', 'quote', 'do', 'string', 'cmdstring', 'vcat', 'hcat', 'ncat', 'typed_vcat', 'typed_hcat', 'typed_ncat', 'comprehension', 'typed_comprehension', 'generator']);

function assignmentLayout(lhsDoc, op, rhs, ctx, parent) {
  const rhsDoc = print(rhs, ctx, parent);
  if (ctx.flat || BLOCKISH.has(rhs.kind) || isStringMacro(rhs) || (rhs.kind === 'macrocall') || docUtils.willBreak(rhsDoc)
    || (rhs.kind === 'call' && !isInfixCall(rhs) && !isPrefixOpCall(rhs))) {
    return [lhsDoc, ' ', op, ' ', rhsDoc];
  }
  const id = Symbol('assign');
  return group([lhsDoc, ' ', op, group(indent(line), { id }), indentIfBreak(rhsDoc, { groupId: id })]);
}

// ─── Matrices ──────────────────────────────────────────────────────────

/** Single-line matrix literals: elements separated by one space. Multi-line ones verbatim. */
function printMatrix(n, ctx) {
  if (hasNewline(ctx.text, n.start, n.end)) return printVerbatim(n, ctx);
  const flat = sub(ctx, { flat: true });
  const out = [];
  let semi = false;
  const walk = m => {
    let ws = false, first = true;
    for (const c of m.children) {
      if (isWs(c)) { ws = true; continue; }
      if (isComment(c)) return false;
      if (!isLeaf(c) && (c.kind === 'row' || c.kind === 'nrow')) {
        if (!first && (ws || semi)) out.push(' ');
        semi = false;
        if (walk(c) === false) return false;
        ws = false; first = false; continue;
      }
      if (isLeaf(c) && isTriviaLeaf(c)) {
        if (/^;+$/.test(c.text)) { out.push(c.text); ws = false; first = false; semi = true; continue; }
        if (!first && (ws || semi) && !CLOSERS.has(c.text)) out.push(' ');
        out.push(c.text); ws = false; semi = false; first = OPENERS.has(c.text); continue;
      }
      if (!first && (ws || semi)) out.push(' ');
      out.push(print(c, flat, m));
      ws = false; first = false; semi = false;
    }
    return true;
  };
  if (walk(n) === false) return printVerbatim(n, ctx);
  return out;
}
