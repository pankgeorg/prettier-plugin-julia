import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const manifest = JSON.parse(readFileSync(new URL('../../wasm/manifest.json', import.meta.url), 'utf8'));
const bytes = readFileSync(new URL('../../wasm/parser.wasm', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) {
  throw new Error('Julia parser artifact hash differs from wasm/manifest.json');
}
const module = new WebAssembly.Module(bytes);
const encoder = new TextEncoder(), decoder = new TextDecoder();

export class ParserTrapError extends Error {
  constructor(cause) {
    super(`JuliaSyntax Wasm trap (Julia ${manifest.versions.julia}, sha256 ${manifest.sha256}): ${cause.message}`, { cause });
    this.name = 'ParserTrapError';
  }
}

// One synchronous instance per isolate. The factory is injectable for trap tests.
export function createWasmHost(instantiate = () => new WebAssembly.Instance(module, {})) {
  let instance, busy = false;
  const names = new Map();
  return function readWasm(text) {
    if (busy) throw new Error('Julia parser adapter is not reentrant');
    busy = true;
    try {
      instance ??= instantiate();
      const e = instance.exports;
      const string = (len, byte) => decoder.decode(Uint8Array.from({ length: len }, (_, i) => byte(i + 1)));
      const name = kind => {
        if (!names.has(kind)) names.set(kind, string(e.kind_name_len(kind), j => e.kind_name_byte(kind, j)));
        return names.get(kind);
      };
      const source = encoder.encode(text);
      e.src_resize(source.length);
      for (let i = 0; i < source.length; i += 4) {
        e.src_set4(i + 1, source[i] | (source[i + 1] << 8) | (source[i + 2] << 16) | (source[i + 3] << 24));
      }
      const count = e.parse_src(1);
      if (!Number.isInteger(count) || count < 0) throw new Error('Invalid Julia parser output count');
      // Copy every result and diagnostic before another file can reuse the instance.
      const raw = Array.from({ length: count }, (_, i) => {
        const k = i + 1, kindId = e.out_kind(k), nodespan = e.out_nodespan(k), cls = e.out_class(k);
        return { kindId, kind: name(kindId), span: e.out_span(k), nodespan,
          class: cls, flags: e.out_flags(k), ...(!(cls & 1) && { originalKind: name(nodespan) }) };
      });
      const diagnostics = Array.from({ length: e.ndiag() }, (_, i) => {
        const k = i + 1;
        return { first: e.diag_first(k), last: e.diag_last(k), level: e.diag_level(k),
          message: string(e.diag_msg_len(k), j => e.diag_msg_byte(k, j)) };
      });
      return { raw, diagnostics, bytes: source.length };
    } catch (error) {
      if (!(error instanceof WebAssembly.RuntimeError)) throw error;
      instance = undefined; // A trapped instance's mutable stream is never reused.
      throw new ParserTrapError(error);
    } finally { busy = false; }
  };
}
export const readWasm = createWasmHost();
