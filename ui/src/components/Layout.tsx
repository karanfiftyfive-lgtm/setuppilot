// Every screen sits inside this: brand bar with the "Demo mode: simulated" label, a stepper
// that shows where you are, a short lead line, and a Back / Next bar.
import type { ReactNode } from "react";
import { COPY } from "../model/copy";
import { DEMO_LABEL } from "../model/demo";
import { Icon } from "./Icon";

export function DemoBanner() {
  return (
    <p className="demo-pill" role="status">
      <Icon name="info" size={18} /> <strong>{DEMO_LABEL}</strong>
      <span className="demo-pill-more">. Nothing is installed, scanned or measured.</span>
    </p>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="stepper" aria-label="Progress through the setup">
      {COPY.stepper.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={label} className={`stepper-item ${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper-dot">{state === "done" ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="stepper-label">{label}<span className="sr-only">{state === "done" ? " (done)" : ""}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

interface LayoutProps {
  step: number;
  title: string;
  lead?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function Layout({ step, title, lead, children, onBack, onNext, nextLabel, nextDisabled }: LayoutProps) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand"><span className="brand-mark" aria-hidden="true"><Icon name="lock" size={18} /></span>{COPY.appName}</span>
          <DemoBanner />
        </div>
        <div className="topbar-inner"><Stepper step={step} /></div>
      </header>
      <main className="screen">
        <h1 tabIndex={-1}>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </main>
      {(onBack || onNext) && (
        <nav className="bottombar" aria-label="Screens">
          <div className="bottombar-inner">
            {onBack ? <button type="button" className="secondary" onClick={onBack}>{COPY.nav.back}</button> : <span />}
            {onNext && <button type="button" className="primary" onClick={onNext} disabled={nextDisabled}>{nextLabel ?? COPY.nav.next}</button>}
          </div>
        </nav>
      )}
    </div>
  );
}
