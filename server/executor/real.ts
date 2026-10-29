// RealExecutor: the only module that starts processes, and the only server file that imports
// child_process (server/CLAUDE.md; tests/spawn-rule.test.ts). Real mode on Windows only.
import { spawn as nodeSpawn } from "node:child_process";
import { renderCommand, renderContextFromCatalog } from "../../core/commands/whitelist";
import { catalog } from "../../core/data";
import { baseOf, isSafePath } from "../../core/paths";
import type { ExecResult, RenderedCommand } from "../../core/types";
import type { ServerConfig } from "../config";
import { buildChildEnv, readChildEnv, type ChildEnv } from "./env";
import { prepare, supervise } from "./supervise";
import { notRun, realClock, type ChildLike, type Clock, type Executor, type OutputLine } from "./types";

export interface SpawnOptions {
  shell: false;
  windowsHide: true;
  stdio: ["ignore", "pipe", "pipe"];
  cwd: string;
  env: Record<string, string>;
}
export type SpawnFn = (path: string, args: string[], opts: SpawnOptions) => ChildLike;

export interface RealDeps {
  spawn?: SpawnFn;                                        // tests inject one; never a real process there
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;     // default: the server's own env
  clock?: Clock;
}

/**
 * The absolute path to run for an exe name, or null. Only a candidate the human confirmed on a
 * real machine, that is a safe absolute drive path named <exe>.exe. Never from a caller.
 */
export function exePath(config: ServerConfig, exe: string): string | null {
  const c = Object.hasOwn(config.exes, exe) ? config.exes[exe] : undefined;
  if (!c?.confirmed || !c.path) return null;
  if (!isSafePath(c.path)) return null; // drive paths only: no relative, UNC or device-name paths
  if (baseOf(c.path).toLowerCase() !== `${exe.toLowerCase()}.exe`) return null;
  return c.path.replace(/\//g, "\\");
}

export class RealExecutor implements Executor {
  private readonly spawn: SpawnFn;
  private readonly env: ChildEnv;
  private readonly clock: Clock;

  constructor(private readonly config: ServerConfig, deps: RealDeps = {}) {
    if (config.mode !== "real" || (deps.platform ?? process.platform) !== "win32") {
      throw new Error("RealExecutor runs only in real mode on Windows");
    }
    this.spawn = deps.spawn ?? ((path, args, opts) => nodeSpawn(path, args, opts) as unknown as ChildLike);
    this.env = buildChildEnv(deps.env ?? process.env);
    this.clock = deps.clock ?? realClock;
  }

  run(cmd: RenderedCommand, onLine: (l: OutputLine) => void, signal: AbortSignal): Promise<ExecResult> {
    const p = prepare(cmd);
    if (!p) return Promise.resolve(notRun("invalid"));
    const path = exePath(this.config, p.spec.exe);
    if (!path) return Promise.resolve(notRun("refused"));
    return supervise(() => this.spawn(path, [...cmd.args], this.options()), p.run, onLine, signal, this.clock,
      (pid, child) => this.killTree(pid, child));
  }

  private options(): SpawnOptions {
    return { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], cwd: this.config.dataDir, env: readChildEnv(this.env) };
  }

  /**
   * taskkill /pid <our child> /t /f. The pid is the supervisor's own child, put into the render
   * context here and nowhere else. child.kill() (direct child only) is used ONLY when taskkill's
   * own path is unconfirmed, and then the kill is never reported as confirmed.
   */
  private killTree(pid: number, child: ChildLike): Promise<"tree" | "fallback" | "failed"> {
    const path = exePath(this.config, "taskkill");
    if (!path) {
      child.kill();
      return Promise.resolve("fallback");
    }
    const cmd = renderCommand("proc.killTree", { pid }, { ...renderContextFromCatalog(catalog), ownChildPids: [pid] });
    return new Promise((resolve) => {
      let k: ChildLike;
      try {
        k = this.spawn(path, [...cmd.args], this.options());
      } catch {
        return resolve("failed");
      }
      k.on("error", () => resolve("failed"));
      k.on("close", (code: number | null) => resolve(code === 0 ? "tree" : "failed"));
    });
  }
}
