// Read-only checks (changesPc: false, no reverse): admin and graphics detection, the "before"
// state the server records right before each change, and Cancel. Syntax re-checked against
// Microsoft Learn on 2026-10-28 (pages named per command); what is still VERIFY is listed.
import type { CommandSpec } from "../types";

/** The only winget packages SetupPilot installs; the "before" check may ask about these alone. */
export const WINGET_PACKAGES = ["Ollama.Ollama", "Tailscale.Tailscale", "ggml.llamacpp"];

type CheckInput = Pick<CommandSpec, "id" | "exe" | "args"> & Partial<CommandSpec>;
const check = (s: CheckInput): CommandSpec =>
  ({ params: {}, needsAdmin: false, changesPc: false, reverseId: null, timeoutSec: 15, ...s });

export const READ_ONLY_CHECKS: readonly CommandSpec[] = [
  // windows-commands/whoami: "whoami {[/user] [/groups] ...} [/fo <format>] [/nh]", csv valid.
  // VERIFY: how Administrators membership (S-1-5-32-544) shows when not elevated; not documented.
  check({ id: "detect.admin", exe: "whoami", args: ["/groups", "/fo", "csv", "/nh"] }),

  // devtest/pnputil-command-syntax: "/enum-devices ... [/class <name | GUID>]", Windows 10 1903+.
  // Gives card names only, never memory sizes. VERIFY: runs without admin (docs say to run
  // PnPUtil as Administrator in general, not per command).
  check({ id: "detect.displays", exe: "pnputil", args: ["/enum-devices", "/class", "Display"], timeoutSec: 30 }),

  // package-manager/winget/list: --id, -e/--exact, --accept-source-agreements and
  // --disable-interactivity are documented. VERIFY: exit code and output when nothing matches.
  check({
    id: "prerun.wingetList", exe: "winget",
    args: ["list", "--id", { param: "pkg" }, "-e", "--accept-source-agreements", "--disable-interactivity"],
    params: { pkg: { kind: "enum", values: WINGET_PACKAGES } }, timeoutSec: 60,
  }),

  // windows-commands/reg-query: HKCU is a valid root; return values are only 0 = success and
  // 1 = failure, so "/v NAME" can't tell "not there" from any other failure. Listing the whole
  // key and finding no OLLAMA_CONTEXT_LENGTH line confirms absence. The listing holds the user's
  // other environment variables, so its output is private. VERIFY: the listing format.
  check({ id: "prerun.envQuery", exe: "reg", args: ["query", "HKCU\\Environment"], privateOutput: true }),

  // windows-commands/taskkill: "/pid <processID>", "/t Ends the specified process and any child
  // processes started by it", "/f ... forcefully ended". The pid can only be the executor's own
  // child (ownChildPid). VERIFY: whether it can end an elevated (UAC) child of winget.
  check({
    id: "proc.killTree", exe: "taskkill", args: ["/pid", { param: "pid" }, "/t", "/f"],
    params: { pid: { kind: "ownChildPid" } },
  }),
];
