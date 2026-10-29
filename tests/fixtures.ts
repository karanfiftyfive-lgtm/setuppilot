// Mock profiles and small builders for tests.
import weakLaptop from "../data/mock-profiles/weak-laptop.json";
import midPc from "../data/mock-profiles/mid-pc.json";
import gpuRig from "../data/mock-profiles/gpu-rig.json";
import upgradedPc from "../data/mock-profiles/upgraded-pc.json";
import bigGpuRig from "../data/mock-profiles/big-gpu-rig.json";
import { expect } from "vitest";
import type { MachineProfile } from "../core/types";

const asProfile = (p: unknown) => p as MachineProfile;

export const profiles = {
  weakLaptop: asProfile(weakLaptop),
  midPc: asProfile(midPc),
  gpuRig: asProfile(gpuRig),
  upgradedPc: asProfile(upgradedPc),
  bigGpuRig: asProfile(bigGpuRig),
};

/** Deep-copies a base profile and applies overrides, so tests never mutate shared fixtures. */
export function makeProfile(
  base: MachineProfile = profiles.midPc,
  overrides: Partial<MachineProfile> = {},
): MachineProfile {
  return { ...structuredClone(base), ...structuredClone(overrides) };
}

/** A machine with only a discrete GPU of the given VRAM and plenty of everything else. */
export function gpuProfile(vramGb: number | null, extra: Partial<MachineProfile> = {}): MachineProfile {
  return makeProfile(profiles.gpuRig, {
    gpus: [{ name: "Test GPU", vendor: "nvidia", discrete: true, vramGb, vramSource: "mock" }],
    diskFreeGb: 500,
    ...extra,
  });
}

/** Guards loop-style tests: fails if fewer than `min` items were actually inspected. */
export function atLeast<T>(items: readonly T[], min: number, what = "items"): readonly T[] {
  expect(items.length, `expected at least ${min} ${what} to check`).toBeGreaterThanOrEqual(min);
  return items;
}
