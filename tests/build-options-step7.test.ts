// Phase 2 T5 follow-up (D42): step 7 (speed boost) is off in real mode, like step 8.
import { describe, expect, it } from "vitest";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan } from "../core/goals";
import { recommend } from "../core/recommend";
import type { BuildOptions, GoalId, MachineProfile } from "../core/types";
import { buildConfig } from "../server/config";
import { atLeast, profiles } from "./fixtures";

const REAL: BuildOptions = { disabledSteps: ["remote-access"] };
const DEMO: BuildOptions = { demo: true };
const DEMO_LABEL = "Demo mode: simulated";
const plan = (goal: GoalId, p: MachineProfile, opts: BuildOptions = {}) =>
  buildPlan(goal, p, recommend(p, catalog, goals.find((g) => g.id === goal)!.modelUse), catalog, {}, undefined, opts);
describe("real mode: step 7 (speed boost) is off too (D42)", () => {
  // The exact list the server passes in real mode.
  const SERVER_REAL: BuildOptions = { disabledSteps: [...buildConfig("C:/Users/me", "real").disabledSteps] };
  const step7 = (goal: GoalId, p: MachineProfile, opts?: BuildOptions) => plan(goal, p, opts).steps.find((s) => s.def.id === "speed-boost")!;
  const all7 = (["chat", "code", "remote", "everything"] as const).flatMap((g) => Object.values(profiles).map((p) => [g, p] as const));
  const withoutBoth = goals.map((g) => ({ ...g, stepIds: g.stepIds.filter((id) => id !== "remote-access" && id !== "speed-boost") }));

  it("is offered on the big GPU PC when nothing is disabled (so the tests below mean something)", () => {
    expect(step7("chat", profiles.bigGpuRig).status).toBe("waiting");
    expect(step7("chat", profiles.bigGpuRig).commands.length).toBeGreaterThan(0);
  });

  it("shows step 7 as skipped with its plain-language reason on every PC, and runs nothing for it", () => {
    for (const [goal, p] of atLeast(all7, 20, "goal/profile pairs")) {
      // D43: its own "not needed" reason when that applies, otherwise "not available yet".
      const reason = step7(goal, p).skipReason ?? explanations.steps["speed-boost"].disabled;
      expect(step7(goal, p, SERVER_REAL)).toMatchObject({ status: "skipped", skipReason: reason, commands: [], demoLabel: null });
    }
    expect(explanations.steps["speed-boost"].disabled).toMatch(/^Your PC could use the speed boost, but it isn't ready in this version\./);
  });

  it("leaves steps 7 and 8 out of the plan hash", () => {
    for (const [goal, p] of atLeast(all7, 20, "goal/profile pairs")) {
      const r = recommend(p, catalog, goals.find((g) => g.id === goal)!.modelUse);
      const off = buildPlan(goal, p, r, catalog, {}, undefined, SERVER_REAL).planHash;
      expect(off).toBe(buildPlan(goal, p, r, catalog, {}, undefined, { goals: withoutBoth }).planHash);
    }
    const r = recommend(profiles.bigGpuRig, catalog, "chat");
    const onlyStep8Off = buildPlan("chat", profiles.bigGpuRig, r, catalog, {}, undefined, REAL).planHash;
    expect(buildPlan("chat", profiles.bigGpuRig, r, catalog, {}, undefined, SERVER_REAL).planHash).not.toBe(onlyStep8Off);
  });

  it("is still offered in demo mode, labelled 'Demo mode: simulated'", () => {
    const s = step7("chat", profiles.bigGpuRig, DEMO);
    expect(s).toMatchObject({ status: "waiting", demoLabel: DEMO_LABEL });
    expect(s.commands.map((c) => c.commandId)).toEqual(["llamacpp.install"]);
  });

  it("words both 'not available yet' texts the same calm way", () => {
    for (const id of atLeast(["remote-access", "speed-boost"] as const, 2, "steps")) {
      const t = explanations.steps[id].disabled!;
      expect(t, id).toMatch(/in this version\. I haven't finished testing it, so I'm leaving it out\./);
      expect(t, id).toMatch(/There's nothing to do here\.$/);
      expect(t, id).toMatch(/Your AI works/i);
      expect(t, id).not.toMatch(/checked on a real PC/);
      expect(t, id).not.toMatch(/!|\b(warning|danger|error|fail\w*|broken|risk\w*)\b/i);
    }
  });
});
