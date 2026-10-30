// One setup step as a compact row: status symbol + plain name + status word, Approve / Skip
// when reviewing, and "What does this step do?" folding out what / why / what changes /
// technical details. Required steps can't be skipped; skipped steps show their reason.
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
  const label = STATUS_LABEL[status];
  return (
    <li className={`step-row step-${status}`}>
      <div className="step-head">
        <span className="step-status" aria-hidden="true">{label.icon}</span>
        <span className="step-title">
          <strong>{COPY.stepNames[step.id]}</strong>
          <span className="step-word">{label.word}</span>
        </span>
        {reviewing && status === "waiting" && (
          <span className="step-actions">
            <button type="button" className="primary small" onClick={onApprove}>{COPY.plan.approve}</button>
            <button type="button" className="secondary small" onClick={onSkip} disabled={step.required}
              title={step.required ? COPY.plan.requiredNote : undefined}>{COPY.plan.skip}</button>
          </span>
        )}
      </div>
      {status === "skipped" && reason && <p className="step-reason"><GlossaryText text={reason} /></p>}
      {status === "waiting" && step.osPromptWarning && <p className="note small">{step.osPromptWarning}</p>}
      {step.smallContext && status !== "skipped" && <p className="note small"><GlossaryText text={step.smallContext} /></p>}
      <details className="more">
        <summary>{COPY.plan.whatHappens}</summary>
        <p><GlossaryText text={step.what} /></p>
        <dl>
          <dt>Why it matters</dt>
          <dd><GlossaryText text={step.why} /></dd>
          <dt>What changes on your PC</dt>
          <dd><GlossaryText text={step.changes} /></dd>
        </dl>
        {step.requiredReason && <p className="muted">{COPY.plan.requiredNote} {step.requiredReason}</p>}
        {step.commands.length > 0 && (
          <details className="more nested">
            <summary>{COPY.plan.details}</summary>
            <pre className="commands">{step.commands.join("\n")}</pre>
          </details>
        )}
        {output.length > 0 && (
          <>
            <p className="muted">{COPY.plan.outputCaption}</p>
            <pre className="output" aria-label="Simulated output">{output.join("\n")}</pre>
          </>
        )}
      </details>
    </li>
  );
}
