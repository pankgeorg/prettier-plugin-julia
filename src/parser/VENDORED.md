# Vendored parser layer

`wasm-host.js`, `green-tree.js`, `positions.js` and `flags.js` here, and `../../wasm/`
(`parser.wasm`, `manifest.json`, `LICENSES/`), plus `../../scripts/parser/` (the artifact's
build inputs), are copied unmodified from
[eslint-plugin-julia](https://github.com/pankgeorg/eslint-plugin-julia) at commit `7c11a07`.

Vendored rather than depended on: that package doesn't export its parser layer, has
`eslint` as a peer dependency, and a git dependency would fetch the whole ESLint plugin on
every install. `node scripts/check-vendored.mjs PATH/TO/eslint-plugin-julia` reports any drift.

`../tree.js` (ours) builds the full tree, trivia included, from the same `readWasm` +
`placeGreen` + `positions`.

For speed, `../tree.js` maps byte offsets to UTF-16 itself (an identity map for ASCII files,
one `charCodeAt` pass otherwise) instead of calling the vendored `positions`; the result is
the same table (checked byte for byte on 173 non-ASCII corpus files).
