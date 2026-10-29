// Picks the executor once at start: RealExecutor only in real mode on Windows; the fake (demo
// output from data/demo-output.json) otherwise. Callers only ever see the Executor interface.
import demoOutput from "../data/demo-output.json";
import type { ServerConfig } from "./config";
import { FakeExecutor, type FakeScript } from "./executor/fake";
import { RealExecutor, type RealDeps } from "./executor/real";
import type { Executor } from "./executor/types";

export type { Executor, OutputLine } from "./executor/types";
export { readPrivate, PrivateText } from "./executor/output";

const demoScripts = (demoOutput as { scripts: Record<string, FakeScript> }).scripts;

export function createExecutor(config: ServerConfig, deps: RealDeps = {}): Executor {
  if (config.mode === "real" && (deps.platform ?? process.platform) === "win32") return new RealExecutor(config, deps);
  return new FakeExecutor(demoScripts);
}
