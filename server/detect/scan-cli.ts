// `npm run demo:scan`: read-only scan of this PC, saved for the demo UI as
// ui/src/generated/this-pc.json (gitignored). Changes nothing on the PC.
// The graphics card is read only in real mode on Windows (SETUPPILOT_MODE=real) with a
// confirmed nvidia-smi path in server/config.ts; otherwise it is reported as "not read".
import { existsSync, mkdirSync, statfsSync, writeFileSync } from "node:fs";
import { arch, cpus, freemem, release, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, startupCheck } from "../config";
import { createExecutor } from "../executor";
import { readGpuLines, scanPc } from "./scan";

async function main(): Promise<void> {
  const config = loadConfig();
  const gpuLines = async (): Promise<string[] | null> => {
    if (config.mode !== "real") return null; // demo mode never starts a program
    startupCheck(config);                     // creates SetupPilot's own folders (cwd for the executor)
    return readGpuLines(createExecutor(config));
  };
  const profile = await scanPc(config, {
    totalmem, freemem, cpus, osVersion: release, arch,
    statfs: async (p) => statfsSync(p),
    exists: (p) => existsSync(p),
    gpuLines,
    now: () => Date.now(),
  });
  const dir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "ui", "src", "generated");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "this-pc.json"), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  const g = profile.gpus[0]!;
  console.log("Read-only scan saved to ui/src/generated/this-pc.json (nothing on this PC was changed).");
  console.log(`  Memory: ${profile.ramGb.total} GB (${profile.ramGb.free} GB free)   Disk free on ${config.modelsDrive}: ${profile.diskFreeGb} GB`);
  console.log(`  Processor: ${profile.cpu.name} (${profile.cpu.threads} threads)`);
  console.log(`  Graphics: ${g.vramSource === "none" ? "not read" : `${g.name}, ${g.vramGb} GB`}   Ollama found: ${profile.ollama.installed ? "yes" : "no"}`);
  if (g.vramSource === "none") {
    console.log("  To read an NVIDIA card: confirm the nvidia-smi path in server/config.ts, then run with SETUPPILOT_MODE=real.");
  }
}

main().catch((e: unknown) => {
  console.error(`Scan failed: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
