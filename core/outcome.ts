// How a finished run becomes a manifest record status, an ErrorCode and a fixed detail text
// (CONTRACTS.md "Executor"). Pure. Never looks at output, so no output can reach a message.
// A non-zero exit may still have changed the PC (e.g. a partial winget install): D46.
import { COMMANDS } from "./commands/whitelist";
import type { CommandId, ErrorCode, ExecDetail, ExecOutcome, ExecResult } from "./types";

const fail = (code: ErrorCode, detail: ExecDetail): ExecOutcome => ({ status: "failed", code, detail });

export function outcomeFor(commandId: CommandId, r: ExecResult): ExecOutcome {
  const spec = Object.hasOwn(COMMANDS, commandId) ? COMMANDS[commandId] : undefined;
  if (!spec) return fail("COMMAND_FAILED", "commandFailed");
  if (r.cancelled) return fail("CANCELLED", "cancelled");
  if (r.timedOut) return fail("TIMEOUT", r.killConfirmed === true ? "timedOut" : "timedOutMayRun");
  switch (r.spawnError) {
    case "refused": return fail("COMMAND_FAILED", "exeUnconfirmed");
    case "not-found": return spec.exe === "winget" ? fail("NO_WINGET", "notFound") : fail("COMMAND_FAILED", "notFound");
    case "invalid":
    case "other": return fail("COMMAND_FAILED", "commandFailed");
    case null: break;
  }
  if (r.exitCode === 0) return { status: "done", code: null, detail: null };
  // No invented winget exit codes: every other non-zero exit is a plain failure.
  return commandId === "ollama.pull" ? fail("DOWNLOAD_INTERRUPTED", "downloadInterrupted") : fail("COMMAND_FAILED", "commandFailed");
}
