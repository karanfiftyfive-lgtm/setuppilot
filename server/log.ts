// The run log (CONTRACTS.md "Log"): JSON Lines in <logDir>/<UTC date>[.n].log. One serialized
// write queue; logging can never throw into a run or change a command. Nothing is ever deleted.
import { dirname, join, resolve } from "node:path";
import { outcomeFor } from "../core/outcome";
import type { ExecResult, RenderedCommand, StepId } from "../core/types";
import type { OutputLine } from "./executor/types";
import { commandEnd, commandStart, outputEntry, toRecord, type LogEntry } from "./log/entry";
import { isLogFileName, logFileName, MAX_ROTATIONS, newestFirst, nodeLogFs, resolveLogFile, utcDate, utcIso, type LogFs } from "./log/files";

export type { LogEntry } from "./log/entry";
export const MAX_ENTRY_BYTES = 8 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_TAIL = 500;
export const REJECTED_MARKER = { event: "log.rejected", note: "a log entry was rejected" } as const;

export type LogProblem = "entry-rejected" | "write-failed" | "cap-reached" | "unsafe-path";
export interface LogReport { rejected: number; dropped: number; failedWrites: number }
export interface LogDeps { clock: { now(): number }; fs?: LogFs; onProblem?: (p: LogProblem) => void }

export class Logger {
  private queue: Promise<void> = Promise.resolve();
  private readonly fs: LogFs;
  private readonly reported = new Set<LogProblem>();
  private readonly counts: LogReport = { rejected: 0, dropped: 0, failedWrites: 0 };
  private current: { date: string; n: number; size: number } | null = null;
  private total: number | null = null;

  constructor(private readonly logDir: string, private readonly deps: LogDeps) {
    this.fs = deps.fs ?? nodeLogFs;
  }

  /** Queues one entry. Returns at once and never throws; a bad entry becomes the fixed marker. */
  write(entry: LogEntry): void {
    const now = this.deps.clock.now();
    let record: Record<string, unknown> | null = toRecord(entry);
    if (!record) {
      this.counts.rejected++;
      this.problem("entry-rejected");
      record = { ...REJECTED_MARKER };
    }
    const text = fit({ at: utcIso(now), ...record });
    this.queue = this.queue.then(() => this.append(utcDate(now), text));
  }

  /** Resolves when everything queued so far has been written (or given up on). Never rejects. */
  flush(): Promise<void> {
    return this.queue;
  }

  report(): LogReport {
    return { ...this.counts };
  }

  /** The last n entries (n <= 500), newest last, across this folder's log files. No path input. */
  async tail(n: number): Promise<Record<string, unknown>[]> {
    const want = Math.max(0, Math.min(MAX_TAIL, Math.floor(n)));
    const dir = await this.safeDir().catch(() => null);
    if (!dir || want === 0) return [];
    const out: Record<string, unknown>[] = [];
    for (const name of (await this.fs.list(dir)).filter(isLogFileName).sort(newestFirst)) {
      const path = resolveLogFile(dir, name);
      if (!path) continue;
      const lines = (await this.fs.read(path)).split("\n").filter(Boolean).reverse();
      for (const l of lines) {
        try {
          out.push(JSON.parse(l) as Record<string, unknown>);
        } catch { /* a damaged line is skipped */ }
        if (out.length === want) return out.reverse();
      }
    }
    return out.reverse();
  }

  private async append(date: string, text: string): Promise<void> {
    try {
      const dir = await this.safeDir();
      if (!dir) return this.drop("unsafe-path");
      const bytes = Buffer.byteLength(text, "utf8") + 1;
      this.total ??= await this.sumExisting(dir);
      if (this.total + bytes > MAX_TOTAL_BYTES) return this.drop("cap-reached");
      if (this.current?.date !== date) this.current = { date, n: 0, size: await this.sizeOf(dir, date, 0) };
      while (this.current.size + bytes > MAX_FILE_BYTES) {
        if (this.current.n >= MAX_ROTATIONS) return this.drop("cap-reached");
        this.current = { date, n: this.current.n + 1, size: await this.sizeOf(dir, date, this.current.n + 1) };
      }
      const path = resolveLogFile(dir, logFileName(date, this.current.n) ?? "");
      if (!path) return this.drop("unsafe-path");
      await this.fs.appendFile(path, `${text}\n`);
      this.current.size += bytes;
      this.total += bytes;
      this.reported.delete("write-failed"); // a new failure after a success is reported again
    } catch {
      this.counts.failedWrites++;
      this.problem("write-failed");
    }
  }

  /** The logs folder, created if missing, only if its last segment is not a link elsewhere. */
  private async safeDir(): Promise<string | null> {
    const dir = resolve(this.logDir);
    await this.fs.mkdir(dir);
    const real = await this.fs.realpath(dir);
    const expected = join(await this.fs.realpath(dirname(dir)), "logs");
    return resolve(real).toLowerCase() === resolve(expected).toLowerCase() ? real : null;
  }

  private async sizeOf(dir: string, date: string, n: number): Promise<number> {
    const path = resolveLogFile(dir, logFileName(date, n) ?? "");
    return path ? this.fs.size(path) : MAX_FILE_BYTES;
  }

  private async sumExisting(dir: string): Promise<number> {
    let sum = 0;
    for (const name of (await this.fs.list(dir)).filter(isLogFileName)) {
      const path = resolveLogFile(dir, name);
      if (path) sum += await this.fs.size(path);
    }
    return sum;
  }

  private drop(kind: LogProblem): void {
    this.counts.dropped++;
    this.problem(kind);
  }

  /** Each kind of problem is reported once (write failures: once per failure streak). */
  private problem(kind: LogProblem): void {
    if (this.reported.has(kind)) return;
    this.reported.add(kind);
    try {
      this.deps.onProblem?.(kind);
    } catch { /* a failing reporter must not break a run either */ }
  }
}

/** One JSON line within MAX_ENTRY_BYTES: the (already cleaned) line is cut to fit. */
function fit(record: Record<string, unknown>): string {
  let text = JSON.stringify(record);
  while (Buffer.byteLength(text, "utf8") > MAX_ENTRY_BYTES && typeof record.line === "string" && record.line.length > 0) {
    const over = Buffer.byteLength(text, "utf8") - MAX_ENTRY_BYTES;
    record = { ...record, line: `${(record.line as string).slice(0, Math.max(0, (record.line as string).length - over - 16))} [cut]` };
    text = JSON.stringify(record);
  }
  return Buffer.byteLength(text, "utf8") > MAX_ENTRY_BYTES ? JSON.stringify({ at: record.at, ...REJECTED_MARKER }) : text;
}

// The path the runner (T12) will use, so the log sees only builder-made entries.
export function loggingOnLine(log: Logger, runId: string, stepId: StepId, onLine: (l: OutputLine) => void): (l: OutputLine) => void {
  return (l) => {
    const e = outputEntry(runId, stepId, l);
    if (e) log.write(e);
    onLine(l);
  };
}

export function logCommandStart(log: Logger, runId: string, stepId: StepId, cmd: RenderedCommand): void {
  log.write(commandStart(runId, stepId, cmd));
}

export function logCommandEnd(log: Logger, runId: string, stepId: StepId, cmd: RenderedCommand, result: ExecResult): void {
  log.write(commandEnd(runId, stepId, cmd, result, outcomeFor(cmd.commandId, result)));
}
