// The child's environment: an allowlist, never the server's full environment (D46). Child
// programs don't need our secrets (API keys, tokens, SETUPPILOT_*). The list is VERIFY: if
// winget or Ollama fail on the test machine for a missing variable, the human adds it by name.
// OLLAMA_* is left out on purpose: we only ever talk to 127.0.0.1:11434 (OLLAMA_HOST ignored).
import { inspect } from "node:util";

export const CHILD_ENV_ALLOWLIST: readonly string[] = Object.freeze([
  // Windows basics a program needs to run
  "SystemRoot", "windir", "SystemDrive", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "USERNAME", "APPDATA", "LOCALAPPDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432",
  "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
  // so downloads work behind a company proxy (values may hold a user name and password)
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
]);

const HIDDEN = "[hidden]";
const envValues = new WeakMap<ChildEnv, Readonly<Record<string, string>>>();

/** The whole child environment is private: it may hold proxy credentials. */
export class ChildEnv {
  constructor(values: Record<string, string>) {
    envValues.set(this, Object.freeze({ ...values }));
    Object.freeze(this);
  }
  /** Variable names only (never values): safe to show or test. */
  names(): string[] { return Object.keys(envValues.get(this)!); }
  toString(): string { return HIDDEN; }
  toJSON(): string { return HIDDEN; }
  [Symbol.toPrimitive](): string { return HIDDEN; }
  [inspect.custom](): string { return HIDDEN; }
}

/** For the spawn call only. */
export const readChildEnv = (env: ChildEnv): Record<string, string> => ({ ...envValues.get(env)! });

/** Copies only allowlisted names; Windows env names are case-insensitive, so the match is too. */
export function buildChildEnv(source: Readonly<Record<string, string | undefined>>): ChildEnv {
  const wanted = new Set(CHILD_ENV_ALLOWLIST.map((n) => n.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && wanted.has(name.toLowerCase())) out[name] = value;
  }
  return new ChildEnv(out);
}
