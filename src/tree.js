// The full JuliaSyntax green tree, with trivia (keywords, punctuation, whitespace and
// comments) kept, as the printer needs it. Built on the vendored parser layer
// (src/parser/: Wasm host, green-tree placement, byte -> UTF-16 offsets), unmodified.
import { readWasm } from './parser/wasm-host.js';
import { placeGreen } from './parser/green-tree.js';
import { positions } from './parser/positions.js';

export const CLASS = { INTERIOR: 1, TRIVIA: 2, ERROR: 4, KEYWORD: 8, OPERATOR: 16, LITERAL: 32, IDENTIFIER: 64, WHITESPACE: 128 };

/**
 * Parse Julia source into a tree of nodes:
 *   { kind, flags, cls, start, end, children, text? }
 * `start`/`end` are UTF-16 offsets into `text`; leaves carry their source `text`.
 * TOMBSTONE leaves of width zero are dropped; everything else (whitespace, newlines,
 * comments, keywords, punctuation) stays, in source order.
 */
export function parseTree(text) {
  const parsed = readWasm(text);
  const { nodes: raw, roots } = placeGreen(parsed.raw, parsed.bytes);
  const off = positions(text, parsed.bytes);
  const nodes = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    const start = off.at(o.start), end = off.at(o.end);
    const n = { kind: o.kind, flags: o.flags, cls: o.class, start, end, children: [] };
    if (!o.interior) n.text = text.slice(start, end);
    else for (const c of o.children) if (keep(nodes[c])) n.children.push(nodes[c]);
    nodes[i] = n;
  }
  const root = { kind: 'toplevel-file', flags: 0, cls: CLASS.INTERIOR, start: 0, end: text.length,
    children: roots.map(i => nodes[i]).filter(keep) };
  const diagnostics = parsed.diagnostics.map(d => ({
    message: d.message, level: d.level, start: off.at(d.first - 1), end: Math.max(off.at(d.first - 1), off.at(d.last)),
    loc: off.loc(off.at(d.first - 1)),
  }));
  return { root, diagnostics, loc: off.loc };
}

function keep(n) {
  return !(n.text !== undefined && n.start === n.end && n.kind === 'TOMBSTONE');
}

export const isLeaf = n => n.text !== undefined;
export const isTrivia = n => Boolean(n.cls & CLASS.TRIVIA);
export const isWhitespace = n => Boolean(n.cls & CLASS.WHITESPACE);
export const isError = n => Boolean(n.cls & CLASS.ERROR);
export const isComment = n => n.kind === 'Comment';
export const isErrorDiagnostic = d => d.level === 1;
export const hasErrors = ({ diagnostics }) => diagnostics.some(isErrorDiagnostic);
