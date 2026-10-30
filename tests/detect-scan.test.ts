// Read-only scan for the demo (server/detect/scan.ts): fakes only, nothing real is started.
import { describe, expect, it } from "vitest";
import { recommend } from "../core/recommend";
import { catalog } from "../core/data";
import { buildConfig } from "../server/config";
import { FakeExecutor, type FakeScript } from "../server/executor/fake";
import { GPU_NOT_READ, parseNvidiaSmi, readGpuLines, scanPc, type ScanDeps } from "../server/detect/scan";
import { profileSummary, toScannedProfile } from "../ui/src/model/demo";
import { atLeast } from "./fixtures";
import { ManualClock, settle } from "./executor-helpers";

const GIB = 1024 ** 3;
const config = buildConfig("C:/Users/me", "real");
const fake = (over: Partial<ScanDeps> = {}): ScanDeps => ({
  totalmem: () => 16 * GIB, freemem: () => 9.44 * GIB,
  cpus: () => Array.from({ length: 12 }, () => ({ model: " AMD Ryzen 5 5600G " })),
  osVersion: () => "10.0.26100", arch: () => "x64",
  statfs: async () => ({ bavail: 100 * 1024 * 1024, bsize: 4096 }),   // 400 GiB
  exists: (p) => p.endsWith("ollama.exe"),
  gpuLines: async () => null,
  now: () => Date.UTC(2026, 9, 30, 12),
  ...over,
});

describe("scanPc (read-only)", () => {
  it("reads memory, processor, disk and installed programs into a profile", async () => {
    const p = await scanPc(config, fake());
    expect(p).toMatchObject({
      schemaVersion: 1, scannedAt: "2026-10-30T12:00:00.000Z",
      os: { name: "windows", version: "10.0.26100", arch: "x64" },
      cpu: { name: "AMD Ryzen 5 5600G", cores: 12, threads: 12 },
      ramGb: { total: 16, free: 9.4 }, diskFreeGb: 400,
      ollama: { installed: true, version: null, running: false, models: [] },
      tools: { winget: false, tailscale: false, tailscaleServe: null },
      isAdmin: false, internet: false, vramOverrideGb: null,
    });
  });

  it("never guesses the graphics card: unread means one 'not read' entry with unknown memory", async () => {
    for (const gpuLines of atLeast([async () => null, async () => [], async () => ["garbage"], async () => { throw new Error("x"); }], 4, "gpu failures")) {
      const p = await scanPc(config, fake({ gpuLines }));
      expect(p.gpus).toEqual([GPU_NOT_READ]);
    }
  });

  it("an unreadable disk counts as 0 GB free (nothing big is recommended), not a crash", async () => {
    const p = await scanPc(config, fake({ statfs: async () => { throw new Error("EACCES"); } }));
    expect(p.diskFreeGb).toBe(0);
  });

  it("the profile is accepted by the demo and by the decision engine", async () => {
    const p = await scanPc(config, fake({ gpuLines: async () => ["NVIDIA GeForce RTX 3060, 12288, 11000"] }));
    expect(toScannedProfile(JSON.parse(JSON.stringify(p)))).not.toBeNull();
    expect(recommend(p, catalog, "chat").memorySource).toBe("vram");
    expect(profileSummary(p)).toBe("16 GB memory, graphics card with 12 GB of its own memory, 400 GB free disk");
  });
});

describe("nvidia-smi output", () => {
  it("parses one or more cards and ignores anything else", () => {
    expect(parseNvidiaSmi(["NVIDIA GeForce RTX 3060, 12288, 11000", "NVIDIA RTX A2000, 6144, 6000", "", "No devices were found", "x, y, z"])).toEqual([
      { name: "NVIDIA GeForce RTX 3060", vendor: "nvidia", discrete: true, vramGb: 12, vramSource: "nvidia-smi" },
      { name: "NVIDIA RTX A2000", vendor: "nvidia", discrete: true, vramGb: 6, vramSource: "nvidia-smi" },
    ]);
  });
});

describe("readGpuLines runs only detect.gpu, through the executor", () => {
  it("returns the lines of a clean run, null otherwise, and starts nothing else", async () => {
    const runs: [FakeScript, string[] | null][] = [
      [{ lines: ["NVIDIA GeForce RTX 3060, 12288, 11000"], exitCode: 0 }, ["NVIDIA GeForce RTX 3060, 12288, 11000"]],
      [{ exitCode: 9 }, null],
      [{ spawnError: "ENOENT" }, null],
    ];
    for (const [script, expected] of atLeast(runs, 3, "runs")) {
      const clock = new ManualClock();
      const ex = new FakeExecutor({ "detect.gpu": script }, { clock });
      const done = readGpuLines(ex);
      await settle();
      clock.advance(0);
      expect(await done).toEqual(expected);
      expect(ex.started).toHaveLength(1); // exactly one program: detect.gpu
    }
  });
});

describe("the demo accepts only a well-formed saved scan", () => {
  it("rejects malformed files", () => {
    const good = { schemaVersion: 1, scannedAt: "2026-10-30T12:00:00.000Z", cpu: { name: "x" }, ramGb: { total: 8, free: 4 }, diskFreeGb: 10, gpus: [GPU_NOT_READ], ollama: { installed: false, models: [] } };
    expect(toScannedProfile(good)).not.toBeNull();
    for (const bad of atLeast([null, "x", {}, { ...good, schemaVersion: 2 }, { ...good, ramGb: { total: -1, free: 1 } }, { ...good, gpus: [] },
      { ...good, diskFreeGb: "lots" }, { ...good, ollama: { installed: "yes", models: [] } }, { ...good, gpus: [{ name: 1 }] }], 9, "bad files")) {
      expect(toScannedProfile(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("says 'graphics card not checked' when the card wasn't read", () => {
    expect(profileSummary({ ...(toScannedProfile({ schemaVersion: 1, scannedAt: "s", cpu: { name: "x" }, ramGb: { total: 8, free: 4 }, diskFreeGb: 10, gpus: [GPU_NOT_READ], ollama: { installed: false, models: [] } }))! }))
      .toBe("8 GB memory, graphics card not checked, 10 GB free disk");
  });
});
