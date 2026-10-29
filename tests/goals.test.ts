import { describe, expect, it } from "vitest";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan, downloadMinutes } from "../core/goals";
import { recommend } from "../core/recommend";
import type { Catalog, GoalId, MachineProfile, StepId } from "../core/types";
import { atLeast, makeProfile, profiles } from "./fixtures";

function plan(goal: GoalId, p: MachineProfile = profiles.midPc, cat: Catalog = catalog) {
  const use = goals.find((g) => g.id === goal)!.modelUse;
  return buildPlan(goal, p, recommend(p, cat, use), cat);
}
const stepIds = (goal: GoalId, p?: MachineProfile) => plan(goal, p).steps.map((s) => s.def.id);
const step = (goal: GoalId, id: StepId, p?: MachineProfile) => plan(goal, p).steps.find((s) => s.def.id === id)!;
const OPTIONAL_GOAL_STEPS: StepId[] = ["remote-access", "connect-coding-tool", "workflow-rules"];

describe("buildPlan: steps per goal", () => {
  it("chat includes none of steps 8-10", () => {
    for (const id of OPTIONAL_GOAL_STEPS) expect(stepIds("chat")).not.toContain(id);
  });

  it("code includes steps 9 and 10 but not 8", () => {
    expect(stepIds("code")).toEqual(expect.arrayContaining(["connect-coding-tool", "workflow-rules"]));
    expect(stepIds("code")).not.toContain("remote-access");
  });

  it("remote includes step 8 only", () => {
    expect(stepIds("remote")).toContain("remote-access");
    expect(stepIds("remote")).not.toContain("connect-coding-tool");
    expect(stepIds("remote")).not.toContain("workflow-rules");
  });

  it("everything includes steps 8, 9 and 10", () => {
    expect(stepIds("everything")).toEqual(expect.arrayContaining(OPTIONAL_GOAL_STEPS));
  });

  it("chat on mid-pc is 7 steps, with speed boost skipped as not needed", () => {
    const p = plan("chat");
    expect(p.steps).toHaveLength(7);
    const boost = p.steps.find((s) => s.def.id === "speed-boost")!;
    expect(boost.status).toBe("skipped");
    expect(boost.skipReason).toBe(explanations.steps["speed-boost"].notNeeded);
    expect(boost.commands).toEqual([]);
  });

  it("skips speed boost on integrated graphics for every goal", () => {
    for (const g of atLeast(goals, 4, "goals")) expect(step(g.id, "speed-boost", profiles.weakLaptop).status, g.id).toBe("skipped");
  });

  it("offers speed boost on big-gpu-rig as an optional, advanced step with its command", () => {
    const boost = step("chat", "speed-boost", profiles.bigGpuRig);
    expect(boost.status).toBe("waiting");
    expect(boost.def).toMatchObject({ required: false, advanced: true });
    expect(boost.commands.map((c) => c.commandId)).toEqual(["llamacpp.install"]);
  });

  it("rejects an unknown goal", () => {
    expect(() => buildPlan("nope" as GoalId, profiles.midPc, recommend(profiles.midPc, catalog, "chat"), catalog))
      .toThrow();
  });
});

describe("buildPlan: text and commands", () => {
  it("fills every placeholder in the step text", () => {
    atLeast(goals.flatMap((g) => plan(g.id, profiles.gpuRig).steps), 30, "planned steps");
    for (const g of goals) {
      for (const s of plan(g.id, profiles.gpuRig).steps) {
        for (const v of Object.values(s.text)) expect(v, `${g.id}/${s.def.id}`).not.toMatch(/\{\w+\}/);
      }
    }
    expect(step("code", "download-model").text.what).toContain("Qwen 2.5 Coder (7B)");
    expect(step("code", "download-model").text.changes).toContain("4.7 GB");
    expect(step("code", "safe-defaults").text.why).toContain("4096");
  });

  it("renders exact commands for the recommended model", () => {
    expect(step("code", "download-model").commands[0]?.display).toBe("ollama pull qwen2.5-coder:7b");
    expect(step("code", "safe-defaults").commands[0]?.display).toBe("setx OLLAMA_CONTEXT_LENGTH 4096");
  });
});

describe("buildPlan: time estimates", () => {
  it("derives download minutes from assumedDownloadMbps", () => {
    expect(downloadMinutes(4.7, catalog)).toBe(13); // 4.7 GB * 8000 / 50 Mbps / 60 = 12.53 -> 13
    expect(step("code", "download-model").def.estimatedMinutes).toBe(13);
    const faster = { ...catalog, assumedDownloadMbps: 100 };
    expect(plan("code", profiles.midPc, faster).steps.find((s) => s.def.id === "download-model")!.def.estimatedMinutes)
      .toBe(7);
  });

  it("totals only steps that will run, and labels the total as an estimate", () => {
    const p = plan("chat");
    const expected = Math.ceil(
      p.steps.filter((s) => s.status !== "skipped").reduce((n, s) => n + s.def.estimatedMinutes, 0),
    );
    expect(p.totalEstimatedMinutes).toBe(expected);
    expect(p.isEstimate).toBe(true);
  });
});

describe("buildPlan: preflight", () => {
  it("is clean on a normal admin PC with internet", () => {
    expect(plan("everything", profiles.midPc).preflight).toEqual([]);
  });

  it("flags no internet, no winget and a full disk", () => {
    const p = makeProfile(profiles.midPc, { internet: false, tools: { winget: false, tailscale: false, tailscaleServe: "none" }, diskFreeGb: 2 });
    expect(plan("chat", p).preflight).toEqual(expect.arrayContaining(["NO_INTERNET", "NO_WINGET", "LOW_DISK"]));
  });

  it("warns about missing admin rights on weak-laptop but skips nothing because of it", () => {
    const p = plan("chat", profiles.weakLaptop);
    expect(p.preflight).toContain("NO_ADMIN");
    expect(p.steps.find((s) => s.def.id === "install-runtime")!.status).toBe("waiting");
  });
});

describe("buildPlan: plan hash", () => {
  it("is the same for the same plan", () => {
    expect(plan("code").planHash).toBe(plan("code").planHash);
  });

  it("changes when the model or the context changes", () => {
    const base = plan("code").planHash;
    expect(plan("code", profiles.gpuRig).planHash).not.toBe(base);
    const rec = recommend(profiles.midPc, catalog, "code");
    const other = buildPlan("code", profiles.midPc, { ...rec, context: 8192 }, catalog);
    expect(other.planHash).not.toBe(base);
  });
});

describe("buildPlan: existing Tailscale sharing (round 2, item 2)", () => {
  it("refuses step 8 and reports SHARING_IN_USE before anything runs", () => {
    const p = makeProfile(profiles.gpuRig, { tools: { winget: true, tailscale: true, tailscaleServe: "existing" } });
    const plan = buildPlan("remote", p, recommend(p, catalog, "chat"), catalog);
    const step = plan.steps.find((s) => s.def.id === "remote-access")!;
    expect(step.status).toBe("skipped");
    expect(step.commands).toEqual([]);
    expect(plan.preflight).toContain("SHARING_IN_USE");
  });
});
