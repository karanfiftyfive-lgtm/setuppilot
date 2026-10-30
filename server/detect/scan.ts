// Read-only scan of this PC for the demo (CONTRACTS.md "Read-only scan"). Changes nothing,
// installs nothing, no network. The only program it may start is the whitelisted read-only
// `detect.gpu` (nvidia-smi), and only through the executor, so every safety gate applies.
import { renderCommand, renderContextFromCatalog } from "../../core/commands/whitelist";
import { catalog } from "../../core/data";
import type { GpuInfo, MachineProfile } from "../../core/types";
import type { ServerConfig } from "../config";
import type { Executor } from "../executor/types";

export interface ScanDeps {
  totalmem(): number;
  freemem(): number;
  cpus(): { model: string }[];
  osVersion(): string;
  arch(): string;
  statfs(path: string): Promise<{ bavail: number; bsize: number }>;
  exists(path: string): boolean;
  gpuLines(): Promise<string[] | null>;   // null = couldn't read
  now(): number;
}

const GIB = 1024 ** 3;
const gib = (bytes: number) => Math.round((bytes / GIB) * 10) / 10;

export const GPU_NOT_READ: GpuInfo = { name: "Graphics card (not read)", vendor: "other", discrete: false, vramGb: null, vramSource: "none" };

/** "NVIDIA GeForce RTX 3060, 12288, 11000" lines -> GPUs; anything unparsable is ignored. */
export function parseNvidiaSmi(lines: readonly string[]): GpuInfo[] {
  const out: GpuInfo[] = [];
  for (const line of lines) {
    const m = /^\s*([^,]{1,120}),\s*(\d{1,7})\s*,\s*(\d{1,7})\s*$/.exec(line);
    if (!m) continue;
    out.push({ name: m[1]!.trim(), vendor: "nvidia", discrete: true, vramGb: Math.round((Number(m[2]) / 1024) * 10) / 10, vramSource: "nvidia-smi" });
  }
  return out;
}

/** Runs only `detect.gpu` and collects its public output lines; null if it didn't finish cleanly. */
export async function readGpuLines(executor: Executor): Promise<string[] | null> {
  const cmd = renderCommand("detect.gpu", {}, renderContextFromCatalog(catalog));
  const lines: string[] = [];
  const result = await executor.run(cmd, (l) => { if (!l.private) lines.push(l.text); }, new AbortController().signal);
  return result.exitCode === 0 ? lines : null;
}

const exists = (deps: ScanDeps, path: string | null) => path !== null && deps.exists(path);

export async function scanPc(config: ServerConfig, deps: ScanDeps): Promise<MachineProfile> {
  const cpus = deps.cpus();
  let diskFreeGb = 0;
  try {
    const s = await deps.statfs(config.modelsDrive);
    diskFreeGb = gib(s.bavail * s.bsize);
  } catch { /* unreadable drive: 0 free, so nothing big is recommended */ }
  let lines: string[] | null = null;
  try { lines = await deps.gpuLines(); } catch { lines = null; }
  const nvidia = lines ? parseNvidiaSmi(lines) : [];
  return {
    schemaVersion: 1,
    scannedAt: new Date(deps.now()).toISOString(),
    os: { name: "windows", version: deps.osVersion(), arch: deps.arch() === "arm64" ? "arm64" : "x64" },
    cpu: { name: cpus[0]?.model.trim() || "Unknown processor", cores: cpus.length, threads: cpus.length },
    ramGb: { total: gib(deps.totalmem()), free: gib(deps.freemem()) },
    gpus: nvidia.length ? nvidia : [GPU_NOT_READ],
    diskFreeGb,
    ollama: { installed: exists(deps, config.exes.ollama?.path ?? null), version: null, running: false, models: [] },
    tools: { winget: exists(deps, config.exes.winget?.path ?? null), tailscale: exists(deps, config.exes.tailscale?.path ?? null), tailscaleServe: null },
    isAdmin: false,
    internet: false,
    vramOverrideGb: null,
  };
}
