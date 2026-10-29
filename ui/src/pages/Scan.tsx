import type { GoalId } from "../../../core/types";
import { GlossaryText } from "../components/GlossaryText";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";
import { PROFILES, profileById, profileSummary, type ProfileId } from "../model/demo";
import { scanView } from "../model/scan";

interface Props { goal: GoalId; profileId: ProfileId; onProfile: (p: ProfileId) => void; onBack: () => void; onNext: () => void }

export function Scan({ goal, profileId, onProfile, onBack, onNext }: Props) {
  const profile = profileById(profileId);
  const v = scanView(goal, profile);
  return (
    <Layout title={COPY.scan.title} onBack={onBack} onNext={onNext}>
      <p>{COPY.scan.hint}</p>
      <label htmlFor="profile">{COPY.scan.pickLabel}</label>
      <select id="profile" value={profileId} onChange={(e) => onProfile(e.target.value as ProfileId)}>
        {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <p className="summary"><GlossaryText text={profileSummary(profile)} /></p>
      <section className="pick">
        <h2>{COPY.scan.pick}: {v.modelName}</h2>
        <h3>{COPY.scan.why}</h3>
        <p><GlossaryText text={v.why} /></p>
        <h3>{COPY.scan.speed}</h3>
        <p>{v.speed}</p>
        {v.weakPc && <p className="info"><GlossaryText text={v.weakPc} /></p>}
        {v.warnings.map((w) => <p key={w} className="info"><GlossaryText text={w} /></p>)}
        <h3>{COPY.scan.next}</h3>
        <p><GlossaryText text={v.nextTier ?? COPY.scan.noNext} /></p>
      </section>
    </Layout>
  );
}
