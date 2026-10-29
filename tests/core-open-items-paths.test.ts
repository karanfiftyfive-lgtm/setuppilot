// Phase 1 open items fixed in core (Phase 2, T2): paths and roots, OI-2, OI-4, OI-5, OI-6.
import { describe, expect, it } from "vitest";
import { catalog, goals } from "../core/data";
import { buildPlan, PlanError } from "../core/goals";
import { buildUninstallPlan } from "../core/manifest";
import { checkRoots, isInsideRoots, isSafePath, normPath } from "../core/paths";
import { recommend } from "../core/recommend";
import type { AllowedRoots } from "../core/types";
import { atLeast, profiles } from "./fixtures";
import { file, manifestOf, model, ROOTS } from "./manifest-helpers";

// Special characters are built from code points so the test source stays plain ASCII.
const ch = (cp: number) => String.fromCodePoint(cp);
const DIR = "C:/Users/me/.config/opencode";

describe("OI-2: more Windows device names are refused", () => {
  const SUP = [0xb9, 0xb2, 0xb3].map(ch); // superscript 1, 2, 3
  const devices = [
    ...SUP.flatMap((s) => [`COM${s}`, `lpt${s}`, `com${s}.txt`]),
    "COM0", "lpt0.log", "CONIN$", "conout$", "CONIN$.txt",
    "nul .txt", "con  .json", "AUX .log", "com1 .txt",
  ];

  it.each(devices)("rejects %j as a file or folder name", (name) => {
    expect(isSafePath(`${DIR}/${name}`)).toBe(false);
    expect(isSafePath(`${DIR}/${name}/x.json`)).toBe(false);
    expect(isInsideRoots(`${DIR}/${name}`, [DIR])).toBe(false);
  });

  it("checked every device name listed", () => {
    atLeast(devices, 18, "device names");
  });

  it.each(["COM10", "lpt10.txt", "console.txt", "nullable.json", "conin.txt", "com.json", "auxiliary", "nul_x.txt"])(
    "still accepts the ordinary name %j",
    (name) => {
      expect(isSafePath(`${DIR}/${name}`)).toBe(true);
    },
  );
});

describe("OI-4: case folding is ASCII only", () => {
  const KELVIN = ch(0x212a);
  const ANGSTROM = ch(0x212b);

  it("lowercases ASCII letters and slashes as before", () => {
    expect(normPath("C:\\Users\\KIM\\X.JSON\\")).toBe("c:/users/kim/x.json");
  });

  it("does not fold the Kelvin or Angstrom sign into a different letter", () => {
    expect(normPath(`C:/Users/${KELVIN}im`)).not.toBe("c:/users/kim");
    expect(normPath(`C:/${ANGSTROM}sa`)).toBe(`c:/${ANGSTROM}sa`);
  });

  it("does not treat a Kelvin-sign folder as inside a root that uses the letter k", () => {
    expect(isInsideRoots(`C:/Users/${KELVIN}im/.config/opencode/x.json`, ["C:/Users/kim/.config/opencode"])).toBe(false);
  });

  it("fails closed for non-ASCII case differences (refuses, never wrongly accepts)", () => {
    const E_UPPER = ch(0xc9);
    const e_lower = ch(0xe9);
    expect(isInsideRoots(`C:/Users/Jos${E_UPPER}/.config/opencode/x.json`, [`C:/Users/Jos${e_lower}/.config/opencode`])).toBe(false);
    expect(isInsideRoots(`C:/USERS/Jos${e_lower}/.config/opencode/x.json`, [`C:/Users/Jos${e_lower}/.config/opencode`])).toBe(true);
  });

  it("keeps a Kelvin-sign file and a k file as two separate uninstall items", () => {
    const roots: AllowedRoots = { ...ROOTS, targets: ["C:/Users/kim", `C:/Users/${KELVIN}im`] };
    const records = [file(null, "C:/Users/kim/a.json"), file(null, `C:/Users/${KELVIN}im/a.json`)];
    expect(buildUninstallPlan(manifestOf(...records), catalog, roots).items).toHaveLength(2);
  });
});

describe("OI-5: the workflow-rules file never goes inside backups or ~/.setuppilot", () => {
  const rec7 = recommend(profiles.midPc, catalog, "any");
  const rules = (targetPath: string) => ({ "workflow-rules": { targetPath, content: "# rules" } });
  const build = (targetPath: string) => () => buildPlan("everything", profiles.midPc, rec7, catalog, rules(targetPath), ROOTS);

  it.each([
    "C:/Users/me/.setuppilot/CLAUDE.md",
    "C:/Users/me/.setuppilot/logs/CLAUDE.md",
    "C:/Users/me/.setuppilot/backups/CLAUDE.md",
    "C:/Users/me/.setuppilot/backups/old/CLAUDE.md",
    "c:\\users\\ME\\.SetupPilot\\CLAUDE.md",
  ])("refuses %j", (p) => {
    expect(build(p)).toThrow(PlanError);
  });

  it("still allows a project folder the user picked", () => {
    const plan = build("D:/projects/app/CLAUDE.md")();
    expect(plan.steps.find((s) => s.def.id === "workflow-rules")!.fileWrite).toMatchObject({ targetPath: "D:/projects/app/CLAUDE.md" });
  });

  it("allows a sibling folder whose name only starts like .setuppilot", () => {
    expect(build("C:/Users/me/.setuppilot-notes/CLAUDE.md")).not.toThrow();
  });
});

describe("OI-6: allowed roots must not overlap", () => {
  const base: AllowedRoots = { targets: [DIR], backups: ["C:/Users/me/.setuppilot/backups"], reserved: ["C:/Users/me/.setuppilot"] };
  const bad: [string, AllowedRoots][] = [
    ["target equals reserved", { ...base, targets: ["C:/Users/me/.setuppilot"] }],
    ["target inside reserved", { ...base, targets: ["C:/Users/me/.setuppilot/config"] }],
    ["target equals backups", { ...base, targets: ["C:/Users/me/.setuppilot/backups/"] }],
    ["target contains reserved", { ...base, targets: ["C:/Users/me"] }],
    ["target contains backups (other case and slashes)", { ...base, targets: ["c:\\USERS\\me\\"] }],
    ["unsafe target root", { ...base, targets: ["C:/Users/me/.config/opencode."] }],
    ["unsafe reserved root", { ...base, reserved: ["//server/share"] }],
    ["drive root as target", { ...base, targets: ["C:/"] }],
  ];

  it.each(bad)("throws for %s", (_name, roots) => {
    expect(() => checkRoots(roots)).toThrow();
  });

  it("checked every bad layout listed", () => {
    atLeast(bad, 8, "root layouts");
  });

  it("accepts separate roots, and backups inside reserved (that is where they live)", () => {
    expect(() => checkRoots(base)).not.toThrow();
    expect(() => checkRoots({ ...base, targets: [DIR, "C:/Users/me/.setuppilot-notes"] })).not.toThrow();
    expect(() => checkRoots({ targets: [], backups: [], reserved: [] })).not.toThrow();
  });

  it("makes buildPlan and buildUninstallPlan refuse overlapping roots", () => {
    const roots = bad[0]![1];
    const rec7 = recommend(profiles.midPc, catalog, goals.find((g) => g.id === "chat")!.modelUse);
    expect(() => buildPlan("chat", profiles.midPc, rec7, catalog, {}, roots)).toThrow();
    expect(() => buildUninstallPlan(manifestOf(model()), catalog, roots)).toThrow();
  });
});
