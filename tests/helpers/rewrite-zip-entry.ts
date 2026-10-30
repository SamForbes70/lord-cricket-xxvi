export function rewriteZipEntryText(bytes: Uint8Array, name: string, before: string, after: string): Uint8Array {
  const out = Uint8Array.from(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let offset = 0;
  let replacementCrc: number | null = null;
  while (offset + 30 <= out.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + nameLength + extraLength;
    const entryName = decoder.decode(out.slice(offset + 30, offset + 30 + nameLength));
    if (entryName === name) {
      const text = decoder.decode(out.slice(dataStart, dataStart + size));
      if (!text.includes(before)) throw new Error("ZIP_TEXT_NOT_FOUND");
      const replacement = encoder.encode(text.replace(before, after));
      if (replacement.length !== size) throw new Error("ZIP_TEXT_LENGTH_CHANGED");
      out.set(replacement, dataStart);
      let crc = 0xffffffff;
      for (const byte of replacement) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      replacementCrc = (crc ^ 0xffffffff) >>> 0;
      view.setUint32(offset + 14, replacementCrc, true);
    }
    offset = dataStart + size;
  }
  if (replacementCrc === null) throw new Error("ZIP_ENTRY_NOT_FOUND");
  while (offset + 46 <= out.length && view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryName = decoder.decode(out.slice(offset + 46, offset + 46 + nameLength));
    if (entryName === name) view.setUint32(offset + 16, replacementCrc, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
