// Re-analyze screen: "My PC changed" compares two scans (core/analyze.ts) and shows the
// upgrade ladder, the no-hardware tips and the rollback promise. Gains are estimates.
import { buildLadder, diffProfiles } from "../../../core/analyze";
import type { GoalId, MachineProfile } from "../../../core/types";
import { COPY } from "./copy";
import { catalog, goalById } from "./demo";
import { recommendFor } from "./scan";

export interface RungView { name: string; fitsNow: boolean; gain: string; needs: string | null }

export interface ReanalyzeView {
  changes: string[];
  current: string | null;
  rungs: RungView[];
  tips: string[];
  rollback: string;
}

export function reanalyzeView(goal: GoalId, before: MachineProfile, after: MachineProfile): ReanalyzeView {
  const currentModelId = recommendFor(goal, before).model.id;
  const ladder = buildLadder(before, after, currentModelId, catalog, goalById(goal).modelUse);
  return {
    // Labelled: in the demo these compare two sample PCs; nothing was really scanned or installed.
    changes: diffProfiles(before, after).map((c) => `[simulated scan] ${c.text}`),
    current: ladder.current?.displayName ?? null,
    rungs: ladder.rungs.map((r) => ({ name: r.model.displayName, fitsNow: r.fitsNow, gain: r.gain, needs: r.needs })),
    tips: [...ladder.tips],
    rollback: ladder.keepOldModelAsRollback ? COPY.reanalyze.rollback : "",
  };
}
