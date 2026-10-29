// Log entries (CONTRACTS.md "Log"): structured only. The type allows no raw objects, and
// toRecord() checks every value again at run time, because a caller's types can lie.
import { STEP_DEFS } from "../../core/steps";
import type { ErrorCode, ExecDetail, ExecOutcome, ExecResult, RenderedCommand, StepId, StepStatus } from "../../core/types";
import { prepare } from "../executor/supervise";
import type { OutputLine } from "../executor/types";
import { cleanLine } from "./clean";

export type LogEvent = "run.start" | "run.end" | "step.start" | "step.end" | "command.start" | "command.end" | "command.output" | "approval";

export interface LogEntry {
  event: LogEvent;
  runId?: string;
  stepId?: StepId;
  item?: number;
  command?: RenderedCommand;
  status?: StepStatus;
  code?: ErrorCode;
  detail?: ExecDetail;
  exitCode?: number | null;
  timedOut?: boolean;
  cancelled?: boolean;
  truncated?: boolean;
  killConfirmed?: boolean | null;
  spawnError?: ExecResult["spawnError"];
  line?: string;
}

const EVENTS = new Set<string>(["run.start", "run.end", "step.start", "step.end", "command.start", "command.end", "command.output", "approval"] satisfies LogEvent[]);
const STATUSES = new Set<string>(["waiting", "running", "done", "failed", "skipped"] satisfies StepStatus[]);
const CODES = new Set<string>([
  "NO_INTERNET", "NO_WINGET", "NO_ADMIN", "LOW_DISK", "DOWNLOAD_INTERRUPTED", "OLLAMA_NOT_RUNNING",
  "COMMAND_FAILED", "TIMEOUT", "NOT_APPROVED", "SHARING_IN_USE", "CANCELLED",
] satisfies ErrorCode[]);
const DETAILS = new Set<string>([
  "exeUnconfirmed", "commandFailed", "notFound", "downloadInterrupted", "timedOut", "timedOutMayRun", "cancelled",
] satisfies ExecDetail[]);
const SPAWN_ERRORS = new Set<unknown>([null, "refused", "invalid", "not-found", "other"]);

const isBool = (v: unknown) => typeof v === "boolean";
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isCommand = (v: unknown): v is RenderedCommand =>
  isPlain(v) && Object.keys(v).sort().join(",") === "args,commandId,display,exe" && prepare(v as unknown as RenderedCommand) !== null;

const CHECKS: Record<keyof LogEntry, (v: unknown) => boolean> = {
  event: (v) => typeof v === "string" && EVENTS.has(v),
  runId: (v) => typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v),
  stepId: (v) => typeof v === "string" && Object.hasOwn(STEP_DEFS, v),
  item: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 10_000,
  command: isCommand,
  status: (v) => typeof v === "string" && STATUSES.has(v),
  code: (v) => typeof v === "string" && CODES.has(v),
  detail: (v) => typeof v === "string" && DETAILS.has(v),
  exitCode: (v) => v === null || Number.isInteger(v),
  timedOut: isBool, cancelled: isBool, truncated: isBool,
  killConfirmed: (v) => v === null || isBool(v),
  spawnError: (v) => SPAWN_ERRORS.has(v),
  line: (v) => typeof v === "string",
};

/**
 * The record to serialize, or null when the entry is not exactly a LogEntry: a class instance
 * (PrivateText, ChildEnv), an unknown key (a request body), a bad value, or no event.
 * `command` becomes its verified display string; `line` is cleaned. Never throws.
 */
export function toRecord(entry: unknown): Record<string, string | number | boolean | null> | null {
  try {
    if (!isPlain(entry) || !Object.hasOwn(entry, "event")) return null;
    const out: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (value === undefined) continue;
      if (!Object.hasOwn(CHECKS, key) || !CHECKS[key as keyof LogEntry](value)) return null;
      if (key === "command") out.command = (value as RenderedCommand).display;
      else if (key === "line") out.line = cleanLine(value as string);
      else out[key] = value as string | number | boolean | null;
    }
    return out;
  } catch {
    return null;
  }
}

// Builders for the runner: named fields only, so a raw result or env never passes through.
export const commandStart = (runId: string, stepId: StepId, command: RenderedCommand): LogEntry =>
  ({ event: "command.start", runId, stepId, command });

export function commandEnd(runId: string, stepId: StepId, command: RenderedCommand, r: ExecResult, o: ExecOutcome): LogEntry {
  return {
    event: "command.end", runId, stepId, command, status: o.status,
    exitCode: r.exitCode, timedOut: r.timedOut, cancelled: r.cancelled, truncated: r.truncated,
    killConfirmed: r.killConfirmed, spawnError: r.spawnError,
    ...(o.code ? { code: o.code } : {}), ...(o.detail ? { detail: o.detail } : {}),
  };
}

/** Private lines are never logged: null means "drop it". */
export function outputEntry(runId: string, stepId: StepId, line: OutputLine): LogEntry | null {
  if (line.private) return null;
  return { event: "command.output", runId, stepId, line: line.text };
}
