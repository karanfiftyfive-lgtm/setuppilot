// Demo-mode constants and the PCs to choose from: the sample PCs, plus this PC when
// `npm run demo:scan` has saved a read-only scan. No server, no network.
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

export type ProfileId = "this-pc" | "weak-laptop" | "mid-pc" | "gpu-rig" | "big-gpu-rig" | "upgraded-pc";
export interface ProfileChoice { id: ProfileId; name: string; profile: MachineProfile }

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** The saved scan, only if it has the shape the decision engine needs; anything else is ignored. */
export function toScannedProfile(raw: unknown): MachineProfile | null {
  const p = raw as MachineProfile | null;
  if (!p || typeof p !== "object" || p.schemaVersion !== 1 || typeof p.scannedAt !== "string") return null;
  if (!isNum(p.ramGb?.total) || !isNum(p.ramGb?.free) || !isNum(p.diskFreeGb) || !Array.isArray(p.gpus) || p.gpus.length === 0) return null;
  if (!p.gpus.every((g) => typeof g?.name === "string" && (g.vramGb === null || isNum(g.vramGb)))) return null;
  if (typeof p.ollama?.installed !== "boolean" || !Array.isArray(p.ollama.models) || typeof p.cpu?.name !== "string") return null;
  return p;
}

// Present only after `npm run demo:scan` (gitignored); an empty object otherwise.
const generated = import.meta.glob<{ default: unknown }>("../generated/this-pc.json", { eager: true });
const scanned = toScannedProfile(Object.values(generated)[0]?.default);

export const PROFILES: ProfileChoice[] = [
  ...(scanned ? [{ id: "this-pc" as const, name: `This PC (scanned ${scanned.scannedAt.slice(0, 10)})`, profile: scanned }] : []),
  { id: "weak-laptop", name: "Older laptop", profile: weakLaptop as unknown as MachineProfile },
  { id: "mid-pc", name: "Everyday PC", profile: midPc as unknown as MachineProfile },
  { id: "gpu-rig", name: "Gaming PC", profile: gpuRig as unknown as MachineProfile },
  { id: "big-gpu-rig", name: "Big gaming PC", profile: bigGpuRig as unknown as MachineProfile },
  { id: "upgraded-pc", name: "The older PC, upgraded", profile: upgradedPc as unknown as MachineProfile },
];

/** The PC the demo starts with: this PC when it was scanned, otherwise the older laptop. */
export const DEFAULT_PROFILE: ProfileId = PROFILES[0]!.id;

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

/** One plain line about a PC, e.g. "8 GB memory, built-in graphics only, 22 GB free disk". */
export function profileSummary(p: MachineProfile): string {
  const card = p.gpus.find((g) => g.discrete);
  const graphics = p.gpus.some((g) => g.vramSource === "none")
    ? "graphics card not checked"
    : card ? `graphics card with ${card.vramGb ?? "unknown"} GB of its own memory` : "built-in graphics only";
  return `${p.ramGb.total} GB memory, ${graphics}, ${p.diskFreeGb} GB free disk`;
}
