// Server constants. Everything SetupPilot may touch is derived here from exactly two inputs,
// read once at start: the home folder (os.homedir()) and SETUPPILOT_MODE. Nothing comes from
// the manifest, the profile, a request, any other env var, or a file the user can edit.
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { checkRoots, isSafePath } from "../core/paths";
import type { AllowedRoots, StepId } from "../core/types";

export type Mode = "demo" | "real";
export const HOST = "127.0.0.1";
export const PORT = 41731;

/** Real mode only for exactly "real" on Windows. "REAL", "true", "1", "" or unset: demo. */
export function modeFor(env: Readonly<Record<string, string | undefined>>, platform: string): Mode {
  return env.SETUPPILOT_MODE === "real" && platform === "win32" ? "real" : "demo";
}

/** A location not yet checked by the human on a real machine stays unconfirmed (VERIFY). */
export interface Candidate { path: string | null; confirmed: boolean }

export interface ServerConfig {
  mode: Mode;
  host: typeof HOST;
  port: number;
  home: string;
  dataDir: string;
  logDir: string;
  manifestPath: string;
  profilePath: string;
  roots: AllowedRoots;
  modelsDir: string;
  modelsDrive: string;
  openCodeConfig: Candidate;
  exes: Readonly<Record<string, Candidate>>;
  disabledSteps: readonly StepId[];
}

export class StartupError extends Error {
  constructor(message: string) {
    super(`SetupPilot can't start: ${message}`);
    this.name = "StartupError";
  }
}

// Real mode: steps whose commands are not verified on a machine yet stay off (human decisions):
// step 8, Tailscale sharing args (D22); step 7, the llama.cpp winget install (D42).
const REAL_MODE_DISABLED: StepId[] = ["remote-access", "speed-boost"];

/** "C:\Users\me\" -> "C:/Users/me". Fails closed on anything Windows could reinterpret. */
export function normHome(raw: string): string {
  const h = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  // isSafePath rejects relative, UNC, \\?\, device names, "." / ".." and trailing dots/spaces,
  // and (with the trailing slash stripped) a bare drive root: "C:/" becomes "C:".
  if (!isSafePath(h)) {
    throw new StartupError(`your home folder ("${h}") doesn't look like a normal Windows user folder.`);
  }
  return h;
}

const unconfirmed = (path: string | null): Candidate => ({ path, confirmed: false });

// Candidate exe locations, one per whitelist exe. All VERIFY: the human checks each on the test
// machine and flips `confirmed`. System tools assume Windows is on C: (no env var is read).
function exeCandidates(home: string): Record<string, Candidate> {
  const sys = (name: string) => unconfirmed(`C:/Windows/System32/${name}.exe`);
  return {
    whoami: sys("whoami"), reg: sys("reg"), setx: sys("setx"), taskkill: sys("taskkill"), pnputil: sys("pnputil"),
    "nvidia-smi": sys("nvidia-smi"), // newer NVIDIA drivers put it here
    winget: unconfirmed(`${home}/AppData/Local/Microsoft/WindowsApps/winget.exe`), // App Installer alias
    ollama: unconfirmed(`${home}/AppData/Local/Programs/Ollama/ollama.exe`), // Ollama installs per user
    tailscale: unconfirmed("C:/Program Files/Tailscale/tailscale.exe"),
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export function buildConfig(rawHome: string, mode: Mode): ServerConfig {
  const home = normHome(rawHome);
  const reserved = `${home}/.setuppilot`;
  const dataDir = mode === "real" ? reserved : `${reserved}/demo`; // a demo never sees real records
  return deepFreeze({
    mode, host: HOST, port: PORT, home, dataDir,
    logDir: `${dataDir}/logs`,
    manifestPath: `${dataDir}/manifest.json`,
    profilePath: `${dataDir}/profile.json`,
    roots: { targets: [`${home}/.config/opencode`], backups: [`${dataDir}/backups`], reserved: [reserved] },
    modelsDir: `${home}/.ollama/models`, // Ollama FAQ: C:\Users\%username%\.ollama\models
    modelsDrive: `${home.slice(0, 2)}/`,
    // opencode.ai/docs/config: global config at ~/.config/opencode/opencode.json; the Windows
    // location is not documented, so VERIFY (real mode shows the snippet until confirmed).
    openCodeConfig: unconfirmed(`${home}/.config/opencode/opencode.json`),
    exes: exeCandidates(home),
    disabledSteps: mode === "real" ? [...REAL_MODE_DISABLED] : [],
  });
}

export interface ConfigInputs {
  homedir: () => string;
  env: Readonly<Record<string, string | undefined>>;
  platform: string;
}

/** Reads the two inputs once. The env object is consulted for SETUPPILOT_MODE only. */
export function loadConfig(inputs: ConfigInputs = { homedir, env: process.env, platform: process.platform }): ServerConfig {
  const mode = modeFor(inputs.env, inputs.platform);
  return buildConfig(inputs.homedir(), mode);
}

export interface StartupFs { exists: (path: string) => boolean; mkdir: (path: string) => void }
const realFs: StartupFs = { exists: existsSync, mkdir: (p) => { mkdirSync(p, { recursive: true }); } };

/** Refuses to start, with a plain message, unless the folders are safe and usable. */
export function startupCheck(config: ServerConfig, fs: StartupFs = realFs): void {
  try {
    checkRoots(config.roots);
  } catch {
    throw new StartupError("its list of allowed folders is unsafe or overlaps. Nothing was changed.");
  }
  if (!fs.exists(config.modelsDrive)) {
    throw new StartupError(`the drive where AI models are stored (${config.modelsDrive}) isn't available.`);
  }
  for (const dir of [config.logDir, ...config.roots.backups]) {
    try {
      fs.mkdir(dir);
    } catch {
      throw new StartupError(`it couldn't create its folder ${dir}. Check there is free space and permission.`);
    }
  }
}

/** What step 9 may do with the OpenCode file: real mode writes only to a confirmed path. */
export function openCodeWriteMode(config: ServerConfig): "simulate" | "snippet" | "write" {
  if (config.mode === "demo") return "simulate";
  return config.openCodeConfig.confirmed ? "write" : "snippet";
}
