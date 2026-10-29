// Phase 2 T4: BuildOptions (step 8 off in real mode, demo labels), the context caveat on the
// coding-tool step, and what the plan hash covers for steps 9 and 10.
import { describe, expect, it } from "vitest";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan, PlanError } from "../core/goals";
import { recommend } from "../core/recommend";
import { STEP_DEFS } from "../core/steps";
import { buildOpenCodeEntry, buildRulesFile, contentHash, mergeProvider, utf8 } from "../core/toolconfig";
import type { BuildOptions, GoalId, MachineProfile, StepId } from "../core/types";
import { atLeast, makeProfile, profiles } from "./fixtures";

const REAL: BuildOptions = { disabledSteps: ["remote-access"] };
const DEMO: BuildOptions = { demo: true };
const DEMO_LABEL = "Demo mode: simulated";
const plan = (goal: GoalId, p: MachineProfile, opts: BuildOptions = {}) =>
  buildPlan(goal, p, recommend(p, catalog, goals.find((g) => g.id === goal)!.modelUse), catalog, {}, undefined, opts);
const step8 = (goal: GoalId, p: MachineProfile, opts?: BuildOptions) => plan(goal, p, opts).steps.find((s) => s.def.id === "remote-access")!;
const withoutStep8 = goals.map((g) => ({ ...g, stepIds: g.stepIds.filter((id) => id !== "remote-access") }));
const cases = (["remote", "everything"] as const).flatMap((g) => Object.values(profiles).map((p) => [g, p] as const));

describe("real mode: step 8 is off until its commands are verified", () => {
  it("shows step 8 as skipped with its plain-language reason, and runs nothing for it", () => {
    for (const [goal, p] of atLeast(cases, 10, "goal/profile pairs")) {
      expect(step8(goal, p, REAL)).toMatchObject({
        status: "skipped", skipReason: explanations.steps["remote-access"].disabled, commands: [], fileWrite: null, demoLabel: null,
      });
    }
    expect(explanations.steps["remote-access"].disabled).toMatch(/isn't available yet in this version\. I haven't finished testing it/);
  });

  it("leaves step 8 out of the plan hash", () => {
    for (const [goal, p] of atLeast(cases, 10, "goal/profile pairs")) {
      const r = recommend(p, catalog, goals.find((g) => g.id === goal)!.modelUse);
      const off = buildPlan(goal, p, r, catalog, {}, undefined, REAL).planHash;
      const absent = buildPlan(goal, p, r, catalog, {}, undefined, { goals: withoutStep8 }).planHash;
      const offered = buildPlan(goal, p, r, catalog).planHash;
      expect(off).toBe(absent);
      expect(off).not.toBe(offered);
    }
  });

  it("wins over the sharing refusal, and so reports no SHARING_IN_USE", () => {
    const shared = makeProfile(profiles.gpuRig, { tools: { ...profiles.gpuRig.tools, tailscaleServe: "existing" } });
    expect(step8("remote", shared, REAL).skipReason).toBe(explanations.steps["remote-access"].disabled);
    expect(plan("remote", shared, REAL).preflight).not.toContain("SHARING_IN_USE");
    expect(plan("remote", shared).preflight).toContain("SHARING_IN_USE");
  });

  it("refuses to disable a required step or an unknown one", () => {
    const required = atLeast(Object.values(STEP_DEFS).filter((d) => d.required).map((d) => d.id), 6, "required steps");
    // Checked by its own message: the rule must hold even if a required step ever gets a "disabled" text.
    for (const id of required) {
      expect(() => plan("everything", profiles.midPc, { disabledSteps: [id] }), id).toThrow(PlanError);
      expect(() => plan("everything", profiles.midPc, { disabledSteps: [id] }), id).toThrow(/is required/);
    }
    expect(() => plan("everything", profiles.midPc, { disabledSteps: ["teleport" as StepId] })).toThrow(PlanError);
  });

  it("ignores a disabled step that the goal does not use", () => {
    expect(plan("chat", profiles.midPc, REAL).planHash).toBe(plan("chat", profiles.midPc).planHash);
  });

  it("puts no demo label on any step", () => {
    for (const [goal, p] of atLeast(cases, 10, "goal/profile pairs")) {
      for (const s of plan(goal, p, REAL).steps) expect(s.demoLabel, s.def.id).toBeNull();
    }
  });
});

describe("demo mode: step 8 is offered and labelled", () => {
  it("offers step 8 with the label 'Demo mode: simulated'", () => {
    for (const [goal, p] of atLeast(cases, 10, "goal/profile pairs")) {
      const s = step8(goal, p, DEMO);
      expect(s.status).toBe("waiting");
      expect(s.commands.length).toBeGreaterThan(0);
      expect(s.demoLabel).toBe(DEMO_LABEL);
    }
  });

  it("labels every step that would run, and no skipped step", () => {
    const steps = atLeast(Object.values(profiles).flatMap((p) => plan("everything", p, DEMO).steps), 40, "steps");
    for (const s of steps) expect(s.demoLabel, s.def.id).toBe(s.status === "skipped" ? null : DEMO_LABEL);
    atLeast(steps.filter((s) => s.status === "skipped"), 3, "skipped steps");
  });

  it("does not change the plan hash (the label is display only)", () => {
    for (const [goal, p] of atLeast(cases, 10, "goal/profile pairs")) expect(plan(goal, p, DEMO).planHash).toBe(plan(goal, p).planHash);
  });
});

describe("the coding-tool step says plainly when the context is small", () => {
  it("adds the caveat with both numbers when the step will run", () => {
    for (const p of atLeast(Object.values(profiles), 5, "profiles")) {
      const s = plan("code", p).steps.find((x) => x.def.id === "connect-coding-tool")!;
      expect(s.text.smallContext).toMatch(/at least 64000 tokens; this PC is set to \d+/);
    }
  });

  it("adds it to no other step", () => {
    const steps = atLeast(plan("everything", profiles.bigGpuRig).steps.filter((s) => s.def.id !== "connect-coding-tool"), 8, "steps");
    for (const s of steps) expect(s.text.smallContext, s.def.id).toBeUndefined();
  });

  it("never appears in the chat-only or remote flows", () => {
    for (const p of atLeast(Object.values(profiles), 5, "profiles")) {
      for (const goal of ["chat", "remote"] as const) {
        for (const s of plan(goal, p).steps) expect(s.text.smallContext, `${goal}:${s.def.id}`).toBeUndefined();
      }
    }
  });

  it("is information only: the step stays offered and no preflight problem is added", () => {
    for (const p of atLeast(Object.values(profiles), 5, "profiles")) {
      const withNote = plan("code", p);
      const s = withNote.steps.find((x) => x.def.id === "connect-coding-tool")!;
      expect(s.text.smallContext).toBeDefined();
      expect(s).toMatchObject({ status: "waiting", skipReason: null });
      const only = [{ ...goals.find((g) => g.id === "code")!, stepIds: ["connect-coding-tool" as StepId] }];
      const r = recommend(p, catalog, "code");
      const big = buildPlan("code", p, { ...r, context: 64000 }, catalog, {}, undefined, { goals: only });
      const small = buildPlan("code", p, r, catalog, {}, undefined, { goals: only });
      expect(small.preflight).toEqual(big.preflight);
      expect(small.steps[0]!.status).toBe(big.steps[0]!.status);
    }
  });

  it("is worded calmly: no alarm words or exclamation marks", () => {
    const note = plan("code", profiles.midPc).steps.find((x) => x.def.id === "connect-coding-tool")!.text.smallContext!;
    expect(note).not.toMatch(/!|\b(warning|danger|dangerous|error|fail\w*|broken|break|risk\w*|cannot|can't|won't|must|critical|unsafe)\b/i);
    expect(note).toMatch(/may not work well/);
  });

  it("leaves it out when the context reaches the docs' figure", () => {
    const only = [{ ...goals.find((g) => g.id === "code")!, stepIds: ["connect-coding-tool" as StepId] }];
    const r = { ...recommend(profiles.bigGpuRig, catalog, "code"), context: 64000 };
    const s = buildPlan("code", profiles.bigGpuRig, r, catalog, {}, undefined, { goals: only }).steps[0]!;
    expect(s.text.smallContext).toBeUndefined();
  });
});

describe("plan hash for steps 9 and 10", () => {
  const roots = { targets: ["C:/Users/me/.config/opencode"], backups: ["C:/Users/me/.setuppilot/backups"], reserved: ["C:/Users/me/.setuppilot"] };
  const CFG = "C:/Users/me/.config/opencode/opencode.json";
  const p = profiles.midPc;
  const recFor = (use: "code" | "chat") => recommend(p, catalog, use);
  const configFor = (tag: string) => {
    const m = catalog.models.find((x) => x.ollamaTag === tag)!;
    const r = mergeProvider({}, buildOpenCodeEntry(m, 8192));
    if (r.kind !== "added") throw new Error("expected added");
    return `${JSON.stringify(r.config, null, 2)}\n`;
  };
  const hash = (cfg: string, cfgPath: string, rules: string, rulesPath: string, rec = recFor("code")) =>
    buildPlan("code", p, rec, catalog, {
      "coding-tool-config": { targetPath: cfgPath, content: cfg },
      "workflow-rules": { targetPath: rulesPath, content: rules },
    }, roots).planHash;
  const base = [configFor("qwen2.5-coder:7b"), CFG, buildRulesFile(), "D:/projects/app/CLAUDE.md"] as const;

  it("records the byte hash of each file's exact content", () => {
    const fw = buildPlan("code", p, recFor("code"), catalog, { "coding-tool-config": { targetPath: CFG, content: base[0] } }, roots)
      .steps.find((s) => s.def.id === "connect-coding-tool")!.fileWrite!;
    expect(fw.contentHash).toBe(contentHash(utf8(base[0])));
  });

  const changes: [string, string][] = [
    ["step 9 content (another model's entry)", hash(configFor("qwen2.5:7b"), base[1], base[2], base[3])],
    ["step 9 content (one byte)", hash(`${base[0]} `, base[1], base[2], base[3])],
    ["step 9 target path", hash(base[0], "C:/Users/me/.config/opencode/other.json", base[2], base[3])],
    ["step 10 content", hash(base[0], base[1], `${base[2]}- one more rule\n`, base[3])],
    ["step 10 target path", hash(base[0], base[1], base[2], "D:/projects/other/CLAUDE.md")],
    ["the model", hash(...base, { ...recFor("code"), model: catalog.models.find((m) => m.ollamaTag === "qwen2.5:7b")! })],
  ];

  it.each(changes)("changes when %s changes", (_what, changed) => {
    expect(changed).not.toBe(hash(...base));
  });

  it("checked every change listed, and is stable when nothing changes", () => {
    atLeast(changes, 6, "changes");
    expect(hash(...base)).toBe(hash(...base));
  });
});
