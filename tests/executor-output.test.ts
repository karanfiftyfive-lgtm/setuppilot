// Phase 2 T6: PrivateText, line splitting and the two output policies.
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { LineSplitter, MAX_LINE_CHARS, MAX_LOG_BYTES, OutputSink, PROGRESS_INTERVAL_MS, PrivateText, readPrivate } from "../server/executor/output";
import type { OutputLine } from "../server/executor/types";
import { atLeast } from "./fixtures";
import { ManualClock } from "./executor-helpers";

const SECRET = "OPENAI_API_KEY=sk-test-123";

describe("PrivateText", () => {
  it("shows as [hidden] however it is turned into text", () => {
    const t = new PrivateText(SECRET);
    // t.toString() directly too: String() and templates go through Symbol.toPrimitive instead (T6 mutation found it).
    const shown = atLeast([t.toString(), String(t), `${t}`, t + "", JSON.stringify(t), JSON.stringify({ line: t }), inspect(t), inspect({ t })], 8, "forms");
    for (const s of shown) expect(s).not.toContain("sk-test");
    expect(String(t)).toBe("[hidden]");
    expect(Object.keys(t)).toEqual([]);
    expect(JSON.stringify(structuredClone(t))).not.toContain("sk-test");
  });

  it("gives the text only to readPrivate", () => {
    expect(readPrivate(new PrivateText(SECRET))).toBe(SECRET);
  });
});

describe("LineSplitter", () => {
  it("splits on \\r\\n, \\r and \\n, and keeps an unfinished line for later", () => {
    const s = new LineSplitter();
    expect(s.push(Buffer.from("a\r\nb\rc\nd"))).toEqual(["a", "b", "c"]);
    expect(s.end()).toEqual(["d"]);
  });

  it("does not invent an empty line when \\r\\n is split across chunks", () => {
    const s = new LineSplitter();
    expect([...s.push(Buffer.from("one\r")), ...s.push(Buffer.from("\ntwo\n"))]).toEqual(["one", "two"]);
  });

  it("decodes a character split across chunks", () => {
    const e = String.fromCodePoint(0xe9);
    const bytes = Buffer.from(`caf${e}\n`, "utf8");
    const s = new LineSplitter();
    expect([...s.push(bytes.subarray(0, 4)), ...s.push(bytes.subarray(4))]).toEqual([`caf${e}`]);
  });

  it("caps a long line and never holds more than one line's worth of an unfinished one", () => {
    const s = new LineSplitter();
    expect(s.push(Buffer.from(`${"x".repeat(10_000)}\n`))[0]).toHaveLength(MAX_LINE_CHARS);
    for (let i = 0; i < 50; i++) s.push(Buffer.from("y".repeat(100_000)));
    expect(s.end()[0]).toHaveLength(MAX_LINE_CHARS);
  });
});

describe("OutputSink", () => {
  const sink = (policy: "log" | "progress", isPrivate = false) => {
    const clock = new ManualClock();
    const got: OutputLine[] = [];
    return { clock, got, s: new OutputSink({ policy, isPrivate, timeoutMs: 1000 }, (l) => got.push(l), clock) };
  };

  it("log: forwards every line until 1 MiB, then drops and marks truncated", () => {
    const { got, s } = sink("log");
    const line = "z".repeat(1024);
    for (let i = 0; i < 1100; i++) s.line(line);
    expect(got).toHaveLength(MAX_LOG_BYTES / 1024);
    expect(s.truncated).toBe(true);
  });

  it("progress: at most one line per interval, always the latest, and the last one on flush", () => {
    const { clock, got, s } = sink("progress");
    s.line("1");
    s.line("2");
    s.line("3");
    clock.advance(PROGRESS_INTERVAL_MS - 1);
    s.line("4");
    clock.advance(1);
    s.line("5");
    s.line("6");
    s.flush();
    expect(got.map((l) => (l.private ? "" : l.text))).toEqual(["1", "5", "6"]);
    expect(s.truncated).toBe(false);
  });

  it("wraps every line of a private command", () => {
    const { got, s } = sink("log", true);
    s.line(SECRET);
    expect(got[0]!.private).toBe(true);
    expect(JSON.stringify(got)).not.toContain("sk-test");
  });
});
