// FakeExecutor: tests and demo mode. Same supervisor path as RealExecutor (verification,
// timeout, cancel, caps); only the process is scripted. Never starts a real process.
import { EventEmitter } from "node:events";
import type { ExecResult, RenderedCommand } from "../../core/types";
import { prepare, supervise } from "./supervise";
import { notRun, realClock, type ChildLike, type Clock, type Executor, type OutputLine } from "./types";

export interface FakeScript {
  lines?: string[];
  exitCode?: number;
  delayMs?: number;          // before output and exit
  hang?: boolean;            // never exits by itself
  ignoresKill?: boolean;     // a kill doesn't end it (e.g. an elevated child)
  closeDelayMs?: number;     // gap between "exit" and "close"
  spawnError?: "ENOENT" | "EACCES";
}

let nextPid = 4000;

/** A scripted process. Emits the same events, in the same order, as a real ChildProcess. */
export class FakeChild extends EventEmitter implements ChildLike {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid: number | undefined;
  killedBy: "kill" | "tree" | null = null;
  private done = false;

  constructor(private readonly script: FakeScript, private readonly clock: Clock) {
    super();
    this.pid = script.spawnError ? undefined : nextPid++;
    clock.setTimeout(() => this.play(), script.delayMs ?? 0);
  }

  kill(): boolean {
    this.killedBy ??= "kill";
    if (!this.script.ignoresKill) this.end(null);
    return true;
  }

  /** What taskkill /t does to this child (the fake taskkill and FakeExecutor call it). */
  killTree(): void {
    this.killedBy = "tree";
    if (!this.script.ignoresKill) this.end(null);
  }

  private play(): void {
    if (this.script.spawnError) {
      this.emit("error", Object.assign(new Error("spawn failed"), { code: this.script.spawnError }));
      return;
    }
    if (this.script.lines?.length) this.stdout.emit("data", Buffer.from(`${this.script.lines.join("\n")}\n`, "utf8"));
    if (!this.script.hang) this.end(this.script.exitCode ?? 0);
  }

  private end(code: number | null): void {
    if (this.done) return;
    this.done = true;
    this.stdout.emit("end");
    this.stderr.emit("end");
    this.emit("exit", code);
    const close = () => this.emit("close", code);
    if (this.script.closeDelayMs) this.clock.setTimeout(close, this.script.closeDelayMs);
    else close();
  }
}

export interface FakeOptions { clock?: Clock; taskkillConfirmed?: boolean }

export class FakeExecutor implements Executor {
  readonly started: FakeChild[] = [];
  readonly kills: number[] = [];
  private readonly clock: Clock;
  private readonly taskkillConfirmed: boolean;

  constructor(private readonly scripts: Readonly<Record<string, FakeScript>>, opts: FakeOptions = {}) {
    this.clock = opts.clock ?? realClock;
    this.taskkillConfirmed = opts.taskkillConfirmed ?? true;
  }

  run(cmd: RenderedCommand, onLine: (l: OutputLine) => void, signal: AbortSignal): Promise<ExecResult> {
    const p = prepare(cmd);
    if (!p) return Promise.resolve(notRun("invalid"));
    const script = this.scripts[cmd.commandId] ?? this.scripts.default ?? {};
    const start = () => {
      const child = new FakeChild(script, this.clock);
      this.started.push(child);
      return child;
    };
    return supervise(start, p.run, onLine, signal, this.clock, async (pid, child) => {
      this.kills.push(pid);
      if (!this.taskkillConfirmed) {
        child.kill();
        return "fallback";
      }
      (child as FakeChild).killTree();
      return "tree";
    });
  }
}
