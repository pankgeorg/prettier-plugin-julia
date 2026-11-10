# prettier-plugin-julia

[![CI](https://github.com/pankgeorg/prettier-plugin-julia/actions/workflows/ci.yml/badge.svg)](https://github.com/pankgeorg/prettier-plugin-julia/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/pankgeorg/prettier-plugin-julia)](https://github.com/pankgeorg/prettier-plugin-julia/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Prettier](https://prettier.io) 3 plugin that formats Julia code. It parses with Julia's
own parser, [JuliaSyntax](https://github.com/JuliaLang/JuliaSyntax.jl) as shipped with Julia
1.13, compiled to WebAssembly: no Julia installation needed, and the plugin reads code
exactly as Julia does.

**Every format is checked.** The output is parsed again and compared with the input. Code
whose formatting would change what the program means is kept exactly as written, and
reported. The plugin never writes a program that parses differently from yours.

<!-- prettier-ignore -->
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

Node `^22.23.3` or `^24.22.1`, and Prettier 3. Not on npm yet: install from the GitHub
release.

```sh
npm install --save-dev prettier https://github.com/pankgeorg/prettier-plugin-julia/releases/download/v0.1.0/prettier-plugin-julia-0.1.0.tgz
# or from the git tag:
npm install --save-dev prettier github:pankgeorg/prettier-plugin-julia#v0.1.0
```

## Usage

`.prettierrc`:

```json
{ "plugins": ["prettier-plugin-julia"] }
```

```sh
npx prettier --write "**/*.jl"   # format
npx prettier --check "**/*.jl"   # exit code 1 if a file would change (for CI)
```

Markdown files get their ` ```julia ` blocks formatted too (`npx prettier --write "**/*.md"`).

[docs/usage.md](docs/usage.md) has the rest:

- a Julia project without Node (a three-file setup);
- a copy-paste GitHub Actions workflow that fails with a diff;
- lint-staged, pre-commit and VS Code settings;
- the Prettier API.

## Style

4-space indent, 92 columns, close to Runic and JuliaFormatter:

- spaces around binary operators except `:`, `^` and `::`;
- `f(x; k=1)`: keyword arguments and defaults without spaces;
- a list that doesn't fit goes one element per line, with a trailing comma;
- `module` bodies are not indented;
- at most one blank line in a row;
- `for i = …` is written `for i in …`.

Strings, string macros, comments and multi-line matrices are kept as written. Details:
[docs/style.md](docs/style.md).

| Option        | Default | Meaning                                                                    |
| ------------- | ------- | -------------------------------------------------------------------------- |
| `printWidth`  | `92`    | Line width.                                                                |
| `tabWidth`    | `4`     | Spaces per indentation level (`useTabs` for tabs).                         |
| `juliaVerify` | `true`  | Check every format and keep code as written where it would change meaning. |
| `juliaReport` | `true`  | Warn on stderr for each region kept as written.                            |

To leave code alone: `# prettier-ignore` before a statement, `#! format: off` …
`#! format: on` around a region, or `.prettierignore` for whole files.

## Safety

After printing, the plugin parses the output with JuliaSyntax and compares both trees in a
strict normal form:

- whitespace and comments are ignored; leaf text must match exactly;
- node kinds and flags must match: infix vs prefix call, `@m(x)` vs `@m x`, `mutable`,
  triple-quoted strings;
- comments must all survive, in order.

The only freedoms are layout ones: `a; b` on one line vs two, a trailing comma in a
multi-line list (not in a one-element tuple, where it changes the meaning).

If the trees differ, the smallest differing node is printed exactly as written and the file
is printed again (up to 30 rounds; after that, the whole file is left as it is). Each such
region is reported:

```
[prettier-plugin-julia] warn: src/a.jl:12:5: kept `[x -y]` as written (formatting would change its meaning: …)
```

Input that JuliaSyntax rejects is reported as a syntax error, with its position, and left
alone. A printer crash also leaves the file as it is.

What "same meaning" does not cover, as for any formatter that moves code between lines:

- source locations: `@__LINE__`, stack traces, and macros that read `__source__` see new
  line numbers;
- statement grouping by `;` at top level: `a; b` on one line is a single `toplevel`
  expression, two lines are two. Only code that loads files with
  `include(mapexpr, …)`/`include_string(mapexpr, …)` can tell the difference.

The printer is written so that the check rarely fires:

- it only breaks lines where Julia reads a line break as whitespace or continuation, never
  inside a matrix row or between macro arguments;
- it keeps `- 2`, `[x -y]`, `"""doc""" f` and the like as written;
- it prints anything it has no rule for token by token.

On the corpus below no region needed protecting; the tests inject printer bugs to show that
they are caught.

## Results and comparison

Corpus: 25,174 unique Julia files (229 MB) from Julia 1.11/1.13 base, stdlib and tests, and
the packages of several Julia depots, deduplicated by content. Arm64 Linux, Node 22.

|                                                      |                                  |
| ---------------------------------------------------- | -------------------------------- |
| Formatted and verified                               | 25,163 (3,267 already formatted) |
| Rejected by JuliaSyntax (not valid Julia 1.13)       | 11                               |
| Regions kept as written / whole files kept / crashes | 0 / 0 / 0                        |
| Not idempotent (formatting twice ≠ once)             | 0                                |

The same 300-file sample through [Runic](https://github.com/fredrikekre/Runic.jl) 1.13 and
[JuliaFormatter](https://github.com/domluna/JuliaFormatter.jl) 2.14 (default settings),
checked with the same JuliaSyntax normal form:

|                                 | this plugin | Runic  | JuliaFormatter |
| ------------------------------- | ----------- | ------ | -------------- |
| Files left unchanged            | 31          | 88     | 38             |
| Output parses to the same tree  | 300         | 146    | 233            |
| Time, 4.4 MB, warm, one process | 5.7 s       | 3.9 s  | 1.6 s          |
| Time per MB                     | 1.3 s       | 0.88 s | 0.35 s         |
| Start-up + a tiny file          | 0.22 s      | 0.27 s | 0.52 s         |

Runic and JuliaFormatter change trees on purpose: Runic adds explicit `return`s, braces in
`where {T}`, parentheses around range operands, and normalizes float literals;
JuliaFormatter adds `where` braces, parentheses and `::Any`. These rewrites are meant to be
equivalent. This plugin only changes layout, so its output can be checked mechanically.

**Speed, honestly:** once warm, the plugin is about 1.5× slower than Runic and 3.7× slower
than JuliaFormatter. With `juliaVerify: false` it matches Runic (0.9 s/MB) and is 2.5×
slower than JuliaFormatter. Start-up is shorter than both, so on a few small files it is
as quick as either. Where the time goes (`node scripts/bench.mjs`, s/MB):

| Stage                                        |     s/MB |   % |
| -------------------------------------------- | -------: | --: |
| JuliaSyntax parse (Wasm)                     |     0.15 |  11 |
| Copying source in and the tree out of Wasm   |     0.09 |   7 |
| Tree building                                |     0.14 |  10 |
| Doc building (this printer)                  |     0.24 |  18 |
| Line fitting (Prettier's `printDocToString`) |     0.27 |  21 |
| Verification: parsing the output             |     0.24 |  19 |
| Verification: tree building and comparison   |     0.17 |  13 |
| **Total**                                    | **1.31** |     |

The parser itself is under a fifth of the time. The same parser built with WasmCodegen main
`10cff8e` (2026-11-10) parses at the same speed and gives identical trees.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md): `npm test`, `npm run lint`, `npm run format:check`,
the corpus scripts, and where `wasm/parser.wasm` comes from.

## License

MIT. `wasm/parser.wasm` contains code from Julia and JuliaSyntax (MIT) and WasmCodegen.jl
(MIT); see `wasm/LICENSES/`. The parser layer is shared with
[eslint-plugin-julia](https://github.com/pankgeorg/eslint-plugin-julia).
