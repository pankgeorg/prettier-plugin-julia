// The full JuliaSyntax green tree, with trivia (keywords, punctuation, whitespace and
// comments) kept, as the printer needs it. Built on the vendored parser layer
// (src/parser/: Wasm host, green-tree placement, byte -> UTF-16 offsets), unmodified.
import { readWasm } from './parser/wasm-host.js';
import { placeGreen } from './parser/green-tree.js';

export const CLASS = {
  INTERIOR: 1,
  TRIVIA: 2,
  ERROR: 4,
  KEYWORD: 8,
  OPERATOR: 16,
  LITERAL: 32,
  IDENTIFIER: 64,
  WHITESPACE: 128,
};

/**
 * Parse Julia source into a tree of nodes:
 *   { kind, flags, cls, start, end, children, text? }
 * `start`/`end` are UTF-16 offsets into `text`; leaves carry their source `text`.
 * TOMBSTONE leaves of width zero are dropped; everything else (whitespace, newlines,
 * comments, keywords, punctuation) stays, in source order.
 */
// The Wasm reader; replaceable for benchmarks and candidate parser builds (setReader).
let read = readWasm;
export function setReader(fn) {
  read = fn ?? readWasm;
}

export function parseTree(text) {
  const parsed = read(text);
  const { nodes: raw, roots } = placeGreen(parsed.raw, parsed.bytes);
  // Pure ASCII (most Julia files): byte offsets are UTF-16 offsets; skip the offset table.
  const off = parsed.bytes === text.length ? asciiPositions(text) : utf8Positions(text, parsed.bytes);
  const nodes = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    const start = off.at(o.start),
      end = off.at(o.end);
    const n = { kind: o.kind, flags: o.flags, cls: o.class, start, end, children: [] };
    if (!o.interior) n.text = text.slice(start, end);
    else for (const c of o.children) if (keep(nodes[c])) n.children.push(nodes[c]);
    nodes[i] = n;
  }
  const root = {
    kind: 'toplevel-file',
    flags: 0,
    cls: CLASS.INTERIOR,
    start: 0,
    end: text.length,
    children: roots.map((i) => nodes[i]).filter(keep),
  };
  const diagnostics = parsed.diagnostics.map((d) => ({
    message: d.message,
    level: d.level,
    start: off.at(d.first - 1),
    end: Math.max(off.at(d.first - 1), off.at(d.last)),
    loc: off.loc(off.at(d.first - 1)),
  }));
  return { root, diagnostics, loc: off.loc };
}

/** Same mapping as the vendored `positions` (byte offset -> UTF-16 index), in one charCodeAt pass. */
export function utf8Positions(text, byteLength) {
  const map = new Uint32Array(byteLength + 1);
  let b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      map[b++] = i;
      continue;
    }
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      map[b] = map[b + 1] = map[b + 2] = map[b + 3] = i;
      b += 4;
      i++;
      continue;
    }
    const w = c < 0x800 ? 2 : 3;
    for (let k = 0; k < w; k++) map[b + k] = i;
    b += w;
  }
  map[b] = text.length;
  const { loc } = asciiPositions(text);
  return { at: (x) => map[Math.max(0, Math.min(byteLength, x))], loc };
}

function asciiPositions(text) {
  let starts = null;
  const loc = (index) => {
    if (!starts) {
      starts = [0];
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    let lo = 0,
      hi = starts.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid;
    }
    return { line: lo + 1, column: index - starts[lo] };
  };
  return { at: (b) => b, loc };
}

function keep(n) {
  return !(n.text !== undefined && n.start === n.end && n.kind === 'TOMBSTONE');
}

export const isLeaf = (n) => n.text !== undefined;
export const isTrivia = (n) => Boolean(n.cls & CLASS.TRIVIA);
export const isWhitespace = (n) => Boolean(n.cls & CLASS.WHITESPACE);
export const isError = (n) => Boolean(n.cls & CLASS.ERROR);
export const isComment = (n) => n.kind === 'Comment';
export const isErrorDiagnostic = (d) => d.level === 1;
export const hasErrors = ({ diagnostics }) => diagnostics.some(isErrorDiagnostic);
