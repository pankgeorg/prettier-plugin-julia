// Postorder placement ported from proto/parser.mjs and topiary-julia/src/jlparse.rs.
// Place ALL leaves, including nonzero TOMBSTONEs, before removing any trivia.
export function placeGreen(raw, byteLength) {
  const nodes = [], stack = [];
  let cursor = 0;
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i], interior = Boolean(o.class & 1), children = [];
    if (!Number.isInteger(o.span) || o.span < 0 || !Number.isInteger(o.nodespan) || o.nodespan < 0) {
      throw new Error(`Invalid green node dimensions at ${i}`);
    }
    let start = cursor;
    if (interior) {
      const first = i - o.nodespan;
      if (first < 0) throw new Error(`Invalid green subtree at ${i}`);
      while (stack.length && stack.at(-1) >= first) children.push(stack.pop());
      children.reverse();
      if (children.length) {
        const firstChild = nodes[children[0]];
        const subtreeStart = children[0] - (firstChild.interior ? firstChild.nodespan : 0);
        if (subtreeStart !== first) throw new Error(`Misaligned green subtree at ${i}`);
        start = firstChild.start;
      } else cursor += o.span;
    } else cursor += o.span;
    if (cursor > byteLength || cursor - start !== o.span) throw new Error(`Invalid green span at ${i}`);
    nodes.push({ ...o, interior, start, end: cursor, children });
    stack.push(i);
  }
  if (cursor !== byteLength) throw new Error(`Tree covers ${cursor} bytes; input has ${byteLength}`);
  const roots = stack.filter(i => nodes[i].interior || nodes[i].start !== nodes[i].end);
  return { nodes, roots };
}
