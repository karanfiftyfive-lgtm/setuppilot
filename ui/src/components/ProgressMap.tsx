// A progress bar plus a list of steps with a word and a symbol each (never colour alone).
import type { Plan } from "../../../core/types";
import { COPY } from "../model/copy";
import { STATUS_LABEL } from "../model/labels";
import { progressPercent, type RunState } from "../model/plan";

export function ProgressMap({ plan, state }: { plan: Plan; state: RunState }) {
  const pct = progressPercent(plan, state);
  return (
    <section className="progress" aria-label="Progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% of steps finished (simulated)`}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>{pct}% of steps finished (simulated)</p>
      <ol className="map">
        {plan.steps.map((s) => {
          const l = STATUS_LABEL[state.status[s.def.id] ?? "waiting"];
          return <li key={s.def.id}><span aria-hidden="true">{l.icon}</span> {COPY.stepNames[s.def.id]}: {l.word}</li>;
        })}
      </ol>
    </section>
  );
}
