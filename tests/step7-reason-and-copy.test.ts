// Phase 2 T5b: step 7 shows its own "not needed" reason before "not available yet" (D43), and the
// reworded "not available yet" texts, context caveat and glossary entries.
import { describe, expect, it } from "vitest";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan } from "../core/goals";
import { recommend } from "../core/recommend";
import { contextNote } from "../core/toolconfig";
import type { BuildOptions, GoalId, MachineProfile } from "../core/types";
import glossary from "../data/glossary.json";
import { buildConfig } from "../server/config";
import { atLeast, profiles } from "./fixtures";

const REAL: BuildOptions = { disabledSteps: [...buildConfig("C:/Users/me", "real").disabledSteps] };
const DEMO: BuildOptions = { demo: true };
const GOALS = ["chat", "code", "remote", "everything"] as const;
const text7 = explanations.steps["speed-boost"];
const recFor = (goal: GoalId, p: MachineProfile) => recommend(p, catalog, goals.find((g) => g.id === goal)!.modelUse);
const plan = (goal: GoalId, p: MachineProfile, opts: BuildOptions = {}) =>
  buildPlan(goal, p, recFor(goal, p), catalog, {}, undefined, opts);
const step7 = (goal: GoalId, p: MachineProfile, opts?: BuildOptions) => plan(goal, p, opts).steps.find((s) => s.def.id === "speed-boost")!;
const withoutBoth = goals.map((g) => ({ ...g, stepIds: g.stepIds.filter((id) => id !== "remote-access" && id !== "speed-boost") }));

describe("step 7 in real mode: 'not needed' first, 'not available yet' only when it would be offered (D43)", () => {
  it("no separate graphics card: shows 'Your PC doesn't need this', skipped, no commands", () => {
    expect(profiles.midPc.gpus.some((g) => g.vramGb)).toBe(false);
    for (const goal of atLeast(GOALS, 4, "goals")) {
      expect(step7(goal, profiles.midPc, REAL), goal).toMatchObject({
        status: "skipped", skipReason: text7.notNeeded, commands: [], demoLabel: null,
      });
    }
  });

  it("big-gpu-rig (where it would be offered): shows 'not available yet', skipped, no commands", () => {
    for (const goal of atLeast(GOALS, 4, "goals")) {
      expect(step7(goal, profiles.bigGpuRig).status, goal).toBe("waiting");
      expect(step7(goal, profiles.bigGpuRig, REAL), goal).toMatchObject({
        status: "skipped", skipReason: text7.disabled, commands: [], demoLabel: null,
      });
    }
  });

  it("keeps step 7 out of the plan hash in both cases", () => {
    for (const p of [profiles.midPc, profiles.bigGpuRig]) {
      for (const goal of atLeast(GOALS, 4, "goals")) {
        const r = recFor(goal, p);
        expect(buildPlan(goal, p, r, catalog, {}, undefined, REAL).planHash, goal)
          .toBe(buildPlan(goal, p, r, catalog, {}, undefined, { goals: withoutBoth }).planHash);
      }
    }
  });

  it("covers both branches across the mock PCs", () => {
    const all = Object.values(profiles);
    atLeast(all.filter((p) => step7("chat", p).skipReason !== null), 2, "PCs where step 7 is not needed");
    atLeast(all.filter((p) => step7("chat", p).skipReason === null), 1, "PCs where step 7 would be offered");
  });

  it("leaves demo mode unchanged", () => {
    for (const [name, p] of atLeast(Object.entries(profiles), 5, "profiles")) {
      for (const goal of GOALS) {
        const [demo, plain] = [step7(goal, p, DEMO), step7(goal, p)];
        expect(demo, `${goal}:${name}`).toMatchObject({ status: plain.status, skipReason: plain.skipReason, commands: plain.commands });
      }
    }
  });
});

describe("T5b wording", () => {
  it("step 8 says plainly that other devices won't work yet, without jargon", () => {
    const t = explanations.steps["remote-access"].disabled!;
    expect(t).toMatch(/^Using your AI from your other devices isn't available yet/);
    expect(t).toMatch(/For now, your AI works on this PC only\. There's nothing to do here\.$/);
    expect(t).not.toMatch(/\b(commands?|sharing)\b/i);
  });

  it("step 7 tells the user there is nothing to do", () => {
    expect(text7.disabled).toMatch(/^Your PC could use the speed boost, but it isn't ready in this version\./);
    expect(text7.disabled).toMatch(/just without the extra speed\. There's nothing to do here\.$/);
  });

  it("the context caveat gives both numbers in tokens, says why, and says nothing needs doing", () => {
    const note = contextNote(8192)!;
    expect(note).toMatch(/at least 64000 tokens; this PC is set to 8192 tokens to fit its memory\./);
    expect(note).toMatch(/may not work well here\. You don't need to do anything\.$/);
    expect(note).not.toMatch(/tool use|\d,\d/);
  });

  it("the context caveat makes no claim about what still works (T5d: the docs don't say)", () => {
    for (const ctx of atLeast([...new Set(catalog.models.flatMap((m) => m.contextOptions))], 4, "context sizes")) {
      const note = contextNote(ctx)!;
      expect(note, String(ctx)).not.toMatch(/\b(still|works?\s+fine|chat\w*|anyway|instead)\b/i);
      expect(note.match(/\bwork\w*/gi), String(ctx)).toEqual(["work", "work"]); // "work best", "may not work well"
    }
  });

  it("explains 'token' and 'context' in the glossary, each in one plain sentence", () => {
    const terms: Record<string, string> = glossary.terms;
    for (const term of atLeast(["token", "context"], 2, "terms")) {
      expect(terms[term], term).toMatch(/^[A-Z][^.!?]*\.$/);
    }
    // T5c: accurate, not just short: a token is often a whole word, not always part of one.
    expect(terms.token).toMatch(/\bwhole word\b/);
  });
});
