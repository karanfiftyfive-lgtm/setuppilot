// Demo-mode constants and the mock PCs. Everything here is simulated: no real scan, no server.
import { catalog, explanations, goals } from "../../../core/data";
import type { BuildOptions, Goal, GoalId, MachineProfile } from "../../../core/types";
import weakLaptop from "../../../data/mock-profiles/weak-laptop.json";
import midPc from "../../../data/mock-profiles/mid-pc.json";
import gpuRig from "../../../data/mock-profiles/gpu-rig.json";
import bigGpuRig from "../../../data/mock-profiles/big-gpu-rig.json";
import upgradedPc from "../../../data/mock-profiles/upgraded-pc.json";

export { catalog, explanations };

/** "Demo mode: simulated", from data/explanations.json; shown on every screen. */
export const DEMO_LABEL = explanations.labels.demo;

/** Demo mode: nothing is disabled (every step is simulated) and every runnable step is labelled. */
export const DEMO_OPTS: BuildOptions = { demo: true, disabledSteps: [] };

export type ProfileId = "weak-laptop" | "mid-pc" | "gpu-rig" | "big-gpu-rig" | "upgraded-pc";

export const PROFILES: { id: ProfileId; name: string; profile: MachineProfile }[] = [
  { id: "weak-laptop", name: "Older laptop", profile: weakLaptop as unknown as MachineProfile },
  { id: "mid-pc", name: "Everyday PC", profile: midPc as unknown as MachineProfile },
  { id: "gpu-rig", name: "Gaming PC", profile: gpuRig as unknown as MachineProfile },
  { id: "big-gpu-rig", name: "Big gaming PC", profile: bigGpuRig as unknown as MachineProfile },
  { id: "upgraded-pc", name: "The older PC, upgraded", profile: upgradedPc as unknown as MachineProfile },
];

export function profileById(id: ProfileId): MachineProfile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown demo profile "${id}"`);
  return p.profile;
}

export function goalById(id: GoalId): Goal {
  const g = goals.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown goal "${id}"`);
  return g;
}

export const ALL_GOALS: GoalId[] = goals.map((g) => g.id);

/** One plain line about a mock PC, e.g. "8 GB memory, built-in graphics, 22 GB free disk". */
export function profileSummary(p: MachineProfile): string {
  const card = p.gpus.find((g) => g.discrete);
  const graphics = card ? `graphics card with ${card.vramGb ?? "unknown"} GB of its own memory` : "built-in graphics only";
  return `${p.ramGb.total} GB memory, ${graphics}, ${p.diskFreeGb} GB free disk`;
}
