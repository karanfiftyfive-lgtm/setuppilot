// Phase 2 T6: RealExecutor rules (injected spawn: no real process is ever started here).
import { describe, expect, it } from "vitest";
import { buildConfig } from "../server/config";
import { createExecutor } from "../server/executor";
import { FakeExecutor } from "../server/executor/fake";
import { RealExecutor } from "../server/executor/real";
import { KILL_WAIT_MS } from "../server/executor/supervise";
import { atLeast } from "./fixtures";
import { cmd, confirmedConfig, realHarness, settle, TAG } from "./executor-helpers";

const run = (h: ReturnType<typeof realHarness>, c = cmd("ollama.list"), ac = new AbortController()) => {
  let result: unknown = null;
  void h.executor.run(c, () => {}, ac.signal).then((r) => (result = r));
  return { ac, result: () => result };
};

describe("RealExecutor: built only in real mode on Windows", () => {
  it("refuses to be built in demo mode or off Windows", () => {
    expect(() => new RealExecutor(buildConfig("C:/Users/me", "demo"), { platform: "win32" })).toThrow(/real mode on Windows/);
    expect(() => new RealExecutor(confirmedConfig(), { platform: "linux" })).toThrow(/real mode on Windows/);
  });

  it("createExecutor gives the fake unless the mode is real and the platform is Windows", () => {
    expect(createExecutor(buildConfig("C:/Users/me", "demo"), { platform: "win32" })).toBeInstanceOf(FakeExecutor);
    expect(createExecutor(confirmedConfig(), { platform: "linux" })).toBeInstanceOf(FakeExecutor);
    expect(createExecutor(confirmedConfig(), { platform: "win32", spawn: () => { throw new Error("no"); } })).toBeInstanceOf(RealExecutor);
  });
});

describe("RealExecutor: how a process is started", () => {
  it("uses the confirmed absolute path, the args unchanged, shell off and the window hidden", async () => {
    const h = realHarness({ exitCode: 0 });
    const c = cmd("ollama.pull", { tag: TAG });
    run(h, c);
    await settle();
    expect(h.calls).toHaveLength(1);
    const call = h.calls[0]!;
    expect(call.path).toBe("C:\\Users\\me\\AppData\\Local\\Programs\\Ollama\\ollama.exe");
    expect(call.args).toEqual(c.args);
    expect(call.args).not.toBe(c.args);
    expect(call.opts).toMatchObject({ shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], cwd: confirmedConfig().dataDir });
  });

  const bad: [string, { path: string | null; confirmed: boolean }][] = [
    ["unconfirmed (as shipped)", { path: "C:/Users/me/AppData/Local/Programs/Ollama/ollama.exe", confirmed: false }],
    ["no path", { path: null, confirmed: true }],
    ["a relative path", { path: "Ollama/ollama.exe", confirmed: true }],
    ["a different program's name", { path: "C:/Tools/notollama.exe", confirmed: true }],
    ["an unsafe path (device name)", { path: "C:/Tools/con/ollama.exe", confirmed: true }],
    ["a UNC path", { path: "//server/share/ollama.exe", confirmed: true }],
  ];
  it.each(bad)("refuses %s and starts nothing", async (_n, candidate) => {
    const h = realHarness({ exitCode: 0 }, { config: confirmedConfig({ ollama: candidate }) });
    const r = run(h);
    await settle();
    expect(r.result()).toMatchObject({ spawnError: "refused", exitCode: null });
    expect(h.calls).toEqual([]);
  });

  it("checked every bad candidate listed, and refuses everything with the shipped config", async () => {
    atLeast(bad, 6, "bad candidates");
    const h = realHarness({ exitCode: 0 }, { config: buildConfig("C:/Users/me", "real") });
    const r = run(h);
    await settle();
    expect(r.result()).toMatchObject({ spawnError: "refused" });
    expect(h.calls).toEqual([]);
  });

  it("a start that throws at once is spawnError 'other'", async () => {
    const ex = new RealExecutor(confirmedConfig(), { platform: "win32", env: {}, spawn: () => { throw new Error("EINVAL"); } });
    expect(await ex.run(cmd("ollama.list"), () => {}, new AbortController().signal)).toMatchObject({ spawnError: "other" });
  });
});

describe("RealExecutor: killing only its own child", () => {
  it("runs taskkill /pid <its child> /t /f from the confirmed taskkill path", async () => {
    const h = realHarness({ hang: true });
    const r = run(h);
    await settle();
    r.ac.abort();
    h.clock.advance(0);
    await settle();
    const tk = h.calls.find((c) => c.path.endsWith("taskkill.exe"))!;
    expect(tk.path).toBe("C:\\Windows\\System32\\taskkill.exe");
    expect(tk.args).toEqual(["/pid", String(h.children()[0]!.pid), "/t", "/f"]);
    expect(tk.opts).toMatchObject({ shell: false, windowsHide: true });
    expect(r.result()).toMatchObject({ cancelled: true, killConfirmed: true });
  });

  it("falls back to child.kill() only when taskkill is unconfirmed, and never claims a confirmed kill", async () => {
    const config = confirmedConfig({ taskkill: { path: "C:/Windows/System32/taskkill.exe", confirmed: false } });
    const h = realHarness({ hang: true }, { config });
    const r = run(h);
    await settle();
    r.ac.abort();
    await settle();
    expect(h.children()[0]!.killedBy).toBe("kill");
    expect(h.calls.some((c) => c.path.endsWith("taskkill.exe"))).toBe(false);
    expect(r.result()).toMatchObject({ cancelled: true, killConfirmed: false }); // even though the child did exit
  });

  it("does not fall back when a confirmed taskkill fails: waits 5 s, then reports the kill unconfirmed", async () => {
    const h = realHarness({ hang: true }, { taskkillExit: 128 });
    const r = run(h);
    await settle();
    r.ac.abort();
    h.clock.advance(0);
    await settle();
    expect(h.children()[0]!.killedBy).toBeNull();
    h.clock.advance(KILL_WAIT_MS);
    await settle();
    expect(r.result()).toMatchObject({ cancelled: true, killConfirmed: false });
  });
});
