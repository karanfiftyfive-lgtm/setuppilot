import type { GoalId } from "../../../core/types";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { goalCards } from "../model/scan";

interface Props { goal: GoalId | null; onPick: (g: GoalId) => void; onBack: () => void; onNext: () => void }

export function Goal({ goal, onPick, onBack, onNext }: Props) {
  return (
    <Layout title={COPY.goal.title} onBack={onBack} onNext={onNext} nextDisabled={goal === null}>
      <p>{COPY.goal.hint}</p>
      <div className="cards" role="group" aria-label={COPY.goal.title}>
        {goalCards().map((g) => (
          <button key={g.id} type="button" aria-pressed={goal === g.id} className={`card${goal === g.id ? " picked" : ""}`} onClick={() => onPick(g.id)}>
            <strong>{goal === g.id ? "[Chosen] " : ""}{g.label}</strong>
            <span>{g.description}</span>
            {g.note && <span className="info">{g.note}</span>}
          </button>
        ))}
      </div>
    </Layout>
  );
}
