import { useState } from "react";
import type { GoalId } from "../../../core/types";
import { GlossaryText } from "../components/GlossaryText";
import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { profileById, type ProfileId } from "../model/demo";
import { reanalyzeView } from "../model/reanalyze";

interface Props { goal: GoalId; profileId: ProfileId; onBack: () => void; onNext?: () => void }

/** "My PC changed": the demo compares the chosen PC with a sample upgraded PC. */
export function Reanalyze({ goal, profileId, onBack, onNext }: Props) {
  const [checked, setChecked] = useState(false);
  const v = reanalyzeView(goal, profileById(profileId), profileById("upgraded-pc"));
  return (
    <Layout step={5} title={COPY.reanalyze.title} lead={COPY.reanalyze.lead} onBack={onBack} onNext={onNext}>
      {!checked && (
        <>
          <div className="actions"><button type="button" className="primary big" onClick={() => setChecked(true)}><Icon name="up" size={20} /> {COPY.reanalyze.button}</button></div>
          <p className="muted small">{COPY.reanalyze.sampleNote}</p>
        </>
      )}
      {checked && (
        <>
          <section className="panel">
            <h2>{COPY.reanalyze.changes}</h2>
            {v.changes.length ? <ul className="plain">{v.changes.map((c) => <li key={c}><GlossaryText text={c} /></li>)}</ul> : <p>No change found.</p>}
          </section>
          <h2>{COPY.reanalyze.ladder}</h2>
          <ul className="rungs">
            {v.rungs.map((r) => (
              <li key={r.name} className={`rung ${r.fitsNow ? "fits" : "needs"}`}>
                <span className="rung-badge">{r.fitsNow ? <><Icon name="check" size={16} /> {COPY.reanalyze.fitsNow}</> : COPY.reanalyze.needsMore}</span>
                <strong>{r.name}</strong>
                <span><GlossaryText text={r.gain} /></span>
                {r.needs && <span className="muted"><GlossaryText text={COPY.reanalyze.youWouldNeed(r.needs)} /></span>}
              </li>
            ))}
          </ul>
          <details className="more">
            <summary>{COPY.reanalyze.tips}</summary>
            <ul className="plain">{v.tips.map((t) => <li key={t}><GlossaryText text={t} /></li>)}</ul>
          </details>
          <p className="note small"><Icon name="undo" size={18} /> <span>{v.rollback}</span></p>
        </>
      )}
    </Layout>
  );
}
