// Test helpers for the executors: a manual clock (no real waiting) and RealExecutor wired to an
// injected spawn that returns scripted FakeChild processes. Nothing here starts a real process.
import { renderCommand, renderContextFromCatalog } from "../core/commands/whitelist";
import { catalog } from "../core/data";
import type { RenderedCommand } from "../core/types";
import { buildConfig, type ServerConfig } from "../server/config";
import { FakeChild, FakeExecutor, type FakeScript } from "../server/executor/fake";
import { RealExecutor, type SpawnFn, type SpawnOptions } from "../server/executor/real";
import type { Clock, Executor } from "../server/executor/types";

export class ManualClock implements Clock {
  private t = 0;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();
  now(): number { return this.t; }
  setTimeout(fn: () => void, ms: number): number {
    this.timers.set(++this.seq, { at: this.t + Math.max(0, ms), fn });
    return this.seq;
  }
  clearTimeout(handle: unknown): void { this.timers.delete(handle as number); }
  /** Runs every timer due up to now + ms, in time order, including ones they schedule. */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.t = due[1].at;
      due[1].fn();
    }
    this.t = end;
  }
}

/** Lets pending promise callbacks run (uses setImmediate, which the manual clock never touches). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r));
}

const ctx = renderContextFromCatalog(catalog, catalog.models.map((m) => m.ollamaTag));
export const cmd = (id: string, params: Record<string, string | number> = {}): RenderedCommand => renderCommand(id, params, ctx);
export const TAG = catalog.models[0]!.ollamaTag;

const confirmed = (path: string) => ({ path, confirmed: true });
/** A real-mode config with every exe confirmed at its candidate path (tests only). */
export function confirmedConfig(overrides: Partial<Record<string, { path: string | null; confirmed: boolean }>> = {}): ServerConfig {
  const base = buildConfig("C:/Users/me", "real");
  const exes = Object.fromEntries(Object.entries(base.exes).map(([k, c]) => [k, confirmed(c.path!)]));
  return { ...base, exes: { ...exes, ...overrides } } as ServerConfig;
}

export interface Harness {
  executor: Executor;
  clock: ManualClock;
  children: () => FakeChild[];
  kills: () => number[];
}

export function fakeHarness(script: FakeScript, taskkillConfirmed = true): Harness {
  const clock = new ManualClock();
  const executor = new FakeExecutor({ default: script }, { clock, taskkillConfirmed });
  return { executor, clock, children: () => executor.started, kills: () => executor.kills };
}

export interface RealHarness extends Harness {
  calls: { path: string; args: string[]; opts: SpawnOptions }[];
}

export function realHarness(
  script: FakeScript,
  opts: { config?: ServerConfig; taskkillExit?: number; env?: Record<string, string | undefined> } = {},
): RealHarness {
  const clock = new ManualClock();
  const calls: RealHarness["calls"] = [];
  const children: FakeChild[] = [];
  const spawn: SpawnFn = (path, args, o) => {
    calls.push({ path, args, opts: o });
    if (/\\taskkill\.exe$/i.test(path)) {
      const exit = opts.taskkillExit ?? 0;
      if (exit === 0) children.find((c) => c.pid === Number(args[1]))?.killTree();
      return new FakeChild({ exitCode: exit }, clock);
    }
    const child = new FakeChild(script, clock);
    children.push(child);
    return child;
  };
  const executor = new RealExecutor(opts.config ?? confirmedConfig(), { spawn, platform: "win32", env: opts.env ?? {}, clock });
  const kills = () => calls.filter((c) => /\\taskkill\.exe$/i.test(c.path)).map((c) => Number(c.args[1]));
  return { executor, clock, children: () => children, kills, calls };
}
