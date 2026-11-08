# Contributing

## Setup

Node `^22.23.3` or `^24.22.1`. No Julia needed for development, except to rebuild the parser
or to compare with other formatters.

```sh
git clone https://github.com/pankgeorg/prettier-plugin-julia
cd prettier-plugin-julia
npm ci
npm test               # parser artifact check, snapshot, safety, review and Prettier tests
npm run lint           # ESLint on the repository's JavaScript
npm run format:check   # Prettier on the repository's JS, JSON, Markdown and YAML
npm run format         # fix formatting
```

CI runs the same commands on Linux, macOS and Windows with Node 22 and 24, plus a packaging
test (`npm pack`, then `node scripts/smoke.mjs prettier-plugin-julia-0.1.0.tgz` installs the
tarball into a scratch project and runs the CLI).

The formatting commit is listed in `.git-blame-ignore-revs`; run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` to skip it in `git blame`.

## Layout

- `src/index.js`: the plugin (languages, parser, printer, options).
- `src/format.js`: print → verify → protect loop.
- `src/printer.js`: the Prettier doc printer, one function per syntax kind.
- `src/verify.js`: the JuliaSyntax normal form and the tree comparison.
- `src/tree.js`: the full tree, with trivia, from the parser layer.
- `src/parser/`, `wasm/`, `scripts/parser/`: vendored, see below.
- `tests/format/*.jl` and `*.out.jl`: input and expected output per construct.
- `tests/safety.test.js`: injects printer bugs and checks that verification catches them.
- `docs/style.md`: the style rules; `docs/usage.md`: the user guide.

## Changing the printer

1. Add a case to `tests/format/` (or a test to `tests/format.test.js`) showing the input and
   the output you want.
2. Change `src/printer.js`. `node scripts/fmt.mjs file.jl` formats a file and lists any
   region the safety check kept as written; `--raw` skips verification to see the printer's
   own output. `node scripts/dump.mjs 'x = [a -b]'` prints JuliaSyntax's tree with trivia.
3. Run the corpus check on as many real Julia files as you have:

   ```sh
   find ~/.julia/packages -name '*.jl' > files.txt
   node scripts/corpus.mjs files.txt out.jsonl     # verified formatting + idempotence
   node scripts/corpus-summary.mjs out.jsonl
   ```

   A change should keep "regions kept as written", "whole files kept", crashes and
   idempotence failures at zero.

The rule the printer follows: only break lines where Julia reads a line break as whitespace
or continuation, and print anything without a dedicated rule token by token. The safety
check is the backstop, not the plan.

`node scripts/bench.mjs files.txt` times each stage (parse, tree, doc building, line
fitting, verification) in s/MB.

## The parser artifact

`wasm/parser.wasm` is JuliaSyntax, as shipped with Julia 1.13.2, compiled to WebAssembly by
[WasmCodegen.jl](https://github.com/pankgeorg/WasmCodegen.jl) (commit `316bbaf`, `wasm-opt
-O3`). It has no imports. `wasm/manifest.json` records its hash, size, versions and exported
ABI; `npm test` checks the artifact against it first.

The artifact and the JavaScript that reads it (`src/parser/*.js`) are copied unmodified from
[eslint-plugin-julia](https://github.com/pankgeorg/eslint-plugin-julia) (see
`src/parser/VENDORED.md` for the commit), so both plugins parse Julia the same way.
`scripts/parser/` holds the build inputs and `build-parser.md` explains how to rebuild (its
script paths are eslint-plugin-julia's). To
update: rebuild or take the new artifact from eslint-plugin-julia, copy the files, then run
`node scripts/check-vendored.mjs PATH/TO/eslint-plugin-julia`, `npm test` and a corpus run.
Do not run a compiler during `npm install`.

## Pull requests

Keep changes focused, with a test. Update `CHANGELOG.md` under "Unreleased".
