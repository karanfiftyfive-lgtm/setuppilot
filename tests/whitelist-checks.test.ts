// Phase 2 T3: read-only checks, proc.killTree (own child only) and verifyRendered.
import { describe, expect, it } from "vitest";
import { WINGET_PACKAGES } from "../core/commands/checks";
import { verifyRendered } from "../core/commands/verify";
import { COMMANDS, renderCommand, renderContextFromCatalog, VERIFY_IN_PHASE_2, WhitelistError } from "../core/commands/whitelist";
import { catalog } from "../core/data";
import { changeFor, PROGRAMS } from "../core/manifest";
import type { RenderContext, RenderedCommand } from "../core/types";
import { atLeast } from "./fixtures";

const base = renderContextFromCatalog(catalog, ["qwen2.5:7b"]);
const withPid = (pid: number): RenderContext => ({ ...base, ownChildPids: [pid] });
const PID = 4321;
// One valid param set per command that takes params; everything else takes none.
const PARAMS: Record<string, Record<string, string | number>> = {
  "ollama.pull": { tag: "qwen2.5:7b" }, "ollama.rm": { tag: "qwen2.5:7b" },
  "env.setContext": { size: "8192" }, "env.restoreContext": { value: "12000" },
  "prerun.wingetList": { pkg: "Ollama.Ollama" }, "proc.killTree": { pid: PID },
};
const render = (id: string) => renderCommand(id, PARAMS[id] ?? {}, withPid(PID));
const NEW_CHECKS = ["detect.admin", "detect.displays", "prerun.wingetList", "prerun.envQuery", "proc.killTree"];

describe("read-only checks", () => {
  it.each([
    ["detect.admin", "whoami /groups /fo csv /nh"],
    ["detect.displays", "pnputil /enum-devices /class Display"],
    ["prerun.wingetList", "winget list --id Ollama.Ollama -e --accept-source-agreements --disable-interactivity"],
    ["prerun.envQuery", "reg query HKCU\\Environment"],
    ["proc.killTree", `taskkill /pid ${PID} /t /f`],
  ])("%s renders exactly the documented command", (id, display) => {
    expect(render(id).display).toBe(display);
  });

  it("marks every new check VERIFY until a real machine confirms it", () => {
    for (const id of atLeast(NEW_CHECKS, 5, "checks")) expect(VERIFY_IN_PHASE_2, id).toContain(id);
  });

  it("gives no read-only command a reverse, and records none of them as a change", () => {
    const readOnly = atLeast(Object.values(COMMANDS).filter((c) => !c.changesPc), 11, "read-only commands");
    for (const c of readOnly) {
      expect(c.reverseId, c.id).toBeNull();
      expect(c.needsAdmin, c.id).toBe(false);
      expect(changeFor(render(c.id)), c.id).toBeNull();
    }
  });

  it("never uses a read-only command as the undo of a change", () => {
    for (const c of atLeast(Object.values(COMMANDS).filter((x) => x.changesPc), 15, "PC-changing commands")) {
      expect(COMMANDS[c.reverseId!]!.changesPc, `${c.id} -> ${c.reverseId}`).toBe(true);
    }
  });

  it("asks winget only about the packages SetupPilot installs", () => {
    expect([...WINGET_PACKAGES].sort()).toEqual(Object.keys(PROGRAMS).sort());
    for (const pkg of ["Microsoft.Edge", "ollama.ollama", "Ollama.Ollama --force", "Ollama.*"]) {
      expect(() => renderCommand("prerun.wingetList", { pkg }, base), pkg).toThrow(WhitelistError);
    }
  });

  it("keeps the environment listing private and fixed to one key", () => {
    expect(COMMANDS["prerun.envQuery"]!.privateOutput).toBe(true);
    expect(() => renderCommand("prerun.envQuery", { key: "HKLM\\SAM" }, base)).toThrow(WhitelistError);
    const others = Object.values(COMMANDS).filter((c) => c.privateOutput);
    expect(others.map((c) => c.id)).toEqual(["prerun.envQuery"]);
  });
});

describe("proc.killTree: only the executor's own child", () => {
  it("renders the pid the executor put in its context", () => {
    expect(renderCommand("proc.killTree", { pid: PID }, withPid(PID)).args).toEqual(["/pid", "4321", "/t", "/f"]);
  });

  it("rejects a pid the executor did not start", () => {
    expect(() => renderCommand("proc.killTree", { pid: 4 }, withPid(PID))).toThrow(WhitelistError);
    expect(() => renderCommand("proc.killTree", { pid: PID }, base)).toThrow(WhitelistError);
  });

  const bad: [string, unknown][] = [
    ["zero", 0], ["negative", -PID], ["non-integer", 4321.5], ["string of digits", "4321"],
    ["text", "abc"], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY], ["array", [PID]],
    ["object", { valueOf: () => PID }], ["huge", 10 ** 12],
  ];
  it.each(bad)("rejects a pid that is %s", (_name, pid) => {
    const ctx: RenderContext = { ...base, ownChildPids: [PID, 0, -PID, 4321.5, 10 ** 12] };
    expect(() => renderCommand("proc.killTree", { pid } as Record<string, number>, ctx)).toThrow(WhitelistError);
  });

  it("checked every bad pid listed", () => {
    atLeast(bad, 10, "pids");
  });

  it("can't take the allowed-pid list from request-shaped input", () => {
    // As an extra param: refused as unknown.
    const asParam = { pid: PID, ownChildPids: [PID] } as unknown as Record<string, number>;
    expect(() => renderCommand("proc.killTree", asParam, base)).toThrow(/Unexpected param/);
    // The context built from the catalog never has pids, whatever else is passed in.
    const loose = renderContextFromCatalog as (...a: unknown[]) => RenderContext;
    expect(loose(catalog, [String(PID)], [PID], { ownChildPids: [PID] }).ownChildPids).toEqual([]);
    // A parsed JSON body with a __proto__ key does not reach the context's own list.
    const body = JSON.parse(`{"__proto__": {"ownChildPids": [${PID}]}}`) as object;
    const merged = { ...renderContextFromCatalog(catalog), ...body } as RenderContext;
    expect(merged.ownChildPids).toEqual([]);
    expect(() => renderCommand("proc.killTree", { pid: PID }, merged)).toThrow(WhitelistError);
  });

  it("refuses a stored cancel command when checked against a plan's context", () => {
    const stored = render("proc.killTree"); // as if someone saved one into a plan
    expect(() => verifyRendered(stored, renderContextFromCatalog(catalog))).toThrow(WhitelistError);
  });
});

describe("verifyRendered: a stored command must match the whitelist exactly", () => {
  const all = atLeast(Object.keys(COMMANDS).map(render), 25, "commands");
  const ctx = withPid(PID);
  const pull = render("ollama.pull");
  const tamper = (over: object) => ({ ...pull, ...over }) as RenderedCommand;

  it("accepts every command exactly as rendered", () => {
    for (const c of all) expect(() => verifyRendered(c, ctx), c.commandId).not.toThrow();
  });

  const refused: [string, unknown][] = [
    ["a swapped exe", tamper({ exe: "cmd" })],
    ["an exe given as a path", tamper({ exe: "C:/evil/ollama.exe" })],
    ["an added arg", tamper({ args: [...pull.args, "--insecure"], display: `${pull.display} --insecure` })],
    ["a removed arg", tamper({ args: ["pull"], display: "ollama pull" })],
    ["a changed fixed arg", tamper({ args: ["rm", "qwen2.5:7b"], display: "ollama rm qwen2.5:7b" })],
    ["a param outside the catalog", tamper({ args: ["pull", "mistral:latest"], display: "ollama pull mistral:latest" })],
    ["a param with a shell trick", tamper({ args: ["pull", "qwen2.5:7b&calc"], display: "ollama pull qwen2.5:7b&calc" })],
    ["args changed but display kept", tamper({ args: ["pull", "llama3.1:8b"] })],
    ["display changed but args kept", tamper({ display: "ollama pull llama3.1:8b" })],
    // The display still shows the honest command; only what would run is different.
    ["shows pull but runs rm", tamper({ args: ["rm", "qwen2.5:7b"] })],
    ["shows pull but runs an extra arg", tamper({ args: [...pull.args, "--insecure"] })],
    ["shows pull but runs an extra empty arg", tamper({ args: [...pull.args, ""] })],
    ["shows pull but runs the args reordered", tamper({ args: ["qwen2.5:7b", "pull"] })],
    ["a non-string arg", tamper({ args: ["pull", 7] })],
    ["a non-string arg in a fixed slot", tamper({ args: [{ toString: () => "pull" }, "qwen2.5:7b"] })],
    ["args that are not a list", tamper({ args: "pull qwen2.5:7b" })],
    ["args that are null", tamper({ args: null })],
    ["an extra field", tamper({ shell: true })],
    ["a missing field", (({ display: _d, ...rest }) => rest)(pull)],
    ["an id not on the whitelist", tamper({ commandId: "ollama.run" })],
    ["an inherited id", tamper({ commandId: "constructor" })],
    ["a __proto__ id", tamper({ commandId: "__proto__" })],
    ["a non-string id", tamper({ commandId: 5 })],
    ["null", null],
    ["a plain string", "ollama pull qwen2.5:7b"],
    ["a different command's args under this id", tamper({ commandId: "ollama.list" })],
  ];

  it.each(refused)("refuses %s", (_name, cmd) => {
    expect(() => verifyRendered(cmd as RenderedCommand, ctx)).toThrow(WhitelistError);
  });

  it("checked every tampering listed", () => {
    atLeast(refused, 26, "tamperings");
  });

  it("leaves a swap to another valid catalog model to the plan hash (verifyRendered can't know)", () => {
    // Both commands are on the whitelist; the runner's hash check is what refuses this one.
    const other = renderCommand("ollama.pull", { tag: "llama3.1:8b" }, ctx);
    expect(() => verifyRendered(other, ctx)).not.toThrow();
    expect(other.args).not.toEqual(pull.args);
  });
});
