// The 10 user-facing steps, their skip rules, and which whitelisted commands each one runs.
// Host-step mapping (brief): 1 scan, 2-3 choose-model, 4 download, 5 install-runtime,
// 6 safe-defaults, 7 speed-boost, 8 remote-access, 9 connect-coding-tool, 10 workflow-rules.
import { explanations } from "./data";
import type { Catalog, MachineProfile, Recommendation, StepDef, StepId } from "./types";

const EPS = 1e-9;

function def(d: Partial<StepDef> & Pick<StepDef, "id" | "required">): StepDef {
  return {
    advanced: false, commandIds: [], estimatedMinutes: 0.5, diskGb: 0, needsAdmin: false,
    needsInternet: false, writesFile: null,
    osPromptWarning: explanations.steps[d.id].osPromptWarning,
    ...d,
  };
}

// Minutes and GB are estimates. download-model's are filled per model by goals.ts.
export const STEP_DEFS: Readonly<Record<StepId, StepDef>> = Object.freeze({
  "scan-pc": def({ id: "scan-pc", required: true, estimatedMinutes: 1 }),
  "choose-model": def({ id: "choose-model", required: true }),
  "install-runtime": def({ id: "install-runtime", required: true, commandIds: ["ollama.install"],
    estimatedMinutes: 3, diskGb: 1, needsInternet: true }),
  "download-model": def({ id: "download-model", required: true, commandIds: ["ollama.pull"],
    estimatedMinutes: 0, needsInternet: true }),
  "safe-defaults": def({ id: "safe-defaults", required: true, commandIds: ["env.setContext"] }),
  "speed-boost": def({ id: "speed-boost", required: false, advanced: true, commandIds: ["llamacpp.install"],
    estimatedMinutes: 3, diskGb: 1, needsInternet: true }),
  "remote-access": def({ id: "remote-access", required: false,
    commandIds: ["tailscale.install", "tailscale.up", "tailscale.serve"],
    estimatedMinutes: 4, diskGb: 0.5, needsAdmin: true, needsInternet: true }),
  "connect-coding-tool": def({ id: "connect-coding-tool", required: false, writesFile: "coding-tool-config" }),
  "workflow-rules": def({ id: "workflow-rules", required: false, writesFile: "workflow-rules" }),
  "test-run": def({ id: "test-run", required: true, estimatedMinutes: 1 }),
});

/** Plain-language reason a step is not needed on this PC, or null if it should run. */
export function skipReason(
  stepId: StepId,
  profile: MachineProfile,
  rec: Recommendation,
  catalog: Catalog,
): string | null {
  const text = explanations.steps[stepId];
  switch (stepId) {
    case "install-runtime":
      return profile.ollama.installed ? text.notNeeded! : null;
    case "download-model":
      return profile.ollama.models.includes(rec.model.ollamaTag) ? text.notNeeded! : null;
    case "speed-boost": {
      // Only a discrete GPU helps; the helper model needs real spare VRAM after the main model.
      if (rec.memorySource !== "vram") return text.notNeeded!;
      const spare = rec.usableMemoryGb - rec.model.minMemoryGb;
      return spare + EPS < catalog.speedBoostMinSpareVramGb ? text.notNeededFull! : null;
    }
    case "remote-access":
      // Our "serve" would replace the user's own sharing on that port with no way back.
      // Unknown (null) is re-checked by the server right before the run.
      return profile.tools.tailscaleServe === "existing" ? text.refused! : null;
    default:
      return null;
  }
}

/** The whitelisted command ids + params a step runs on this PC (rendering happens in goals.ts). */
export function stepCommands(
  stepId: StepId,
  profile: MachineProfile,
  rec: Recommendation,
): { id: string; params: Record<string, string | number> }[] {
  switch (stepId) {
    case "download-model":
      return [{ id: "ollama.pull", params: { tag: rec.model.ollamaTag } }];
    case "safe-defaults":
      return [{ id: "env.setContext", params: { size: rec.context } }];
    case "remote-access":
      // Tailscale may already be installed; the user still signs in and shares the AI.
      return STEP_DEFS[stepId].commandIds
        .filter((id) => !(id === "tailscale.install" && profile.tools.tailscale))
        .map((id) => ({ id, params: {} }));
    default:
      return STEP_DEFS[stepId].commandIds.map((id) => ({ id, params: {} }));
  }
}
