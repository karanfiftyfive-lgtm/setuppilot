// Regression tests for the Phase 1 safety review, round 1 (rewritten in round 2, item 15).
import { describe, expect, it } from "vitest";
import { catalog } from "../core/data";
import { COMMANDS, renderCommand, renderContextFromCatalog } from "../core/commands/whitelist";
import { buildUninstallPlan, changeFor } from "../core/manifest";
import type { ChangeRecord, StepId } from "../core/types";
import { atLeast } from "./fixtures";
import { CONFIG, env, file, login, manifestOf, model, planOf, rec, serve } from "./manifest-helpers";

const ctx = renderContextFromCatalog(catalog);
const PARAMS: Record<string, Record<string, string>> = { "ollama.pull": { tag: "qwen2.5:7b" }, "env.setContext": { size: "8192" } };
// The state before SetupPilot that proves SetupPilot made the change, per record target.
const PROOF: Record<string, string | null> = {
  "Ollama.Ollama": "absent", "Tailscale.Tailscale": "absent", "ggml.llamacpp": "absent", "qwen2.5:7b": "absent",
  "OLLAMA_CONTEXT_LENGTH": null, "tailscale-login": "logged-out", "tailscale-serve": "none",
};
const tryRender = (id: string) => { try { return renderCommand(id, PARAMS[id] ?? {}, ctx); } catch { return null; } };
const changing = Object.values(COMMANDS).filter((c) => c.changesPc);
const forward = changing.filter((c) => { const r = tryRender(c.id); return r !== null && changeFor(r) !== null; });

describe("every PC change can be undone (whole class)", () => {
  it("classifies every PC-changing command as a recorded change or the undo of one", () => {
    const undo = new Set([...forward.map((c) => c.reverseId), "env.restoreContext"]);
    for (const c of atLeast(changing, 15, "PC-changing commands")) {
      expect(forward.includes(c) || undo.has(c.id), `${c.id} changes the PC but has no record kind and is no undo`).toBe(true);
    }
    expect(forward.map((c) => c.id).sort()).toEqual([
      "env.setContext", "llamacpp.install", "ollama.install", "ollama.pull",
      "tailscale.install", "tailscale.serve", "tailscale.up",
    ]);
  });

  it.each(forward.map((c) => [c.id]))("uninstall runs the exact reverse of %s", (id) => {
    const change = changeFor(tryRender(id)!)!;
    const [item] = planOf(rec({ ...change, previous: PROOF[change.target] ?? null })).items;
    const reverseParams: Record<string, string> = id === "ollama.pull" ? { tag: "qwen2.5:7b" } : {};
    const expected = renderCommand(COMMANDS[id]!.reverseId!, reverseParams, { ...ctx, allowedTags: ["qwen2.5:7b"] });
    expect(item!.command).toEqual(expected);
  });

  it("covers file writes: delete what we created, restore what we replaced, keep the rules file", () => {
    const backup = "C:/Users/me/.setuppilot/backups/1.json";
    expect(planOf(file(null)).items[0]).toMatchObject({ action: "delete-file", file: { path: CONFIG, restoreFrom: null } });
    expect(planOf(file(backup)).items[0]).toMatchObject({ action: "restore-file", file: { path: CONFIG, restoreFrom: backup } });
    const rules = rec({ stepId: "workflow-rules" as StepId, kind: "file-written", target: "D:/proj/CLAUDE.md" });
    expect(planOf(rules).items[0]).toMatchObject({ action: "keep", command: null, file: null });
  });
});

describe("undo only what SetupPilot did", () => {
  const plan = (...r: ChangeRecord[]) => planOf(...r).items;

  it("logs out only if SetupPilot did the first login", () => {
    expect(plan(login("logged-out"))[0]!.command?.commandId).toBe("tailscale.logout");
    expect(plan(login("logged-in"))[0]).toMatchObject({ action: "keep", command: null });
    expect(plan(login(null))[0]).toMatchObject({ action: "keep", command: null });
  });

  it("turns off only its own sharing, and never with 'serve reset'", () => {
    const [off] = plan(serve("none"));
    expect(off!.command?.commandId).toBe("tailscale.serveOff");
    expect(off!.command?.args).not.toContain("reset");
    expect(plan(serve("existing"))[0]).toMatchObject({ action: "keep", command: null });
  });

  it("uses the reverse from the fixed table, ignoring a stored reverseCommandId", () => {
    const tricked = rec({ kind: "program-installed", target: "Ollama.Ollama", previous: "absent", reverseCommandId: "tailscale.uninstall" });
    const [item] = plan(tricked);
    expect(item!.command?.commandId).toBe("ollama.uninstall");
    expect(item!.command?.args).toContain("Ollama.Ollama");
  });

  it("refuses to remove a model that is not in the catalog, even if the manifest names it", () => {
    const [item] = plan(model("mistral:latest"));
    expect(item!.command).toBeNull();
    expect(item!.description).toMatch(/isn't in this version's model list/);
  });
});

describe("setup run twice restores the user's ORIGINAL state", () => {
  it("puts back the user's own setting, not SetupPilot's earlier one", () => {
    const items = planOf(env("12000"), env("4096")).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.command?.display).toBe("setx OLLAMA_CONTEXT_LENGTH 12000");
    expect(items[0]!.recordIds).toHaveLength(2);
  });

  it("removes the setting if the user had none, even after a second run", () => {
    expect(planOf(env(null), env("8192")).items[0]!.command?.commandId).toBe("env.unsetContext");
  });

  it("restores the user's original file, not SetupPilot's first version", () => {
    const first = "C:/Users/me/.setuppilot/backups/original.json";
    const items = planOf(file(first), file("C:/Users/me/.setuppilot/backups/ours.json")).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "restore-file", file: { restoreFrom: first } });
  });

  it("stays signed in if the user was signed in before the first run", () => {
    expect(planOf(login("logged-in"), login("logged-out")).items[0]!.action).toBe("keep");
  });

  it("restores a previous value that is not a catalog size", () => {
    expect(planOf(env("12000")).items[0]!.command?.commandId).toBe("env.restoreContext");
  });
});

describe("file paths must be inside the server's allowed roots", () => {
  const fileAt = (target: string, backupPath: string | null = null) =>
    rec({ stepId: "connect-coding-tool", kind: "file-written", target, backupPath });
  const item = (r: ChangeRecord) => planOf(r).items[0]!;

  it.each([
    "C:/Windows/System32/x.dll",
    "C:/Users/me/.config/opencode/../../Windows/x.dll",
    "C:\\Users\\me\\.config\\opencode\\..\\x.dll",
    "D:/Users/me/.config/opencode/x.json",
    "//server/share/x.json",
    "Users/me/.config/opencode/x.json",
    "C:/Users/me/.config/opencode",
    "C:/Users/me/.config/opencode-evil/x.json",
    "C:/Users/me/.config/opencode/x.json:stream",
    "C:/Users/me/.setuppilot/manifest.json",
  ])("treats %j as damaged and touches nothing", (target) => {
    expect(item(fileAt(target))).toMatchObject({ command: null, file: null });
    expect(item(fileAt(target)).description).toMatch(/damaged/);
  });

  it("rejects a backup that lives outside the backups folder", () => {
    expect(item(fileAt(CONFIG, "C:/Windows/evil.json")).file).toBeNull();
    expect(item(fileAt(CONFIG, "C:/Users/me/.config/opencode/old.json")).file).toBeNull();
  });

  it("accepts an allowed path written with backslashes and different case", () => {
    expect(item(fileAt("c:\\users\\ME\\.config\\opencode\\opencode.json"))).toMatchObject({ action: "delete-file" });
  });

  it("allows nothing when the server passes no roots", () => {
    const [i] = buildUninstallPlan(manifestOf(fileAt(CONFIG)), catalog, { targets: [], backups: [], reserved: [] }).items;
    expect(i!.description).toMatch(/damaged/);
  });
});
