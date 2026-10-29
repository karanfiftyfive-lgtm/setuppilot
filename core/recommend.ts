// Picks the AI model for a machine. All thresholds come from data/catalog.json.
import { explanations } from "./data";
import type { Catalog, MachineProfile, Model, Recommendation } from "./types";

export type ModelUse = "chat" | "code" | "any";
const EPS = 1e-9;

/** Rounds down to 0.1 GB: cautious, and avoids float noise at tier boundaries. */
const floor1 = (x: number) => Math.floor(x * 10 + EPS) / 10;
const round1 = (x: number) => Math.round(x * 10) / 10;

export function usableMemory(profile: MachineProfile, catalog: Catalog) {
  const warnings: string[] = [];
  // A manual override wins: Windows can under-report VRAM above 4 GB.
  if (profile.vramOverrideGb !== null) {
    return { gb: floor1(profile.vramOverrideGb), source: "vram" as const, warnings };
  }
  // Integrated graphics share system RAM, so only discrete cards count. One card, no splitting.
  const discrete = profile.gpus.filter((g) => g.discrete);
  const known = discrete.map((g) => g.vramGb).filter((v): v is number => v !== null);
  if (known.length > 0) return { gb: floor1(Math.max(...known)), source: "vram" as const, warnings };
  if (discrete.length > 0) {
    warnings.push("I couldn't read your graphics card's memory. You can enter it by hand.");
  }
  // Without a usable GPU the model runs in RAM; keep room for Windows and open programs.
  return { gb: floor1(Math.max(0, profile.ramGb.free) * catalog.ramUsableFraction), source: "ram" as const, warnings };
}

export function diskNeededGb(model: Model, profile: MachineProfile, catalog: Catalog): number {
  const runtime = profile.ollama.installed ? 0 : catalog.runtimeDiskGb;
  return round1(model.q4SizeGb + runtime + catalog.diskReserveGb);
}

const tierIndex = (catalog: Catalog, model: Model) => catalog.tiers.findIndex((t) => t.id === model.tier);
const suits = (m: Model, use: ModelUse) => use === "any" || m.goals.includes(use);

/** Largest first; ties go to more parameters, then catalog order. */
function bySizeDesc(catalog: Catalog): Model[] {
  return catalog.models
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.minMemoryGb - a.m.minMemoryGb || b.m.parametersB - a.m.parametersB || a.i - b.i)
    .map((x) => x.m);
}

/** Whether a model fits this PC's memory and disk. Shared by recommend and the upgrade ladder. */
export function modelFits(model: Model, profile: MachineProfile, catalog: Catalog) {
  const mem = usableMemory(profile, catalog);
  return {
    // Model memory + safety margin within usable memory; the boundary itself counts as a fit.
    memory:
      model.minMemoryGb + catalog.safetyMarginGb <= mem.gb + EPS &&
      (!model.requiresDiscreteGpu || mem.source === "vram"),
    disk: diskNeededGb(model, profile, catalog) <= profile.diskFreeGb + EPS,
  };
}

export function recommend(profile: MachineProfile, catalog: Catalog, use: ModelUse): Recommendation {
  const mem = usableMemory(profile, catalog);
  const warnings = [...mem.warnings];
  const fitsMem = (m: Model) => modelFits(m, profile, catalog).memory;
  const fitsDisk = (m: Model) => modelFits(m, profile, catalog).disk;

  const ordered = bySizeDesc(catalog);
  const memoryBest = ordered.find((m) => fitsMem(m) && suits(m, use)) ?? ordered.find(fitsMem);
  // Prefer a model made for the goal; otherwise any model that fits beats nothing.
  let model =
    ordered.find((m) => fitsMem(m) && fitsDisk(m) && suits(m, use)) ?? ordered.find((m) => fitsMem(m) && fitsDisk(m));
  let diskShortfallGb: number | null = null;
  const fitsNothing = !model;

  if (memoryBest && model && model !== memoryBest) {
    warnings.push(
      `Free disk space is low (${profile.diskFreeGb} GB). A better model needs about ` +
        `${diskNeededGb(memoryBest, profile, catalog)} GB (estimate), so I chose a smaller one.`,
    );
  }
  if (!model) {
    // Always offer a path: the smallest model, plus what is missing.
    const smallest = [...ordered].reverse()[0]!;
    model = smallest;
    if (!memoryBest) warnings.push("Your PC's memory is almost full right now. Closing programs will help.");
    const short = round1(diskNeededGb(smallest, profile, catalog) - profile.diskFreeGb);
    if (short > 0) {
      diskShortfallGb = short;
      warnings.push(`Your disk is almost full. I need about ${short} GB more free space (estimate).`);
    }
  }

  const tier = catalog.tiers[tierIndex(catalog, model)]!;
  const lowestTier = tierIndex(catalog, model) === 0;
  const needed = model.minMemoryGb + catalog.safetyMarginGb;

  return {
    model,
    usableMemoryGb: mem.gb,
    memorySource: mem.source,
    why: fitsNothing
      ? `${model.displayName} is the smallest AI model, and your PC has little room right now.`
      : `${model.displayName} is the largest AI model that fits in your ` +
        `${mem.source === "vram" ? "graphics card's memory" : "free memory"} (${mem.gb} GB usable, estimate).`,
    speed: { label: tier.speedLabel[mem.source === "vram" ? "gpu" : "cpu"], isEstimate: true },
    context: pickContext(model, fitsNothing ? -1 : mem.gb - needed),
    nextTier: nextTier(model, catalog, use, mem.source),
    weakPc:
      lowestTier || fitsNothing
        ? { reason: explanations.weakPc.body, options: ["small-model", "remote-machine", "upgrade-tips"] }
        : null,
    diskShortfallGb,
    warnings,
  };
}

/** Default context, one option smaller when under 1 GB is left after the model (context uses memory). */
function pickContext(model: Model, headroomGb: number): number {
  const options = [...model.contextOptions].sort((a, b) => a - b);
  if (headroomGb < 0) return options[0]!;
  const i = options.indexOf(model.defaultContext);
  if (headroomGb < 1 - EPS && i > 0) return options[i - 1]!;
  return model.defaultContext;
}

/** The smallest model in a higher tier (made for the goal if possible) and what unlocks it. */
export function nextTier(model: Model, catalog: Catalog, use: ModelUse, source: "vram" | "ram") {
  const current = tierIndex(catalog, model);
  const higher = [...bySizeDesc(catalog)].reverse().filter((m) => tierIndex(catalog, m) > current);
  const next = higher.find((m) => suits(m, use)) ?? higher[0];
  if (!next) return null;
  const needsUsableGb = round1(next.minMemoryGb + catalog.safetyMarginGb);
  return { model: next, needsUsableGb, unlockHint: unlockHint(next, catalog, source) };
}

/** Plain words for the hardware a model needs, in the terms that apply to this PC. */
export function unlockHint(model: Model, catalog: Catalog, source: "vram" | "ram"): string {
  const needsUsableGb = round1(model.minMemoryGb + catalog.safetyMarginGb);
  const gpuHint = `a graphics card with about ${Math.ceil(needsUsableGb)} GB of its own memory`;
  // RAM path: usable memory is only a fraction of free RAM, so convert back to free RAM.
  const ramHint = `about ${Math.ceil(needsUsableGb / catalog.ramUsableFraction)} GB of free memory`;
  return `${model.requiresDiscreteGpu || source === "vram" ? gpuHint : `${ramHint}, or ${gpuHint}`} (estimate)`;
}
