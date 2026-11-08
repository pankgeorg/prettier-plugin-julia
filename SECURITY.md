# Security

Please report vulnerabilities privately through GitHub's
[security advisory form](https://github.com/pankgeorg/prettier-plugin-julia/security/advisories/new)
rather than a public issue. Only the latest release is supported.

The plugin runs locally on source files you give it. The parser is a self-contained
WebAssembly module with no imports: it cannot read files, use the network or call back into
Node. The plugin has no runtime dependencies besides Prettier itself.

A formatter that changes what a program means is a correctness bug we treat with the same
priority: if the plugin writes code that parses or behaves differently from the input
without reporting it, please open an issue with the input.
