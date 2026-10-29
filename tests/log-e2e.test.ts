// Phase 2 T7, end to end: commands run through the fake executor and are logged through the
// same helpers the runner will use (loggingOnLine, logCommandStart, logCommandEnd). Secrets,
// private output, proxy credentials and login links never reach a log file, and a failing log
// never changes a command's result.
import { describe, expect, it } from "vitest";
import type { ExecResult, RenderedCommand, StepId } from "../core/types";
import { FakeExecutor, type FakeScript } from "../server/executor/fake";
import type { OutputLine } from "../server/executor/types";
import { logCommandEnd, logCommandStart, Logger, loggingOnLine } from "../server/log";
import { atLeast } from "./fixtures";
import { cmd, ManualClock, settle } from "./executor-helpers";
import { fixedClock, LOG_DIR, MemFs, T0 } from "./log-helpers";

const SECRET = "SECRET_MARKER_5521";
const PASSWORD = "Pr0xyP4ss-e2e";
const PROXY = `http://alice:${PASSWORD}@proxy.example:8080`;
const TS_TOKEN = "9f8e7d6c5b4a";

const scripts: Record<string, FakeScript> = {
  "prerun.envQuery": { lines: [`HKEY_CURRENT_USER\\Environment`, `    API_KEY    REG_SZ    ${SECRET}`, `    HTTPS_PROXY    REG_SZ    ${PROXY}`] },
  "ollama.list": { lines: ["NAME  ID  SIZE", `using proxy ${PROXY}`] },
  "tailscale.up": { lines: ["To authenticate, visit:", "", `\thttps://login.tailscale.com/a/${TS_TOKEN}`, "Success."] },
};

/** What the runner (T12) will do for one command. */
async function runLogged(log: Logger | null, c: RenderedCommand, stepId: StepId) {
  const clock = new ManualClock();
  const ex = new FakeExecutor(scripts, { clock });
  const shown: OutputLine[] = [];
  const onLine = (l: OutputLine) => shown.push(l);
  if (log) logCommandStart(log, "run-e2e", stepId, c);
  const done = ex.run(c, log ? loggingOnLine(log, "run-e2e", stepId, onLine) : onLine, new AbortController().signal);
  await settle();
  clock.advance(0);
  const result: ExecResult = await done;
  if (log) logCommandEnd(log, "run-e2e", stepId, c, result);
  return { result, shown };
}

const commands: [RenderedCommand, StepId][] = [
  [cmd("prerun.envQuery"), "safe-defaults"],
  [cmd("ollama.list"), "install-runtime"],
  [cmd("tailscale.up"), "remote-access"],
];

describe("end to end: executor -> runner path -> log file", () => {
  it("no secret, private line, proxy password or login token in any log file; the UI still gets its lines", async () => {
    const fs = new MemFs();
    const log = new Logger(LOG_DIR, { fs, clock: fixedClock(T0) });
    const shownAll: OutputLine[] = [];
    for (const [c, step] of atLeast(commands, 3, "commands")) shownAll.push(...(await runLogged(log, c, step)).shown);
    await log.flush();

    const text = fs.allText();
    atLeast(text.split("\n").filter(Boolean), 8, "log lines");
    for (const leak of [SECRET, PASSWORD, TS_TOKEN, "API_KEY", "login.tailscale.com"]) expect(text, leak).not.toContain(leak);
    expect(text).toContain("[credentials removed]@proxy.example:8080");
    expect(text).toContain("[login link removed]");
    expect(text).toContain(cmd("ollama.list").display);
    expect(log.report()).toEqual({ rejected: 0, dropped: 0, failedWrites: 0 });

    // The private lines did reach the UI side (as PrivateText), and the login link is shown there.
    expect(shownAll.filter((l) => l.private)).toHaveLength(3);
    expect(shownAll.some((l) => !l.private && l.text.includes(`/a/${TS_TOKEN}`))).toBe(true);
  });

  it("a broken log changes nothing about a command's result or its output", async () => {
    const broken = new MemFs();
    broken.failAppend = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const problems: string[] = [];
    const log = new Logger(LOG_DIR, { fs: broken, clock: fixedClock(T0), onProblem: (p) => problems.push(p) });
    for (const [c, step] of commands) {
      const withLog = await runLogged(log, c, step);
      const without = await runLogged(null, c, step);
      expect(withLog.result, c.commandId).toEqual(without.result);
      expect(withLog.shown.length, c.commandId).toBe(without.shown.length);
    }
    await expect(log.flush()).resolves.toBeUndefined();
    expect(problems).toEqual(["write-failed"]);
  });
});
