import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "../core/data";
import { recommend, usableMemory } from "../core/recommend";
import { atLeast, gpuProfile, makeProfile, profiles } from "./fixtures";

const tag = (r: ReturnType<typeof recommend>) => r.model.ollamaTag;

describe("recommend: mock profiles", () => {
  it("weak-laptop (5 GB free RAM) gets the 1B tier and the weak-PC path", () => {
    const r = recommend(profiles.weakLaptop, catalog, "chat");
    expect(r.usableMemoryGb).toBe(3.2);
    expect(tag(r)).toBe("gemma3:1b");
    expect(r.model.tier).toBe("1b");
    expect(r.weakPc?.options).toEqual(["small-model", "remote-machine", "upgrade-tips"]);
  });

  it("weak-laptop asking for code falls back to the 1B model when no coding model fits", () => {
    const r = recommend(profiles.weakLaptop, catalog, "code");
    expect(tag(r)).toBe("gemma3:1b");
    expect(r.weakPc).not.toBeNull();
  });

  it("mid-pc (11 GB free RAM) gets the 7-8B tier, slow on CPU, smaller context", () => {
    const chat = recommend(profiles.midPc, catalog, "chat");
    const code = recommend(profiles.midPc, catalog, "code");
    expect(tag(chat)).toBe("llama3.1:8b");
    expect(tag(code)).toBe("qwen2.5-coder:7b");
    expect(code.model.tier).toBe("8b");
    expect(code.memorySource).toBe("ram");
    expect(code.speed).toEqual({ label: "slow", isEstimate: true });
    expect(code.context).toBe(4096);
    expect(code.weakPc).toBeNull();
  });

  it("gpu-rig (12 GB VRAM) gets the 14B tier with the default context", () => {
    const chat = recommend(profiles.gpuRig, catalog, "chat");
    const code = recommend(profiles.gpuRig, catalog, "code");
    expect(tag(chat)).toBe("phi4:14b");
    expect(tag(code)).toBe("qwen2.5-coder:14b");
    expect(code.memorySource).toBe("vram");
    expect(code.context).toBe(8192);
  });

  it("upgraded-pc (integrated graphics + RTX 3060 12 GB) uses the discrete card: 14B tier", () => {
    const r = recommend(profiles.upgradedPc, catalog, "code");
    expect(r.memorySource).toBe("vram");
    expect(r.usableMemoryGb).toBe(12);
    expect(tag(r)).toBe("qwen2.5-coder:14b");
  });

  it("big-gpu-rig (24 GB VRAM) gets gemma3:27b for chat, with no higher tier", () => {
    const r = recommend(profiles.bigGpuRig, catalog, "chat");
    expect(tag(r)).toBe("gemma3:27b");
    expect(r.nextTier).toBeNull();
  });
});

describe("recommend: tier boundaries", () => {
  it("VRAM exactly at the 8B need (6.5 + 0.5 = 7.0) fits; 6.9 does not", () => {
    expect(tag(recommend(gpuProfile(7.0), catalog, "code"))).toBe("qwen2.5-coder:7b");
    expect(tag(recommend(gpuProfile(6.9), catalog, "code"))).toBe("qwen3:4b");
  });

  it("free RAM 10.77 GB (usable 7.0) reaches 8B; 10.0 GB (usable 6.5) does not", () => {
    const at = makeProfile(profiles.midPc, { ramGb: { total: 16, free: 10.77 } });
    const below = makeProfile(profiles.midPc, { ramGb: { total: 16, free: 10 } });
    expect(recommend(at, catalog, "chat").usableMemoryGb).toBe(7);
    expect(tag(recommend(at, catalog, "chat"))).toBe("llama3.1:8b");
    expect(tag(recommend(below, catalog, "chat"))).toBe("qwen3:4b");
  });

  it("never picks a model that needs a discrete GPU on a CPU-only machine", () => {
    const p = makeProfile(profiles.midPc, { ramGb: { total: 64, free: 32 } });
    const r = recommend(p, catalog, "chat");
    expect(r.model.requiresDiscreteGpu).toBe(false);
    expect(tag(r)).toBe("phi4:14b");
  });
});

describe("recommend: edge cases", () => {
  it("0 GB free RAM still offers the smallest model and the weak-PC path", () => {
    const p = makeProfile(profiles.midPc, { ramGb: { total: 16, free: 0 } });
    const r = recommend(p, catalog, "chat");
    expect(r.usableMemoryGb).toBe(0);
    expect(tag(r)).toBe("gemma3:1b");
    expect(r.weakPc).not.toBeNull();
    expect(r.context).toBe(2048);
    expect(r.warnings.some((w) => /memory/i.test(w))).toBe(true);
  });

  it("uses the discrete GPU when integrated graphics are listed first", () => {
    const p = makeProfile(profiles.midPc, {
      gpus: [
        { name: "Intel UHD", vendor: "intel", discrete: false, vramGb: 2, vramSource: "wmi" },
        { name: "RTX 3050", vendor: "nvidia", discrete: true, vramGb: 8, vramSource: "nvidia-smi" },
      ],
    });
    const r = recommend(p, catalog, "code");
    expect(r.memorySource).toBe("vram");
    expect(r.usableMemoryGb).toBe(8);
    expect(tag(r)).toBe("qwen2.5-coder:7b");
  });

  it("falls back to RAM and warns when a discrete GPU's memory is unknown", () => {
    const r = recommend(gpuProfile(null), catalog, "chat");
    expect(r.memorySource).toBe("ram");
    expect(r.warnings.some((w) => /graphics card/i.test(w))).toBe(true);
  });

  it("a manual VRAM override wins over detection", () => {
    const r = recommend(gpuProfile(null, { vramOverrideGb: 8 }), catalog, "code");
    expect(r.memorySource).toBe("vram");
    expect(tag(r)).toBe("qwen2.5-coder:7b");
  });

  it("very low disk (6 GB) picks a smaller model and explains why", () => {
    const r = recommend(makeProfile(profiles.midPc, { diskFreeGb: 6 }), catalog, "code");
    expect(tag(r)).toBe("qwen3:4b");
    expect(r.diskShortfallGb).toBeNull();
    expect(r.warnings.some((w) => /disk/i.test(w))).toBe(true);
  });

  it("disk too small for any model (2 GB) reports how much more is needed", () => {
    const r = recommend(makeProfile(profiles.midPc, { diskFreeGb: 2 }), catalog, "code");
    expect(tag(r)).toBe("gemma3:1b");
    expect(r.diskShortfallGb).toBe(1.8);
  });

  it("does not count the Ollama install against disk when Ollama is already installed", () => {
    const installed = makeProfile(profiles.gpuRig, { diskFreeGb: 11.5 });
    const missing = makeProfile(profiles.gpuRig, {
      diskFreeGb: 11.5,
      ollama: { installed: false, version: null, running: false, models: [] },
    });
    expect(tag(recommend(installed, catalog, "code"))).toBe("qwen2.5-coder:14b");
    expect(tag(recommend(missing, catalog, "code"))).toBe("qwen2.5-coder:7b");
  });
});

describe("recommend: next tier and honesty", () => {
  it("tells a RAM-only PC what unlocks the next tier, in RAM and GPU terms", () => {
    const next = recommend(profiles.midPc, catalog, "code").nextTier;
    expect(next?.model.ollamaTag).toBe("qwen2.5-coder:14b");
    expect(next?.needsUsableGb).toBe(11);
    expect(next?.unlockHint).toContain("17 GB of free memory");
    expect(next?.unlockHint).toContain("11 GB");
  });

  it("tells a GPU PC it needs about 19 GB of graphics memory for 27B", () => {
    const next = recommend(profiles.gpuRig, catalog, "chat").nextTier;
    expect(next?.model.ollamaTag).toBe("gemma3:27b");
    expect(next?.unlockHint).toBe("a graphics card with about 19 GB of its own memory (estimate)");
  });

  it("labels speed as an estimate and never gives a numeric range", () => {
    for (const p of atLeast(Object.values(profiles), 5, "profiles")) {
      const r = recommend(p, catalog, "chat");
      expect(r.speed.isEstimate).toBe(true);
      expect(r.speed).not.toHaveProperty("tokPerSecRange");
    }
  });
});

describe("recommend: determinism and purity", () => {
  it("gives the same output for the same input", () => {
    for (const p of atLeast(Object.values(profiles), 5, "profiles")) {
      expect(recommend(p, catalog, "code")).toEqual(recommend(structuredClone(p), catalog, "code"));
    }
  });

  it("does not mutate its inputs", () => {
    const p = structuredClone(profiles.upgradedPc);
    const c = structuredClone(catalog);
    recommend(p, c, "any");
    usableMemory(p, c);
    expect(p).toEqual(profiles.upgradedPc);
    expect(c).toEqual(catalog);
  });

  it("core/ uses no clock, randomness or I/O", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk(join(__dirname, "..", "core"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const banned = /Date\.now|new Date|Math\.random|performance\.now|crypto|from "node:|from "fs"|require\(|process\.|fetch\(/;
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(banned);
  });
});
