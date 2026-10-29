// The ONLY commands SetupPilot may run. Fixed exe + fixed args; params are typed and validated.
// The server spawns `exe` with `args` as an array and shell:false, so nothing here is ever
// parsed by a shell. The metacharacter checks are defence in depth on top of that.
import type { Catalog, CommandId, CommandSpec, ParamRule, RenderContext, RenderedCommand } from "../types";
import { READ_ONLY_CHECKS } from "./checks";

export class WhitelistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhitelistError";
  }
}

const WINGET_FLAGS = ["-e", "--silent", "--accept-source-agreements", "--accept-package-agreements"];
const TAG = { tag: { kind: "catalogTag" } as ParamRule };

function spec(s: Omit<CommandSpec, "params" | "needsAdmin" | "timeoutSec" | "output"> & Partial<CommandSpec>): CommandSpec {
  return { params: {}, needsAdmin: false, timeoutSec: 120, output: "log", ...s };
}

const LIST: CommandSpec[] = [
  // Read-only detection.
  spec({ id: "detect.gpu", exe: "nvidia-smi", changesPc: false, reverseId: null,
    args: ["--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"], timeoutSec: 15 }),
  spec({ id: "detect.winget", exe: "winget", args: ["--version"], changesPc: false, reverseId: null, timeoutSec: 15 }),
  spec({ id: "ollama.version", exe: "ollama", args: ["--version"], changesPc: false, reverseId: null, timeoutSec: 15 }),
  spec({ id: "ollama.list", exe: "ollama", args: ["list"], changesPc: false, reverseId: null, timeoutSec: 15 }),

  // Runtime.
  spec({ id: "ollama.install", exe: "winget", args: ["install", "--id", "Ollama.Ollama", ...WINGET_FLAGS],
    changesPc: true, reverseId: "ollama.uninstall", timeoutSec: 900, output: "progress" }),
  spec({ id: "ollama.uninstall", exe: "winget", args: ["uninstall", "--id", "Ollama.Ollama", "-e", "--silent"],
    changesPc: true, reverseId: "ollama.install", timeoutSec: 600 }),

  // Models. Pull only catalog tags; remove only tags SetupPilot recorded in the manifest.
  spec({ id: "ollama.pull", exe: "ollama", args: ["pull", { param: "tag" }], params: TAG,
    changesPc: true, reverseId: "ollama.rm", timeoutSec: 7200, output: "progress" }),
  spec({ id: "ollama.rm", exe: "ollama", args: ["rm", { param: "tag" }], params: { tag: { kind: "modelTag" } },
    changesPc: true, reverseId: "ollama.pull", timeoutSec: 120 }),

  // Safe defaults: user-level env var read by Ollama at start.
  spec({ id: "env.setContext", exe: "setx", args: ["OLLAMA_CONTEXT_LENGTH", { param: "size" }],
    params: { size: { kind: "contextSize" } }, changesPc: true, reverseId: "env.unsetContext", timeoutSec: 15 }),
  // Restore only: puts back a user's own previous value, which may not be a catalog size.
  spec({ id: "env.restoreContext", exe: "setx", args: ["OLLAMA_CONTEXT_LENGTH", { param: "value" }],
    params: { value: { kind: "positiveInt" } }, changesPc: true, reverseId: "env.unsetContext", timeoutSec: 15 }),
  spec({ id: "env.unsetContext", exe: "reg", args: ["delete", "HKCU\\Environment", "/v", "OLLAMA_CONTEXT_LENGTH", "/f"],
    changesPc: true, reverseId: "env.setContext", timeoutSec: 15 }),

  // Remote access. VERIFY IN PHASE 2: winget id, serve on/off syntax, status JSON shape.
  // Read-only status, used by the server to record what existed before SetupPilot.
  spec({ id: "tailscale.status", exe: "tailscale", args: ["status", "--json"], changesPc: false, reverseId: null, timeoutSec: 15 }),
  spec({ id: "tailscale.serveStatus", exe: "tailscale", args: ["serve", "status", "--json"],
    changesPc: false, reverseId: null, timeoutSec: 15 }),
  spec({ id: "tailscale.install", exe: "winget", args: ["install", "--id", "Tailscale.Tailscale", ...WINGET_FLAGS],
    needsAdmin: true, changesPc: true, reverseId: "tailscale.uninstall", timeoutSec: 900, output: "progress" }),
  spec({ id: "tailscale.uninstall", exe: "winget", args: ["uninstall", "--id", "Tailscale.Tailscale", "-e", "--silent"],
    needsAdmin: true, changesPc: true, reverseId: "tailscale.install", timeoutSec: 600 }),
  spec({ id: "tailscale.up", exe: "tailscale", args: ["up"], changesPc: true, reverseId: "tailscale.logout", timeoutSec: 600 }),
  spec({ id: "tailscale.logout", exe: "tailscale", args: ["logout"], changesPc: true, reverseId: "tailscale.up", timeoutSec: 60 }),
  // Tailscale docs: "add off to the end of the command you used to turn it on"; all original
  // flags are required. Exact args below are inferred from that rule. Never "serve reset":
  // it would wipe sharing the user set up themselves.
  spec({ id: "tailscale.serve", exe: "tailscale", args: ["serve", "--bg", "--https=443", "localhost:11434"],
    changesPc: true, reverseId: "tailscale.serveOff", timeoutSec: 60 }),
  spec({ id: "tailscale.serveOff", exe: "tailscale", args: ["serve", "--bg", "--https=443", "localhost:11434", "off"],
    changesPc: true, reverseId: "tailscale.serve", timeoutSec: 60 }),

  // Speed boost (VERIFY IN PHASE 2: winget id; real path untested until a human runs it).
  spec({ id: "llamacpp.install", exe: "winget", args: ["install", "--id", "ggml.llamacpp", ...WINGET_FLAGS],
    changesPc: true, reverseId: "llamacpp.uninstall", timeoutSec: 900, output: "progress" }),
  spec({ id: "llamacpp.uninstall", exe: "winget", args: ["uninstall", "--id", "ggml.llamacpp", "-e", "--silent"],
    changesPc: true, reverseId: "llamacpp.install", timeoutSec: 600 }),

  // Admin/graphics detection, "before" checks and Cancel (core/commands/checks.ts).
  ...READ_ONLY_CHECKS,
];

export const COMMANDS: Readonly<Record<CommandId, CommandSpec>> = Object.freeze(
  Object.fromEntries(LIST.map((c) => [c.id, c])),
);

/** Commands whose real behaviour has not been checked on a machine yet. */
export const VERIFY_IN_PHASE_2: readonly CommandId[] = [
  "tailscale.install", "tailscale.uninstall", "tailscale.status", "tailscale.serveStatus",
  "tailscale.up", "tailscale.logout", "tailscale.serve", "tailscale.serveOff",
  "llamacpp.install", "llamacpp.uninstall",
  "ollama.uninstall", // does a silent uninstall keep or delete %USERPROFILE%\.ollama\models?
  // Syntax confirmed in Microsoft's docs; output parsing or behaviour not yet (see checks.ts).
  "detect.admin", "detect.displays", "prerun.wingetList", "prerun.envQuery", "proc.killTree",
];

// Characters that chain, redirect, expand or quote in cmd/PowerShell/sh, plus control chars.
const FORBIDDEN = /[&|;<>$`()"'%^!\\\r\n\t\0]/;
const TAG_FORMAT = /^[a-z0-9._-]+(:[a-z0-9._-]+)?$/;

export function renderContextFromCatalog(catalog: Catalog, allowedTags: string[] = []): RenderContext {
  return {
    catalogTags: catalog.models.map((m) => m.ollamaTag),
    allowedTags,
    contextSizes: [...new Set(catalog.models.flatMap((m) => m.contextOptions))],
    ownChildPids: [], // only the executor adds the pid of the child it spawned itself
  };
}

function checkParam(name: string, rule: ParamRule, raw: unknown, ctx: RenderContext): string {
  // A pid is never text: only the executor passes one, as the number of the child it spawned.
  if (rule.kind === "ownChildPid" && typeof raw !== "number") throw new WhitelistError(`Param "${name}" must be a number`);
  if (typeof raw !== "string" && !(typeof raw === "number" && Number.isInteger(raw))) {
    throw new WhitelistError(`Param "${name}" must be a string or integer`);
  }
  const value = String(raw);
  if (value.length === 0 || value.length > 100) throw new WhitelistError(`Param "${name}" has a bad length`);
  if (FORBIDDEN.test(value)) throw new WhitelistError(`Param "${name}" contains a forbidden character`);
  if (value.startsWith("-")) throw new WhitelistError(`Param "${name}" may not start with "-"`);
  if (value.includes("..")) throw new WhitelistError(`Param "${name}" may not contain ".."`);

  switch (rule.kind) {
    case "catalogTag":
      if (!TAG_FORMAT.test(value) || !ctx.catalogTags.includes(value)) {
        throw new WhitelistError(`"${value}" is not a model in the catalog`);
      }
      return value;
    case "modelTag":
      // Must be a tag SetupPilot can pull AND one it recorded pulling: never the user's own models.
      if (!TAG_FORMAT.test(value) || !ctx.catalogTags.includes(value) || !ctx.allowedTags.includes(value)) {
        throw new WhitelistError(`"${value}" is not a model SetupPilot installed`);
      }
      return value;
    case "contextSize":
      // Canonical digits only: "08192" would be shown and hashed differently from 8192.
      if (!/^[1-9]\d*$/.test(value) || !ctx.contextSizes.includes(Number(value))) {
        throw new WhitelistError(`"${value}" is not an allowed context size`);
      }
      return value;
    case "positiveInt":
      if (!/^[1-9]\d{0,6}$/.test(value)) throw new WhitelistError(`"${value}" is not a positive whole number`);
      return value;
    case "enum":
      if (!rule.values?.includes(value)) throw new WhitelistError(`"${value}" is not an allowed value`);
      return value;
    case "ownChildPid":
      if (!/^[1-9]\d{0,9}$/.test(value) || !ctx.ownChildPids.includes(Number(value))) {
        throw new WhitelistError(`"${value}" is not a process SetupPilot started`);
      }
      return value;
  }
}

/** Builds the exact command to run. Throws WhitelistError for anything not on the list. */
export function renderCommand(
  id: CommandId,
  params: Record<string, string | number>,
  ctx: RenderContext,
): RenderedCommand {
  const cmd = Object.hasOwn(COMMANDS, id) ? COMMANDS[id] : undefined;
  if (!cmd) throw new WhitelistError(`Command "${id}" is not on the whitelist`);

  for (const key of Object.keys(params)) {
    if (!Object.hasOwn(cmd.params, key)) throw new WhitelistError(`Unexpected param "${key}" for ${id}`);
  }
  const args = cmd.args.map((a) => {
    if (typeof a === "string") return a;
    const rule = Object.hasOwn(cmd.params, a.param) ? cmd.params[a.param] : undefined;
    if (!rule || !Object.hasOwn(params, a.param)) throw new WhitelistError(`Missing param "${a.param}" for ${id}`);
    return checkParam(a.param, rule, params[a.param], ctx);
  });
  return { commandId: id, exe: cmd.exe, args, display: [cmd.exe, ...args].join(" ") };
}
