import { useState } from "react";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";

export function TestRun({ modelName, onBack, onNext }: { modelName: string; onBack: () => void; onNext: () => void }) {
  const [asked, setAsked] = useState(false);
  return (
    <Layout title={COPY.test.title} onBack={onBack} onNext={onNext}>
      <p>Question for {modelName}: "{COPY.test.question}"</p>
      {!asked && <button type="button" onClick={() => setAsked(true)}>Ask (simulated)</button>}
      {asked && (
        <section className="answer" role="status">
          <p>{COPY.test.answer}</p>
          <p className="info">{COPY.test.speed}</p>
        </section>
      )}
    </Layout>
  );
}
