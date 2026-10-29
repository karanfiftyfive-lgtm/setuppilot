import { describe, expect, it } from "vitest";
import { isInsideRoots, isSafePath } from "../core/paths";

const ROOT = "C:/Users/me/.config/opencode";
const UNSAFE = [
  // Windows rewrites these to the root folder itself (round 2, item 1).
  "C:/Users/me/.config/opencode/ ",
  "C:/Users/me/.config/opencode/...",
  "C:/Users/me/.config/opencode/. .",
  "C:/Users/me/.config/opencode/..",
  "C:/Users/me/.config/opencode/.",
  "C:/Users/me/.config/opencode/x.json.",
  "C:/Users/me/.config/opencode/x.json ",
  "C:/Users/me/.config/opencode./x.json",
  // Control characters and characters Windows forbids.
  "C:/Users/me/.config/opencode/x\u0000.json",
  "C:/Users/me/.config/opencode/x\u0001.json",
  "C:/Users/me/.config/opencode/x\t.json",
  ...["<", ">", '"', "|", "?", "*"].map((c) => `C:/Users/me/.config/opencode/x${c}.json`),
  // Reserved device names, with or without an extension.
  "C:/Users/me/.config/opencode/nul",
  "C:/Users/me/.config/opencode/nul.txt",
  "C:/Users/me/.config/opencode/CON",
  "C:/Users/me/.config/opencode/prn.json",
  "C:/Users/me/.config/opencode/Aux.log",
  "C:/Users/me/.config/opencode/COM1",
  "C:/Users/me/.config/opencode/com9.txt",
  "C:/Users/me/.config/opencode/LPT1",
  "C:/Users/me/.config/opencode/lpt9.dat",
  // Not a plain absolute drive path.
  "//server/share/x.json",
  "\\\\?\\C:\\Users\\me\\.config\\opencode\\x.json",
  "\\\\.\\C:\\x.json",
  "Users/me/.config/opencode/x.json",
  "C:/Users/me/.config/opencode/x.json:stream",
  "C:/Users//me/x.json",
];

describe("isSafePath", () => {
  it.each(UNSAFE)("rejects %j", (p) => {
    expect(isSafePath(p)).toBe(false);
  });

  it("checked every unsafe case listed", () => {
    expect(UNSAFE.length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    "C:/Users/me/.config/opencode/opencode.json",
    "c:\\users\\ME\\.config\\opencode\\opencode.json",
    "D:/projects/my app/CLAUDE.md",
    "C:/Users/me/console.json", // "console" is not "con"
    "C:/Users/me/.nul/x.json",
  ])("accepts %j", (p) => {
    expect(isSafePath(p)).toBe(true);
  });
});

describe("isInsideRoots", () => {
  it.each(UNSAFE)("rejects unsafe path %j even under the root", (p) => {
    expect(isInsideRoots(p, [ROOT])).toBe(false);
  });

  it.each([
    "C:/Windows/System32/x.dll",
    "D:/Users/me/.config/opencode/x.json",
    "C:/Users/me/.config/opencode",
    "C:/Users/me/.config/opencode-evil/x.json",
  ])("rejects %j outside or equal to the root", (p) => {
    expect(isInsideRoots(p, [ROOT])).toBe(false);
  });

  it("accepts a path inside the root, any slash style or case, root with trailing slash", () => {
    expect(isInsideRoots("c:\\users\\me\\.config\\opencode\\opencode.json", [`${ROOT}/`])).toBe(true);
    expect(isInsideRoots("C:/Users/me/.config/opencode/sub/x.json", ["C:\\Users\\me\\.config\\opencode\\"])).toBe(true);
  });

  it("allows nothing with no roots, or only unsafe roots", () => {
    expect(isInsideRoots(`${ROOT}/x.json`, [])).toBe(false);
    expect(isInsideRoots("C:/x.json", ["C:/"])).toBe(false);
    expect(isInsideRoots(`${ROOT}/x.json`, ["Users/me"])).toBe(false);
  });
});
