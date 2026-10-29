// Plan screen: step cards from core/goals.ts (demo mode) and a simulated run. Pure functions:
// the page only calls these. Nothing is ever executed; output lines come from demo-output.json.
import { buildPlan } from "../../../core/goals";
import type { GoalId, MachineProfile, Plan, StepId, StepStatus } from "../../../core/types";
import demoOutput from "../../../data/demo-output.json";
import { COPY } from "./copy";
import { catalog, DEMO_OPTS } from "./demo";
import { recommendFor } from "./scan";

export interface StepCardView {
  id: StepId;
  number: number;
  what: string;
  why: string;
  changes: string;
  required: boolean;
  requiredReason: string | null;
  skipReason: string | null;
  smallContext: string | null;   // coding goals: information only, never blocks the step
  osPromptWarning: string | null;
  commands: string[];            // rendered by core/commands, shown under "technical details"
  estimatedMinutes: number;
}

export function demoPlan(goal: GoalId, profile: MachineProfile): Plan {
  return buildPlan(goal, profile, recommendFor(goal, profile), catalog, {}, undefined, DEMO_OPTS);
}

export function stepCards(plan: Plan): StepCardView[] {
  return plan.steps.map((s, i) => ({
    id: s.def.id,
    number: i + 1,
    what: s.text.what,
    why: s.text.why,
    changes: s.text.changes,
    required: s.def.required,
    requiredReason: s.def.required ? (s.text.requiredReason ?? COPY.plan.requiredNote) : null,
    skipReason: s.skipReason,
    smallContext: s.text.smallContext ?? null,
    osPromptWarning: s.def.osPromptWarning && !s.skipReason ? COPY.plan.osPrompt : null,
    commands: s.commands.map((c) => c.display),
    estimatedMinutes: s.def.estimatedMinutes,
  }));
}

export interface RunState {
  status: Record<string, StepStatus>;
  reasons: Record<string, string>;   // why a step was skipped (core's reason or the user's choice)
  output: Record<string, string[]>;
}

export function startRun(plan: Plan): RunState {
  const state: RunState = { status: {}, reasons: {}, output: {} };
  for (const s of plan.steps) {
    state.status[s.def.id] = s.status;
    if (s.skipReason) state.reasons[s.def.id] = s.skipReason;
    state.output[s.def.id] = [];
  }
  return state;
}

const scripts = (demoOutput as { scripts: Record<string, { lines?: string[] }> }).scripts;

/** Simulated output for one step: every line is labelled, so it never reads as a real result. */
export function simulatedLines(plan: Plan, id: StepId): string[] {
  const step = plan.steps.find((s) => s.def.id === id);
  if (!step) return [];
  const ids = step.commands.length ? step.commands.map((c) => c.commandId) : ["default"];
  return ids.flatMap((c) => (scripts[c] ?? scripts.default)?.lines ?? []).map((l) => `[simulated] ${l}`);
}

/** Approve one waiting step: it "runs" (simulated) and is done. Anything else is unchanged. */
export function approveStep(plan: Plan, state: RunState, id: StepId): RunState {
  if (state.status[id] !== "waiting") return state;
  return {
    status: { ...state.status, [id]: "done" },
    reasons: state.reasons,
    output: { ...state.output, [id]: simulatedLines(plan, id) },
  };
}

/** Skip one waiting step. Required steps can never be skipped. */
export function skipStep(plan: Plan, state: RunState, id: StepId): RunState {
  const step = plan.steps.find((s) => s.def.id === id);
  if (!step || step.def.required || state.status[id] !== "waiting") return state;
  return { status: { ...state.status, [id]: "skipped" }, reasons: { ...state.reasons, [id]: COPY.plan.userSkipped }, output: state.output };
}

/** The next step waiting for approval, in plan order, or null when none is left. */
export function nextWaiting(plan: Plan, state: RunState): StepId | null {
  return plan.steps.find((s) => state.status[s.def.id] === "waiting")?.def.id ?? null;
}

export function approveAll(plan: Plan, state: RunState): RunState {
  let s = state;
  for (let id = nextWaiting(plan, s); id; id = nextWaiting(plan, s)) s = approveStep(plan, s, id);
  return s;
}

/** Share of steps finished (done or skipped), 0-100, rounded down. */
export function progressPercent(plan: Plan, state: RunState): number {
  const total = plan.steps.length;
  if (total === 0) return 100;
  const finished = plan.steps.filter((s) => state.status[s.def.id] === "done" || state.status[s.def.id] === "skipped").length;
  return Math.floor((finished / total) * 100);
}

export const isFinished = (plan: Plan, state: RunState) => nextWaiting(plan, state) === null;
