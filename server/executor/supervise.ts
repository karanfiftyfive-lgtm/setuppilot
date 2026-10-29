// The one code path both executors use for verification, timeout, cancel, the wait after a
// kill and the output caps, so the fake behaves like the real one where it matters.
import { renderContextFromCatalog, COMMANDS } from "../../core/commands/whitelist";
import { verifyRendered } from "../../core/commands/verify";
import { catalog } from "../../core/data";
import type { CommandSpec, ExecResult, RenderedCommand } from "../../core/types";
import { LineSplitter, OutputSink } from "./output";
import type { ChildLike, Clock, OutputLine, RunSpec, TreeKiller } from "./types";

export const KILL_WAIT_MS = 5000;

// allowedTags = catalog tags: shape and catalog membership are checked here; the runner's own
// verifyRendered (with the manifest's tags) stays the check for modelTag. ownChildPids is empty,
// so a stored proc.killTree is always refused.
const verifyContext = () => {
  const tags = catalog.models.map((m) => m.ollamaTag);
  return renderContextFromCatalog(catalog, tags);
};

/** The spec for a verified command, or null when the command isn't exactly what core renders. */
export function prepare(cmd: RenderedCommand): { spec: CommandSpec; run: RunSpec } | null {
  try {
    verifyRendered(cmd, verifyContext());
  } catch {
    return null;
  }
  const spec = COMMANDS[cmd.commandId]!;
  return { spec, run: { policy: spec.output, isPrivate: spec.privateOutput === true, timeoutMs: spec.timeoutSec * 1000 } };
}

export function supervise(
  start: () => ChildLike, spec: RunSpec, onLine: (l: OutputLine) => void, signal: AbortSignal, clock: Clock, killTree: TreeKiller,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const base: ExecResult = { exitCode: null, timedOut: false, cancelled: false, spawnError: null, truncated: false, killConfirmed: null };
    if (signal.aborted) return resolve({ ...base, cancelled: true });
    let child: ChildLike;
    try {
      child = start();
    } catch {
      return resolve({ ...base, spawnError: "other" });
    }
    // Our own child's pid, and only while it runs: after "exit" the number may belong to another process.
    const own = new Set<number>();
    if (child.pid !== undefined) own.add(child.pid);
    const out = new OutputSink(spec, onLine, clock);
    let finished = false;
    let ending: "timeout" | "cancel" | null = null;
    let killHow: "tree" | "fallback" | "failed" | null = null;
    let closed = false;
    let timer: unknown = null;
    let waitTimer: unknown = null;

    const finish = (patch: Partial<ExecResult>) => {
      if (finished) return;
      finished = true;
      if (timer !== null) clock.clearTimeout(timer);
      if (waitTimer !== null) clock.clearTimeout(waitTimer);
      signal.removeEventListener("abort", onAbort);
      out.flush();
      resolve({ ...base, ...patch, truncated: out.truncated });
    };
    const ended = (exitedInTime: boolean) =>
      finish({ timedOut: ending === "timeout", cancelled: ending === "cancel", killConfirmed: exitedInTime && killHow === "tree" });

    const stop = async (why: "timeout" | "cancel") => {
      if (ending || finished) return;
      ending = why;
      const pid = child.pid;
      killHow = pid !== undefined && own.has(pid) ? await killTree(pid, child) : "failed";
      if (closed) return ended(true);
      waitTimer = clock.setTimeout(() => ended(false), KILL_WAIT_MS);
    };
    const onAbort = () => void stop("cancel");

    for (const stream of [child.stdout, child.stderr]) {
      const splitter = new LineSplitter();
      stream?.on("data", (chunk: Buffer) => splitter.push(chunk).forEach((l) => out.line(l)));
      stream?.on("end", () => splitter.end().forEach((l) => out.line(l)));
    }
    child.on("error", (e: NodeJS.ErrnoException) => {
      // Only a failed start ends the run here; a later error (e.g. a failed kill) does not.
      if (child.pid === undefined) finish({ spawnError: e.code === "ENOENT" ? "not-found" : "other" });
    });
    child.on("exit", () => {
      if (child.pid !== undefined) own.delete(child.pid);
    });
    child.on("close", (code: number | null) => {
      closed = true;
      if (child.pid !== undefined) own.delete(child.pid);
      if (!ending) return finish({ exitCode: code });
      if (killHow !== null) ended(true); // otherwise stop() finishes once killTree has answered
    });

    timer = clock.setTimeout(() => void stop("timeout"), spec.timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
