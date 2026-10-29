// Phase 2 T6: outcomeFor maps every run result to a record status, an ErrorCode and a fixed
// detail text (CONTRACTS.md "Executor").
import { describe, expect, it } from "vitest";
import { explanations } from "../core/data";
import { outcomeFor } from "../core/outcome";
import type { ExecDetail, ExecOutcome, ExecResult } from "../core/types";
import { atLeast } from "./fixtures";

const R = (p: Partial<ExecResult>): ExecResult =>
  ({ exitCode: null, timedOut: false, cancelled: false, spawnError: null, truncated: false, killConfirmed: null, ...p });
const F = (code: ExecOutcome["code"], detail: ExecDetail): ExecOutcome => ({ status: "failed", code, detail });

const table: [string, string, ExecResult, ExecOutcome][] = [
  ["exit 0", "ollama.list", R({ exitCode: 0 }), { status: "done", code: null, detail: null }],
  ["exit 0, output truncated", "ollama.list", R({ exitCode: 0, truncated: true }), { status: "done", code: null, detail: null }],
  ["unconfirmed exe", "ollama.install", R({ spawnError: "refused" }), F("COMMAND_FAILED", "exeUnconfirmed")],
  ["tampered command", "ollama.list", R({ spawnError: "invalid" }), F("COMMAND_FAILED", "commandFailed")],
  ["other start failure", "ollama.list", R({ spawnError: "other" }), F("COMMAND_FAILED", "commandFailed")],
  ["winget not found", "ollama.install", R({ spawnError: "not-found" }), F("NO_WINGET", "notFound")],
  ["ollama not found", "ollama.list", R({ spawnError: "not-found" }), F("COMMAND_FAILED", "notFound")],
  ["non-zero exit", "ollama.install", R({ exitCode: 1 }), F("COMMAND_FAILED", "commandFailed")],
  ["killed (exit null)", "ollama.list", R({ exitCode: null }), F("COMMAND_FAILED", "commandFailed")],
  ["pull stopped", "ollama.pull", R({ exitCode: 1 }), F("DOWNLOAD_INTERRUPTED", "downloadInterrupted")],
  ["timeout, kill confirmed", "ollama.list", R({ timedOut: true, killConfirmed: true }), F("TIMEOUT", "timedOut")],
  ["timeout, kill not confirmed", "ollama.install", R({ timedOut: true, killConfirmed: false }), F("TIMEOUT", "timedOutMayRun")],
  ["cancelled", "ollama.pull", R({ cancelled: true, killConfirmed: true }), F("CANCELLED", "cancelled")],
  ["unknown command id", "nope.nothing", R({ exitCode: 0 }), F("COMMAND_FAILED", "commandFailed")],
];

describe("outcomeFor", () => {
  it.each(table)("%s", (_name, id, result, expected) => {
    expect(outcomeFor(id, result)).toEqual(expected);
  });

  it("checked every case listed", () => {
    atLeast(table, 14, "cases");
  });

  it("has a plain text for every detail, and the unconfirmed-exe one differs from the generic one", () => {
    const details = explanations.execDetails;
    for (const d of atLeast(table.map(([, , , o]) => o.detail).filter((d): d is ExecDetail => d !== null), 10, "details")) {
      expect(details[d], d).toMatch(/^[A-Z].+\.$/);
    }
    expect(details.exeUnconfirmed).toBe("This program's location hasn't been confirmed on this PC yet.");
    expect(details.exeUnconfirmed).not.toBe(details.commandFailed);
    expect(new Set(Object.entries(details).filter(([k]) => k !== "_note").map(([, v]) => v)).size).toBe(7);
  });

  it("a failed run is never 'done', and a timeout never says the program stopped for sure unless the kill was confirmed", () => {
    for (const [, id, result, expected] of table) if (result.exitCode !== 0) expect(outcomeFor(id, result).status, id).toBe(expected.status);
    expect(outcomeFor("ollama.list", R({ timedOut: true, killConfirmed: null })).detail).toBe("timedOutMayRun");
  });
});
