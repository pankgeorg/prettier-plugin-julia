# Ecosystem

What works with prettier-plugin-julia, what needs a line of configuration, and what was
actually run. Tested with Prettier 3.9.10 on Node 22.23.3 and 24.22.1, from the packed
tarball (`npm pack`) installed into a fresh project.

| Where | Status | Glue needed |
|---|---|---|
| `prettier --write` / `--check` on `.jl` | works | list the plugin in `.prettierrc` |
| `.prettierrc` options and `overrides` | works | none |
| Markdown: ```` ```julia ```` / ```` ```jl ```` blocks | works out of the box | none |
| lint-staged | works | `"*.jl": "prettier --write"` |
| pre-commit (`repo: local`) | works | a local hook (below) |
| Prettier API (`format`, `formatWithCursor`, `getSupportInfo`, `getFileInfo`) | works | none |
| VS Code (Prettier extension) | expected to work, not run here | `prettier.documentSelectors` |

## Install and configure

Not on npm. Install from git (the wasm parser is committed, so no build step):

```sh
npm install --save-dev prettier github:pankgeorg/prettier-plugin-julia
```

`.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-julia"]
}
```

Prettier 3 never loads plugins on its own: the `plugins` entry is required, also for the
editor and the Markdown embed. The plugin sets `tabWidth: 4` and `printWidth: 92` as its
defaults; a `.prettierrc` value overrides them for every language, so scope Julia-specific
values with `overrides`:

```json
{
  "plugins": ["prettier-plugin-julia"],
  "printWidth": 80,
  "overrides": [{ "files": "*.jl", "options": { "printWidth": 92, "tabWidth": 4 } }]
}
```

Plugin options, in `.prettierrc` (on the command line, `--no-julia-verify` /
`--no-julia-report` are recognized only when the plugin is also given with `--plugin
prettier-plugin-julia`; otherwise Prettier warns "Ignored unknown option"):

| Option | Default | |
|---|---|---|
| `juliaVerify` | `true` | Check every format with JuliaSyntax; keep code whose meaning would change as written. Turn off only to debug the printer. |
| `juliaReport` | `true` | Print one warning per region kept as written. |

## CLI

```sh
npx prettier --check "**/*.jl"     # exit code 1 when a file would change
npx prettier --write src/ docs/    # .jl and the julia blocks of .md files
```

Syntax errors are reported by Prettier with JuliaSyntax's message and position
(`[error] a.jl: SyntaxError: Expected `)` or `,` (1:4)`); the file is left alone. Regions the
safety check kept as written are reported on stderr:

```
[prettier-plugin-julia] warn: src/a.jl:12:5: kept `…` as written (formatting would change its meaning: …)
```

The rest of the file is still formatted.

## Markdown

Prettier's Markdown printer formats fenced code blocks whose info string names a language
some plugin registers (`julia`, `jl`), through the plugin's own parser and printer, so the
safety check applies there too. Nothing to configure beyond `plugins`. A block that doesn't
parse (a fragment, an error example) is left exactly as written; Prettier swallows embed
errors silently. Indented code blocks and ```` ```julia-repl ```` blocks are not touched.

Verified on a README with a valid block (formatted), an invalid block (kept) and a ```` ```jl ````
block (formatted).

## lint-staged

`package.json`:

```json
{ "lint-staged": { "*.jl": "prettier --write" } }
```

Ran `npx lint-staged` (17.6.0) on a staged unformatted file: it was formatted and re-staged.

## pre-commit

The archived `mirrors-prettier` hook can't load local plugins; use a local hook that runs the
project's Prettier:

```yaml
repos:
  - repo: local
    hooks:
      - id: prettier-julia
        name: prettier (Julia)
        language: system
        entry: npx prettier --write --ignore-unknown
        files: \.jl$
```

Ran `pre-commit run --files src/d.jl` (pre-commit 4.7.0): the file was formatted and the hook
reported "files were modified by this hook". `language: node` with
`additional_dependencies: [prettier@3, "github:pankgeorg/prettier-plugin-julia"]` should also
work once the repository is public; not tried.

## VS Code

The Prettier extension (`esbenp.prettier-vscode`) uses the project's own `prettier` and its
`.prettierrc` plugins, but only registers itself as a formatter for languages it knows. Add
the Julia files with `prettier.documentSelectors` and pick it as the Julia formatter:

```json
{
  "prettier.documentSelectors": ["**/*.jl"],
  "[julia]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

The Julia extension also registers a formatter (JuliaFormatter), hence the explicit
`defaultFormatter`. Not run here (headless machine); what we checked is the part the
extension relies on: `getSupportInfo` lists the Julia language with `vscodeLanguageIds:
["julia"]`, `getFileInfo("a.jl")` infers the `julia` parser, and `formatWithCursor` works.

## Other editors and tools

Anything that runs Prettier with the project's config works the same way: Neovim
(conform.nvim, null-ls with `prettier`), JetBrains (Prettier plugin, add `jl` to "Run for
files"), `prettierd`. Not tried individually.

## Range formatting

Not supported: with `--range-start/--range-end` (or an editor's "format selection") Prettier
finds no range nodes in a plugin language it doesn't know, and returns the file unchanged.
Format the whole file instead; the safety check works on whole files.
