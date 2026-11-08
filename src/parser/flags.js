// These meanings are pinned to the manifest's JuliaSyntax grammar. Never interpret
// overloaded bits 8/9 without checking the kind.
export const isInfixCall = n => ['call', 'dotcall'].includes(n.kind) && n.interior && (n.flags & 24) === 8;
export const isPrefixCall = n => n.kind === 'call' && n.interior && (n.flags & 24) === 0;
export const isPrefixOperatorCall = n => n.kind === 'call' && n.interior && (n.flags & 24) === 16;
export const isMutableStruct = n => n.kind === 'struct' && n.interior && Boolean(n.flags & 256);
export const isTripleString = n => ['string', 'cmdstring'].includes(n.kind) && n.interior && Boolean(n.flags & 256);
export const isShortFunction = n => n.kind === 'function' && n.interior && Boolean(n.flags & 256);
export const hasTrailingComma = n => ['tuple', 'call', 'dotcall', 'curly', 'ref', 'vect', 'braces', 'parameters'].includes(n.kind) && n.interior && Boolean(n.flags & 512);
export const semanticChildren = n => n.children;
export const getOperatorToken = n => isInfixCall(n) ? n.children[1] : isPrefixOperatorCall(n) ? n.children[0] : undefined;
export function isInsideMacro(n, source) {
  for (let p = n; p; p = source.getParent(p)) if (p.kind === 'macrocall') return true;
  return false;
}
export function isQuoted(n, source) {
  for (let p = n; p; p = source.getParent(p)) if (['quote', 'inert'].includes(p.kind)) return true;
  return false;
}
