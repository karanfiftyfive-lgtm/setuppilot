// Every screen sits inside this: the "Demo mode: simulated" banner is always visible.
import type { ReactNode } from "react";
import { COPY } from "../model/copy";
import { DEMO_LABEL } from "../model/demo";

export function DemoBanner() {
  return (
    <p className="demo-banner" role="status">
      <strong>{DEMO_LABEL}</strong>. Nothing is installed, scanned or measured.
    </p>
  );
}

interface LayoutProps {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function Layout({ title, children, onBack, onNext, nextLabel, nextDisabled }: LayoutProps) {
  return (
    <main className="screen">
      <header>
        <p className="app-name">{COPY.appName}</p>
        <DemoBanner />
        <h1 tabIndex={-1}>{title}</h1>
      </header>
      {children}
      {(onBack || onNext) && (
        <nav className="nav" aria-label="Screens">
          {onBack && <button type="button" className="secondary" onClick={onBack}>{COPY.nav.back}</button>}
          {onNext && (
            <button type="button" onClick={onNext} disabled={nextDisabled}>{nextLabel ?? COPY.nav.next}</button>
          )}
        </nav>
      )}
    </main>
  );
}
