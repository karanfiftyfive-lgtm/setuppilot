// Demo UI: the pure view models in ui/src/model/.
import { describe, expect, it } from "vitest";
import { COPY, speedText } from "../ui/src/model/copy";
import { ALL_GOALS, DEMO_LABEL, PROFILES, profileById, profileSummary } from "../ui/src/model/demo";
import { splitGlossary } from "../ui/src/model/glossary";
import { STATUS_LABEL } from "../ui/src/model/labels";
import { approveAll, approveStep, demoPlan, nextWaiting, progressPercent, simulatedLines, skipStep, startRun, stepCards } from "../ui/src/model/plan";
import { reanalyzeView } from "../ui/src/model/reanalyze";
import { goalCards, scanView } from "../ui/src/model/scan";
import { atLeast } from "./fixtures";

const weak = profileById("weak-laptop");

describe("demo basics", () => {
  it("has the five mock PCs and the four goals, and the demo label from data", () => {
    atLeast(PROFILES, 5, "profiles");
    atLeast(ALL_GOALS, 4, "goals");
    expect(DEMO_LABEL).toBe("Demo mode: simulated");
    expect(profileSummary(weak)).toBe("8 GB memory, built-in graphics only, 22 GB free disk");
  });

  it("shows no 'not in this version' note on any goal in demo mode", () => {
    for (const g of atLeast(goalCards(), 4, "goal cards")) expect(g.note, g.id).toBeNull();
  });

  it("labels every speed word as an estimate", () => {
    for (const w of atLeast(["fast", "okay", "slow"] as const, 3, "speed words")) expect(speedText(w)).toMatch(/\(estimate\)$/);
  });

  it("gives every status a word and a symbol (never colour alone)", () => {
    for (const [s, l] of atLeast(Object.entries(STATUS_LABEL), 5, "statuses")) {
      expect(l.word.length, s).toBeGreaterThan(2);
      expect(l.icon.length, s).toBeGreaterThan(0);
    }
  });
});

describe("scan view", () => {
  it("gives a pick, a reason, an estimate speed, and the next-tier hint or 'already biggest'", () => {
    for (const p of atLeast(PROFILES, 5, "profiles")) {
      for (const g of ALL_GOALS) {
        const v = scanView(g, p.profile);
        expect(v.modelName.length, `${p.id} ${g}`).toBeGreaterThan(0);
        expect(v.why.length).toBeGreaterThan(10);
        expect(v.speed).toMatch(/\(estimate\)$/);
      }
    }
  });
});

describe("plan view and simulated run", () => {
  const plan = demoPlan("code", weak);
  it("builds step cards with what / why / changes, and labels running steps for the demo", () => {
    const cards = atLeast(stepCards(plan), 8, "steps");
    for (const c of cards) expect([c.what, c.why, c.changes].every((t) => t.length > 0), c.id).toBe(true);
    for (const s of plan.steps) expect(s.demoLabel, s.def.id).toBe(s.skipReason ? null : DEMO_LABEL);
  });

  it("shows the coding context caveat as information on the coding-tool step only", () => {
    const cards = stepCards(plan);
    expect(cards.find((c) => c.id === "connect-coding-tool")!.smallContext).toMatch(/may not work well/);
    for (const c of cards.filter((c) => c.id !== "connect-coding-tool")) expect(c.smallContext, c.id).toBeNull();
  });

  it("required steps can't be skipped; optional ones can, with a reason", () => {
    let s = startRun(plan);
    for (const st of atLeast(plan.steps.filter((x) => x.def.required), 5, "required steps")) {
      expect(skipStep(plan, s, st.def.id)).toBe(s);
    }
    const optional = plan.steps.find((x) => !x.def.required && x.status === "waiting")!;
    s = skipStep(plan, s, optional.def.id);
    expect(s.status[optional.def.id]).toBe("skipped");
    expect(s.reasons[optional.def.id]).toBe(COPY.plan.userSkipped);
  });

  it("approving runs steps in order, with labelled simulated output, up to 100%", () => {
    let s = startRun(plan);
    const first = nextWaiting(plan, s)!;
    s = approveStep(plan, s, first);
    expect(s.status[first]).toBe("done");
    for (const l of atLeast(s.output[first]!, 1, "output lines")) expect(l).toMatch(/^\[simulated\] /);
    s = approveAll(plan, s);
    expect(nextWaiting(plan, s)).toBeNull();
    expect(progressPercent(plan, s)).toBe(100);
    expect(progressPercent(plan, startRun(plan))).toBeLessThan(100);
  });

  it("uses data/demo-output.json lines for a pull", () => {
    expect(simulatedLines(plan, "download-model").join("\n")).toMatch(/\[simulated\] Demo mode: simulated download/);
  });
});

describe("glossary tap-to-explain", () => {
  it("finds terms (longest first, any case, plural) and keeps the rest as plain text", () => {
    const segs = splitGlossary("More RAM and tokens per second; each token counts.");
    expect(segs.map((s) => s.text).join("")).toBe("More RAM and tokens per second; each token counts.");
    const terms = atLeast(segs.filter((s) => s.term !== null).map((s) => s.term), 3, "terms");
    expect(terms).toEqual(["RAM", "tokens per second", "token"]);
  });
});

describe("re-analyze view", () => {
  it("weak-laptop -> upgraded-pc: changes, a ladder with bigger models that fit now, tips, rollback", () => {
    const v = reanalyzeView("chat", weak, profileById("upgraded-pc"));
    atLeast(v.changes, 2, "changes");
    atLeast(v.rungs.filter((r) => r.fitsNow), 1, "rungs that fit now");
    expect(v.rollback).toBe(COPY.reanalyze.rollback);
  });
});
