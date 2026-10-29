// Mirrors docs/CONTRACTS.md exactly. Change the contract first, then this file.

export type GoalId = "chat" | "code" | "remote" | "everything";
export type TierId = "1b" | "3b" | "8b" | "14b" | "27b";
export type StepId =
  | "scan-pc" | "choose-model" | "install-runtime" | "download-model" | "safe-defaults"
  | "speed-boost" | "remote-access" | "connect-coding-tool" | "workflow-rules" | "test-run";
export type StepStatus = "waiting" | "running" | "done" | "failed" | "skipped";
export type ErrorCode =
  | "NO_INTERNET" | "NO_WINGET" | "NO_ADMIN" | "LOW_DISK" | "DOWNLOAD_INTERRUPTED"
  | "OLLAMA_NOT_RUNNING" | "COMMAND_FAILED" | "TIMEOUT" | "NOT_APPROVED"
  | "SHARING_IN_USE"
  | "CANCELLED";
export type SpeedWord = "fast" | "okay" | "slow";

export interface GpuInfo {
  name: string;
  vendor: "nvidia" | "amd" | "intel" | "other";
  discrete: boolean;
  vramGb: number | null;
  vramSource: "nvidia-smi" | "wmi" | "manual" | "mock" | "none";
}

export interface MachineProfile {
  schemaVersion: 1;
  scannedAt: string;
  os: { name: "windows" | "macos" | "linux"; version: string; arch: "x64" | "arm64" };
  cpu: { name: string; cores: number; threads: number };
  ramGb: { total: number; free: number };
  gpus: GpuInfo[];
  diskFreeGb: number;
  ollama: { installed: boolean; version: string | null; running: boolean; models: string[] };
  tools: { winget: boolean; tailscale: boolean; tailscaleServe: "none" | "existing" | null };
  isAdmin: boolean;
  internet: boolean;
  vramOverrideGb: number | null;
}

export interface Tier {
  id: TierId;
  label: string;
  speedLabel: { gpu: SpeedWord; cpu: SpeedWord };
  gainNote: string;
}

export interface Model {
  id: string;
  displayName: string;
  ollamaTag: string;
  parametersB: number;
  tier: TierId;
  q4SizeGb: number;
  minMemoryGb: number;
  sizeIsEstimate: true;
  verified: boolean;
  contextOptions: number[];
  defaultContext: number;
  goals: ("chat" | "code")[];
  roles?: "narrator"[];
  requiresDiscreteGpu: boolean;
  qualityNote: string;
  license: string;
}

export interface Catalog {
  schemaVersion: 1;
  overheadGb: number;
  safetyMarginGb: number;
  ramUsableFraction: number;
  diskReserveGb: number;
  runtimeDiskGb: number;
  speedBoostMinSpareVramGb: number;
  assumedDownloadMbps: number;
  tiers: Tier[];
  models: Model[];
}

export interface Recommendation {
  model: Model;
  usableMemoryGb: number;
  memorySource: "vram" | "ram";
  why: string;
  speed: { label: SpeedWord; isEstimate: true; tokPerSecRange?: null };
  context: number;
  nextTier: { model: Model; needsUsableGb: number; unlockHint: string } | null;
  weakPc: null | { reason: string; options: ("small-model" | "remote-machine" | "upgrade-tips")[] };
  diskShortfallGb: number | null;
  warnings: string[];
}

export interface Goal {
  id: GoalId;
  label: string;
  description: string;
  modelUse: "chat" | "code" | "any";
  stepIds: StepId[];
}

/** Goal screen: which of a goal's steps are off in this version, and a plain note (CONTRACTS.md). */
export interface GoalAvailability { goal: GoalId; disabledSteps: StepId[]; note: string | null }

export type CommandId = string;

export interface StepDef {
  id: StepId;
  required: boolean;
  advanced: boolean;
  commandIds: CommandId[];
  estimatedMinutes: number;
  diskGb: number;
  needsAdmin: boolean;
  needsInternet: boolean;
  osPromptWarning: boolean;
  writesFile: "coding-tool-config" | "workflow-rules" | null;
}

export interface StepText {
  what: string;
  why: string;
  changes: string;
  requiredReason?: string;
  notNeeded?: string;
  notNeededFull?: string;
  signInNote?: string;
  refused?: string;
  disabled?: string;
  smallContext?: string;
}

export interface RenderedCommand { commandId: CommandId; exe: string; args: string[]; display: string }

export interface PlannedStep {
  def: StepDef;
  text: StepText;
  status: StepStatus;
  skipReason: string | null;
  commands: RenderedCommand[];
  fileWrite: FileWrite | null;
  demoLabel: string | null;
}

export interface FileWrite {
  kind: "coding-tool-config" | "workflow-rules";
  targetPath: string;
  contentHash: string;
}

export interface BuildOptions { goals?: Goal[]; disabledSteps?: StepId[]; demo?: boolean }

export interface Plan {
  goal: GoalId;
  modelId: string;
  steps: PlannedStep[];
  totalEstimatedMinutes: number;
  isEstimate: true;
  preflight: ErrorCode[];
  planHash: string;
}

export interface ParamRule {
  kind: "catalogTag" | "modelTag" | "contextSize" | "positiveInt" | "enum" | "ownChildPid";
  values?: string[];
}
export interface RenderContext {
  catalogTags: string[];
  allowedTags: string[];
  contextSizes: number[];
  ownChildPids: number[];
}

export interface CommandSpec {
  id: CommandId;
  exe: string;
  args: (string | { param: string })[];
  params: Record<string, ParamRule>;
  needsAdmin: boolean;
  changesPc: boolean;
  reverseId: CommandId | null;
  timeoutSec: number;
  privateOutput?: boolean;
  /** log: every line, capped. progress: latest line only, throttled, no history (CONTRACTS.md). */
  output: "log" | "progress";
}

/** How one run ended (server/executor). Never carries output text, public or private. */
export interface ExecResult {
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  spawnError: "refused" | "invalid" | "not-found" | "other" | null;
  truncated: boolean;
  killConfirmed: boolean | null;
}
/** Keys of data/explanations.json execDetails: fixed plain text, never built from output. */
export type ExecDetail =
  | "exeUnconfirmed" | "commandFailed" | "notFound" | "downloadInterrupted" | "timedOut" | "timedOutMayRun" | "cancelled";
export interface ExecOutcome { status: "done" | "failed"; code: ErrorCode | null; detail: ExecDetail | null }

export interface Approval {
  id: string;
  subject: "setup" | "uninstall";
  planId: string;
  hash: string;
  mode: "all" | "step";
  stepId: StepId | null;
  approvedAt: string;
}

type RunAt = { stepId: StepId | null; item: number | null };
export type RunEvent =
  | ({ type: "status"; status: StepStatus } & RunAt)
  | ({ type: "output"; line: string } & RunAt)
  | ({ type: "progress"; percent: number | null } & RunAt)
  | ({ type: "error"; code: ErrorCode; detail: string } & RunAt)
  | { type: "finished"; result: "done" | "failed" | "cancelled" };

export interface TestResult { firstAnswer: string; tokensPerSec: number | null; measured: boolean; demo: boolean }
export interface ApiResponse<T> { mode: "demo" | "real"; data: T }

export type EndpointId = "ollama.tags" | "ollama.generate";
export interface EndpointSpec {
  id: EndpointId;
  method: "GET" | "POST";
  path: "/api/tags" | "/api/generate";
  timeoutSec: number;
  maxResponseBytes: number;
}
export interface GenerateParams {
  purpose: "test" | "narrate";
  model: string;
  textKey: string | null;
  numCtx: number;
}
export interface HttpContext {
  catalogTags: string[];
  installedTags: string[];
  contextSizes: number[];
  narratorTexts: Record<string, string>;
}
export interface RenderedRequest { endpointId: EndpointId; method: "GET" | "POST"; url: string; body: string | null; display: string }

export interface ChangeRecord {
  id: string;
  stepId: StepId;
  kind: "program-installed" | "model-pulled" | "env-var-set" | "file-written" | "service-configured";
  target: string;
  previous: string | null;
  backupPath: string | null;
  writtenHash: string | null;
  reverseCommandId: CommandId | null;
  status: "planned" | "done" | "failed" | "reversed";
  at: string;
}

export interface Manifest { schemaVersion: 1; records: ChangeRecord[] }

export interface UninstallItem {
  recordIds: string[];
  action: "run-command" | "restore-file" | "delete-file" | "restore-env" | "keep" | "skip";
  command: RenderedCommand | null;
  file: { path: string; restoreFrom: string | null; writtenHash: string | null; changedNote: string } | null;
  optional: boolean;
  description: string;
}

export interface UninstallPlan { items: UninstallItem[]; uninstallHash: string }

export interface AllowedRoots { targets: string[]; backups: string[]; reserved: string[] }

export interface ProfileChange { field: string; from: string; to: string; text: string }

export interface UpgradeRung {
  model: Model;
  fitsNow: boolean;
  gain: string;
  needs: string | null;
  isEstimate: true;
}

export interface UpgradeLadder {
  changes: ProfileChange[];
  current: Model | null;
  rungs: UpgradeRung[];
  tips: string[];
  keepOldModelAsRollback: true;
}
