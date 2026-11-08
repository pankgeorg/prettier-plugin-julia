# prettier-plugin-julia

A [Prettier](https://prettier.io) 3 plugin for Julia, built on Julia's own parser:
[JuliaSyntax](https://github.com/JuliaLang/JuliaSyntax.jl) as shipped with Julia 1.13,
compiled to WebAssembly (`wasm/parser.wasm`, 735 KB, no Julia needed at run time).

**Every format is checked.** The output is parsed again and compared with the input; code
whose formatting would change what the program means is kept exactly as written, and
reported. The plugin never writes a program that parses differently from yours.

```julia
# before
function f(x::Int,y=2;k=3) where T
  z = x+y   # trailing
  if z>3 return z end
  [i^2 for i = 1:n if isodd(i)]
end

# after
function f(x::Int, y=2; k=3) where T
    z = x + y   # trailing
    if z > 3
        return z
    end
    [i^2 for i in 1:n if isodd(i)]
end
```

## Install

Not on npm yet; install from git (the parser artifact is committed):

```sh
npm install --save-dev prettier github:pankgeorg/prettier-plugin-julia
```

`.prettierrc`:

```json
{ "plugins": ["prettier-plugin-julia"] }
```

```sh
npx prettier --write "**/*.jl"
npx prettier --check "**/*.jl"
```

Requires Node 22.23.3+ (22.x) or 24.22.1+ (Wasm GC and exception handling) and Prettier 3.

Markdown files get their ```` ```julia ```` blocks formatted too, with no extra setup. Editor,
lint-staged and pre-commit setup: [ECOSYSTEM.md](ECOSYSTEM.md).

## Style

4-space indent, 92 columns (the plugin's defaults; set `tabWidth`/`printWidth` to change them),
close to Runic and JuliaFormatter: spaces around binary operators except `:` and `^`,
`f(x; k=1)` keyword arguments, one element per line with a trailing comma when a list
doesn't fit, `module` bodies not indented, at most one blank line in a row, `for i = …`
written `for i in …`. Strings, string macros, comments and multi-line matrices are kept as
written. `# prettier-ignore` and `#! format: off`/`#! format: on` are honoured. Details:
[STYLE.md](STYLE.md).

## Safety

After printing, the plugin parses the output with JuliaSyntax and compares both trees in a
strict normal form:
- whitespace and comments are ignored; leaf text must match exactly;
- node kinds and flags must match: infix vs prefix call, `@m(x)` vs `@m x`, `mutable`,
  triple-quoted strings;
- comments must all survive, in order.

The only freedoms are layout ones: `a; b` on one line vs two, a trailing comma in a
multi-line list.

If the trees differ, the smallest differing node is printed exactly as written, and the file
is printed again (up to 30 rounds, then the whole file is left as it is). Each such region is
reported:

```
[prettier-plugin-julia] warn: src/a.jl:12:5: kept `[x -y]` as written (formatting would change its meaning: …)
```

Input that JuliaSyntax rejects is reported as a syntax error, with its position, and left
alone. A printer crash also leaves the file as it is.

The printer is written so that this rarely triggers: it only breaks lines where Julia reads a
line break as whitespace or continuation (never inside a matrix row or between macro
arguments), keeps `- 2`, `[x -y]`, `"""doc""" f` and the like as written, and prints
anything it has no rule for token by token. On the 25,174-file corpus below, no region
needed protecting; the tests inject printer bugs to show that they're caught.

## Results

Real-world corpus: 25,174 unique Julia files (229 MB) from Julia 1.11/1.13 base, stdlib and
tests, and the packages of several Julia depots, deduplicated by content. Arm64 server, Node 22, 4 worker threads.

| | |
|---|---|
| Formatted and verified | 25,163 (3,267 already formatted) |
| Rejected by JuliaSyntax (not valid Julia 1.13) | 11 |
| Regions kept as written / whole files kept / crashes | 0 / 0 / 0 |
| Not idempotent (formatting twice ≠ once) | 0 |
| Time | 2.1 s/MB per worker, verification included; median 4 ms per file |
| CLI latency, small file | 0.22 s (`node …/prettier.cjs`), 0.6 s through `npx` |

Same sample of 300 files with [Runic](https://github.com/fredrikekre/Runic.jl) 1.13 and
[JuliaFormatter](https://github.com/domluna/JuliaFormatter.jl) 2.14 (defaults), checked with
the same JuliaSyntax normal form:

| | this plugin | Runic | JuliaFormatter |
|---|---|---|---|
| Files left unchanged | 31 | 88 | 38 |
| Output parses to the same tree | 300 | 146 | 233 |
| Time, 4.4 MB, warm | 6.7 s (1.5 s/MB, incl. verification) | 3.9 s | 1.6 s |
| Start-up + tiny file | 0.22 s | 0.27 s | 0.52 s |

Runic and JuliaFormatter change trees on purpose: Runic adds explicit `return`s, braces in
`where {T}`, parentheses around range operands and normalizes float literals; JuliaFormatter
adds `where` braces, parentheses and `::Any`. These are meant to be equivalent; this plugin
only changes layout, so its output can be checked mechanically.

## Development

```sh
npm test                                   # parser artifact check + snapshot, safety and Prettier tests
node scripts/fmt.mjs file.jl               # format, show protected regions (--raw: no verification)
node scripts/dump.mjs 'x = [a -b]'         # JuliaSyntax's tree with trivia
node scripts/corpus.mjs LIST out.jsonl     # verified formatting + idempotence over a file list
node scripts/corpus-summary.mjs out.jsonl  # summary
```

- `src/index.js`: the plugin (languages, parser, printer, options).
- `src/format.js`: print → verify → protect loop.
- `src/printer.js`: the Prettier doc printer.
- `src/verify.js`: the JuliaSyntax normal form and tree comparison.
- `src/tree.js`: the full tree, with trivia, from the parser layer.
- `src/parser/`, `wasm/`: vendored from
  [eslint-plugin-julia](https://github.com/pankgeorg/eslint-plugin-julia) (see
  `src/parser/VENDORED.md`). `wasm/manifest.json` records the artifact's provenance;
  `scripts/parser/` has its build inputs.

## License

MIT. `wasm/parser.wasm` contains code from Julia and JuliaSyntax (MIT) and WasmCodegen.jl
(MIT); see `wasm/LICENSES/`.
