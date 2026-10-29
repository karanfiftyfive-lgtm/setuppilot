// Shapes shared by both executors (CONTRACTS.md "Executor"). This file must never import
// child_process: only real.ts may (tests/spawn-rule.test.ts).
import type { EventEmitter } from "node:events";
import type { ExecResult, RenderedCommand } from "../../core/types";
import type { PrivateText } from "./output";

export type { ExecResult };

export type OutputLine = { private: false; text: string } | { private: true; text: PrivateText };

export interface Executor {
  run(cmd: RenderedCommand, onLine: (line: OutputLine) => void, signal: AbortSignal): Promise<ExecResult>;
}

/**
 * The part of a started process the supervisor uses. Node's ChildProcess fits it, and so does
 * the fake. Events: "error" (start failed), "exit" (process gone: its pid may be reused from
 * now on), "close" (process gone and its output fully read).
 */
export interface ChildLike extends EventEmitter {
  readonly pid?: number | undefined;
  readonly stdout: EventEmitter | null;
  readonly stderr: EventEmitter | null;
  kill(): boolean;
}

/** Ends the process tree of the supervisor's own child; "fallback" = child.kill() only. */
export type TreeKiller = (pid: number, child: ChildLike) => Promise<"tree" | "fallback" | "failed">;

/** Time source; tests inject a manual one, so no test waits for real seconds. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What the supervisor needs to know about a command; always derived from its CommandSpec. */
export interface RunSpec { policy: "log" | "progress"; isPrivate: boolean; timeoutMs: number }

export const notRun = (spawnError: NonNullable<ExecResult["spawnError"]>): ExecResult =>
  ({ exitCode: null, timedOut: false, cancelled: false, spawnError, truncated: false, killConfirmed: null });
