// Phase 2 T7: the log accepts structured entries only (type-level and runtime guard).
import { describe, expect, it } from "vitest";
import { outcomeFor } from "../core/outcome";
import type { ExecResult } from "../core/types";
import { buildChildEnv } from "../server/executor/env";
import { PrivateText } from "../server/executor/output";
import { commandEnd, commandStart, outputEntry, toRecord, type LogEntry } from "../server/log/entry";
import { atLeast } from "./fixtures";
import { cmd } from "./executor-helpers";

const LIST = cmd("ollama.list");
const RESULT: ExecResult = { exitCode: 0, timedOut: false, cancelled: false, spawnError: null, truncated: false, killConfirmed: null };

describe("type-level guard (checked by tsc)", () => {
  it("rejects raw objects at compile time", () => {
    const log = (e: LogEntry) => e;
    // @ts-expect-error a raw executor result is not a LogEntry
    log(RESULT);
    // @ts-expect-error a child environment is not a LogEntry
    log(buildChildEnv({ PATH: "x" }));
    // @ts-expect-error a private line can't be a log line
    log({ event: "command.output", line: new PrivateText("secret") });
    // @ts-expect-error a request body with unknown fields
    log({ event: "approval", body: { approvalId: "x" } });
    // @ts-expect-error free text in place of a fixed event
    log({ event: "anything I like" });
    expect(true).toBe(true);
  });
});

describe("runtime guard", () => {
  const rejected: [string, unknown][] = [
    ["a raw executor result", RESULT],
    ["a raw result with an event added and an extra field", { event: "command.end", ...RESULT, env: { HTTPS_PROXY: "x" } }],
    ["a child environment", buildChildEnv({ HTTPS_PROXY: "http://a:b@c" })],
    ["a PrivateText", new PrivateText("secret")],
    ["a private line as line", { event: "command.output", line: new PrivateText("secret") }],
    ["a whole OutputLine as line", { event: "command.output", line: { private: false, text: "x" } }],
    ["a request body", { approvalId: "a1", hash: "b2" }],
    ["a request body with an event", { event: "approval", approvalId: "a1" }],
    ["free-text event", { event: "hello" }],
    ["no event", { runId: "r1" }],
    ["bad run id", { event: "run.start", runId: "../../etc" }],
    ["unknown step", { event: "step.start", stepId: "teleport" }],
    ["bad status", { event: "step.end", status: "exploded" }],
    ["bad error code", { event: "command.end", code: "PWNED" }],
    ["bad detail", { event: "command.end", detail: "free text" }],
    ["fractional exit code", { event: "command.end", exitCode: 1.5 }],
    ["tampered command", { event: "command.start", command: { ...LIST, args: ["rm", "x"] } }],
    ["command with an extra field", { event: "command.start", command: { ...LIST, env: "x" } }],
    ["a stored kill command", { event: "command.start", command: { commandId: "proc.killTree", exe: "taskkill", args: ["/pid", "4", "/t", "/f"], display: "taskkill /pid 4 /t /f" } }],
    ["an array", [{ event: "run.start" }]],
    ["null", null],
    ["a string", "run.start"],
    ["an object with another prototype", Object.assign(Object.create({ evil: 1 }), { event: "run.start" })],
  ];
  it.each(rejected)("rejects %s", (_n, entry) => {
    expect(toRecord(entry)).toBeNull();
  });
  it("checked every case", () => atLeast(rejected, 23, "rejected shapes"));

  it("accepts builder entries, logs the command's display and cleans the line", () => {
    expect(toRecord(commandStart("run-1", "download-model", LIST))).toEqual({ event: "command.start", runId: "run-1", stepId: "download-model", command: LIST.display });
    const end = toRecord(commandEnd("run-1", "download-model", LIST, RESULT, outcomeFor(LIST.commandId, RESULT)))!;
    expect(end).toMatchObject({ event: "command.end", status: "done", exitCode: 0, killConfirmed: null, spawnError: null });
    expect(Object.keys(end)).not.toContain("code");
    const line = toRecord(outputEntry("run-1", "download-model", { private: false, text: "see https://login.tailscale.com/a/1a2b3c4d5e" })!)!;
    expect(line.line).toBe("see [login link removed]");
  });

  it("drops private lines before they become entries", () => {
    expect(outputEntry("run-1", "safe-defaults", { private: true, text: new PrivateText("SECRET=1") })).toBeNull();
  });
});
