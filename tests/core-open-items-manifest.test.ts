// Phase 1 open items fixed in core (Phase 2, T2): uninstall records, OI-7, OI-3, OI-9.
import { describe, expect, it } from "vitest";
import { catalog } from "../core/data";
import { buildUninstallPlan, reversedIdsFor, show } from "../core/manifest";
import type { ChangeRecord, Manifest, UninstallItem } from "../core/types";
import { atLeast } from "./fixtures";
import { CONFIG, env, file, login, model, ollama, planOf, rec, ROOTS } from "./manifest-helpers";

// Special characters are built from code points so the test source stays plain ASCII.
const ch = (cp: number) => String.fromCodePoint(cp);

describe("OI-7: hidden characters are removed from displayed text", () => {
  const hidden = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
    0x2028, 0x2029, 0x0085, 0x200e, 0x200f, 0x061c, 0x0000, 0x001b, 0x007f].map(ch);

  it.each(hidden.map((c) => [c.codePointAt(0)!.toString(16), c]))("strips U+%s", (_hex, c) => {
    expect(show(`a${c}b`)).toBe("ab");
  });

  it("checked every hidden character listed", () => {
    atLeast(hidden, 18, "characters");
  });

  it("keeps ordinary non-ASCII text", () => {
    expect(show(`Jos${ch(0xe9)} ${ch(0x4e2d)}`)).toBe(`Jos${ch(0xe9)} ${ch(0x4e2d)}`);
  });

  it("never shows a bidi trick in an uninstall description", () => {
    const RLO = ch(0x202e);
    const tricky = [
      file(null, `C:/Windows/${RLO}nosj.exe`), // outside the roots: damaged
      rec({ stepId: "workflow-rules", kind: "file-written", target: `D:/p${RLO}x/CLAUDE.md` }), // kept
    ];
    const items = atLeast(planOf(...tricky).items, 2, "items");
    for (const i of items) for (const c of hidden) expect(i.description.includes(c)).toBe(false);
  });
});

describe("OI-3: a record with the wrong shape never throws", () => {
  const good = (): Partial<ChangeRecord> => ({ ...model() });
  const shapes: [string, unknown][] = [
    ["non-string target", { ...good(), id: "m1", target: 42 }],
    ["missing target", (({ target: _t, ...r }) => ({ ...r, id: "m2" }))(good() as ChangeRecord)],
    ["object previous", { ...good(), id: "m3", previous: { x: 1 } }],
    ["number writtenHash", { ...good(), id: "m4", writtenHash: 7 }],
    ["array kind", { ...good(), id: "m5", kind: ["model-pulled"] }],
    ["null record", null],
    ["number record", 5],
    ["string record", "model-pulled"],
    ["non-string id", { ...good(), id: 9 }],
    ["file record with non-string target", { ...file(null), id: "m6", target: null }],
  ];
  const planFor = (r: unknown) => buildUninstallPlan({ schemaVersion: 1, records: [r] } as unknown as Manifest, catalog, ROOTS);

  it.each(shapes)("turns a record with %s into one skip item", (_name, r) => {
    const { items } = planFor(r);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: "skip", command: null, file: null });
    expect(items[0]!.description).toMatch(/damaged/);
  });

  it("checked every bad shape listed", () => {
    atLeast(shapes, 10, "shapes");
  });

  it("keeps the record id when it is a string, and none when it is not", () => {
    expect(planFor(shapes[0]![1]).items[0]!.recordIds).toEqual(["m1"]);
    expect(planFor(null).items[0]!.recordIds).toEqual([]);
    expect(planFor({ ...good(), id: 9 }).items[0]!.recordIds).toEqual([]);
  });

  it("still plans the good records next to a bad one", () => {
    const m = { schemaVersion: 1, records: [model(), { bad: true }, env(null)] } as unknown as Manifest;
    const items = buildUninstallPlan(m, catalog, ROOTS).items;
    expect(items.map((i) => i.action)).toEqual(["run-command", "restore-env", "skip"]);
  });

  it("marks a good record damaged when a bad record reuses its id", () => {
    const r = model();
    const m = { schemaVersion: 1, records: [r, { id: r.id, target: 1 }] } as unknown as Manifest;
    const items = buildUninstallPlan(m, catalog, ROOTS).items;
    expect(atLeast(items, 2)).toSatisfy((xs: readonly UninstallItem[]) => xs.every((i) => i.action === "skip"));
  });
});

describe("OI-9: damaged and declined records are never marked reversed", () => {
  const damagedCases: [string, ChangeRecord[]][] = [
    ["file outside the roots", [file(null, "C:/Windows/x.dll")]],
    ["unknown program", [rec({ kind: "program-installed", target: "Evil.App", previous: "absent" })]],
    ["unknown service", [rec({ kind: "service-configured", target: "tailscale-funnel", previous: null })]],
    ["other env var", [rec({ kind: "env-var-set", target: "PATH", previous: null })]],
    ["bad model tag", [model("bad tag!")]],
    ["unknown status", [rec({ status: "weird" as ChangeRecord["status"] })]],
    ["unknown kind", [rec({ kind: "registry-key" as ChangeRecord["kind"] })]],
    ["env value that can't be restored", [env("12; del x")]],
  ];

  it.each(damagedCases)("gives a skip item for a %s", (_name, records) => {
    const [item] = planOf(...records).items;
    expect(item).toMatchObject({ action: "skip", command: null, file: null, optional: false });
    expect(reversedIdsFor(item!, "done")).toEqual([]);
  });

  it("checked every damaged case listed", () => {
    atLeast(damagedCases, 8, "cases");
  });

  it("marks records reversed only when the action succeeded", () => {
    const [item] = planOf(model()).items;
    expect(item!.action).toBe("run-command");
    expect(reversedIdsFor(item!, "done")).toEqual(item!.recordIds);
    expect(reversedIdsFor(item!, "failed")).toEqual([]);
  });

  it("never marks an optional item the user declined", () => {
    const [item] = planOf(ollama("absent")).items;
    expect(item).toMatchObject({ action: "run-command", optional: true });
    expect(reversedIdsFor(item!, "declined")).toEqual([]);
  });

  it("marks a kept item done (nothing left to undo)", () => {
    const [item] = planOf(login("logged-in")).items;
    expect(item!.action).toBe("keep");
    expect(reversedIdsFor(item!, "done")).toEqual(item!.recordIds);
  });

  it("returns a copy, so the caller can't change the plan through it", () => {
    const [item] = planOf(model()).items;
    reversedIdsFor(item!, "done").push("other");
    expect(item!.recordIds).not.toContain("other");
  });

  it("a skip item changes the uninstall hash (its action is hashed)", () => {
    const a = planOf(file(null, CONFIG)).uninstallHash;
    const b = planOf(file(null, "C:/Windows/x.dll")).uninstallHash;
    expect(a).not.toBe(b);
  });
});
