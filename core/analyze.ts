// Re-analyze: what changed on the PC, and which bigger models that unlocks.
import { explanations } from "./data";
import { diskNeededGb, modelFits, recommend, unlockHint, usableMemory, type ModelUse } from "./recommend";
import type { Catalog, MachineProfile, Model, ProfileChange, UpgradeLadder, UpgradeRung } from "./types";

const round1 = (x: number) => Math.round(x * 10) / 10;
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
const vram = (v: number | null) => (v === null ? "memory unknown" : `${v} GB`);

export function diffProfiles(before: MachineProfile, after: MachineProfile): ProfileChange[] {
  const changes: ProfileChange[] = [];
  const add = (field: string, from: string, to: string, text: string) => changes.push({ field, from, to, text });

  if (before.ramGb.total !== after.ramGb.total) {
    const [a, b] = [before.ramGb.total, after.ramGb.total];
    add("ramGb.total", `${a}`, `${b}`, `RAM ${a} → ${b} GB`);
  }
  if (before.cpu.name !== after.cpu.name) add("cpu.name", before.cpu.name, after.cpu.name, `New processor: ${after.cpu.name}`);

  // Only discrete cards matter for the AI; integrated graphics share RAM.
  const oldGpus = new Map(before.gpus.filter((g) => g.discrete).map((g) => [g.name, g]));
  const newGpus = new Map(after.gpus.filter((g) => g.discrete).map((g) => [g.name, g]));
  for (const [name, g] of newGpus) {
    const old = oldGpus.get(name);
    if (!old) add("gpus", "none", name, `New graphics card: ${name}, ${vram(g.vramGb)}`);
    else if (old.vramGb !== g.vramGb) add("gpus", vram(old.vramGb), vram(g.vramGb), `${name}: ${vram(old.vramGb)} → ${vram(g.vramGb)}`);
  }
  for (const name of oldGpus.keys()) {
    if (!newGpus.has(name)) add("gpus", name, "none", `Graphics card removed: ${name}`);
  }

  // Small swings in free disk are normal; report only big ones.
  if (Math.abs(after.diskFreeGb - before.diskFreeGb) >= 10) {
    add("diskFreeGb", `${before.diskFreeGb}`, `${after.diskFreeGb}`, `Free disk ${before.diskFreeGb} → ${after.diskFreeGb} GB`);
  }
  if (!before.ollama.installed && after.ollama.installed) add("ollama.installed", "no", "yes", "Ollama is now installed");
  return changes;
}

const tierIndex = (catalog: Catalog, m: Model) => catalog.tiers.findIndex((t) => t.id === m.tier);

function rungFor(model: Model, profile: MachineProfile, catalog: Catalog): UpgradeRung {
  const fit = modelFits(model, profile, catalog);
  const tier = catalog.tiers[tierIndex(catalog, model)]!;
  let needs: string | null = null;
  if (!fit.memory) {
    needs = unlockHint(model, catalog, usableMemory(profile, catalog).source);
  } else if (!fit.disk) {
    needs = `about ${round1(diskNeededGb(model, profile, catalog) - profile.diskFreeGb)} GB more free disk space (estimate)`;
  }
  return { model, fitsNow: fit.memory && fit.disk, gain: tier.gainNote, needs, isEstimate: true };
}

export function buildLadder(
  before: MachineProfile,
  after: MachineProfile,
  currentModelId: string | null,
  catalog: Catalog,
  use: ModelUse,
): UpgradeLadder {
  const current = catalog.models.find((m) => m.id === currentModelId) ?? null;
  const from = current ? tierIndex(catalog, current) : -1;
  const suits = (m: Model) => use === "any" || m.goals.includes(use);

  // One rung per higher tier: the biggest model for the goal that fits now, else the easiest to reach.
  const rungs = catalog.tiers.slice(from + 1).flatMap((tier) => {
    const inTier = catalog.models.filter((m) => m.tier === tier.id);
    const pool = inTier.some(suits) ? inTier.filter(suits) : inTier;
    const bySize = [...pool].sort((a, b) => a.minMemoryGb - b.minMemoryGb || a.parametersB - b.parametersB);
    const fitting = bySize.filter((m) => { const f = modelFits(m, after, catalog); return f.memory && f.disk; });
    const pick = fitting.at(-1) ?? bySize[0];
    return pick ? [rungFor(pick, after, catalog)] : [];
  });

  return { changes: diffProfiles(before, after), current, rungs, tips: tips(after, catalog, use, rungs), keepOldModelAsRollback: true };
}

function tips(profile: MachineProfile, catalog: Catalog, use: ModelUse, rungs: UpgradeRung[]): string[] {
  const t = explanations.tips;
  const out: string[] = [];
  const mem = usableMemory(profile, catalog);
  // Numbers come only from the scan: memory other programs are using right now.
  const inUse = round1(profile.ramGb.total - profile.ramGb.free);
  if (mem.source === "ram" && inUse >= 2) out.push(fill(t.closePrograms, { inUseGb: inUse }));

  const blocked = rungs.find((r) => !r.fitsNow);
  if (blocked && !rungs.some((r) => r.fitsNow)) {
    const needGb = round1(blocked.model.minMemoryGb + catalog.safetyMarginGb);
    if (mem.source === "ram" && !blocked.model.requiresDiscreteGpu) {
      out.push(fill(t.addRam, { needGb: Math.ceil(needGb / catalog.ramUsableFraction) }));
    }
    out.push(fill(t.addGpu, { needGb: Math.ceil(needGb), model: blocked.model.displayName }));
  }
  if (recommend(profile, catalog, use).weakPc) out.push(t.remoteMachine);
  return out;
}
