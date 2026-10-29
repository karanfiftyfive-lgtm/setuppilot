// Turns a goal + scanned PC + recommendation into the full, approvable Plan.
import { COMMANDS, renderCommand, renderContextFromCatalog } from "./commands/whitelist";
import { explanations, goals as allGoals } from "./data";
import { contentHash, fnv1a, utf8 } from "./hash";
import { baseOf, checkRoots, isInsideRoots, isSafePath } from "./paths";
import { skipReason, STEP_DEFS, stepCommands } from "./steps";
import { contextNote } from "./toolconfig";
import type {
  AllowedRoots, BuildOptions, Catalog, ErrorCode, FileWrite, GoalId, MachineProfile, Plan, PlannedStep, Recommendation,
  StepId, StepText,
} from "./types";

/** What the server will write for each file-writing step. Decided server-side, hashed here. */
export type FileInputs = Partial<Record<FileWrite["kind"], { targetPath: string; content: string }>>;

/** Download time at the assumed connection speed. Always shown as an estimate. */
export function downloadMinutes(sizeGb: number, catalog: Catalog): number {
  const megabits = sizeGb * 8000; // 1 GB = 8000 megabits (decimal units, like download sizes)
  return Math.ceil(megabits / catalog.assumedDownloadMbps / 60);
}

function fill(text: StepText, vars: Record<string, string>): StepText {
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
  return Object.fromEntries(
    Object.entries(text).map(([k, v]) => [k, typeof v === "string" ? sub(v) : v]),
  ) as unknown as StepText;
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

/**
 * Coding-tool config only inside the server's fixed folder; workflow rules only as a new
 * CLAUDE.md, never inside the backups or SetupPilot's own folder.
 */
function checkFileTarget(kind: FileWrite["kind"], targetPath: string, roots: AllowedRoots): void {
  const guarded = [...roots.backups, ...roots.reserved];
  const ok = kind === "coding-tool-config"
    ? isInsideRoots(targetPath, roots.targets)
    : isSafePath(targetPath) && baseOf(targetPath) === "CLAUDE.md" && !isInsideRoots(targetPath, guarded);
  if (!ok) throw new PlanError(`Refusing to plan a ${kind} file at "${targetPath}"`);
}

export function buildPlan(
  goalId: GoalId,
  profile: MachineProfile,
  rec: Recommendation,
  catalog: Catalog,
  files: FileInputs = {},
  roots: AllowedRoots = { targets: [], backups: [], reserved: [] },
  opts: BuildOptions = {},
): Plan {
  checkRoots(roots);
  const goal = (opts.goals ?? allGoals).find((g) => g.id === goalId);
  if (!goal) throw new Error(`Unknown goal "${goalId}"`);
  const disabled = new Set<StepId>(opts.disabledSteps ?? []);
  for (const id of disabled) {
    // Only optional steps can be switched off; a typo must not silently skip nothing.
    if (!Object.hasOwn(STEP_DEFS, id)) throw new PlanError(`Unknown step "${id}" in disabledSteps`);
    if (STEP_DEFS[id].required) throw new PlanError(`Step "${id}" is required and can't be disabled`);
  }
  const ctx = renderContextFromCatalog(catalog);
  const vars = {
    model: rec.model.displayName,
    sizeGb: String(rec.model.q4SizeGb),
    context: String(rec.context),
  };

  const steps: PlannedStep[] = goal.stepIds.map((id) => {
    const def = { ...STEP_DEFS[id], commandIds: [...STEP_DEFS[id].commandIds] };
    if (id === "download-model") {
      def.diskGb = rec.model.q4SizeGb;
      def.estimatedMinutes = downloadMinutes(rec.model.q4SizeGb, catalog);
    }
    const { osPromptWarning: _ignored, ...text } = explanations.steps[id];
    let reason = skipReason(id, profile, rec, catalog);
    if (disabled.has(id)) {
      // Disabled (not yet verified on a real PC): always skipped, so it never runs. Step 7 keeps its
      // own "not needed" reason when that applies, since it's the truthful one (D43); otherwise, and
      // for step 8 even over its sharing refusal, the "not available yet" text is shown.
      if (!text.disabled) throw new PlanError(`Step "${id}" has no "disabled" text`);
      if (!(id === "speed-boost" && reason)) reason = text.disabled;
    }
    // Skipped steps carry no commands, so they can never be part of an approval.
    const commands = reason ? [] : stepCommands(id, profile, rec).map((c) => renderCommand(c.id, c.params, ctx));
    const file = def.writesFile && !reason ? files[def.writesFile] : undefined;
    if (file && def.writesFile) checkFileTarget(def.writesFile, file.targetPath, roots);
    const fileWrite: FileWrite | null = file && def.writesFile
      ? { kind: def.writesFile, targetPath: file.targetPath, contentHash: contentHash(utf8(file.content)) }
      : null;
    const note = id === "connect-coding-tool" && !reason ? contextNote(rec.context) : null;
    const filled = fill(note ? { ...text, smallContext: note } : text, vars);
    return {
      def, text: filled, status: reason ? "skipped" : "waiting", skipReason: reason, commands, fileWrite,
      demoLabel: opts.demo && !reason ? explanations.labels.demo : null,
    };
  });

  const active = steps.filter((s) => s.status !== "skipped");
  const usesWinget = active.some((s) => s.commands.some((c) => COMMANDS[c.commandId]?.exe === "winget"));
  const preflight: ErrorCode[] = [];
  if (!profile.internet && active.some((s) => s.def.needsInternet)) preflight.push("NO_INTERNET");
  if (!profile.tools.winget && usesWinget) preflight.push("NO_WINGET");
  if (rec.diskShortfallGb !== null) preflight.push("LOW_DISK");
  // Not an admin: Windows will ask someone who is. A warning, not a reason to skip.
  if (steps.some((s) => s.def.id === "remote-access" && s.skipReason === explanations.steps["remote-access"].refused)) {
    preflight.push("SHARING_IN_USE");
  }
  if (!profile.isAdmin && active.some((s) => s.def.needsAdmin || s.def.osPromptWarning)) preflight.push("NO_ADMIN");

  const hashInput = JSON.stringify({
    goal: goalId,
    model: rec.model.id,
    // [exe, args] as data, not the display string; plus exactly which file gets what content.
    steps: active.map((s) => [s.def.id, s.commands.map((c) => [c.exe, c.args]), s.fileWrite]),
  });

  return {
    goal: goalId,
    modelId: rec.model.id,
    steps,
    totalEstimatedMinutes: Math.ceil(active.reduce((sum, s) => sum + s.def.estimatedMinutes, 0)),
    isEstimate: true,
    preflight,
    planHash: fnv1a(hashInput),
  };
}
