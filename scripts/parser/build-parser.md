# Parser artifact provenance and rebuilding

The supplied parser.wasm is 735,576 bytes, SHA-256
`08b1b81beac1f8a5aa7b4467bd5a1024f99f32cf03c1f33f7fca81a556fe8859`.
It was built from topiary-julia's `jlparse/parser.jl` and `jlparse/build.jl`, using
Julia 1.13.2 and WasmCodegen.jl main commit `316bbaf`, with `wasm-opt -O3`.
Those two source files are copied here as `parser.jl` and `build-parser.jl`.
The manifest contains the full exported numeric ABI (17 functions; no imports).
The compiler's numeric ABI uses 1-based source indices and inclusive diagnostic
byte endpoints. The source uploader packs four bytes into a little-endian i32.

This run did not rebuild the artifact. The original wasm-opt executable version
and topiary-julia build commit were not recorded, so byte-for-byte reproducibility
is not claimed. The supplied source snapshots and artifact hash pin this package.
The compiler license was read at `316bbaf`; Julia and JuliaSyntax notices are
copied from the installed 1.13.2 distribution into wasm/LICENSES/. A compiler
notice is retained conservatively; no claim is made that all compiler code is
embedded. No arbitrary third-party runtime has been inferred from the binary.

In a separate maintainer environment with dependencies already available:

```sh
# Check out WasmCodegen.jl at 316bbaf and use its examples/juliasyntax environment.
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
