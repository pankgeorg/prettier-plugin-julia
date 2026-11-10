# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-10

### Changed

- `wasm/parser.wasm` rebuilt on [WasmCodegen.jl](https://github.com/gbaraldi/WasmCodegen.jl)
  main `98cad1f` (v0.1.0: `316bbaf`), with WasmBuilder.jl 0.1.1 and `wasm-opt -O3`
  (Binaryen 130). JuliaSyntax is unchanged: the one shipped in Julia 1.13.2 (also the one in
  1.13.3). The parser output is identical to v0.1.0's on 25,174 real-world Julia files, and
  parsing speed is the same within noise (0.156 → 0.159 s/MB). The module is 739,251 bytes
  (was 735,576). `wasm/manifest.json` also records the WasmBuilder and Binaryen versions.
  It is the same file as in eslint-plugin-julia v0.2.0. The build was first checked on
  WasmCodegen main in #2; this release ships it.

### Fixed

- The source links in `wasm/manifest.json` point at topiary-julia's `jlparse` branch, where
  the parser sources are (the links to `main` were broken).

## [0.1.0] - 2026-11-08

First release, distributed as a GitHub release tarball (not on npm yet).

### Added

- Prettier 3 plugin for Julia (`.jl`): language registration, the `julia` parser, and a
  printer built on JuliaSyntax (from Julia 1.13.2) compiled to WebAssembly. No Julia
  installation needed.
- Style close to Runic and JuliaFormatter: 4-space indent, 92 columns, spaces around binary
  operators except `:` and `^`, `f(x; k=1)` keyword arguments, one element per line with a
  trailing comma when a list doesn't fit, unindented `module` bodies, `for i in`.
- Safety check: every output is parsed again and compared with the input in a strict
  normal form; code whose meaning would change is kept as written and reported. Options
  `juliaVerify` and `juliaReport`.
- `# prettier-ignore` and `#! format: off` / `#! format: on`.
- ` ```julia ` / ` ```jl ` blocks in Markdown, formatted with 4-space indent
  and 92 columns.
- Usage guide for the CLI, GitHub Actions, lint-staged, pre-commit and VS Code
  ([docs/usage.md](docs/usage.md)).

Tested on 25,174 real-world Julia files: all valid files formatted and verified, no region
kept as written, formatting is idempotent.

[Unreleased]: https://github.com/pankgeorg/prettier-plugin-julia/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pankgeorg/prettier-plugin-julia/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/pankgeorg/prettier-plugin-julia/releases/tag/v0.1.0
