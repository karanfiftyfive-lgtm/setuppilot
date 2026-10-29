// One setup step: what / why / what changes / technical details / Approve + Skip / status.
// Required steps: Skip is disabled and the card says why. Skipped steps show their reason.
import { useState } from "react";
import type { StepStatus } from "../../../core/types";
import { COPY } from "../model/copy";
import { STATUS_LABEL } from "../model/labels";
import type { StepCardView } from "../model/plan";
import { GlossaryText } from "./GlossaryText";

interface Props {
  step: StepCardView;
  status: StepStatus;
  reason: string | null;
  output: string[];
  reviewing: boolean;          // "Review each step" mode: show Approve / Skip
  onApprove: () => void;
  onSkip: () => void;
}

export function StepCard({ step, status, reason, output, reviewing, onApprove, onSkip }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const label = STATUS_LABEL[status];
  return (
    <li className={`step step-${status}`}>
      <h3>
        <span className="status-icon" aria-hidden="true">{label.icon}</span> {step.number}. <GlossaryText text={step.what} />
      </h3>
      <p className="status-word">{label.word}</p>
      {status === "skipped" && reason && <p className="skip-reason"><GlossaryText text={reason} /></p>}
      {status !== "skipped" && (
        <dl>
          <dt>Why it matters</dt>
          <dd><GlossaryText text={step.why} /></dd>
          <dt>What changes on your PC</dt>
          <dd><GlossaryText text={step.changes} /></dd>
        </dl>
      )}
      {step.smallContext && status !== "skipped" && <p className="info"><GlossaryText text={step.smallContext} /></p>}
      {step.osPromptWarning && status === "waiting" && <p className="info">{step.osPromptWarning}</p>}
      {step.requiredReason && <p className="required">{COPY.plan.requiredNote} {step.requiredReason}</p>}
      {step.commands.length > 0 && (
        <>
          <button type="button" className="link" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? COPY.plan.hideDetails : COPY.plan.details}
          </button>
          {showDetails && <pre className="commands">{step.commands.join("\n")}</pre>}
        </>
      )}
      {output.length > 0 && (
        <>
          <p className="info">{COPY.plan.outputCaption}</p>
          <pre className="output" aria-label="Simulated output">{output.join("\n")}</pre>
        </>
      )}
      {reviewing && status === "waiting" && (
        <div className="actions">
          <button type="button" onClick={onApprove}>{COPY.plan.approve}</button>
          <button type="button" className="secondary" onClick={onSkip} disabled={step.required} aria-disabled={step.required}>
            {COPY.plan.skip}
          </button>
        </div>
      )}
    </li>
  );
}
