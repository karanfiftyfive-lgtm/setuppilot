import { describe, expect, it } from "vitest";
import { catalog } from "../core/data";
import { addRecord, buildUninstallPlan, emptyManifest, setStatus, uninstallHash } from "../core/manifest";
import { env, file, manifestOf, model, ollama, rec, ROOTS } from "./manifest-helpers";

describe("record helpers", () => {
  it("adds and updates records without mutating the input", () => {
    const m0 = emptyManifest();
    const m1 = addRecord(m0, model());
    const m2 = setStatus(m1, m1.records[0]!.id, "failed");
    expect(m0.records).toHaveLength(0);
    expect(m1.records[0]!.status).toBe("done");
    expect(m2.records[0]!.status).toBe("failed");
  });
});

describe("buildUninstallPlan", () => {
  it("returns an empty plan for an empty manifest", () => {
    const plan = buildUninstallPlan(emptyManifest(), catalog, ROOTS);
    expect(plan.items).toEqual([]);
    expect(plan.uninstallHash).toBe(uninstallHash([]));
  });

  it("undoes in the fixed order, so the model goes before Ollama", () => {
    const plan = buildUninstallPlan(manifestOf(ollama(), model(), env(null)), catalog, ROOTS);
    expect(plan.items.map((i) => i.command?.commandId)).toEqual(["ollama.rm", "env.unsetContext", "ollama.uninstall"]);
    expect(plan.items[0]!.command!.display).toBe("ollama rm qwen2.5-coder:7b");
    expect(plan.items[0]!.description).toContain("4.7 GB, estimate");
  });

  it("includes planned and failed records, but not reversed ones", () => {
    const plan = buildUninstallPlan(
      manifestOf(model("llama3.1:8b"), { ...model("qwen2.5:7b"), status: "planned" },
        { ...model("phi4:14b"), status: "failed" }, { ...model("gemma3:1b"), status: "reversed" }),
      catalog,
      ROOTS,
    );
    expect(plan.items.map((i) => i.command?.args[1])).toEqual(["phi4:14b", "qwen2.5:7b", "llama3.1:8b"]);
  });

  it("skips a target whose newest record was already reversed", () => {
    const plan = buildUninstallPlan(manifestOf(model(), env(null), { ...model(), status: "reversed" }), catalog, ROOTS);
    expect(plan.items.map((i) => i.command?.commandId)).toEqual(["env.unsetContext"]);
  });

  it("restores a previous setting, or removes one SetupPilot added", () => {
    const [restore] = buildUninstallPlan(manifestOf(env("8192")), catalog, ROOTS).items;
    expect(restore).toMatchObject({ action: "restore-env", command: { display: "setx OLLAMA_CONTEXT_LENGTH 8192" } });
    const [remove] = buildUninstallPlan(manifestOf(env(null)), catalog, ROOTS).items;
    expect(remove).toMatchObject({ action: "restore-env", command: { commandId: "env.unsetContext" } });
  });

  it("restores a backed-up file, or deletes a file SetupPilot created", () => {
    expect(buildUninstallPlan(manifestOf(file("C:/Users/me/.setuppilot/backups/1.json")), catalog, ROOTS).items[0])
      .toMatchObject({ action: "restore-file", command: null });
    expect(buildUninstallPlan(manifestOf(file(null)), catalog, ROOTS).items[0])
      .toMatchObject({ action: "delete-file", command: null });
  });

  it("makes removing programs optional and removing models required", () => {
    const items = buildUninstallPlan(manifestOf(ollama(), model()), catalog, ROOTS).items;
    expect(items.find((i) => i.command?.commandId === "ollama.uninstall")!.optional).toBe(true);
    expect(items.find((i) => i.command?.commandId === "ollama.rm")!.optional).toBe(false);
  });

  it.each([
    ["a tampered model tag", model("x;del")],
    ["a tampered env value", env("8192 & calc")],
    ["an unknown env var", rec({ kind: "env-var-set", target: "PATH", previous: null })],
    ["a program with an unknown reverse command", rec({ kind: "program-installed", target: "X", reverseCommandId: "rm.all" })],
    ["a program whose reverse is not an uninstall", rec({ kind: "program-installed", target: "X", reverseCommandId: "ollama.install" })],
  ])("refuses to run anything for %s", (_label, bad) => {
    const [item] = buildUninstallPlan(manifestOf(bad), catalog, ROOTS).items;
    expect(item!.command).toBeNull();
    expect(item!.description).toMatch(/damaged/);
  });

  it("gives the same plan when run twice on the same input", () => {
    const m = manifestOf(ollama(), model(), env("4096"), file(null));
    const snapshot = structuredClone(m);
    expect(buildUninstallPlan(m, catalog, ROOTS)).toEqual(buildUninstallPlan(m, catalog, ROOTS));
    expect(m).toEqual(snapshot);
  });
});
