import { describe, expect, it } from "vitest";
import { buildLadder, diffProfiles } from "../core/analyze";
import { catalog, explanations } from "../core/data";
import { recommend } from "../core/recommend";
import { atLeast, makeProfile, profiles } from "./fixtures";

describe("diffProfiles", () => {
  it("reports the RAM upgrade and the new graphics card for mid-pc -> upgraded-pc", () => {
    const texts = diffProfiles(profiles.midPc, profiles.upgradedPc).map((c) => c.text);
    expect(texts).toContain("RAM 16 → 32 GB");
    expect(texts).toContain("New graphics card: NVIDIA GeForce RTX 3060, 12 GB");
  });

  it("reports nothing when nothing changed", () => {
    expect(diffProfiles(profiles.midPc, structuredClone(profiles.midPc))).toEqual([]);
  });

  it("ignores integrated graphics and small swings in free disk", () => {
    const after = makeProfile(profiles.midPc, { diskFreeGb: 175 });
    expect(diffProfiles(profiles.midPc, after)).toEqual([]);
  });

  it("reports a removed graphics card and a VRAM change", () => {
    const smaller = makeProfile(profiles.gpuRig, {
      gpus: [{ ...profiles.gpuRig.gpus[0]!, vramGb: 8 }],
    });
    expect(diffProfiles(profiles.gpuRig, smaller).map((c) => c.text)).toEqual(["NVIDIA GeForce RTX 4070: 12 GB → 8 GB"]);
    expect(diffProfiles(profiles.gpuRig, profiles.midPc).map((c) => c.text)).toContain(
      "Graphics card removed: NVIDIA GeForce RTX 4070",
    );
  });
});

describe("buildLadder", () => {
  it("mid-pc -> upgraded-pc: the 14B coder fits now, 27B needs about 19 GB of graphics memory", () => {
    const l = buildLadder(profiles.midPc, profiles.upgradedPc, "qwen2.5-coder-7b", catalog, "code");
    expect(l.current?.ollamaTag).toBe("qwen2.5-coder:7b");
    expect(l.rungs.map((r) => [r.model.ollamaTag, r.fitsNow])).toEqual([
      ["qwen2.5-coder:14b", true],
      ["gemma3:27b", false],
    ]);
    expect(l.rungs[1]!.needs).toBe("a graphics card with about 19 GB of its own memory (estimate)");
    expect(l.keepOldModelAsRollback).toBe(true);
  });

  it("takes each rung's gain from the tier note and labels it an estimate", () => {
    const l = buildLadder(profiles.midPc, profiles.upgradedPc, "qwen2.5-coder-7b", catalog, "code");
    for (const r of atLeast(l.rungs, 2, "rungs")) {
      expect(r.gain).toBe(catalog.tiers.find((t) => t.id === r.model.tier)!.gainNote);
      expect(r.isEstimate).toBe(true);
    }
  });

  it("weak-laptop -> upgraded-pc (the demo path) unlocks three tiers at once", () => {
    const l = buildLadder(profiles.weakLaptop, profiles.upgradedPc, "gemma3-1b", catalog, "chat");
    expect(l.rungs.filter((r) => r.fitsNow).map((r) => r.model.tier)).toEqual(["3b", "8b", "14b"]);
    expect(l.changes.map((c) => c.text)).toContain("RAM 8 → 32 GB");
  });

  it("has no rungs when the current model is already the top tier", () => {
    const l = buildLadder(profiles.bigGpuRig, profiles.bigGpuRig, "gemma3-27b", catalog, "chat");
    expect(l.rungs).toEqual([]);
    expect(l.changes).toEqual([]);
  });

  it("starts from the lowest tier when there is no current model", () => {
    const l = buildLadder(profiles.midPc, profiles.midPc, null, catalog, "chat");
    expect(l.current).toBeNull();
    expect(l.rungs[0]!.model.tier).toBe("1b");
  });
});

describe("buildLadder: tips", () => {
  it("tells a RAM-only PC how much memory other programs use right now (from the scan)", () => {
    const l = buildLadder(profiles.midPc, profiles.midPc, "qwen2.5-coder-7b", catalog, "code");
    expect(l.tips).toContain(explanations.tips.closePrograms.replace("{inUseGb}", "5"));
  });

  it("suggests RAM or a graphics card when nothing higher fits", () => {
    const l = buildLadder(profiles.midPc, profiles.midPc, "qwen2.5-coder-7b", catalog, "code");
    expect(l.tips.some((t) => t.includes("17 GB free"))).toBe(true);
    expect(l.tips.some((t) => t.includes("graphics card with about 11 GB"))).toBe(true);
  });

  it("offers the stronger-computer option on a weak PC", () => {
    const l = buildLadder(profiles.weakLaptop, profiles.weakLaptop, "gemma3-1b", catalog, "chat");
    expect(l.tips).toContain(explanations.tips.remoteMachine);
  });

  it("gives no memory tips on a GPU PC where an upgrade already fits", () => {
    const l = buildLadder(profiles.midPc, profiles.upgradedPc, "qwen2.5-coder-7b", catalog, "code");
    expect(l.tips).toEqual([]);
  });

  it("leaves no unfilled placeholders, across every kind of tip", () => {
    // Current = what each PC got, so ladders above it are blocked and the templated tips appear.
    const tips = Object.values(profiles).flatMap((p) =>
      (["chat", "code"] as const).flatMap((use) => {
        const current = recommend(p, catalog, use).model.id;
        return buildLadder(p, p, current, catalog, use).tips;
      }));
    for (const t of atLeast(tips, 5, "tips")) expect(t).not.toMatch(/\{\w+\}/);
    for (const kind of ["You would need about", "A graphics card with about", "Other programs are using", "stronger computer"]) {
      expect(tips.some((t) => t.includes(kind)), kind).toBe(true);
    }
  });
});
