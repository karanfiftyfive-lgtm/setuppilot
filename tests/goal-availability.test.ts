// Phase 2 T5c: the goal screen says plainly when part of a goal is off in this version.
import { describe, expect, it } from "vitest";
import { goalAvailability } from "../core/availability";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan } from "../core/goals";
import { recommend } from "../core/recommend";
import type { BuildOptions, GoalId, StepId } from "../core/types";
import { buildConfig } from "../server/config";
import { atLeast, profiles } from "./fixtures";

const optsFor = (mode: "real" | "demo"): BuildOptions => {
  const c = buildConfig("C:/Users/me", mode);
  return { disabledSteps: [...c.disabledSteps], demo: mode === "demo" };
};
const REAL = optsFor("real");
const DEMO = optsFor("demo");
const NOTE = "Not in this version: using your AI from your other devices. For now, it works on this PC only.";
const ALL: GoalId[] = ["chat", "code", "remote", "everything"];

describe("goalAvailability", () => {
  it("real mode: notes the missing part for 'remote' and 'everything'", () => {
    for (const goal of ["remote", "everything"] as const) {
      const a = goalAvailability(goal, REAL);
      expect(a.note, goal).toBe(NOTE);
      expect(a.note).toBe(explanations.goalNote.text.replace("{features}", explanations.goalNote.features["remote-access"]!));
      expect(a.disabledSteps, goal).toEqual(["speed-boost", "remote-access"]);
    }
  });

  it("real mode: no note for 'chat' or 'code' (the speed boost is an extra, not a promise)", () => {
    for (const goal of ["chat", "code"] as const) {
      expect(goalAvailability(goal, REAL), goal).toEqual({ goal, disabledSteps: ["speed-boost"], note: null });
    }
  });

  it("demo mode: no note on any goal, even if a disabled list is passed in", () => {
    for (const goal of atLeast(ALL, 4, "goals")) {
      expect(goalAvailability(goal, DEMO), goal).toEqual({ goal, disabledSteps: [], note: null });
      expect(goalAvailability(goal, { ...REAL, demo: true }).note, goal).toBeNull();
    }
  });

  it("follows the disabled list it is given, not a fixed one", () => {
    const without8 = REAL.disabledSteps!.filter((id) => id !== "remote-access");
    atLeast(without8, 1, "other disabled steps");
    expect(goalAvailability("remote", { disabledSteps: without8 }).note).toBeNull();
    expect(goalAvailability("everything", { disabledSteps: [] }).note).toBeNull();
    expect(goalAvailability("chat", { disabledSteps: ["remote-access"] }).note).toBeNull();
    expect(goalAvailability("remote", { disabledSteps: ["remote-access"] }).note).toBe(NOTE);
  });

  it("takes its wording from data/explanations.json, not from code (T5d)", () => {
    const saved = { ...explanations.goalNote, features: { ...explanations.goalNote.features } };
    try {
      explanations.goalNote.text = "Probe: {features}. Probe.";
      explanations.goalNote.features["remote-access"] = "probe feature";
      expect(goalAvailability("remote", REAL).note).toBe("Probe: probe feature. Probe.");
    } finally {
      Object.assign(explanations.goalNote, saved);
    }
    expect(goalAvailability("remote", REAL).note).toBe(NOTE);
    expect(explanations.goalNote.text).toMatch(/For now, it works on this PC only\.$/);
  });

  it("refuses a disabled step that has no note text, and an unknown step", () => {
    expect(() => goalAvailability("code", { disabledSteps: ["connect-coding-tool"] })).toThrow(/no goal-note text/);
    expect(() => goalAvailability("chat", { disabledSteps: ["teleport" as StepId] })).toThrow(/Unknown step/);
  });

  it("keeps the goal selectable: the rest of its plan still runs", () => {
    for (const goal of ["remote", "everything"] as const) {
      const r = recommend(profiles.midPc, catalog, goals.find((g) => g.id === goal)!.modelUse);
      const plan = buildPlan(goal, profiles.midPc, r, catalog, {}, undefined, REAL);
      atLeast(plan.steps.filter((s) => s.status === "waiting"), 4, `${goal} steps that run`);
    }
  });

  it("keeps the note out of goals.json (it would drift from the disabled list)", () => {
    for (const g of atLeast(goals, 4, "goals")) {
      expect(`${g.label} ${g.description}`, g.id).not.toMatch(/available|this version|coming|later/i);
    }
  });
});
