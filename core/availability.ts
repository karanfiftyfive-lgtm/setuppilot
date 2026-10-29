// Goal screen: which parts of a goal are switched off in this version, with a plain note.
// Takes the same BuildOptions as buildPlan, so it follows the server's real-mode disabledSteps
// and can't drift from it (the note is never written into goals.json).
import { explanations, goals as allGoals } from "./data";
import { STEP_DEFS } from "./steps";
import type { BuildOptions, GoalAvailability, GoalId, StepId } from "./types";

export function goalAvailability(goalId: GoalId, opts: BuildOptions = {}): GoalAvailability {
  const goal = (opts.goals ?? allGoals).find((g) => g.id === goalId);
  if (!goal) throw new Error(`Unknown goal "${goalId}"`);
  // Demo mode simulates every step, so nothing is missing there.
  if (opts.demo) return { goal: goalId, disabledSteps: [], note: null };
  const off = new Set<StepId>(opts.disabledSteps ?? []);
  for (const id of off) if (!Object.hasOwn(STEP_DEFS, id)) throw new Error(`Unknown step "${id}" in disabledSteps`);
  const disabledSteps = goal.stepIds.filter((id) => off.has(id));
  // Advanced extras (step 7) are never what a goal promises; they show their own reason instead.
  const missing = disabledSteps.filter((id) => !STEP_DEFS[id].advanced);
  if (missing.length === 0) return { goal: goalId, disabledSteps, note: null };
  const { text, features } = explanations.goalNote;
  const names = missing.map((id) => {
    const name = Object.hasOwn(features, id) ? features[id] : undefined;
    if (!name) throw new Error(`Step "${id}" has no goal-note text`);
    return name;
  });
  return { goal: goalId, disabledSteps, note: text.replace("{features}", names.join(" and ")) };
}
