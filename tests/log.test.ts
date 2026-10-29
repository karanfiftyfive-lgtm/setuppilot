// Phase 2 T7: the Logger (queue, failures, caps, rotation, rejected entries, tail).
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Logger, MAX_ENTRY_BYTES, MAX_FILE_BYTES, MAX_TAIL, MAX_TOTAL_BYTES, REJECTED_MARKER, type LogEntry, type LogProblem } from "../server/log";
import { atLeast } from "./fixtures";
import { fixedClock, LOG_DIR, MemFs, T0 } from "./log-helpers";

const entry = (i: number): LogEntry => ({ event: "command.output", runId: "run-1", stepId: "download-model", line: `line ${i}` });
function setup(fs = new MemFs(), clock = fixedClock(T0)) {
  const problems: LogProblem[] = [];
  return { fs, problems, log: new Logger(LOG_DIR, { fs, clock, onProblem: (p) => problems.push(p) }) };
}

describe("writing", () => {
  it("appends JSON lines to <logDir>/<UTC date>.log, creating the folder", async () => {
    const { fs, log } = setup();
    log.write({ event: "run.start", runId: "run-1" });
    await log.flush();
    expect(fs.dirs.has(LOG_DIR)).toBe(true);
    expect(fs.lines("2026-10-30.log")).toEqual([{ at: "2026-10-30T12:00:00.000Z", event: "run.start", runId: "run-1" }]);
  });

  it("uses the injected clock: 23:59:59 and 00:00:00 UTC go to different files", async () => {
    let now = Date.UTC(2026, 9, 30, 23, 59, 59);
    const { fs, log } = setup(new MemFs(), { now: () => now });
    log.write(entry(1));
    now = Date.UTC(2026, 9, 31, 0, 0, 0);
    log.write(entry(2));
    await log.flush();
    expect(fs.lines("2026-10-30.log").map((l) => l.line)).toEqual(["line 1"]);
    expect(fs.lines("2026-10-31.log").map((l) => l.line)).toEqual(["line 2"]);
  });

  it("one queue: 300 simultaneous writes never overlap and every line stays whole and in order", async () => {
    const { fs, log } = setup();
    const n = atLeast(Array.from({ length: 300 }, (_, i) => i), 300, "writes");
    for (const i of n) log.write(entry(i));
    await log.flush();
    expect(fs.maxActive).toBe(1);
    expect(fs.lines("2026-10-30.log").map((l) => l.line)).toEqual(n.map((i) => `line ${i}`));
  });

  it("neutralises newlines and bidi in a line, so it can't forge a second log line", async () => {
    const { fs, log } = setup();
    log.write({ event: "command.output", line: `ok${String.fromCodePoint(0x0a)}{"event":"run.end"}${String.fromCodePoint(0x202e)}x` });
    await log.flush();
    const raw = fs.allText();
    expect(raw.split("\n").filter(Boolean)).toHaveLength(1);
    expect(fs.lines("2026-10-30.log")[0]!.line).toBe(`ok {"event":"run.end"} x`);
  });
});

describe("failures never reach the caller and are reported once", () => {
  const failures: [string, (fs: MemFs) => void][] = [
    ["write fails (EIO)", (fs) => { fs.failAppend = Object.assign(new Error("io"), { code: "EIO" }); }],
    ["disk full (ENOSPC)", (fs) => { fs.failAppend = Object.assign(new Error("full"), { code: "ENOSPC" }); }],
    ["folder can't be created", (fs) => { fs.failMkdir = Object.assign(new Error("denied"), { code: "EACCES" }); }],
  ];
  it.each(failures)("%s: no throw, flush resolves, one report for 20 lines", async (_n, breakIt) => {
    const { fs, log, problems } = setup();
    breakIt(fs);
    expect(() => { for (let i = 0; i < 20; i++) log.write(entry(i)); }).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
    expect(problems).toEqual(["write-failed"]);
    expect(log.report().failedWrites).toBe(20);
  });
  it("checked every failure", () => atLeast(failures, 3, "failures"));

  it("reports again only after a success in between (a new failure streak)", async () => {
    const { fs, log, problems } = setup();
    fs.failAppend = new Error("io");
    log.write(entry(1));
    await log.flush();
    fs.failAppend = null;
    log.write(entry(2));
    await log.flush();
    fs.failAppend = new Error("io");
    log.write(entry(3));
    log.write(entry(4));
    await log.flush();
    expect(problems).toEqual(["write-failed", "write-failed"]);
  });

  it("a throwing problem reporter doesn't break writing either", async () => {
    const fs = new MemFs();
    fs.failAppend = new Error("io");
    const log = new Logger(LOG_DIR, { fs, clock: fixedClock(T0), onProblem: () => { throw new Error("reporter broke"); } });
    expect(() => log.write(entry(1))).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });
});

describe("rejected entries", () => {
  it("never throw: one fixed marker line per rejected entry, none of its data, reported once, counted", async () => {
    const { fs, log, problems } = setup();
    const bad = [
      { event: "command.start", command: { commandId: "ollama.list", exe: "ollama", args: ["rm", "SECRET-ARG"], display: "ollama rm SECRET-ARG" } },
      { event: "approval", body: "SECRET-BODY" },
      { exitCode: 0, timedOut: false, env: "SECRET-ENV" },
    ] as unknown as LogEntry[];
    expect(() => bad.forEach((b) => log.write(b))).not.toThrow();
    log.write(entry(9));
    await log.flush();
    const lines = fs.lines("2026-10-30.log");
    expect(lines.slice(0, 3)).toEqual(Array(3).fill({ at: "2026-10-30T12:00:00.000Z", ...REJECTED_MARKER }));
    expect(lines[3]!.line).toBe("line 9"); // the run goes on
    expect(fs.allText()).not.toMatch(/SECRET/);
    expect(problems).toEqual(["entry-rejected"]);
    expect(log.report().rejected).toBe(3);
  });
});

describe("size caps and rotation (no file is ever deleted)", () => {
  it("cuts a long line so the entry fits 8 KiB", async () => {
    const { fs, log } = setup();
    log.write({ event: "command.output", line: "x".repeat(50_000) });
    await log.flush();
    const raw = fs.allText().trimEnd();
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(MAX_ENTRY_BYTES);
    expect(fs.lines("2026-10-30.log")[0]!.line).toMatch(/ \[cut\]$/);
  });

  it("rotates to .1 when a file would pass 5 MiB, up to .9, then drops and reports once", async () => {
    const { fs, log, problems } = setup();
    fs.extraSize.set(resolve(LOG_DIR, "2026-10-30.log"), MAX_FILE_BYTES - 10);
    log.write(entry(1));
    await log.flush();
    expect(fs.lines("2026-10-30.1.log").map((l) => l.line)).toEqual(["line 1"]);
    for (let n = 1; n <= 9; n++) fs.extraSize.set(resolve(LOG_DIR, `2026-10-30.${n}.log`), MAX_FILE_BYTES);
    const fresh = setup(fs);
    for (let i = 0; i < 5; i++) fresh.log.write(entry(i));
    await fresh.log.flush();
    expect(fresh.problems).toEqual(["cap-reached"]);
    expect(fresh.log.report().dropped).toBe(5);
    expect(problems).toEqual([]);
  });

  it("stops at 100 MiB for all log files together", async () => {
    const { fs, log, problems } = setup();
    fs.extraSize.set(resolve(LOG_DIR, "2026-01-01.log"), MAX_TOTAL_BYTES - 50);
    log.write(entry(1));
    log.write(entry(2));
    await log.flush();
    expect(fs.files.size).toBe(0);
    expect(problems).toEqual(["cap-reached"]);
    expect(log.report().dropped).toBe(2);
  });
});

describe("only inside the logs folder", () => {
  it("writes nothing when the logs folder is a link to somewhere else (junction)", async () => {
    const { fs, log, problems } = setup();
    fs.realpaths.set(LOG_DIR, resolve("C:/Windows/System32"));
    log.write(entry(1));
    await log.flush();
    expect(fs.files.size).toBe(0);
    expect(problems).toEqual(["unsafe-path"]);
  });
});

describe("tail(n): the last n entries, no path input", () => {
  it("returns the newest entries across files, oldest first, at most 500", async () => {
    let now = Date.UTC(2026, 9, 29, 12);
    const { log } = setup(new MemFs(), { now: () => now });
    for (let i = 0; i < 3; i++) log.write(entry(i));
    now = Date.UTC(2026, 9, 30, 12);
    for (let i = 3; i < 6; i++) log.write(entry(i));
    await log.flush();
    expect((await log.tail(4)).map((e) => e.line)).toEqual(["line 2", "line 3", "line 4", "line 5"]);
    expect(await log.tail(0)).toEqual([]);
    expect(log.tail.length).toBe(1); // one parameter: a count, never a path
    for (let i = 0; i < 600; i++) log.write(entry(i));
    await log.flush();
    expect(await log.tail(10_000)).toHaveLength(MAX_TAIL);
  });
});

describe("real disk (temp folder)", () => {
  it("writes whole JSON lines with node's fs", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "setuppilot-log-")), "logs");
    const log = new Logger(dir, { clock: fixedClock(T0) });
    for (let i = 0; i < 200; i++) log.write(entry(i));
    await log.flush();
    expect(readdirSync(dir)).toEqual(["2026-10-30.log"]);
    const lines = readFileSync(join(dir, "2026-10-30.log"), "utf8").split("\n").filter(Boolean);
    expect(lines.map((l) => (JSON.parse(l) as { line: string }).line)).toEqual(Array.from({ length: 200 }, (_, i) => `line ${i}`));
  });
});
