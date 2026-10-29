// Phase 2 T6: the fake and the real executor (injected spawn) go through the same supervisor:
// one table of cases, run against both.
import { describe, expect, it } from "vitest";
import type { ExecResult, RenderedCommand } from "../core/types";
import { MAX_LOG_BYTES, readPrivate } from "../server/executor/output";
import type { FakeScript } from "../server/executor/fake";
import { KILL_WAIT_MS } from "../server/executor/supervise";
import type { OutputLine } from "../server/executor/types";
import { atLeast } from "./fixtures";
import { cmd, fakeHarness, realHarness, settle, TAG, type Harness } from "./executor-helpers";

const LIST = cmd("ollama.list");               // log, 15 s
const PULL = cmd("ollama.pull", { tag: TAG });  // progress, 7200 s
const ENV = cmd("prerun.envQuery");            // privateOutput
const factories: [string, (s: FakeScript) => Harness][] = [["fake", (s) => fakeHarness(s)], ["real", (s) => realHarness(s)]];

async function start(h: Harness, c: RenderedCommand, ac = new AbortController()) {
  const lines: OutputLine[] = [];
  let result: ExecResult | null = null;
  void h.executor.run(c, (l) => lines.push(l), ac.signal).then((r) => (result = r));
  await settle();
  return { lines, ac, result: () => result };
}
const go = async (h: Harness, ms: number) => { h.clock.advance(ms); await settle(); };

describe.each(atLeast(factories, 2, "executors"))("%s executor, shared supervisor", (_name, make) => {
  it("runs a command to the end and forwards its lines", async () => {
    const h = make({ lines: ["one", "two"], exitCode: 0 });
    const r = await start(h, LIST);
    await go(h, 0);
    expect(r.result()).toEqual({ exitCode: 0, timedOut: false, cancelled: false, spawnError: null, truncated: false, killConfirmed: null });
    expect(r.lines).toEqual([{ private: false, text: "one" }, { private: false, text: "two" }]);
    expect(h.kills()).toEqual([]);
  });

  it("reports a non-zero exit as it is", async () => {
    const h = make({ exitCode: 3 });
    const r = await start(h, LIST);
    await go(h, 0);
    expect(r.result()).toMatchObject({ exitCode: 3, timedOut: false, killConfirmed: null });
  });

  it("times out after the spec's own timeout and kills only its own child", async () => {
    const h = make({ hang: true });
    const r = await start(h, LIST);
    await go(h, 14_999);
    expect(r.result()).toBeNull();
    await go(h, 1);
    expect(r.result()).toMatchObject({ timedOut: true, cancelled: false, exitCode: null, killConfirmed: true });
    expect(h.kills()).toEqual([h.children()[0]!.pid]);
    expect(h.kills()).not.toContain(process.pid);
  });

  it("cancels on the abort signal", async () => {
    const h = make({ hang: true });
    const r = await start(h, PULL);
    r.ac.abort();
    await go(h, 0); // the (fake) taskkill process reports its exit on the clock
    expect(r.result()).toMatchObject({ cancelled: true, timedOut: false, killConfirmed: true });
    expect(h.kills()).toEqual([h.children()[0]!.pid]);
  });

  it("starts nothing when cancelled before it begins", async () => {
    const h = make({ lines: ["x"] });
    const ac = new AbortController();
    ac.abort();
    const r = await start(h, LIST, ac);
    expect(r.result()).toMatchObject({ cancelled: true, exitCode: null });
    expect(h.children()).toEqual([]);
  });

  it("waits 5 s (injected clock) for a child that ignores the kill, then says the kill is unconfirmed", async () => {
    const h = make({ hang: true, ignoresKill: true });
    const r = await start(h, LIST);
    await go(h, 15_000);
    await go(h, KILL_WAIT_MS - 1);
    expect(r.result()).toBeNull();
    await go(h, 1);
    expect(r.result()).toMatchObject({ timedOut: true, killConfirmed: false });
  });

  it("never kills a child that has already exited (its pid may be reused)", async () => {
    const h = make({ closeDelayMs: 1000 }); // "exit" at once, output closes 1 s later
    const r = await start(h, LIST);
    await go(h, 0);
    r.ac.abort();
    await go(h, 1000);
    expect(h.kills()).toEqual([]);
    expect(r.result()).toMatchObject({ cancelled: true, killConfirmed: false });
  });

  it("progress: 100,000 lines forward a small bounded number, keep the latest, and nothing is killed", async () => {
    const lines = Array.from({ length: 100_000 }, (_, i) => `pulling ${i + 1}`);
    const h = make({ lines, exitCode: 0 });
    const r = await start(h, PULL);
    await go(h, 0);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.lines.at(-1)).toEqual({ private: false, text: "pulling 100000" });
    expect(r.result()).toEqual({ exitCode: 0, timedOut: false, cancelled: false, spawnError: null, truncated: false, killConfirmed: null });
    expect(h.kills()).toEqual([]);
  });

  it("log: stops forwarding past 1 MiB, marks it truncated, and lets the process finish", async () => {
    const lines = Array.from({ length: 1500 }, (_, i) => `${i}`.padEnd(1000, "x"));
    const h = make({ lines, exitCode: 0 });
    const r = await start(h, LIST);
    await go(h, 0);
    const sent = r.lines.reduce((n, l) => n + Buffer.byteLength(l.private ? "" : l.text), 0);
    expect(sent).toBeLessThanOrEqual(MAX_LOG_BYTES);
    expect(r.lines.length).toBeLessThan(1500);
    expect(r.result()).toMatchObject({ exitCode: 0, truncated: true, killConfirmed: null });
  });

  it("private output: lines arrive as PrivateText and the result holds no output", async () => {
    const marker = "SECRET_TOKEN=do-not-leak-7731";
    const h = make({ lines: [marker], exitCode: 0 });
    const r = await start(h, ENV);
    await go(h, 0);
    const line = r.lines[0]!;
    expect(line.private).toBe(true);
    expect(String(line.text)).toBe("[hidden]");
    expect(JSON.stringify(r.lines)).not.toContain("do-not-leak");
    expect(JSON.stringify(r.result())).not.toContain("do-not-leak");
    expect(line.private && readPrivate(line.text)).toBe(marker);
  });

  it.each([["ENOENT", "not-found"], ["EACCES", "other"]] as const)("a failed start (%s) is spawnError %s", async (code, kind) => {
    const h = make({ spawnError: code });
    const r = await start(h, LIST);
    await go(h, 0);
    expect(r.result()).toMatchObject({ spawnError: kind, exitCode: null, killConfirmed: null });
  });

  it("refuses a tampered or stored-kill command without starting anything", async () => {
    const h = make({ lines: ["x"] });
    const tampered = { ...LIST, args: ["rm", TAG] };
    const killCmd: RenderedCommand = { commandId: "proc.killTree", exe: "taskkill", args: ["/pid", "4321", "/t", "/f"], display: "taskkill /pid 4321 /t /f" };
    for (const c of atLeast([tampered, killCmd], 2, "bad commands")) {
      expect((await h.executor.run(c, () => {}, new AbortController().signal)).spawnError, c.commandId).toBe("invalid");
    }
    expect(h.children()).toEqual([]);
  });
});
