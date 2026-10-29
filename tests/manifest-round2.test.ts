// Regression tests for the Phase 1 safety review, round 2.
import { describe, expect, it } from "vitest";
import { uninstallHash } from "../core/manifest";
import type { UninstallItem } from "../core/types";
import { atLeast } from "./fixtures";
import { CONFIG, env, file, login, model, ollama, planOf, rec, serve } from "./manifest-helpers";

describe("item 1: Windows path tricks in uninstall", () => {
  it.each([
    "C:/Users/me/.config/opencode/ ", "C:/Users/me/.config/opencode/...", "C:/Users/me/.config/opencode/. .",
    "C:/Users/me/.config/opencode/nul", "C:/Users/me/.config/opencode/nul.txt", "C:/Users/me/.config/opencode/x\u0001.json",
  ])("never deletes or restores %j", (target) => {
    const [item] = planOf(rec({ stepId: "connect-coding-tool", kind: "file-written", target })).items;
    expect(item).toMatchObject({ command: null, file: null });
  });
});

describe("item 2: Tailscale sharing fails safe", () => {
  it("turns sharing off when the earlier state is unknown", () => {
    expect(planOf(serve(null)).items[0]!.command?.commandId).toBe("tailscale.serveOff");
  });

  it("is honest when keeping a login it can't be sure about", () => {
    expect(planOf(login(null)).items[0]!.description).toMatch(/can't tell/);
  });
});

describe("item 3: never remove something the user already had", () => {
  it("keeps a model the user already had, even though Ollama wasn't running at scan time", () => {
    // Scan saw no models (Ollama stopped), so the pull ran; the server's pre-run check found it present.
    const [item] = planOf(model("qwen2.5-coder:7b", "present")).items;
    expect(item).toMatchObject({ action: "keep", command: null });
  });

  it.each([
    ["model, unknown", model("qwen2.5-coder:7b", null)],
    ["program, unknown", ollama(null)],
    ["program, already present", ollama("present")],
  ])("keeps it: %s", (_label, r) => {
    expect(planOf(r).items[0]).toMatchObject({ action: "keep", command: null });
  });

  it("uses the FIRST run's state: present before run 1 stays kept after run 2", () => {
    expect(planOf(model("qwen2.5-coder:7b", "present"), model("qwen2.5-coder:7b", "absent")).items[0]!.action).toBe("keep");
  });
});

describe("item 4: fixed undo order", () => {
  it("removes the model before uninstalling Ollama after a double setup run", () => {
    // Run 1 installed Ollama + model; user removed Ollama; run 2 installed Ollama again.
    const ids = planOf(ollama(), model(), ollama()).items.map((i) => i.command?.commandId);
    expect(ids).toEqual(["ollama.rm", "ollama.uninstall"]);
  });

  it("orders services, models, settings, files, programs regardless of record order", () => {
    const items = planOf(ollama(), file(null), env(null), model(), serve("none")).items;
    expect(items.map((i) => i.action === "run-command" ? i.command!.commandId : i.action)).toEqual([
      "tailscale.serveOff", "ollama.rm", "restore-env", "delete-file", "ollama.uninstall",
    ]);
  });
});

describe("item 6: the workflow-rules file stays", () => {
  it("keeps it and says where", () => {
    const r = rec({ stepId: "workflow-rules", kind: "file-written", target: "D:/projects/my app/CLAUDE.md" });
    expect(planOf(r).items[0]).toMatchObject({ action: "keep", command: null, file: null,
      description: "You chose to keep this file in D:/projects/my app." });
  });
});

describe("item 7: user edits are moved to backups, never deleted", () => {
  it("passes the written hash and a plain note to the server", () => {
    const del = planOf(file(null)).items[0]!;
    expect(del.file).toMatchObject({ path: CONFIG, writtenHash: "0badc0de" });
    expect(del.file!.changedNote).toMatch(/moved your version to the backups folder instead of deleting/);
    const restore = planOf(file("C:/Users/me/.setuppilot/backups/1.json")).items[0]!;
    expect(restore.file!.changedNote).toMatch(/instead of overwriting/);
  });
});

describe("item 8: uninstallHash binds the exact list", () => {
  const items = planOf(serve("none"), model(), env("12000"), file("C:/Users/me/.setuppilot/backups/1.json"), ollama()).items;
  const base = uninstallHash(items);
  const tweak = (i: number, f: (x: UninstallItem) => UninstallItem) => uninstallHash(items.map((x, j) => (j === i ? f(x) : x)));
  const fileItem = items.findIndex((x) => x.file);
  const cmdItem = items.findIndex((x) => x.command);
  const changes: [string, string][] = [
    ["action", tweak(cmdItem, (x) => ({ ...x, action: "keep" }))],
    ["exe", tweak(cmdItem, (x) => ({ ...x, command: { ...x.command!, exe: "other" } }))],
    ["args", tweak(cmdItem, (x) => ({ ...x, command: { ...x.command!, args: [...x.command!.args, "x"] } }))],
    ["file path", tweak(fileItem, (x) => ({ ...x, file: { ...x.file!, path: "C:/x" } }))],
    ["restore source", tweak(fileItem, (x) => ({ ...x, file: { ...x.file!, restoreFrom: "C:/y" } }))],
    ["written hash", tweak(fileItem, (x) => ({ ...x, file: { ...x.file!, writtenHash: "1" } }))],
    ["record ids", tweak(0, (x) => ({ ...x, recordIds: ["other"] }))],
    ["optional", tweak(cmdItem, (x) => ({ ...x, optional: !x.optional }))],
    ["order", uninstallHash([...items].reverse())],
    ["one item fewer", uninstallHash(items.slice(1))],
  ];

  it.each(atLeast(changes, 10, "item changes"))("changes when the %s changes", (_what, hash) => {
    expect(hash).not.toBe(base);
  });

  it("is part of every plan", () => {
    const plan = planOf(model());
    expect(plan.uninstallHash).toBe(uninstallHash(plan.items));
  });
});

describe("items 9-11: untrusted records", () => {
  it("strips control characters and caps the length of manifest text", () => {
    const [item] = planOf(rec({ kind: "program-installed", target: `X\u0007\u001b[31m${"a".repeat(500)}` })).items;
    expect(item!.description).not.toMatch(/[\u0000-\u001f]/);
    expect(item!.description.length).toBeLessThan(160);
  });

  it("marks every group sharing a duplicate record id as damaged", () => {
    const a = { ...model(), id: "dup" };
    const b = { ...env(null), id: "dup" };
    const items = planOf(a, b).items;
    expect(atLeast(items, 2)).toSatisfy((xs: UninstallItem[]) => xs.every((i) => /damaged/.test(i.description)));
  });

  it("treats an unknown status as damaged", () => {
    const [item] = planOf({ ...model(), status: "skipped" as never }).items;
    expect(item!.description).toMatch(/damaged/);
  });

  it("after a failed run, restores the value the user set by hand before the next run", () => {
    expect(planOf({ ...env(null), status: "failed" }, env("12000")).items[0]!.command?.display)
      .toBe("setx OLLAMA_CONTEXT_LENGTH 12000");
  });
});
