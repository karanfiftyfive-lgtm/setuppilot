// View models for the Goal and Scan screens. Pure: core/ decides, this only shapes text.
import { goalAvailability } from "../../../core/availability";
import { recommend } from "../../../core/recommend";
import type { GoalId, MachineProfile, Recommendation } from "../../../core/types";
import { speedText } from "./copy";
import { ALL_GOALS, catalog, DEMO_OPTS, explanations, goalById } from "./demo";

export interface GoalCard { id: GoalId; label: string; description: string; note: string | null }

/** The four goals; demo mode never shows the "not in this version" note (every step is simulated). */
export function goalCards(): GoalCard[] {
  return ALL_GOALS.map((id) => {
    const g = goalById(id);
    return { id, label: g.label, description: g.description, note: goalAvailability(id, DEMO_OPTS).note };
  });
}

export const recommendFor = (goal: GoalId, profile: MachineProfile): Recommendation =>
  recommend(profile, catalog, goalById(goal).modelUse);

export interface SpecChip { key: "memory" | "disk" | "graphics" | "processor"; value: string }

/** The PC's main facts as short chips. The graphics card is never guessed. */
export function specChips(p: MachineProfile): SpecChip[] {
  const card = p.gpus.find((g) => g.discrete);
  const graphics = p.gpus.some((g) => g.vramSource === "none") ? "Not checked"
    : card ? `${card.name}, ${card.vramGb ?? "unknown"} GB` : "Built-in only";
  return [
    { key: "memory", value: `${p.ramGb.total} GB (${p.ramGb.free} GB free)` },
    { key: "disk", value: `${p.diskFreeGb} GB` },
    { key: "graphics", value: graphics },
    { key: "processor", value: p.cpu.name },
  ];
}

export interface ScanView {
  modelName: string;
  why: string;
  speed: string;
  nextTier: string | null;
  warnings: string[];
  weakPc: string | null;
}

export function scanView(goal: GoalId, profile: MachineProfile): ScanView {
  const r = recommendFor(goal, profile);
  return {
    modelName: r.model.displayName,
    why: r.why,
    speed: speedText(r.speed.label),
    nextTier: r.nextTier ? r.nextTier.unlockHint : null,
    warnings: [...r.warnings],
    // The title gives the body's "It" something to refer to (the body alone starts "It will be...").
    weakPc: r.weakPc ? `${explanations.weakPc.title}. ${r.weakPc.reason}` : null,
  };
}
