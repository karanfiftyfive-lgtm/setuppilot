// Demo UI: the whole flow for every mock PC and every goal completes, required steps are never
// skippable, and every skipped step has a reason.
import { describe, expect, it } from "vitest";
import type { GoalId } from "../core/types";
import { COPY } from "../ui/src/model/copy";
import { ALL_GOALS, PROFILES, profileById, type ProfileId } from "../ui/src/model/demo";
import { approveAll, approveStep, demoPlan, nextWaiting, progressPercent, skipStep, startRun, stepCards } from "../ui/src/model/plan";
import { reanalyzeView } from "../ui/src/model/reanalyze";
import { scanView } from "../ui/src/model/scan";
import { atLeast } from "./fixtures";

const pairs = PROFILES.flatMap((p) => ALL_GOALS.map((g) => [p.id, g] as [ProfileId, GoalId]));

describe("whole demo flow, every profile x goal", () => {
  it.each(atLeast(pairs, 20, "profile/goal pairs"))("%s / %s: goal, scan, plan, run all, test, re-analyze", (pid, goal) => {
    const profile = profileById(pid);
    expect(() => scanView(goal, profile)).not.toThrow();
    const plan = demoPlan(goal, profile);
    const cards = atLeast(stepCards(plan), 6, "steps");

    let s = startRun(plan);
    for (const step of plan.steps.filter((x) => x.def.required)) expect(skipStep(plan, s, step.def.id), step.def.id).toBe(s);
    for (const step of plan.steps.filter((x) => x.status === "skipped")) expect(s.reasons[step.def.id], step.def.id).toBeTruthy();

    s = approveAll(plan, s);
    expect(nextWaiting(plan, s)).toBeNull();
    expect(progressPercent(plan, s)).toBe(100);
    for (const c of cards) {
      const st = s.status[c.id];
      expect(st === "done" || st === "skipped", c.id).toBe(true);
      // Required: never skipped by the user. Core may skip it as not needed, with its own reason.
      if (c.required) expect(st === "done" || (st === "skipped" && s.reasons[c.id] === c.skipReason), c.id).toBe(true);
      if (c.required) expect(s.reasons[c.id], c.id).not.toBe(COPY.plan.userSkipped);
      if (st === "skipped") expect(s.reasons[c.id], c.id).toBeTruthy();
    }
    expect(COPY.test.speed).toMatch(/Demo mode: simulated, not measured/);
    expect(() => reanalyzeView(goal, profile, profileById("upgraded-pc"))).not.toThrow();
  });

  it("'Review each step': approving and skipping every optional step also finishes, with reasons", () => {
    for (const [pid, goal] of atLeast(pairs, 20, "pairs")) {
      const plan = demoPlan(goal, profileById(pid));
      let s = startRun(plan);
      for (let id = nextWaiting(plan, s); id; id = nextWaiting(plan, s)) {
        const step = plan.steps.find((x) => x.def.id === id)!;
        s = step.def.required ? approveStep(plan, s, id) : skipStep(plan, s, id);
      }
      expect(progressPercent(plan, s), `${pid} ${goal}`).toBe(100);
      for (const st of plan.steps) {
        // Required: done, or skipped by core as not needed (its own reason); never by the user.
        if (st.def.required) expect(s.status[st.def.id] === "done" || s.reasons[st.def.id] === st.skipReason, st.def.id).toBe(true);
        if (st.def.required) expect(s.reasons[st.def.id], st.def.id).not.toBe(COPY.plan.userSkipped);
        else expect(s.reasons[st.def.id], `${pid} ${goal} ${st.def.id}`).toBeTruthy();
      }
    }
  });
});
