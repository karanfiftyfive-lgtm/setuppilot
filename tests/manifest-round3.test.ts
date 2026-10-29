// Regression tests for the Phase 1 safety review, round 3 (blocker #1, #6, #2).
import { describe, expect, it } from "vitest";
import { CONFIG, file, login, model, ollama, planOf, rec } from "./manifest-helpers";

// Run 1 failed (changed nothing); before run 2 the server found the item already there.
const failedThenPresent = <T extends { status: string }>(first: T, second: T) => [{ ...first, status: "failed" as const }, second];

describe("#1: a failed run never sets the 'before SetupPilot' state", () => {
  it("keeps a model the user pulled themselves after SetupPilot's pull failed", () => {
    const items = planOf(...failedThenPresent(model("qwen2.5-coder:7b", "absent"), model("qwen2.5-coder:7b", "present"))).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "keep", command: null });
  });

  it("keeps an Ollama the user installed themselves after SetupPilot's install failed", () => {
    expect(planOf(...failedThenPresent(ollama("absent"), ollama("present"))).items[0]).toMatchObject({ action: "keep", command: null });
  });

  it("does not sign out a Tailscale login the user made after SetupPilot's attempt failed", () => {
    expect(planOf(...failedThenPresent(login("logged-out"), login("logged-in"))).items[0]).toMatchObject({ action: "keep", command: null });
  });

  it("restores the user's file from the backup taken by the run that succeeded", () => {
    const backup = "C:/Users/me/.setuppilot/backups/user-original.json";
    const [item] = planOf(...failedThenPresent(file(null), file(backup))).items;
    expect(item).toMatchObject({ action: "restore-file", file: { path: CONFIG, restoreFrom: backup } });
  });

  it("still removes what SetupPilot added when every run failed (a crash may have changed something)", () => {
    expect(planOf({ ...model("qwen2.5-coder:7b", "absent"), status: "failed" }).items[0]!.command?.commandId).toBe("ollama.rm");
  });
});

describe("#6: the workflow-rules file is kept if ANY record says it is", () => {
  it("keeps it even when a newer record claims it was a coding-tool config", () => {
    const path = "C:/Users/me/.config/opencode/CLAUDE.md";
    const rules = rec({ stepId: "workflow-rules", kind: "file-written", target: path });
    const config = rec({ stepId: "connect-coding-tool", kind: "file-written", target: path });
    expect(planOf(rules, config).items[0]).toMatchObject({ action: "keep", command: null, file: null });
  });
});

describe("#2: honest about what removing Ollama may delete", () => {
  it("warns that Ollama's uninstaller may delete stored models", () => {
    expect(planOf(ollama()).items[0]!.description).toMatch(/may also delete AI models/);
  });
});
