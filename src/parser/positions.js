// Ported from the investigation prototype. All public offsets use UTF-16.
const encoder = new TextEncoder();
export function positions(text, byteLength = encoder.encode(text).length) {
  const byteToIndex = new Uint32Array(byteLength + 1);
  let byte = 0, index = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    const width = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    byteToIndex.fill(index, byte, byte + width);
    byte += width;
    index += char.length;
    byteToIndex[byte] = index;
  }
  const starts = [0];
  for (const match of text.matchAll(/\r\n|[\r\n]/gu)) starts.push(match.index + match[0].length);
  function loc(index) {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid;
    }
    return { line: lo + 1, column: index - starts[lo] };
  }
  const at = b => byteToIndex[Math.max(0, Math.min(byteLength, b))];
  return { byteToIndex, at, loc };
}

