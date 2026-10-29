import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Layout title={COPY.welcome.title} onNext={onNext} nextLabel={COPY.welcome.start}>
      <ul className="points">{COPY.welcome.points.map((p) => <li key={p}>{p}</li>)}</ul>
      <p className="limit">{COPY.welcome.limit}</p>
      <p>{COPY.welcome.demoNote}</p>
    </Layout>
  );
}
