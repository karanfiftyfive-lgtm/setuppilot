// Guard against invisible characters in our own files (Phase 2 T2 mistake: escapes typed as
// \uXXXX reached a file as raw U+2028 and split a regex). Scans the raw bytes, so it also
// catches characters an editor would hide. Byte patterns are numbers: this file stays ASCII.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { atLeast } from "./fixtures";

const ROOT = join(__dirname, "..");
const FOLDERS = ["core", "server", "tests", "data"];

// UTF-8 encodings of the characters that break or disguise code and text.
const BANNED: { name: string; bytes: number[] }[] = [
  { name: "U+0085 next line", bytes: [0xc2, 0x85] },
  { name: "U+061C Arabic letter mark", bytes: [0xd8, 0x9c] },
  { name: "U+200E left-to-right mark", bytes: [0xe2, 0x80, 0x8e] },
  { name: "U+200F right-to-left mark", bytes: [0xe2, 0x80, 0x8f] },
  { name: "U+2028 line separator", bytes: [0xe2, 0x80, 0xa8] },
  { name: "U+2029 paragraph separator", bytes: [0xe2, 0x80, 0xa9] },
  ...[0xaa, 0xab, 0xac, 0xad, 0xae].map((b) => ({ name: `bidi U+202${b.toString(16).slice(1).toUpperCase()}`, bytes: [0xe2, 0x80, b] })),
  ...[0xa6, 0xa7, 0xa8, 0xa9].map((b) => ({ name: `bidi U+206${(b - 0xa0).toString(16)}`, bytes: [0xe2, 0x81, b] })),
];

function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // folder not created yet (server/ before T5)
  }
  return entries.flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

/** Every banned sequence found in a buffer, as "name at byte N". */
export function findBanned(buf: Buffer): string[] {
  const hits: string[] = [];
  for (const { name, bytes } of BANNED) {
    let at = buf.indexOf(Buffer.from(bytes));
    while (at !== -1) {
      hits.push(`${name} at byte ${at}`);
      at = buf.indexOf(Buffer.from(bytes), at + 1);
    }
  }
  return hits;
}

describe("source hygiene: no invisible line breaks or bidi controls", () => {
  const files = FOLDERS.flatMap((f) => filesUnder(join(ROOT, f)));

  it("scans the project's own files", () => {
    atLeast(files, 40, "files");
    atLeast(BANNED, 15, "banned characters");
  });

  it("finds none in core/, server/, tests/ or data/", () => {
    const found = files.flatMap((f) => findBanned(readFileSync(f)).map((h) => `${relative(ROOT, f)}: ${h}`));
    expect(found).toEqual([]);
  });

  it("detects each banned character when it is present", () => {
    for (const { name, bytes } of BANNED) {
      expect(findBanned(Buffer.from([0x61, ...bytes, 0x62])), name).toHaveLength(1);
    }
  });

  it("does not flag ordinary non-ASCII text", () => {
    const ok = Buffer.from(`Jos${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x2026)} ${String.fromCodePoint(0x4e2d)}`);
    expect(findBanned(ok)).toEqual([]);
  });
});
