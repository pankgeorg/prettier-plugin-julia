# Style

Close to the defaults of [Runic](https://github.com/fredrikekre/Runic.jl) and
[JuliaFormatter](https://github.com/domluna/JuliaFormatter.jl), with Prettier's line fitting.
Prettier options: `printWidth` (default 92 here), `tabWidth` (default 4), `useTabs`.

## Layout

- **Indentation**: 4 spaces per level. Bodies of `function`, `macro`, `if`/`elseif`/`else`,
  `for`, `while`, `let`, `begin`, `quote`, `try`/`catch`/`else`/`finally`, `struct`, `do` are
  indented; `end` lines up with the opening keyword.
- **`module` bodies are not indented** (Runic, BlueStyle). One blank line after
  `module X` and before `end` is kept when written.
- **One statement per line.** Single-line blocks (`if a b end`, `while x f() end`) are
  expanded. `a; b` on one line stays on one line.
- **Blank lines**: kept, at most one in a row; none at the start or end of a block body.
- **Line breaks** are added only where Julia reads them as continuation:
  - after `(`, `[`, `{` and commas inside brackets;
  - after binary and assignment operators;
  - before `for`/`if` in a generator or comprehension.
  None are added inside matrix rows or between macro arguments (`@m a b`), where a newline
  would change the meaning.
- **Lists that don't fit** go one element per line, with a trailing comma:
  ```julia
  very_long_function_name(
      argument_number_one,
      argument_number_two;
      keyword=1,
  )
  ```
  A last argument that is a bracket, a block, a multi-line string or a `do`/`function`
  "hugs" the call: `println(io, """` … `""")`, `f(a, [` … `])`.
- **Trailing commas** are removed in single-line lists, except the one a 1-tuple needs `(a,)`.

## Spacing

- Spaces around binary operators: `a + b`, `x == y`, `a => b`, `x -> x + 1`, `a ? b : c`,
  `x = y`, `x += 1`, `a <: B`, `a && b`.
- No spaces around `:` (ranges), `^`, `::`, `.`, `...`: `1:n`, `x^2`, `x::Int`, `a.b`.
  Operands of a range are compact: `1:n-1`; inside parentheses they are spaced again:
  `1:(n - 1)`.
- Keyword arguments, defaults and named tuples without spaces around `=`: `f(x; k=1)`,
  `function f(x, y=2)`, `(a=1, b=2)` (BlueStyle, SciML, YAS). Inside macro calls without
  parentheses (`@kwdef`, `@set a = 1`) the spacing is kept as written.
- `<:`/`>:` inside braces are tight: `Vector{<:Real}`, `where {T<:Real}`.
- `, ` after commas; no space after `(`, `[`, `{` or before `)`, `]`, `}`.
- Unary operators are tight (`-x`, `!x`), except `- 2` and `- (x)`, which mean something
  else than `-2` and `-(x)` and are kept as written.
- `for i = 1:n` becomes `for i in 1:n` (as Runic); `∈` is kept.

## Kept as written

- Strings, string macros (`r"…"`, `raw"…"`, `md"""…"""`), command strings, characters,
  numbers, `var"…"`. Triple-quoted strings move with the line they start on; their content
  keeps its relative indentation (the value doesn't change).
- Matrices written over several lines (`[1 2\n 3 4]`): kept, so hand alignment survives;
  single-line matrices are normalized to one space between elements and never broken.
- Comments: own-line comments stay on their own line at the block's indentation; a comment
  after code stays after that code, with its original spacing before `#`.
- `# prettier-ignore` keeps the next statement as written; `#! format: off` …
  `#! format: on` keeps a region as written (the Runic/JuliaFormatter convention).
- Anything the printer has no rule for is printed token by token: same tokens, whitespace
  normalized (runs of spaces become one, line breaks kept and re-indented).
- Anything whose formatting would change the program (checked by JuliaSyntax after every
  format) is kept exactly as written, and reported.
