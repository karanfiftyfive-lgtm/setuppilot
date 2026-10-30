import { useState } from "react";
import { Icon } from "../components/Icon";
import { Layout } from "../components/Layout";
import { COPY } from "../model/copy";

export function TestRun({ modelName, onBack, onNext }: { modelName: string; onBack: () => void; onNext: () => void }) {
  const [asked, setAsked] = useState(false);
  return (
    <Layout step={4} title={COPY.test.title} lead={COPY.test.lead} onBack={onBack} onNext={onNext}>
      <div className="chat" aria-live="polite">
        <div className="bubble me"><span className="who">{COPY.test.you}</span>{COPY.test.question}</div>
        {asked && (
          <div className="bubble ai"><span className="who">{COPY.test.ai} ({modelName})</span>{COPY.test.answer}</div>
        )}
      </div>
      {!asked && <div className="actions"><button type="button" className="primary big" onClick={() => setAsked(true)}><Icon name="chat" size={20} /> {COPY.test.ask}</button></div>}
      {asked && <p className="note small"><Icon name="info" size={18} /> <span>{COPY.test.speed}</span></p>}
    </Layout>
  );
}
