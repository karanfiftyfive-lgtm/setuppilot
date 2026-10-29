import { describe, expect, it } from "vitest";
import { COMMANDS } from "../core/commands/whitelist";
import { catalog, explanations } from "../core/data";
import { recommend } from "../core/recommend";
import { skipReason, STEP_DEFS, stepCommands } from "../core/steps";
import type { StepId } from "../core/types";
import { atLeast, makeProfile, profiles } from "./fixtures";

const ids = Object.keys(STEP_DEFS) as StepId[];
const commandRefs = ids.flatMap((id) => STEP_DEFS[id].commandIds.map((c) => [id, c] as const));
const text = explanations.steps;

describe("STEP_DEFS", () => {
  it("defines all 10 steps, each with an explanation", () => {
    expect(ids).toHaveLength(10);
    for (const id of atLeast(ids, 10, "steps")) expect(text[id], id).toBeDefined();
  });

  it("gives every required step a reason, so Skip can be disabled with an explanation", () => {
    for (const id of ids.filter((i) => STEP_DEFS[i].required)) expect(text[id].requiredReason, id).toBeTruthy();
    expect(ids.filter((i) => STEP_DEFS[i].required)).toEqual([
      "scan-pc", "choose-model", "install-runtime", "download-model", "safe-defaults", "test-run",
    ]);
  });

  it("only references whitelisted commands", () => {
    for (const [id, c] of atLeast(commandRefs, 6, "step commands")) expect(COMMANDS[c], `${id}:${c}`).toBeDefined();
  });

  it("warns before a Windows prompt exactly where the explanation says so", () => {
    for (const id of atLeast(ids, 10, "steps")) expect(STEP_DEFS[id].osPromptWarning, id).toBe(text[id].osPromptWarning);
  });

  it("marks speed boost as optional and advanced", () => {
    expect(STEP_DEFS["speed-boost"]).toMatchObject({ required: false, advanced: true });
  });
});

describe("skipReason: speed boost (step 7)", () => {
  const reasonFor = (p = profiles.midPc, use: "chat" | "code" = "chat") =>
    skipReason("speed-boost", p, recommend(p, catalog, use), catalog);

  it("is not needed on integrated graphics (mid-pc, weak-laptop)", () => {
    expect(reasonFor(profiles.midPc)).toBe(text["speed-boost"].notNeeded);
    expect(reasonFor(profiles.weakLaptop)).toBe(text["speed-boost"].notNeeded);
  });

  it("is not offered on gpu-rig, with its own reason: the model already fills the card", () => {
    expect(reasonFor(profiles.gpuRig, "chat")).toBe(text["speed-boost"].notNeededFull);
    expect(reasonFor(profiles.gpuRig, "code")).toBe(text["speed-boost"].notNeededFull);
    expect(text["speed-boost"].notNeededFull).not.toBe(text["speed-boost"].notNeeded);
  });

  it("is offered on big-gpu-rig, which has real spare graphics memory", () => {
    expect(reasonFor(profiles.bigGpuRig, "chat")).toBeNull();
  });

  it("explains what it is and that it needs spare graphics memory", () => {
    const t = text["speed-boost"];
    expect(t.what).toMatch(/helper AI guesses ahead/i);
    expect(t.why).toMatch(/spare graphics memory/i);
    expect(t.changes).toMatch(/optional/i);
  });
});

describe("skipReason: other steps", () => {
  it("skips installing Ollama when it is already installed", () => {
    const r = recommend(profiles.gpuRig, catalog, "chat");
    expect(skipReason("install-runtime", profiles.gpuRig, r, catalog)).toBe(text["install-runtime"].notNeeded);
    const m = recommend(profiles.midPc, catalog, "chat");
    expect(skipReason("install-runtime", profiles.midPc, m, catalog)).toBeNull();
  });

  it("skips the download when the model is already on the PC", () => {
    const p = makeProfile(profiles.upgradedPc, {
      ollama: { installed: true, version: "0.6.0", running: true, models: ["qwen2.5-coder:14b"] },
    });
    const r = recommend(p, catalog, "code");
    expect(skipReason("download-model", p, r, catalog)).toBe(text["download-model"].notNeeded);
  });

  it("never skips required steps other than for 'already done' reasons", () => {
    const r = recommend(profiles.weakLaptop, catalog, "chat");
    for (const id of ["scan-pc", "choose-model", "safe-defaults", "test-run"] as StepId[]) {
      expect(skipReason(id, profiles.weakLaptop, r, catalog), id).toBeNull();
    }
  });
});

describe("stepCommands", () => {
  it("pulls the recommended model and sets the recommended context", () => {
    const r = recommend(profiles.midPc, catalog, "code");
    expect(stepCommands("download-model", profiles.midPc, r)).toEqual([
      { id: "ollama.pull", params: { tag: "qwen2.5-coder:7b" } },
    ]);
    expect(stepCommands("safe-defaults", profiles.midPc, r)).toEqual([
      { id: "env.setContext", params: { size: 4096 } },
    ]);
  });

  it("does not reinstall Tailscale when it is already installed", () => {
    const r = recommend(profiles.gpuRig, catalog, "chat");
    expect(stepCommands("remote-access", profiles.gpuRig, r).map((c) => c.id)).toEqual([
      "tailscale.up", "tailscale.serve",
    ]);
    const m = recommend(profiles.midPc, catalog, "chat");
    expect(stepCommands("remote-access", profiles.midPc, m).map((c) => c.id)).toEqual([
      "tailscale.install", "tailscale.up", "tailscale.serve",
    ]);
  });
});

describe("skipReason: remote access refuses to overwrite existing sharing (round 2, item 2)", () => {
  const r = recommend(profiles.gpuRig, catalog, "chat");
  const withServe = (tailscaleServe: "none" | "existing" | null) =>
    makeProfile(profiles.gpuRig, { tools: { winget: true, tailscale: true, tailscaleServe } });

  it("refuses when Tailscale sharing already exists on the port", () => {
    expect(skipReason("remote-access", withServe("existing"), r, catalog)).toBe(text["remote-access"].refused);
    expect(text["remote-access"].refused).toBeTruthy();
  });

  it("runs when there is no sharing, or when it is unknown (the server re-checks before running)", () => {
    expect(skipReason("remote-access", withServe("none"), r, catalog)).toBeNull();
    expect(skipReason("remote-access", withServe(null), r, catalog)).toBeNull();
  });
});
