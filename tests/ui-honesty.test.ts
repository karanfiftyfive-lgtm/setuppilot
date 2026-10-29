// Demo UI honesty: every screen says "Demo mode: simulated"; no "unlimited"; no speed number
// unless labelled estimate/simulated; no claim that anything was installed or measured.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, SCREENS } from "../ui/src/App";
import { COPY } from "../ui/src/model/copy";
import { ALL_GOALS, DEMO_LABEL, PROFILES, profileById, profileSummary } from "../ui/src/model/demo";
import { GLOSSARY } from "../ui/src/model/glossary";
import { STATUS_LABEL } from "../ui/src/model/labels";
import { demoPlan, simulatedLines, stepCards } from "../ui/src/model/plan";
import { reanalyzeView } from "../ui/src/model/reanalyze";
import { goalCards, scanView } from "../ui/src/model/scan";
import { atLeast } from "./fixtures";

const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

function corpus(): string[] {
  const out = [...strings(COPY), ...Object.values(STATUS_LABEL).map((l) => l.word), ...Object.values(GLOSSARY), ...strings(goalCards())];
  for (const p of PROFILES) {
    out.push(profileSummary(p.profile));
    for (const g of ALL_GOALS) {
      const plan = demoPlan(g, p.profile);
      out.push(...strings(scanView(g, p.profile)), ...strings(stepCards(plan)), ...strings(reanalyzeView(g, p.profile, profileById("upgraded-pc"))));
      for (const s of plan.steps) out.push(...simulatedLines(plan, s.def.id));
    }
  }
  for (const s of SCREENS) out.push(textOf(renderToStaticMarkup(createElement(App, { initial: s }))));
  return out.filter((t) => t.trim().length > 0);
}

// Detectors (each is tested on bad examples below, so a broken detector can't pass silently).
const UNLIMITED = /unlimited/i;
const SPEED_NUMBER = /\b\d+(\.\d+)?\s*(tok(en)?s?\s*\/\s*s(ec)?\b|tokens? per second|t\/s\b|words? per (second|minute))/i;
const LABELLED = /estimate|simulated/i;
// Per sentence: "measured" is a claim unless that sentence negates it or speaks about later /
// the real app ("Nothing is ... measured", "is measured after the test run").
const MEASURED_CLAIM = { test: (t: string) => t.split(/(?<=[.!?])\s+/).some((s) =>
  /\bmeasured\b/i.test(s) && !/\b(not|nothing|never|no)\b|after the test|real app|will be/i.test(s)) };
const INSTALL_CLAIM = /\b(successfully|now|has been|have been|was|were)\s+(installed|downloaded|set up)\b|\b(I|we|SetupPilot)\b[^.]*\b(installed|downloaded)\b/i;
const problems = (t: string) => [
  UNLIMITED.test(t) && "unlimited",
  SPEED_NUMBER.test(t) && !LABELLED.test(t) && "unlabelled speed number",
  MEASURED_CLAIM.test(t) && "claims a measurement",
  INSTALL_CLAIM.test(t) && !/simulated/i.test(t) && "claims an install",
].filter(Boolean);

describe("demo UI honesty", () => {
  const all = corpus();

  it("scans a large corpus from every source", () => {
    atLeast(all, 400, "strings");
  });

  it("the detectors catch bad examples", () => {
    const bad = atLeast(["Unlimited AI for free", "It runs at 24 tokens/s", "Speed: 12.5 tokens per second", "Measured speed: fast",
      "Ollama was installed", "I installed the model for you", "Model successfully downloaded"], 7, "bad examples");
    for (const b of bad) expect(problems(b), b).not.toEqual([]);
    for (const ok of ["Speed: Demo mode: simulated, not measured.", "[simulated] Successfully installed", "Feels quick (estimate)"]) {
      expect(problems(ok), ok).toEqual([]);
    }
  });

  it("finds no problem in anything the demo shows", () => {
    expect(all.flatMap((t) => problems(t).map((p) => `${p}: ${t.slice(0, 120)}`))).toEqual([]);
  });

  it("shows 'Demo mode: simulated' on every screen", () => {
    for (const s of atLeast(SCREENS, 6, "screens")) {
      expect(renderToStaticMarkup(createElement(App, { initial: s })), s).toContain(DEMO_LABEL);
    }
  });

  it("the test screen's speed line says simulated and not measured; no number", () => {
    expect(COPY.test.speed).toMatch(/^Speed: Demo mode: simulated, not measured\./);
    expect(COPY.test.speed).not.toMatch(/\d/);
  });

  it("the welcome screen states the honest limit", () => {
    expect(COPY.welcome.limit).toMatch(/smaller than ChatGPT or Claude/);
    expect(COPY.welcome.limit).toMatch(/depends on your PC/);
  });
});
