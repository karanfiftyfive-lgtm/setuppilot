import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Layout step={0} title={COPY.welcome.title} lead={COPY.welcome.lead} onNext={onNext} nextLabel={COPY.welcome.start}>
      <ul className="benefits">
        {COPY.welcome.points.map((p) => (
          <li key={p.title} className="benefit">
            <span className="benefit-icon"><Icon name={p.icon} /></span>
            <strong>{p.title}</strong>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
      <p className="note"><Icon name="info" size={20} /> <span>{COPY.welcome.limit}</span></p>
      <p className="muted">{COPY.welcome.demoNote}</p>
    </Layout>
  );
}
