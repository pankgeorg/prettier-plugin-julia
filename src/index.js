// prettier-plugin-julia: Prettier 3 plugin entry point.
import { parseForFormat, formatParsed } from './format.js';
import { manifest } from './parser/wasm-host.js';

export const languages = [
  {
    name: 'Julia',
    parsers: ['julia'],
    extensions: ['.jl'],
    aliases: ['julia', 'jl'],
    linguistLanguageId: 184,
    tmScope: 'source.julia',
    aceMode: 'julia',
    vscodeLanguageIds: ['julia'],
  },
];

export const parsers = {
  julia: {
    astFormat: 'julia-ast',
    parse(text) {
      const parsed = parseForFormat(text);
      return { type: 'JuliaFile', parsed, start: 0, end: text.length };
    },
    locStart: node => node.start ?? 0,
    locEnd: node => node.end ?? 0,
  },
};

const prefix = '[prettier-plugin-julia]';

function report(filepath, result, text) {
  const name = filepath ?? '<input>';
  if (result.whole) {
    console.warn(`${prefix} warn: ${name}: kept the whole file as written (formatting would change its meaning: ${result.whole})`);
  }
  for (const r of result.regions) {
    const first = text.slice(r.start, r.end).split('\n')[0];
    const excerpt = first.length > 40 ? first.slice(0, 40) + '…' : first;
    console.warn(`${prefix} warn: ${name}:${r.line}:${r.column}: kept \`${excerpt}\` as written (formatting would change its meaning: ${r.reason})`);
  }
}

export const printers = {
  'julia-ast': {
    print(path, options) {
      const node = path.node;
      if (node.type !== 'JuliaFile') return '';
      const result = formatParsed(node.parsed, options);
      if (options.juliaReport !== false) report(options.filepath, result, node.parsed.text);
      return result.output;
    },
    getVisitorKeys: () => [],
  },
};

export const options = {
  juliaVerify: {
    category: 'Julia',
    type: 'boolean',
    default: true,
    description: 'Check every format with JuliaSyntax and keep code whose meaning would change as written (disable only to debug the printer).',
  },
  juliaReport: {
    category: 'Julia',
    type: 'boolean',
    default: true,
    description: 'Print a warning for each region kept as written by the safety check.',
  },
};

export const defaultOptions = {
  tabWidth: 4,
  printWidth: 92,
};

export const juliaSyntax = { julia: manifest.versions.julia, sha256: manifest.sha256 };

export default { languages, parsers, printers, options, defaultOptions };
