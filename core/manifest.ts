// Manifest helpers and the uninstall plan. Uninstall reads ONLY the manifest and undoes only
// what the records prove SetupPilot did; when unsure, it keeps (see changes.ts for services).
import { CONTEXT_VAR, PROGRAMS, SERVICES, UNDO_ORDER } from "./changes";
import { renderCommand, renderContextFromCatalog, WhitelistError } from "./commands/whitelist";
import { fnv1a } from "./hash";
import { checkRoots, dirOf, isInsideRoots, normPath } from "./paths";
import type {
  AllowedRoots, Catalog, ChangeRecord, CommandId, Manifest, RenderContext, RenderedCommand, UninstallItem,
  UninstallPlan,
} from "./types";

export { changeFor, PROGRAMS, SERVICES, UNDO_ORDER } from "./changes";

const STATUSES = new Set(["planned", "done", "failed", "reversed"]);
const TAG_FORMAT = /^[a-z0-9._-]+(:[a-z0-9._-]+)?$/;

export const emptyManifest = (): Manifest => ({ schemaVersion: 1, records: [] });

export function addRecord(manifest: Manifest, record: ChangeRecord): Manifest {
  return { ...manifest, records: [...manifest.records, record] };
}

export function setStatus(manifest: Manifest, id: string, status: ChangeRecord["status"]): Manifest {
  return { ...manifest, records: manifest.records.map((r) => (r.id === id ? { ...r, status } : r)) };
}

/**
 * Manifest text is untrusted: strip control characters, bidi controls (which can make a path
 * read backwards) and line/paragraph separators, then cap the length before showing it.
 */
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f\u0085\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
export const show = (s: string) => { const c = s.replace(HIDDEN, ""); return c.length > 80 ? `${c.slice(0, 79)}…` : c; };

const str = (v: unknown) => typeof v === "string";
const strOrNull = (v: unknown) => v === null || typeof v === "string";
/** Records come from a file on disk: check every field's type before trusting any of it. */
function wellFormed(r: unknown): r is ChangeRecord {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  return str(x.id) && str(x.stepId) && str(x.kind) && str(x.target) && str(x.status) && str(x.at)
    && strOrNull(x.previous) && strOrNull(x.writtenHash) && strOrNull(x.backupPath) && strOrNull(x.reverseCommandId);
}

function safeRender(id: CommandId, params: Record<string, string>, ctx: RenderContext): RenderedCommand | null {
  try {
    return renderCommand(id, params, ctx);
  } catch (e) {
    if (e instanceof WhitelistError) return null;
    throw e;
  }
}

// baseline = the record that says what the PC was like before SetupPilot: the oldest live
// record that did not fail (a failed run changed nothing, so the next run saw the truer state).
interface Group { live: ChangeRecord[]; baseline: ChangeRecord; newest: ChangeRecord; damaged: boolean; pos: number }

/** Damaged: nothing runs and the records stay live, so they are never marked reversed. */
const skipItem = (recordIds: string[], what: string): UninstallItem => ({
  recordIds, action: "skip", command: null, file: null, optional: false,
  description: `Skipped: ${what} looks damaged, so I won't run anything for it.`,
});

function itemFor(g: Group, catalog: Catalog, ctx: RenderContext, roots: AllowedRoots): UninstallItem {
  const { baseline, newest } = g;
  const base = { recordIds: g.live.map((r) => r.id), file: null, optional: false };
  const damaged = skipItem(base.recordIds, `the record for "${show(newest.target)}"`);
  const keep = (description: string): UninstallItem => ({ ...base, action: "keep", command: null, description });
  const run = (command: RenderedCommand | null, optional: boolean, description: string): UninstallItem =>
    command ? { ...base, action: "run-command", command, optional, description } : damaged;
  if (g.damaged) return damaged;

  switch (newest.kind) {
    case "model-pulled": {
      const tag = newest.target;
      const model = catalog.models.find((m) => m.ollamaTag === tag);
      if (!model) {
        return TAG_FORMAT.test(tag)
          ? keep(`${tag} isn't in this version's model list, so I'll leave it. You can remove it in Ollama yourself.`)
          : damaged;
      }
      // Only remove a model the record proves was absent before SetupPilot pulled it.
      if (baseline.previous !== "absent") return keep(`You already had ${tag} (or I can't tell), so I'll keep it.`);
      return run(safeRender("ollama.rm", { tag }, ctx), false,
        `Remove the AI model ${tag} (frees about ${model.q4SizeGb} GB, estimate)`);
    }
    case "program-installed": {
      const p = Object.hasOwn(PROGRAMS, newest.target) ? PROGRAMS[newest.target]! : null;
      if (!p) return damaged;
      if (baseline.previous !== "absent") return keep(`You already had ${p.name} (or I can't tell), so I'll keep it.`);
      // Removing a program is the user's choice; they may use it elsewhere.
      return run(safeRender(p.uninstall, {}, ctx), true, `Remove the program ${p.name}${p.warning ? `. ${p.warning}` : ""}`);
    }
    case "service-configured": {
      const s = Object.hasOwn(SERVICES, newest.target) ? SERVICES[newest.target]! : null;
      if (!s) return damaged;
      return s.undo(baseline.previous) ? run(safeRender(s.off, {}, ctx), s.optional, s.offText) : keep(s.keepText(baseline.previous));
    }
    case "env-var-set": {
      if (newest.target !== CONTEXT_VAR) return damaged;
      const prev = baseline.previous;
      const command = prev === null
        ? safeRender("env.unsetContext", {}, ctx)
        : safeRender("env.restoreContext", { value: prev }, ctx);
      if (!command) return damaged;
      return { ...base, action: "restore-env", command,
        description: prev === null ? "Remove the AI memory setting SetupPilot added" : `Put the AI memory setting back to ${prev}` };
    }
    case "file-written": {
      // Any workflow-rules record for this path means it is the user's chosen file: never remove it.
      if (g.live.some((r) => r.stepId === "workflow-rules")) {
        return keep(`You chose to keep this file in ${show(dirOf(newest.target))}.`);
      }
      if (!isInsideRoots(newest.target, roots.targets)) return damaged;
      const backup = baseline.backupPath;
      if (backup !== null && !isInsideRoots(backup, roots.backups)) return damaged;
      // The server compares the current file with writtenHash; if the user edited it, it
      // moves their version to backups instead of deleting or overwriting it.
      const file = { path: newest.target, restoreFrom: backup, writtenHash: newest.writtenHash,
        changedNote: `You changed this file after SetupPilot wrote it, so I moved your version to the backups folder instead of ${backup ? "overwriting" : "deleting"} it.` };
      return backup === null
        ? { ...base, action: "delete-file", command: null, file, description: `Delete the file SetupPilot created: ${show(newest.target)}` }
        : { ...base, action: "restore-file", command: null, file, description: `Restore your previous version of ${show(newest.target)}` };
    }
    default:
      return damaged;
  }
}

/**
 * One item per target, in the fixed undo order. "planned" and "failed" records count: a crash
 * mid-step may still have changed something. Records before the last "reversed" are already undone.
 * roots must come from server constants, never from the manifest or a user-editable file.
 */
export function buildUninstallPlan(manifest: Manifest, catalog: Catalog, roots: AllowedRoots): UninstallPlan {
  checkRoots(roots);
  const records: unknown[] = manifest.records;
  const idCount = new Map<unknown, number>();
  for (const r of records) {
    const id = typeof r === "object" && r !== null ? (r as { id?: unknown }).id : undefined;
    idCount.set(id, (idCount.get(id) ?? 0) + 1);
  }

  // A record with the wrong shape never throws: it becomes one "skip" item of its own.
  const malformed: UninstallItem[] = [];
  const byTarget = new Map<string, { list: ChangeRecord[]; pos: number }>();
  records.forEach((r, pos) => {
    if (!wellFormed(r)) {
      const id = typeof r === "object" && r !== null ? (r as { id?: unknown }).id : undefined;
      malformed.push(skipItem(typeof id === "string" ? [id] : [], `entry ${pos + 1} in the change list`));
      return;
    }
    const key = `${r.kind}:${r.kind === "file-written" ? normPath(r.target) : r.target}`;
    byTarget.set(key, { list: [...(byTarget.get(key)?.list ?? []), r], pos });
  });

  const groups: Group[] = [];
  for (const { list, pos } of byTarget.values()) {
    const rest = list.slice(list.map((r) => r.status).lastIndexOf("reversed") + 1);
    if (rest.length === 0) continue;
    // Duplicate ids would let one "mark reversed" hide another target; unknown statuses are tampering.
    const damaged = list.some((r) => idCount.get(r.id)! > 1 || !STATUSES.has(r.status));
    const baseline = rest.find((r) => r.status !== "failed") ?? rest[0]!;
    groups.push({ live: rest, baseline, newest: rest.at(-1)!, damaged, pos });
  }
  const rank = (k: string) => { const i = UNDO_ORDER.indexOf(k as ChangeRecord["kind"]); return i < 0 ? UNDO_ORDER.length : i; };
  groups.sort((a, b) => rank(a.newest.kind) - rank(b.newest.kind) || b.pos - a.pos);

  const tags = groups.filter((g) => g.newest.kind === "model-pulled").map((g) => g.newest.target);
  const ctx = renderContextFromCatalog(catalog, tags);
  const items = [...groups.map((g) => itemFor(g, catalog, ctx, roots)), ...malformed];
  return { items, uninstallHash: uninstallHash(items) };
}

/**
 * Which records the server may mark "reversed" after handling an item. Only after the action
 * succeeded, never for a skip (damaged) item, never for an optional item the user declined.
 */
export function reversedIdsFor(item: UninstallItem, outcome: "done" | "failed" | "declined"): string[] {
  if (item.action === "skip" || outcome !== "done") return [];
  return [...item.recordIds];
}

/** Same construction as planHash: commands as [exe, args] data, plus files and records. */
export function uninstallHash(items: UninstallItem[]): string {
  return fnv1a(JSON.stringify(items.map((i) =>
    [i.action, i.command ? [i.command.exe, i.command.args] : null, i.file, i.recordIds, i.optional])));
}
