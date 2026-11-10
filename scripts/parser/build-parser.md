# Parser artifact provenance and rebuilding

The supplied parser.wasm is 739,251 bytes, SHA-256
`189b319e4bc7f338a5b1128e5822f08f730227b2050fab28aced3b95e1f17b5d`.
It was built from `parser.jl` and `build-parser.jl` here (unchanged since v0.1.0; they come
from topiary-julia's `jlparse/parser.jl` and `jlparse/build.jl`), using Julia 1.13.2,
WasmCodegen.jl main commit `98cad1f` (2026-11-10), WasmBuilder.jl 0.1.1, and `wasm-opt -O3`
from Binaryen_jll 0.130.0 (WasmCodegen's default optimization).
JuliaSyntax is the one shipped in Julia 1.13.2 (JuliaSyntax `e8a07f5`; Julia 1.13.3 ships the
same commit).
The manifest contains the full exported numeric ABI (17 functions; no imports).
The compiler's numeric ABI uses 1-based source indices and inclusive diagnostic
byte endpoints. The source uploader packs four bytes into a little-endian i32.

v0.1.0 shipped a 735,576-byte build on WasmCodegen `316bbaf` (SHA-256 `08b1b81b…`). The
`98cad1f` build gives the same green trees and diagnostics on 25,174 real-world Julia files.
Two separate builds, on `10cff8e` and on `98cad1f` (which differ only in the README), gave
identical bytes.
Julia and JuliaSyntax notices are copied from the installed 1.13.2 distribution into
wasm/LICENSES/, with WasmCodegen.jl's licence (unchanged at `98cad1f`).

In a separate maintainer environment with dependencies already available:

```sh
# Check out WasmCodegen.jl (main, 98cad1f for this artifact) and use its examples/juliasyntax
# environment, which takes WasmBuilder.jl from its main branch.
julia --project=/path/to/WasmCodegen.jl/examples/juliasyntax scripts/build-parser.jl
```

The copied build script writes `scripts/parser.wasm`. Review its output, compare
native reference trees, then deliberately replace `wasm/parser.wasm` and update
manifest versions/hash and ABI. Do not run a compiler during npm installation.
`node scripts/verify-artifact.mjs` verifies size, hash, imports, exports, and a
Wasm feature smoke parse. Importing the plugin also verifies the hash.

`tests/fixtures/jlparse_reference.json` is the supplied native oracle: 21 sources,
76,494 nodes, including three large files with 35,317 / 29,745 / 11,037 nodes.
Its rows contain kind, span, nodespan, and class; diagnostics include exact bytes
and text. `native-flags.json` was generated in this run by Julia 1.13.2's
Base.JuliaSyntax using `native-reference.jl`, in the same source order. To regenerate,
extract each reference source to an ordered `.jl` file and pass those filenames
to `julia --startup-file=no scripts/native-reference.jl FILES...`.
`native-lowering.jl` regenerates the declaration/keyword lowering evidence.

The nonzero leaf TOMBSTONE regression is a synthetic raw-output fixture in the
tests; a native source producing that specific case has not been found. It checks
that bytes advance before filtering, without claiming native provenance.
