// Phase 2 T4: contentHash, the byte hash used for file content in the plan hash (steps 9 and 10).
import { describe, expect, it } from "vitest";
import { contentHash, utf8 } from "../core/toolconfig";
import { atLeast } from "./fixtures";

describe("contentHash", () => {
  it("matches the published FNV-1a 32-bit test values", () => {
    expect(contentHash(utf8(""))).toBe("811c9dc5");
    expect(contentHash(utf8("a"))).toBe("e40c292c");
    expect(contentHash(utf8("foobar"))).toBe("bf9cf968");
  });

  it("matches an independent FNV-1a reference for every byte value", () => {
    // Reference written with BigInt arithmetic, separately from core/hash.ts.
    const ref = (bytes: readonly number[]) => {
      let h = 0x811c9dc5n;
      for (const b of bytes) h = ((h ^ BigInt(b)) * 0x01000193n) % 0x100000000n;
      return h.toString(16).padStart(8, "0");
    };
    const all = atLeast(Array.from({ length: 256 }, (_, i) => i), 256, "byte values");
    expect(contentHash(Uint8Array.from(all))).toBe(ref(all));
    for (const b of all) expect(contentHash(Uint8Array.of(b, 0x41)), String(b)).toBe(ref([b, 0x41]));
    const text = `Jos${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x4e2d)}`;
    expect(contentHash(utf8(text))).toBe(ref([...utf8(text)]));
  });

  it("hashes bytes: a one-byte change or a non-ASCII character changes it", () => {
    expect(contentHash(utf8("{}\n"))).not.toBe(contentHash(utf8("{}\r\n")));
    const e = String.fromCodePoint(0xe9);
    expect(utf8(e)).toHaveLength(2);
    expect(contentHash(utf8(e))).not.toBe(contentHash(utf8(String.fromCodePoint(0xc3, 0xa9))));
    expect(contentHash(utf8("x"))).toBe(contentHash(utf8("x")));
  });
});
