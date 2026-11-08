# Using prettier-plugin-julia

How to install the plugin, run it from the command line and in GitHub Actions, and hook it
into editors and pre-commit tools. Everything here was run with Prettier 3.9.10 (and the CLI
path with 3.0.0) on Node 22 and 24, from the packed tarball installed into a fresh project;
`scripts/smoke.mjs` repeats the CLI part in CI.

- [Install](#install)
- [Configure](#configure)
- [Command line](#command-line)
- [A Julia project without Node](#a-julia-project-without-node)
- [GitHub Actions](#github-actions)
- [lint-staged and pre-commit](#lint-staged-and-pre-commit)
- [Editors](#editors)
- [Prettier API](#prettier-api)
- [Limits](#limits)

## Install

Requirements: Node `^22.23.3` or `^24.22.1` (the parser needs WebAssembly GC and exception
handling) and Prettier 3. No Julia installation is needed: the parser ships as
`wasm/parser.wasm`.

The plugin is not on npm yet. Install it from the GitHub release tarball:

```sh
npm install --save-dev prettier https://github.com/pankgeorg/prettier-plugin-julia/releases/download/v0.1.0/prettier-plugin-julia-0.1.0.tgz
```

or from the git tag (the parser artifact is committed, so there is no build step):

```sh
npm install --save-dev prettier github:pankgeorg/prettier-plugin-julia#v0.1.0
```

Once it is published to npm, `npm install --save-dev prettier prettier-plugin-julia` will
work too.

## Configure

`.prettierrc` (or `.prettierrc.json`, `prettier.config.js`, the `prettier` key of
`package.json`):

```json
{ "plugins": ["prettier-plugin-julia"] }
```

Prettier 3 never loads plugins on its own: the `plugins` entry is required, also for editors
and for Markdown files.

The plugin defaults to `tabWidth: 4` and `printWidth: 92` for `.jl` files. A top-level value
in `.prettierrc` overrides that for every language, so scope Julia values with `overrides`:

```json
{
  "plugins": ["prettier-plugin-julia"],
  "printWidth": 80,
  "overrides": [{ "files": "*.jl", "options": { "printWidth": 92 } }]
}
```

Options:

| Option        | Default | Meaning                                                                                                                      |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `printWidth`  | `92`    | Line width the printer aims for.                                                                                             |
| `tabWidth`    | `4`     | Spaces per indentation level.                                                                                                |
| `useTabs`     | `false` | Indent with tabs.                                                                                                            |
| `endOfLine`   | `"lf"`  | Prettier's usual line-ending option.                                                                                         |
| `juliaVerify` | `true`  | Check every format with JuliaSyntax and keep code whose meaning would change as written. Turn off only to debug the printer. |
| `juliaReport` | `true`  | Print one warning per region kept as written.                                                                                |

On the command line, `--no-julia-verify` and `--no-julia-report` are recognized only when
the plugin is also given with `--plugin prettier-plugin-julia`; in `.prettierrc` they always
work.

Files and regions to leave alone: list paths in `.prettierignore` (Prettier also skips what
`.gitignore` lists), put `# prettier-ignore` on the line before a statement, or surround a
region with `#! format: off` and `#! format: on`.

## Command line

````sh
npx prettier --check "**/*.jl"          # exit code 1 if a file would change
npx prettier --write "**/*.jl"          # format in place
npx prettier --write "**/*.{jl,md}"     # also the ```julia blocks of Markdown files
npx prettier "src/a.jl"                 # print the formatted file to stdout
````

List the `.jl` glob explicitly: `prettier --write .` picks up `.jl` files only on recent
Prettier 3 releases.

Exit codes: 0 when everything is formatted, 1 when `--check` finds files to format, 2 on an
error. A file JuliaSyntax rejects is reported with its position and left alone:

```
[error] bad.jl: SyntaxError: Expected `)` or `,`
[error] > 1 | f(x
[error]     |    ^
```

Code the safety check had to keep as written is reported on stderr; the rest of the file is
still formatted:

```
[prettier-plugin-julia] warn: src/a.jl:12:5: kept `[x -y]` as written (formatting would change its meaning: …)
```

### Markdown

Fenced ` ```julia ` and ` ```jl ` blocks in Markdown files are formatted by the plugin (with
4-space indentation and 92 columns, whatever the Markdown file's own settings), and the
safety check applies there too. Nothing to configure beyond `plugins`. A block that doesn't
parse (a fragment, an error example) is left exactly as written. ` ```julia-repl ` blocks and
indented code blocks are not touched. To keep one block as written, put
`<!-- prettier-ignore -->` on the line before it.

## A Julia project without Node

Three small files at the root of the Julia project, plus the lock file npm writes.

`package.json`:

```json
{
  "private": true,
  "devDependencies": {
    "prettier": "^3.9.10",
    "prettier-plugin-julia": "https://github.com/pankgeorg/prettier-plugin-julia/releases/download/v0.1.0/prettier-plugin-julia-0.1.0.tgz"
  },
  "scripts": {
    "format": "prettier --write \"**/*.jl\"",
    "format:check": "prettier --check \"**/*.jl\""
  }
}
```

`.prettierrc`:

```json
{ "plugins": ["prettier-plugin-julia"] }
```

`.gitignore` (append):

```
node_modules/
```

Then `npm install` once, and `npm run format` / `npm run format:check`. Commit
`package.json`, `package-lock.json` and `.prettierrc`. A `.prettierignore` is useful for
generated files, for example `docs/build/`.

## GitHub Actions

`.github/workflows/format.yml`, for a project set up as above (with a `package-lock.json`):

```yaml
name: Format
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  prettier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Check Julia formatting
        run: |
          if ! npx prettier --check "**/*.jl"; then
            echo "::error::Some Julia files are not formatted. Run: npx prettier --write \"**/*.jl\""
            npx prettier --write "**/*.jl" > /dev/null
            git --no-pager diff
            exit 1
          fi
```

The job fails when a file would change, and the log ends with the diff to apply.

Without a `package.json` in the repository, install the tools in the job instead of
`npm ci`:

```yaml
- run: npm install --no-save prettier@3 https://github.com/pankgeorg/prettier-plugin-julia/releases/download/v0.1.0/prettier-plugin-julia-0.1.0.tgz
- run: npx prettier --plugin prettier-plugin-julia --check "**/*.jl"
```

## lint-staged and pre-commit

[lint-staged](https://github.com/lint-staged/lint-staged), in `package.json`:

```json
{ "lint-staged": { "*.jl": "prettier --write" } }
```

[pre-commit](https://pre-commit.com): the archived `mirrors-prettier` hook can't load local
plugins, so use a local hook that runs the project's Prettier:

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

Both were run on a staged unformatted file: it was formatted (and re-staged by lint-staged;
pre-commit reports "files were modified by this hook").

## Editors

**VS Code**, with the Prettier extension (`esbenp.prettier-vscode`): it uses the project's
own `prettier` and `.prettierrc`, but registers itself only for languages it knows. Add the
Julia files and pick it as the Julia formatter, in `.vscode/settings.json`:

```json
{
  "prettier.documentSelectors": ["**/*.jl"],
  "[julia]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

The Julia extension also registers a formatter (JuliaFormatter), hence the explicit
`defaultFormatter`. Not run in an editor here; the parts the extension relies on are tested:
`getSupportInfo` lists Julia with `vscodeLanguageIds: ["julia"]`, `getFileInfo("a.jl")`
infers the `julia` parser, and `formatWithCursor` works.

Anything else that runs Prettier with the project's configuration works the same way:
Neovim (conform.nvim, none-ls), JetBrains IDEs (Prettier plugin; add `jl` to "Run for
files"), `prettierd`. Not tried individually.

## Prettier API

```js
import * as prettier from 'prettier';
import * as julia from 'prettier-plugin-julia';

const out = await prettier.format('f(x)=x+1', { parser: 'julia', plugins: [julia] });
// 'f(x) = x + 1\n'
```

## Limits

- Range formatting (`--range-start`/`--range-end`, an editor's "format selection") is not
  supported: Prettier returns the file unchanged. Format whole files.
- Source line numbers can change (`@__LINE__`, stack traces, macros that read
  `__source__`), as with any formatter that moves code between lines.
- Speed: about 1.3 s per MB of Julia, warm, with the safety check (0.9 s/MB without), plus
  0.2 s of start-up. See the README for the comparison with Runic and JuliaFormatter.
