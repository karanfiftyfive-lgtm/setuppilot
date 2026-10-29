// Shared builders for the manifest tests.
import { catalog } from "../core/data";
import { addRecord, buildUninstallPlan, emptyManifest } from "../core/manifest";
import type { AllowedRoots, ChangeRecord, Manifest } from "../core/types";

let n = 0;
export function rec(over: Partial<ChangeRecord>): ChangeRecord {
  n += 1;
  return {
    id: `r${n}`, stepId: "download-model", kind: "model-pulled", target: "qwen2.5-coder:7b",
    previous: null, backupPath: null, writtenHash: null, reverseCommandId: null, status: "done",
    at: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`, ...over,
  };
}

// Fixed test roots, standing in for the server constants.
export const ROOTS: AllowedRoots = {
  targets: ["C:/Users/me/.config/opencode"],
  backups: ["C:/Users/me/.setuppilot/backups"],
  reserved: ["C:/Users/me/.setuppilot"],
};
export const CONFIG = "C:/Users/me/.config/opencode/opencode.json";
export const manifestOf = (...records: ChangeRecord[]): Manifest => records.reduce(addRecord, emptyManifest());
export const planOf = (...records: ChangeRecord[]) => buildUninstallPlan(manifestOf(...records), catalog, ROOTS);

// "absent" = the record proves SetupPilot added it (it was not there before).
export const ollama = (previous: string | null = "absent") =>
  rec({ stepId: "install-runtime", kind: "program-installed", target: "Ollama.Ollama", previous });
export const model = (target = "qwen2.5-coder:7b", previous: string | null = "absent") => rec({ target, previous });
export const env = (previous: string | null) => rec({ stepId: "safe-defaults", kind: "env-var-set",
  target: "OLLAMA_CONTEXT_LENGTH", previous });
export const file = (backupPath: string | null, target = CONFIG) => rec({ stepId: "connect-coding-tool",
  kind: "file-written", target, backupPath, writtenHash: "0badc0de" });
export const login = (previous: string | null) => rec({ stepId: "remote-access", kind: "service-configured",
  target: "tailscale-login", previous });
export const serve = (previous: string | null) => rec({ stepId: "remote-access", kind: "service-configured",
  target: "tailscale-serve", previous });
