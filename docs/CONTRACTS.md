# Contracts

Shapes passed between modules. `core/types.ts` must match this file exactly.
Change this file first, then the code. Sizes in GB (decimal), times in minutes.

## Shared ids
```ts
type GoalId = "chat" | "code" | "remote" | "everything";
type TierId = "1b" | "3b" | "8b" | "14b" | "27b";
type StepId =
  | "scan-pc" | "choose-model" | "install-runtime" | "download-model" | "safe-defaults"
  | "speed-boost" | "remote-access" | "connect-coding-tool" | "workflow-rules" | "test-run";
type StepStatus = "waiting" | "running" | "done" | "failed" | "skipped";
type ErrorCode =
  | "NO_INTERNET" | "NO_WINGET" | "NO_ADMIN" | "LOW_DISK" | "DOWNLOAD_INTERRUPTED"
  | "OLLAMA_NOT_RUNNING" | "COMMAND_FAILED" | "TIMEOUT" | "NOT_APPROVED"
  | "SHARING_IN_USE"              // Tailscale sharing already set up on our port: step refuses
  | "CANCELLED";                  // the user pressed Cancel; the record ends "failed"
// An interrupted download ends as record "failed" + DOWNLOAD_INTERRUPTED; Retry re-runs the
// same whitelisted `ollama pull`, which continues where it stopped.
```

## MachineProfile (server/detect -> core, saved by profile-store)
```ts
interface GpuInfo {
  name: string;
  vendor: "nvidia" | "amd" | "intel" | "other";
  discrete: boolean;
  vramGb: number | null;          // null = unknown (WMI can under-report above 4 GB)
  vramSource: "nvidia-smi" | "wmi" | "manual" | "mock" | "none";
                                  // none = couldn't read it: UI shows "Couldn't read graphics
                                  // memory" + the manual override, never a guessed number
}
interface MachineProfile {
  schemaVersion: 1;
  scannedAt: string;              // ISO time, set by server (core never reads the clock)
  os: { name: "windows" | "macos" | "linux"; version: string; arch: "x64" | "arm64" };
  cpu: { name: string; cores: number; threads: number };
  ramGb: { total: number; free: number };
  gpus: GpuInfo[];
  diskFreeGb: number;             // on the drive Ollama stores models
  ollama: { installed: boolean; version: string | null; running: boolean; models: string[] };
  tools: { winget: boolean; tailscale: boolean;
           tailscaleServe: "none" | "existing" | null };  // sharing on port 443; null = unknown
  isAdmin: boolean;
  internet: boolean;
  vramOverrideGb: number | null;  // set by the user in the UI; wins over detected VRAM
}
```

## Catalog and Model (data/catalog.json -> core/recommend)
```ts
interface Tier {
  id: TierId;
  label: string;                  // "Small and quick"
  speedLabel: { gpu: "fast" | "okay" | "slow"; cpu: "fast" | "okay" | "slow" };
  gainNote: string;               // what moving up to this tier gives you (plain words)
}
interface Model {
  id: string;                     // kebab-case, unique
  displayName: string;
  ollamaTag: string;              // exact tag for `ollama pull`
  parametersB: number;
  tier: TierId;
  q4SizeGb: number;               // download size, estimate
  minMemoryGb: number;            // q4SizeGb + overheadGb, rounded up to 0.5
  sizeIsEstimate: true;
  verified: boolean;              // tag + size checked against the Ollama library (pre-demo)
  contextOptions: number[];
  defaultContext: number;
  goals: ("chat" | "code")[];
  roles?: "narrator"[];
  requiresDiscreteGpu: boolean;
  qualityNote: string;
  license: string;
}
interface Catalog {
  schemaVersion: 1;
  overheadGb: number;             // context + runtime on top of file size
  safetyMarginGb: number;         // extra headroom before we call a model "fits"
  ramUsableFraction: number;      // share of FREE RAM usable without a discrete GPU (0.65)
  diskReserveGb: number;          // free disk we always leave untouched (2)
  runtimeDiskGb: number;          // Ollama install size, counted only if not installed (1)
  speedBoostMinSpareVramGb: number; // VRAM left after the model needed for step 7 (2)
  assumedDownloadMbps: number;    // basis for every "about N min left" (estimate) (50)
  tiers: Tier[];
  models: Model[];
}
```

## Recommendation (core/recommend -> ui)
```ts
interface Recommendation {
  model: Model;
  usableMemoryGb: number;
  memorySource: "vram" | "ram";
  why: string;                    // one sentence, plain words
  speed: { label: "fast" | "okay" | "slow"; isEstimate: true;
           tokPerSecRange?: null };  // reserved, always null (D8)
  context: number;                // num_ctx we will set
  nextTier: { model: Model; needsUsableGb: number; unlockHint: string } | null;
  weakPc: null | { reason: string;
                   options: ("small-model" | "remote-machine" | "upgrade-tips")[] };
  diskShortfallGb: number | null; // set when even the smallest model does not fit on disk
  warnings: string[];             // e.g. "Free disk is tight"
}
```

## Goal (data/goals.json)
```ts
interface Goal {
  id: GoalId; label: string; description: string;
  modelUse: "chat" | "code" | "any";  // which catalog models suit this goal
  stepIds: StepId[];
}
```

## Step and Plan (core/steps + core/goals -> server, ui)
```ts
interface StepDef {
  id: StepId;
  required: boolean;              // true -> Skip disabled, requiredReason shown
  advanced: boolean;
  commandIds: CommandId[];
  estimatedMinutes: number;       // estimate
  diskGb: number;                 // estimate
  needsAdmin: boolean;
  needsInternet: boolean;
  osPromptWarning: boolean;       // show "Windows will ask permission. Click Yes."
  writesFile: "coding-tool-config" | "workflow-rules" | null;  // done by server/tools-config
}
interface StepText { what: string; why: string; changes: string;
                     requiredReason?: string; notNeeded?: string;
                     notNeededFull?: string; signInNote?: string;
                     refused?: string;   // data/explanations.json; refused = step won't run (safety)
                     disabled?: string;  // step not yet checked on a real PC: off in real mode
                     smallContext?: string } // connect-coding-tool only, and only when the
                                         // plan's context is below TOOL_USE_MIN_CONTEXT
interface PlannedStep {
  def: StepDef;
  text: StepText;
  status: StepStatus;
  skipReason: string | null;      // set when a skip rule applies ("Your PC doesn't need this")
  commands: RenderedCommand[];
  fileWrite: FileWrite | null;    // for writesFile steps; null until the server supplies it
  demoLabel: string | null;       // "Demo mode: simulated" on every step that would run, when
                                  // BuildOptions.demo; null in real mode and on skipped steps
}
// Server supplies { targetPath, content } per writesFile kind before the plan is shown.
interface FileWrite {
  kind: "coding-tool-config" | "workflow-rules";
  targetPath: string;
  contentHash: string;            // contentHash(UTF-8 bytes of the exact content to write):
                                  // FNV-1a over bytes, so the server can hash the file on disk
}
// buildPlan(goalId, profile, rec, catalog, files, roots: AllowedRoots, opts: BuildOptions).
// Throws if a file target is outside roots.targets (coding-tool-config), or unsafe or inside
// roots.backups / roots.reserved (workflow-rules).
interface BuildOptions {
  goals?: Goal[];                 // default data/goals.json (tests only)
  disabledSteps?: StepId[];       // server constant: real mode lists steps whose commands are
                                  // not yet verified on a machine (remote-access). Each becomes
                                  // "skipped" with text.disabled; skipped steps are not hashed.
                                  // A required or unknown step id throws PlanError.
  demo?: boolean;                 // demo mode: every step that would run gets demoLabel
}
interface Plan {
  goal: GoalId;
  modelId: string;
  steps: PlannedStep[];
  totalEstimatedMinutes: number;  // download part = size / assumedDownloadMbps; shown as "about N min (estimate)"
  isEstimate: true;
  preflight: ErrorCode[];         // NO_INTERNET, NO_WINGET, LOW_DISK, NO_ADMIN found before running
  planHash: string;               // hash of active steps' [exe, args] + fileWrite; approvals bind to it
}
// Phase 2 rule: the runner executes ONLY from its own stored copy of the Plan (keyed by
// planId, see StoredPlan) and re-verifies planHash before each step. It never runs commands, paths or
// file content sent by the UI. FNV-1a is not collision-resistant, so this rule is what
// makes the hash safe to use.
```

## Commands (core/commands/whitelist.ts -> server/runner)
```ts
type CommandId = string;          // e.g. "ollama.install", "ollama.pull", "tailscale.install"
// catalogTag: must be a catalog ollamaTag. modelTag: tag format + in BOTH ctx.catalogTags
// and ctx.allowedTags (tags recorded in the manifest). contextSize: integer in some model's
// contextOptions. positiveInt: 1..9999999, used only to restore a user's previous value.
// ownChildPid: must be in ctx.ownChildPids, which ONLY the executor fills with the pid of the
// child it spawned itself. No route, request body or stored plan can supply a pid.
interface ParamRule {
  kind: "catalogTag" | "modelTag" | "contextSize" | "positiveInt" | "enum" | "ownChildPid";
  values?: string[];
}
interface RenderContext { catalogTags: string[]; allowedTags: string[]; contextSizes: number[];
                          ownChildPids: number[] }  // [] everywhere except inside the executor
interface CommandSpec {
  id: CommandId;
  exe: string;                    // fixed executable name, never from input
  args: (string | { param: string })[];
  params: Record<string, ParamRule>;
  needsAdmin: boolean;
  changesPc: boolean;             // true -> must write a ChangeRecord first
  reverseId: CommandId | null;    // must be null when changesPc is false
  timeoutSec: number;
  privateOutput?: boolean;        // output is parsed in memory only: never logged, streamed
                                  // to the UI or stored (it can hold the user's other data)
}
interface RenderedCommand { commandId: CommandId; exe: string; args: string[]; display: string }
// verifyRendered(cmd, ctx) (core/commands/verify.ts): throws unless cmd is exactly what renderCommand would produce for
// its commandId (same exe, same fixed args in the same places, every param slot valid, display
// matches). The runner calls it on every stored command right before spawning.
//
// Read-only commands (core/commands/checks.ts, changesPc: false). Syntax re-checked against
// Microsoft Learn on 2026-10-28; what is still VERIFY on a real machine is listed per line.
//   detect.admin       whoami /groups /fo csv /nh
//                      docs: syntax + /fo csv + /nh confirmed. VERIFY: how Administrators
//                      membership (S-1-5-32-544) shows when not elevated (docs don't say).
//   detect.displays    pnputil /enum-devices /class Display
//                      docs: /enum-devices and /class since Windows 10 1903. VERIFY: runs
//                      without admin (docs say "Run as Administrator" for PnPUtil in general).
//   prerun.wingetList  winget list --id {pkg} -e --accept-source-agreements --disable-interactivity
//                      pkg: enum of our 3 package ids. docs: every flag confirmed.
//                      VERIFY: exit code / output when nothing matches (docs don't say).
//   prerun.envQuery    reg query HKCU\Environment          (privateOutput)
//                      docs: HKCU valid; exit 0 = success, 1 = failure, with no separate code
//                      for "value not found", so `/v` cannot confirm absence. Listing the key
//                      and finding no OLLAMA_CONTEXT_LENGTH line does. VERIFY: listing format.
//   proc.killTree      taskkill /pid {pid: ownChildPid} /t /f
//                      docs: /pid, /t ("and any child processes started by it"), /f confirmed.
//                      VERIFY: can it end an elevated (UAC) child of winget.

// Approval binds to the exact hash of what was shown: Plan.planHash for setup,
// UninstallPlan.uninstallHash for uninstall, AND to the server's stored plan (planId).
interface Approval { id: string; subject: "setup" | "uninstall"; planId: string; hash: string;
                     mode: "all" | "step"; stepId: StepId | null; approvedAt: string }
```

## Local HTTP calls (core/commands/http-whitelist.ts -> server/ollama)
```ts
// The ONLY HTTP requests SetupPilot makes. Host is always 127.0.0.1:11434 (fixed, never from
// input). No other paths, no query string, no fragment, no user:pass, redirects never followed
// (a 3xx response is an error). Pull and remove are CLI commands, not HTTP.
type EndpointId = "ollama.tags" | "ollama.generate";
interface EndpointSpec {
  id: EndpointId;
  method: "GET" | "POST";         // tags: GET /api/tags   generate: POST /api/generate
  path: "/api/tags" | "/api/generate";
  timeoutSec: number;
  maxResponseBytes: number;       // larger responses are cut off and treated as an error
}
// The server never passes a body; it passes these params and core builds the body from a
// fixed template: { model, prompt, stream: false, options: { num_ctx, num_predict } }.
interface GenerateParams {
  purpose: "test" | "narrate";
  model: string;                  // a catalog tag that is ALSO in ctx.installedTags
  textKey: string | null;         // narrate: key of a static explanation text; test: null
  numCtx: number;                 // one of ctx.contextSizes
}
// prompt: test = a fixed constant; narrate = a fixed instruction + the static explanation
// text for textKey (never manifest, profile or user text). num_predict is fixed per purpose
// and capped (test 128, narrate 120).
interface HttpContext { catalogTags: string[]; installedTags: string[]; contextSizes: number[];
                        narratorTexts: Record<string, string> }  // from data/explanations.json
interface RenderedRequest { endpointId: EndpointId; method: "GET" | "POST"; url: string;
                            body: string | null; display: string }
// renderRequest(id, params | null, ctx) builds it; verifyRequest(req, ctx) re-parses url and
// body before each call (exact host, port, path, no search/hash; body has exactly the template
// keys with valid values) and throws HttpWhitelistError otherwise.
```

## Run events (server -> ui, Server-Sent Events)
```ts
// Setup events carry stepId; uninstall events carry the item index instead (stepId null).
type RunEvent =
  | { type: "status"; stepId: StepId | null; item: number | null; status: StepStatus }
  | { type: "output"; stepId: StepId | null; item: number | null; line: string }
  | { type: "progress"; stepId: StepId | null; item: number | null; percent: number | null }
  | { type: "error"; stepId: StepId | null; item: number | null; code: ErrorCode; detail: string }
  | { type: "finished"; result: "done" | "failed" | "cancelled" };
// tokensPerSec = eval_count / (eval_duration / 1e9) from Ollama's own response (eval_duration
// is in nanoseconds). null + measured:false when it could not be measured. In demo mode:
// tokensPerSec null, measured false, demo true; the UI shows "Demo mode: simulated".
interface TestResult { firstAnswer: string; tokensPerSec: number | null; measured: boolean;
                       demo: boolean }
// Every API response is wrapped so the UI can label every simulated screen.
interface ApiResponse<T> { mode: "demo" | "real"; data: T }
```

## Manifest (core/manifest <-> server/manifest-store)
```ts
// Every PC-changing forward command maps to exactly one record kind (core/changes.ts
// changeFor). Uninstall derives the reverse ONLY from core's fixed tables.
// `previous` = the state BEFORE SetupPilot, captured by the server immediately before the
// run (not at scan time). null = unknown. Unknown never leads to a removal, except for
// tailscale-serve, where unknown means "turn our sharing off" (the safe direction there).
interface ChangeRecord {
  id: string;
  stepId: StepId;
  kind: "program-installed" | "model-pulled" | "env-var-set" | "file-written" | "service-configured";
  target: string;                 // package id, model tag, env var name, file path,
                                  // or service id: "tailscale-login" | "tailscale-serve"
  previous: string | null;        // model-pulled / program-installed: "absent" | "present".
                                  // env: the previous value, or null = the server CONFIRMED the
                                  // variable was absent (reg query said "not found"). If the
                                  // check fails for any other reason, the step does not run.
                                  // tailscale-login: "logged-out" | "logged-in".
                                  // tailscale-serve: "none" | "existing".
  writtenHash: string | null;     // file-written: FNV-1a of the content SetupPilot wrote
  backupPath: string | null;      // backup of an overwritten file
  reverseCommandId: CommandId | null;  // informational (logs) only; uninstall ignores it
  status: "planned" | "done" | "failed" | "reversed";
  at: string;                     // ISO time from server
}
interface Manifest { schemaVersion: 1; records: ChangeRecord[] }
// buildUninstallPlan(manifest, catalog, roots: AllowedRoots). Roots come from constants in
// server code, never from the manifest or any user-editable file. Paths outside them, or
// unsafe on Windows (trailing dot/space, control chars, <>"|?*, device names), are damaged.
// One item per target. The "before SetupPilot" state (previous, backupPath) comes from the
// baseline: the oldest live record that did not fail (a failed run changed nothing, so the
// next run's pre-run check is the truer state); if every record failed, the oldest. Fixed undo order:
// services, models, settings, files, programs. Duplicate ids or unknown kinds/statuses: damaged.
// A record with the wrong shape (missing field, non-string target, ...) never throws: it is
// grouped under its id and becomes one "skip" item. Display text has control, bidi
// (U+202A-202E, U+2066-2069) and line/paragraph separators (U+2028/2029/0085) removed.
interface AllowedRoots {
  targets: string[];              // where SetupPilot may write config files (not ~/.setuppilot)
  backups: string[];              // where backups live: ~/.setuppilot/backups only
  reserved: string[];             // never a target or workflow-rules folder: ~/.setuppilot
}
// Roots must not overlap: a target root may not contain, equal or sit inside any backups or
// reserved root (checkRoots throws; the server checks its constants at start-up).
interface UninstallItem {
  recordIds: string[];            // live records for this target. The server marks them
                                  // reversed ONLY after the action succeeds; never for skip,
                                  // never for an optional item the user declined.
  action: "run-command" | "restore-file" | "delete-file" | "restore-env" | "keep" | "skip";
                                  // keep = existed before SetupPilot, left as it was (its
                                  //   records ARE marked reversed: nothing left to undo)
                                  // skip = damaged record: nothing runs, records stay live
  command: RenderedCommand | null;
  file: { path: string; restoreFrom: string | null; writtenHash: string | null;
          changedNote: string } | null;  // restore/delete-file only; paths already checked
  optional: boolean;              // Ollama and Tailscale programs are optional to remove
  description: string;            // plain words: "Remove the AI model (frees 4.9 GB)"
}
interface UninstallPlan { items: UninstallItem[]; uninstallHash: string }
// uninstallHash: FNV-1a over each item's [action, [exe, args] | null, file, recordIds, optional],
// built like planHash. Approval binds to it; the runner re-checks it before each item.
//
// Server file rules (Phase 2): non-recursive delete only, never a folder. Before delete or
// restore, resolve the real path (junctions/symlinks) and check it again. Hash the current
// file: if it differs from writtenHash (or writtenHash is null), MOVE it into
// ~/.setuppilot/backups/ instead of deleting or overwriting it, and show changedNote.
// The workflow-rules file is never removed: if ANY live record for that path came from the
// workflow-rules step, Uninstall keeps it and shows "you chose to keep this file in X".
// Removing Ollama warns that its uninstaller may also delete stored models (unverified).
```

## Coding-tool content (core/toolconfig.ts, pure; the server reads and writes files in T14)
```ts
// Docs checked 2026-10-28:
// - opencode.ai/docs/providers: Ollama via "@ai-sdk/openai-compatible", options.baseURL
//   "http://localhost:11434/v1", models map; the provider id "can be any string".
// - opencode.ai/config.json: top-level `provider` is marked deprecated in favour of `providers`
//   (different entry shape, no Ollama example). We follow the documented `provider` example;
//   VERIFY against the installed OpenCode version. A `providers` entry with our key = conflict.
// - docs.ollama.com/context-length: coding tools "should be set to at least 64000 tokens";
//   docs.ollama.com/integrations/opencode and /claude-code: "64k or higher".
const TOOL_USE_MIN_CONTEXT = 64000;
const PROVIDER_KEY = "setuppilot-ollama"; // our own key: never collides with a user's "ollama"
interface OpenCodeEntry {
  key: typeof PROVIDER_KEY;
  value: { npm: "@ai-sdk/openai-compatible"; name: string;
           options: { baseURL: "http://localhost:11434/v1" };
           models: Record<string, { name: string }> };   // one model: the catalog tag
  contextNote: string | null;     // plain words when context < TOOL_USE_MIN_CONTEXT
}
type MergeResult =
  | { kind: "added" | "unchanged"; config: Record<string, unknown> } // new object; input untouched
  | { kind: "conflict" | "invalid"; reason: string };                 // nothing to write
// buildOpenCodeEntry(model, context) -> OpenCodeEntry
// mergeProvider(parsed, entry): adds ONLY provider[PROVIDER_KEY]; every other key is copied
//   as is. Same entry already there: "unchanged" (idempotent). Our key with different content,
//   or in `providers`: "conflict". Not a plain object / provider not an object: "invalid".
//   JSONC with comments is detected by the server (T14) before parsing: snippet only.
// buildRulesFile() -> CLAUDE.md text: plan / build / verify, optional and editable, < 100 lines.
// buildClaudeCodeCommand(model, context) -> { text, caveat }: copy-paste text only, never run
//   or written. PowerShell, this window only ($env:...), from the documented variables
//   ANTHROPIC_BASE_URL=http://localhost:11434, ANTHROPIC_AUTH_TOKEN=ollama, ANTHROPIC_API_KEY="".
//   The docs show only a Bash example: the PowerShell form is our translation, VERIFY.
// contentHash(bytes: Uint8Array) -> FNV-1a over bytes; utf8(text) -> Uint8Array.
```

## Server constants (server/config.ts)
```ts
// Derived once at start from exactly two inputs: os.homedir() and SETUPPILOT_MODE. Never from
// the manifest, the profile, a request, another env var, or any file the user can edit.
type Mode = "demo" | "real";
// modeFor(env, platform): "real" only when env.SETUPPILOT_MODE === "real" AND platform ===
// "win32". Anything else ("REAL", "true", "1", "", unset, other OS) is "demo".
interface Candidate { path: string | null; confirmed: boolean } // confirmed = checked by the
                                // human on a real machine; every candidate starts false (VERIFY)
interface ServerConfig {        // deep-frozen
  mode: Mode; host: "127.0.0.1"; port: number;
  home: string;                 // normalised ("C:/Users/me"); must be a safe absolute drive
                                // path below the drive root, else StartupError (fails closed)
  dataDir: string;              // real: <home>/.setuppilot   demo: <home>/.setuppilot/demo
  logDir: string; manifestPath: string; profilePath: string;   // all inside dataDir
  roots: AllowedRoots;          // targets [<home>/.config/opencode]
                                // backups [<dataDir>/backups]   reserved [<home>/.setuppilot]
  modelsDir: string;            // <home>/.ollama/models (Ollama FAQ); read for free disk only
  modelsDrive: string;          // "C:/": must exist at start
  openCodeConfig: Candidate;    // <home>/.config/opencode/opencode.json, confirmed false
  exes: Record<string, Candidate>;  // one per whitelist exe name, absolute candidate paths
  disabledSteps: StepId[];      // real: ["remote-access"]; demo: []
}
// buildConfig(home, mode) -> ServerConfig; loadConfig(deps?) reads the two inputs once.
// startupCheck(config, fs?): checkRoots(roots), modelsDrive exists, logDir and backups can be
// created; otherwise StartupError with a plain message and the server does not start.
// openCodeWriteMode(config): demo -> "simulate"; real + unconfirmed -> "snippet"; real +
// confirmed -> "write".
```

## Server-only shapes (server/types.ts; never sent by the UI)
```ts
interface StoredPlan {            // created by POST /api/plan, held in server memory
  planId: string;                 // random, server-generated
  subject: "setup" | "uninstall";
  plan: Plan | UninstallPlan;     // built on the server from its own profile, manifest,
                                  // constants and tools-config content
  hash: string;                   // planHash or uninstallHash at creation
  createdAt: string;
}
// POST /api/run accepts exactly { approvalId }. The runner loads the approval, then the
// StoredPlan by approval.planId, recomputes the hash and compares it with both. Any mismatch
// refuses (NOT_APPROVED) and voids the approval. Approvals are single-use.
interface Session { token: string }  // random per server start; required in the
                                     // X-SetupPilot-Token header on every state-changing route
interface ExecRequest { exe: string; args: string[]; timeoutMs: number }  // exe = absolute path
interface ExecResult { exitCode: number | null; timedOut: boolean; cancelled: boolean }
interface Executor {
  run(req: ExecRequest, onLine: (line: string) => void, signal: AbortSignal): Promise<ExecResult>;
}
// FakeExecutor (tests + demo mode) and RealExecutor (spawn, shell:false). RealExecutor is
// constructed only when SETUPPILOT_MODE=real on Windows; demo is the default.
```

## Re-analyze (core/analyze -> ui)
```ts
interface ProfileChange { field: string; from: string; to: string; text: string } // "RAM 16 -> 32 GB"
interface UpgradeRung {
  model: Model;
  fitsNow: boolean;
  gain: string;                   // plain words, from tier.gainNote
  needs: string | null;           // "about 4 GB more free memory" when not fitting
  isEstimate: true;
}
interface UpgradeLadder {
  changes: ProfileChange[];
  current: Model | null;
  rungs: UpgradeRung[];           // ascending, starting above current
  tips: string[];                 // no-hardware tips from explanations.json `tips`; numbers only from the scan
  keepOldModelAsRollback: true;
}
```

## Allowed write locations (server constants; passed to core as AllowedRoots)
- `~/.setuppilot/`: logs, profile.json, manifest.json. Written by the server only; never a
  manifest target, so Uninstall can never delete the audit trail.
- `roots.backups` = `~/.setuppilot/backups/`: the only place a restore may come from.
- `roots.reserved` = `~/.setuppilot/`: never a target or workflow-rules folder.
- `roots.targets` = the coding tool's config folder: `buildPlan` and `buildUninstallPlan`
  reject coding-tool-config paths outside it. OpenCode's Windows path is unverified: in real
  mode the file is written only once the path is marked confirmed in server constants;
  otherwise (and whenever the existing file is JSONC with comments) the UI shows the snippet
  to paste instead and nothing is written.
- `workflow-rules`: a folder the user picks in the UI. The path must be safe (same Windows
  checks), not inside backups or reserved, the file name is fixed (`CLAUDE.md`), and an
  existing file is never overwritten. Uninstall leaves it in place and says so.
- Never written: Claude Code's settings or user environment variables. For Claude Code the
  UI shows a copy-paste command only, with the plain-language note about context size.
