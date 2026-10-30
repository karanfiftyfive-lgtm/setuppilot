import type { GoalId } from "../../../core/types";
import { GlossaryText } from "../components/GlossaryText";
import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { PROFILES, profileById, type ProfileId } from "../model/demo";
import { scanView, specChips } from "../model/scan";

const CHIP_ICON = { memory: "memory", disk: "disk", graphics: "graphics", processor: "chip" } as const;

interface Props { goal: GoalId; profileId: ProfileId; onProfile: (p: ProfileId) => void; onBack: () => void; onNext: () => void }

export function Scan({ goal, profileId, onProfile, onBack, onNext }: Props) {
  const profile = profileById(profileId);
  const v = scanView(goal, profile);
  return (
    <Layout step={2} title={COPY.scan.title} lead={COPY.scan.hint} onBack={onBack} onNext={onNext}>
      <div className="field">
        <label htmlFor="profile">{COPY.scan.pickLabel}</label>
        <select id="profile" value={profileId} onChange={(e) => onProfile(e.target.value as ProfileId)}>
          {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <ul className="chips" aria-label="This PC">
        {specChips(profile).map((c) => (
          <li key={c.key} className="chip">
            <Icon name={CHIP_ICON[c.key]} size={20} />
            <span><span className="chip-label">{COPY.scan.specs[c.key]}</span><span className="chip-value">{c.value}</span></span>
          </li>
        ))}
      </ul>

      <section className="result" aria-labelledby="pick-title">
        <p className="eyebrow">{COPY.scan.pick}</p>
        <h2 id="pick-title" className="result-name">{v.modelName}</h2>
        <p className="badge"><Icon name="bolt" size={16} /> {COPY.scan.speed}: {v.speed}</p>
        {v.weakPc && <p className="note small"><GlossaryText text={v.weakPc} /></p>}
        {v.warnings.map((w) => <p key={w} className="note small"><GlossaryText text={w} /></p>)}
        <details className="more">
          <summary>{COPY.scan.why}</summary>
          <p><GlossaryText text={v.why} /></p>
        </details>
      </section>

      <section className="panel">
        <h3><Icon name="up" size={18} /> {COPY.scan.next}</h3>
        <p><GlossaryText text={v.nextTier ? COPY.reanalyze.youWouldNeed(v.nextTier) : COPY.scan.noNext} /></p>
      </section>
    </Layout>
  );
}
