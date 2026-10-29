// Phase 2 T6: the child's environment is an allowlist (D46), and proxy credentials reach the
// child and nowhere else. (The log, event stream and stored manifest get the same test in
// T7, T15 and T8, where they are built.)
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { explanations } from "../core/data";
import { outcomeFor } from "../core/outcome";
import { buildChildEnv, CHILD_ENV_ALLOWLIST, readChildEnv } from "../server/executor/env";
import type { OutputLine } from "../server/executor/types";
import { atLeast } from "./fixtures";
import { cmd, realHarness, settle } from "./executor-helpers";

const PASSWORD = "Pr0xyP4ss-9921";
const PROXY = `http://alice:${PASSWORD}@proxy.example:8080`;
const SOURCE = {
  OPENAI_API_KEY: "sk-live-abc", GITHUB_TOKEN: "ghp_secret", AWS_SECRET_ACCESS_KEY: "aws-secret",
  SETUPPILOT_MODE: "real", MY_CUSTOM_VAR: "custom", OLLAMA_HOST: "0.0.0.0:9999",
  Path: "C:\\Windows\\System32", SystemRoot: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
  "ProgramFiles(x86)": "C:\\Program Files (x86)", HTTPS_PROXY: PROXY, http_proxy: PROXY, UNDEFINED_ONE: undefined,
};

describe("child environment allowlist", () => {
  it("passes allowlisted names (any case) and nothing else", () => {
    const env = readChildEnv(buildChildEnv(SOURCE));
    expect(Object.keys(env).sort()).toEqual(["HTTPS_PROXY", "LOCALAPPDATA", "Path", "ProgramFiles(x86)", "SystemRoot", "http_proxy"].sort());
    for (const name of ["OPENAI_API_KEY", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "SETUPPILOT_MODE", "MY_CUSTOM_VAR", "OLLAMA_HOST"]) {
      expect(env, name).not.toHaveProperty(name);
    }
  });

  it("covers the Windows basics and the proxy variables, and nothing named like a secret", () => {
    const list = atLeast([...CHILD_ENV_ALLOWLIST], 20, "allowlisted names");
    for (const n of ["SystemRoot", "TEMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "PATH", "PATHEXT", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]) {
      expect(list, n).toContain(n);
    }
    expect(list.filter((n) => /key|token|secret|pass|setuppilot|ollama/i.test(n))).toEqual([]);
    expect(Object.isFrozen(CHILD_ENV_ALLOWLIST)).toBe(true);
  });

  it("hides the whole environment however it is printed", () => {
    const env = buildChildEnv(SOURCE);
    for (const s of [env.toString(), String(env), `${env}`, JSON.stringify(env), JSON.stringify({ env }), inspect(env)]) {
      expect(s).not.toContain(PASSWORD);
    }
    expect(env.names()).toContain("HTTPS_PROXY");
  });
});

describe("proxy credentials reach the child and nowhere else", () => {
  afterEach(() => vi.restoreAllMocks());

  it("are in the spawned child's env, but not in output, result, console or thrown text", async () => {
    const printed: string[] = [];
    const capture = (...a: unknown[]) => { printed.push(a.map((x) => (typeof x === "string" ? x : inspect(x))).join(" ")); };
    for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation(capture);
    vi.spyOn(process.stdout, "write").mockImplementation((s) => (printed.push(String(s)), true));
    vi.spyOn(process.stderr, "write").mockImplementation((s) => (printed.push(String(s)), true));

    const h = realHarness({ lines: ["downloading"], exitCode: 1 }, { env: SOURCE });
    const lines: OutputLine[] = [];
    const ac = new AbortController();
    const done = h.executor.run(cmd("ollama.list"), (l) => lines.push(l), ac.signal);
    await settle();
    h.clock.advance(0);
    const result = await done;
    vi.restoreAllMocks();

    expect(h.calls[0]!.opts.env.HTTPS_PROXY).toBe(PROXY); // it does reach the child
    expect(JSON.stringify(h.calls[0]!.opts.env)).not.toContain("sk-live");
    const outcome = outcomeFor("ollama.list", result);
    expect(outcome.detail).not.toBeNull();
    const detailText = explanations.execDetails[outcome.detail!];
    const everywhereElse = [JSON.stringify(result), JSON.stringify(lines), JSON.stringify(outcome), detailText, ...printed].join("\n");
    expect(everywhereElse).not.toContain(PASSWORD);
    expect(everywhereElse).not.toContain("sk-live");
  });
});
