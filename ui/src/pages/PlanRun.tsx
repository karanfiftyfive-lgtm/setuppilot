// Plan and simulated setup. "Approve all" runs the waiting steps one after another (simulated);
// "Review each step" shows Approve / Skip on every row. Nothing is executed.
import { useEffect, useState } from "react";
import type { Plan } from "../../../core/types";
import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { ProgressMap } from "../components/ProgressMap";
import { StepCard } from "../components/StepCard";
import { COPY } from "../model/copy";
import { approveStep, isFinished, nextWaiting, skipStep, stepCards, type RunState } from "../model/plan";

interface Props { plan: Plan; state: RunState; setState: (s: RunState) => void; onBack: () => void; onNext: () => void }

export function PlanRun({ plan, state, setState, onBack, onNext }: Props) {
  const [mode, setMode] = useState<"choose" | "all" | "each">("choose");
  const finished = isFinished(plan, state);
  const cards = stepCards(plan);

  useEffect(() => {
    if (mode !== "all") return;
    const id = nextWaiting(plan, state);
    if (!id) return;
    const t = setTimeout(() => setState(approveStep(plan, state, id)), 450);
    return () => clearTimeout(t);
  }, [mode, plan, state, setState]);

  return (
    <Layout step={3} title={COPY.plan.title} lead={COPY.plan.lead} onBack={onBack} onNext={onNext} nextDisabled={!finished}>
      <section className="panel run-panel">
        <p className="run-summary"><Icon name="check" size={18} /> {COPY.plan.stepsLine(plan.steps.length, plan.totalEstimatedMinutes)}</p>
        <ProgressMap plan={plan} state={state} />
        {mode === "choose" && !finished && (
          <>
            <div className="actions">
              <button type="button" className="primary big" onClick={() => setMode("all")}>{COPY.plan.approveAll}</button>
              <button type="button" className="secondary" onClick={() => setMode("each")}>{COPY.plan.reviewEach}</button>
            </div>
            <p className="muted small">{COPY.plan.approveAllHint(cards.filter((c) => c.osPromptWarning).length)}</p>
          </>
        )}
        {finished && <p className="done" role="status"><Icon name="check" size={20} /> {COPY.plan.allDone}</p>}
      </section>
      <ol className="steps">
        {cards.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            status={state.status[step.id] ?? "waiting"}
            reason={state.reasons[step.id] ?? null}
            output={state.output[step.id] ?? []}
            reviewing={mode === "each"}
            onApprove={() => setState(approveStep(plan, state, step.id))}
            onSkip={() => setState(skipStep(plan, state, step.id))}
          />
        ))}
      </ol>
    </Layout>
  );
}
