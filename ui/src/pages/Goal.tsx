import type { GoalId } from "../../../core/types";
import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { goalCards } from "../model/scan";

const GOAL_ICON: Record<GoalId, string> = { chat: "chat", code: "code", remote: "devices", everything: "star" };

interface Props { goal: GoalId | null; onPick: (g: GoalId) => void; onBack: () => void; onNext: () => void }

export function Goal({ goal, onPick, onBack, onNext }: Props) {
  return (
    <Layout step={1} title={COPY.goal.title} lead={COPY.goal.hint} onBack={onBack} onNext={onNext} nextDisabled={goal === null}>
      <div className="goal-grid" role="group" aria-label={COPY.goal.title}>
        {goalCards().map((g) => {
          const picked = goal === g.id;
          return (
            <button key={g.id} type="button" aria-pressed={picked} className={`goal-card${picked ? " picked" : ""}`} onClick={() => onPick(g.id)}>
              <span className="goal-icon"><Icon name={GOAL_ICON[g.id]} size={28} /></span>
              <span className="goal-text">
                <strong>{g.label}</strong>
                <span>{g.description}</span>
                {g.note && <span className="note small">{g.note}</span>}
              </span>
              {picked && <span className="goal-tick"><Icon name="check" size={18} /><span className="sr-only">Chosen</span></span>}
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
