// Print JuliaSyntax's full green tree (with trivia) for each argument or stdin.
import { readFileSync } from 'node:fs';
import { parseTree } from '../src/tree.js';
const inputs = process.argv.length > 2 ? process.argv.slice(2) : [readFileSync(0, 'utf8')];
for (const text of inputs) {
  const { root, diagnostics } = parseTree(text);
  const show = (n, d) => {
    const pad = '  '.repeat(d);
    const f = n.flags ? ` f=${n.flags.toString(16)}` : '', c = ` c=${n.cls}`;
    if (n.text !== undefined) console.log(`${pad}${n.kind}${f}${c} ${JSON.stringify(n.text)}`);
    else { console.log(`${pad}(${n.kind}${f}${c}`); for (const k of n.children) show(k, d + 1); }
  };
  show(root, 0);
  if (diagnostics.length) console.log(diagnostics);
}
