// Debug: format a file (or -e code) and show regions; --raw prints the unverified output.
import { readFileSync } from 'node:fs';
import { formatJulia } from '../src/format.js';
const args = process.argv.slice(2);
const raw = args.includes('--raw');
const rest = args.filter((a) => a !== '--raw');
const text = rest[0] === '-e' ? rest[1] : readFileSync(rest[0], 'utf8');
const r = formatJulia(text, { juliaVerify: !raw });
process.stdout.write(r.output);
if (!raw)
  console.error(
    JSON.stringify(
      { whole: r.whole, rounds: r.rounds, regions: r.regions.map((x) => [x.line, x.column, x.reason]) },
      null,
      1,
    ),
  );
