import { useState } from "react";
import type { GoalId } from "../../../core/types";
import { GlossaryText } from "../components/GlossaryText";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { profileById, type ProfileId } from "../model/demo";
import { reanalyzeView } from "../model/reanalyze";

interface Props { goal: GoalId; profileId: ProfileId; onBack: () => void; onNext?: () => void }

/** "My PC changed": the demo compares the chosen PC with the upgraded one. */
export function Reanalyze({ goal, profileId, onBack, onNext }: Props) {
  const [checked, setChecked] = useState(false);
  const v = reanalyzeView(goal, profileById(profileId), profileById("upgraded-pc"));
  return (
    <Layout title={COPY.reanalyze.title} onBack={onBack} onNext={onNext}>
      {!checked && <button type="button" onClick={() => setChecked(true)}>{COPY.reanalyze.button}</button>}
      {checked && (
        <>
          <h2>{COPY.reanalyze.changes}</h2>
          {v.changes.length ? <ul>{v.changes.map((c) => <li key={c}><GlossaryText text={c} /></li>)}</ul> : <p>No change found.</p>}
          <h2>{COPY.reanalyze.ladder}</h2>
          <ul className="ladder">
            {v.rungs.map((r) => (
              <li key={r.name}>
                <strong>{r.fitsNow ? `[${COPY.reanalyze.fitsNow}]` : `[${COPY.reanalyze.needsMore}]`} {r.name}</strong>: <GlossaryText text={r.gain} />
                {r.needs && <> <GlossaryText text={COPY.reanalyze.youWouldNeed(r.needs)} /></>}
              </li>
            ))}
          </ul>
          <h2>{COPY.reanalyze.tips}</h2>
          <ul>{v.tips.map((t) => <li key={t}><GlossaryText text={t} /></li>)}</ul>
          <p className="info">{v.rollback}</p>
        </>
      )}
    </Layout>
  );
}
