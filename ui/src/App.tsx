// Demo app: screen order and state, all in memory (no storage, no server, no network).
import { useEffect, useMemo, useRef, useState } from "react";
import type { GoalId, Plan } from "../../core/types";
import { DEFAULT_PROFILE, profileById, type ProfileId } from "./model/demo";
import { demoPlan, startRun, type RunState } from "./model/plan";
import { recommendFor } from "./model/scan";
import { Goal } from "./pages/Goal";
import { PlanRun } from "./pages/PlanRun";
import { Reanalyze } from "./pages/Reanalyze";
import { Scan } from "./pages/Scan";
import { TestRun } from "./pages/TestRun";
import { Welcome } from "./pages/Welcome";

export const SCREENS = ["welcome", "goal", "scan", "plan", "test", "reanalyze"] as const;
export type Screen = (typeof SCREENS)[number];

export function App({ initial = "welcome" }: { initial?: Screen }) {
  const [screen, setScreen] = useState<Screen>(initial);
  const [goal, setGoal] = useState<GoalId | null>(initial === "welcome" ? null : "chat");
  const [profileId, setProfileId] = useState<ProfileId>(DEFAULT_PROFILE);
  const plan = useMemo(() => (goal ? demoPlan(goal, profileById(profileId)) : null), [goal, profileId]);
  // The run belongs to one plan; a new plan (other goal or PC) starts a fresh run, from the first render on.
  const [runFor, setRunFor] = useState<{ plan: Plan; state: RunState } | null>(null);
  const run = plan ? (runFor?.plan === plan ? runFor.state : startRun(plan)) : null;
  const setRun = (state: RunState) => { if (plan) setRunFor({ plan, state }); };

  // Move keyboard focus to the new screen's heading, for screen-reader and keyboard users.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.querySelector<HTMLElement>("h1")?.focus();
  }, [screen]);

  const go = (s: Screen) => () => setScreen(s);
  switch (screen) {
    case "welcome":
      return <Welcome onNext={go("goal")} />;
    case "goal":
      return <Goal goal={goal} onPick={setGoal} onBack={go("welcome")} onNext={go("scan")} />;
    case "scan":
      return <Scan goal={goal!} profileId={profileId} onProfile={setProfileId} onBack={go("goal")} onNext={go("plan")} />;
    case "plan":
      return plan && run ? <PlanRun plan={plan} state={run} setState={setRun} onBack={go("scan")} onNext={go("test")} /> : null;
    case "test":
      return <TestRun modelName={recommendFor(goal!, profileById(profileId)).model.displayName} onBack={go("plan")} onNext={go("reanalyze")} />;
    case "reanalyze":
      return <Reanalyze goal={goal!} profileId={profileId} onBack={go("test")} />;
  }
}
