# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/pankgeorg/prettier-plugin-julia/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pankgeorg/prettier-plugin-julia/releases/tag/v0.1.0
