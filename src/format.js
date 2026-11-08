// Format with verification: print, parse the output, compare; protect the differing node
// (print it verbatim) and try again; after MAX_ROUNDS, keep the whole file as written.
import { printer as docPrinter } from 'prettier/doc';
import { parseTree, hasErrors, isErrorDiagnostic } from './tree.js';
import { normalizeTree, parentsOf, printJulia } from './printer.js';
import { verify } from './verify.js';

const MAX_ROUNDS = 30;
const STATEMENT_LISTS = new Set(['block', 'toplevel', 'toplevel-file']);

export class JuliaSyntaxError extends SyntaxError {
  constructor(d) {
    super(d.message);
    this.loc = { start: { line: d.loc.line, column: d.loc.column + 1 } };
  }
}

/** Parse for formatting: throws JuliaSyntaxError on a syntax error. */
export function parseForFormat(text) {
  const tree = parseTree(text);
  if (hasErrors(tree)) throw new JuliaSyntaxError(tree.diagnostics.find(isErrorDiagnostic));
  normalizeTree(tree.root);
  return { tree, text };
}

export function render(doc, options) {
  return docPrinter.printDocToString(doc, {
    printWidth: options.printWidth ?? 92,
    tabWidth: options.tabWidth ?? 4,
    useTabs: options.useTabs ?? false,
    endOfLine: 'lf',
  }).formatted;
}

/**
 * @returns {{ output: string, regions: Array<{line, column, excerpt, reason}>, whole: string|null, rounds: number }}
 *   `whole` is the reason when the whole file was kept as written.
 */
export function formatParsed(parsed, options = {}, hooks = {}) {
  const { tree, text } = parsed;
  let parentMap = null;
  const parents = { get: n => (parentMap ??= parentsOf(tree.root)).get(n) };
  const protect = new Set();
  const reasons = new Map();
  const doVerify = options.juliaVerify !== false;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let output;
    try {
      output = render(printJulia(tree, text, protect, hooks.mutate ?? null), options);
    } catch (e) {
      // A printer bug must not lose the file: keep it as written and say why.
      return { output: text, regions: [], whole: `printer error: ${e?.message ?? e}`, rounds: round, error: e };
    }
    if (!doVerify) return { output, regions: [], whole: null, rounds: round };
    const d = verify(tree, output);
    if (!d) return { output, regions: regionsOf(protect, reasons, tree), whole: null, rounds: round };
    let target = d.node;
    if (target && target.text !== undefined) target = parents.get(target) ?? null;
    while (target && (protect.has(target) || STATEMENT_LISTS.has(target.kind))) target = parents.get(target) ?? null;
    if (!target || target === tree.root) return { output: text, regions: [], whole: d.message, rounds: round };
    protect.add(target);
    reasons.set(target, d.message);
  }
  return { output: text, regions: [], whole: `no verified formatting after ${MAX_ROUNDS} rounds`, rounds: MAX_ROUNDS };
}

function regionsOf(protect, reasons, tree) {
  // Report only outermost protected nodes.
  const all = [...protect];
  const inside = (a, b) => a !== b && b.start <= a.start && a.end <= b.end;
  return all.filter(n => !all.some(m => inside(n, m))).map(n => {
    const { line, column } = tree.loc(n.start);
    return { line, column: column + 1, start: n.start, end: n.end, reason: reasons.get(n) };
  }).sort((a, b) => a.start - b.start);
}

export function formatJulia(text, options = {}, hooks = {}) {
  return formatParsed(parseForFormat(text), options, hooks);
}
