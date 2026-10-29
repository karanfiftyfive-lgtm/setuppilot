// File-writing steps: what gets hashed, and which targets are allowed.
import { describe, expect, it } from "vitest";
import { catalog, goals } from "../core/data";
import { buildPlan, PlanError } from "../core/goals";
import { recommend } from "../core/recommend";
import type { GoalId } from "../core/types";
import { atLeast, profiles } from "./fixtures";

const plan = (goal: GoalId) => buildPlan(goal, profiles.midPc, recommend(profiles.midPc, catalog,
  goals.find((g) => g.id === goal)!.modelUse), catalog);

describe("buildPlan: file writes in the hash (review round 1)", () => {
  const rec = recommend(profiles.midPc, catalog, "code");
  const files = (targetPath: string, content: string) => ({ "coding-tool-config": { targetPath, content } });
  const roots = { targets: ["C:/Users/me/.config/opencode", "C:/a", "C:/b"], backups: [], reserved: ["C:/Users/me/.setuppilot"] };
  const hashFor = (f: ReturnType<typeof files>) => buildPlan("code", profiles.midPc, rec, catalog, f, roots).planHash;

  it("records the target path and a hash of the content on the file-writing step", () => {
    const p = buildPlan("code", profiles.midPc, rec, catalog, files("C:/Users/me/.config/opencode/opencode.json", "{}"), roots);
    const s = p.steps.find((x) => x.def.id === "connect-coding-tool")!;
    expect(s.fileWrite).toMatchObject({ kind: "coding-tool-config", targetPath: "C:/Users/me/.config/opencode/opencode.json" });
    expect(s.fileWrite!.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes the plan hash when the target path changes", () => {
    expect(hashFor(files("C:/a/opencode.json", "{}"))).not.toBe(hashFor(files("C:/b/opencode.json", "{}")));
  });

  it("changes the plan hash when the content changes", () => {
    expect(hashFor(files("C:/a/opencode.json", '{"model":"a"}'))).not.toBe(hashFor(files("C:/a/opencode.json", '{"model":"b"}')));
  });

  it("changes the plan hash when a file write is added", () => {
    expect(hashFor(files("C:/a/opencode.json", "{}"))).not.toBe(buildPlan("code", profiles.midPc, rec, catalog).planHash);
  });

  it("has no file write on steps that do not write files", () => {
    for (const s of atLeast(plan("everything").steps.filter((x) => !x.def.writesFile), 8, "steps")) expect(s.fileWrite).toBeNull();
  });
});

describe("buildPlan: file targets are checked (round 2, item 5)", () => {
  const rec = recommend(profiles.midPc, catalog, "any");
  const roots = { targets: ["C:/Users/me/.config/opencode"], backups: ["C:/Users/me/.setuppilot/backups"], reserved: ["C:/Users/me/.setuppilot"] };
  const build = (files: Parameters<typeof buildPlan>[4]) => () => buildPlan("everything", profiles.midPc, rec, catalog, files, roots);
  const cfg = (targetPath: string) => ({ "coding-tool-config": { targetPath, content: "{}" } });
  const rules = (targetPath: string) => ({ "workflow-rules": { targetPath, content: "# rules" } });

  it.each([
    "C:/Windows/System32/drivers/etc/hosts",
    "C:/Users/me/.setuppilot/manifest.json",
    "C:/Users/me/.config/opencode/../x.json",
    "C:/Users/me/.config/opencode/nul.json",
  ])("refuses a coding-tool config at %j", (p) => {
    expect(build(cfg(p))).toThrow(PlanError);
  });

  it.each(["D:/projects/app/rules.md", "D:/projects/app/CLAUDE.md.", "relative/CLAUDE.md", "D:/x/CON/CLAUDE.md"])(
    "refuses a workflow-rules file at %j",
    (p) => {
      expect(build(rules(p))).toThrow(PlanError);
    },
  );

  it("accepts the config inside its folder and CLAUDE.md in any safe folder", () => {
    const p = build({ ...cfg("C:/Users/me/.config/opencode/opencode.json"), ...rules("D:/projects/my app/CLAUDE.md") })();
    expect(p.steps.filter((s) => s.fileWrite).map((s) => s.fileWrite!.kind)).toEqual(["coding-tool-config", "workflow-rules"]);
  });

  it("refuses everything when the server passes no roots", () => {
    expect(() => buildPlan("code", profiles.midPc, rec, catalog, cfg("C:/Users/me/.config/opencode/x.json"))).toThrow(PlanError);
  });
});
