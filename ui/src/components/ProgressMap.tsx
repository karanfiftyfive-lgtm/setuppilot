// Progress at a glance: a bar plus "N of M steps finished" in words (never colour alone).
import type { Plan } from "../../../core/types";
import { progressPercent, type RunState } from "../model/plan";

export function ProgressMap({ plan, state }: { plan: Plan; state: RunState }) {
  const pct = progressPercent(plan, state);
  const finished = plan.steps.filter((s) => state.status[s.def.id] === "done" || state.status[s.def.id] === "skipped").length;
  const text = `${finished} of ${plan.steps.length} steps finished (simulated)`;
  return (
    <div className="progress" aria-label="Progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={text}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">{text}</p>
    </div>
  );
}
