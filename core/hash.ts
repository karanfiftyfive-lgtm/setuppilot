// FNV-1a 32-bit. Binds approvals to exactly what was shown; NOT collision-resistant, so the
// runner must execute only from its own stored copy and re-check the hash (CONTRACTS.md).
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** UTF-8 bytes of a text, exactly as the server writes it to disk. */
export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** FNV-1a 32-bit over bytes, so a file can be hashed the same way from disk (FileWrite.contentHash). */
export function contentHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}
