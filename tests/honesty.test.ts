// Scans every user-facing string core can produce. Each source must contribute text, so a
// source that silently goes quiet fails the test instead of passing with nothing checked.
import { describe, expect, it } from "vitest";
import { buildLadder } from "../core/analyze";
import { catalog, explanations, goals } from "../core/data";
import { buildPlan } from "../core/goals";
import { recommend } from "../core/recommend";
import { buildClaudeCodeCommand, buildOpenCodeEntry, buildRulesFile, TOOL_USE_MIN_CONTEXT } from "../core/toolconfig";
import type { MachineProfile } from "../core/types";
import { atLeast, gpuProfile, makeProfile, profiles } from "./fixtures";
import { env, file, login, model, ollama, planOf, rec, serve } from "./manifest-helpers";

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const machines: MachineProfile[] = [
  ...Object.values(profiles),
  makeProfile(profiles.midPc, { diskFreeGb: 6 }),
  makeProfile(profiles.midPc, { diskFreeGb: 2 }),
  makeProfile(profiles.midPc, { ramGb: { total: 16, free: 0 } }),
  gpuProfile(null),
];

function sources(): Record<string, string[]> {
  const rec_: string[] = [], plans: string[] = [], ladders: string[] = [];
  for (const p of machines) {
    for (const g of goals) {
      const r = recommend(p, catalog, g.modelUse);
      rec_.push(r.why, ...r.warnings, ...(r.nextTier ? [r.nextTier.unlockHint] : []));
      plans.push(...buildPlan(g.id, p, r, catalog).steps.flatMap((s) => strings(s.text)));
      // Demo labels, the "not available yet" reason and the context note (Phase 2, T4).
      for (const opts of [{ demo: true }, { disabledSteps: ["remote-access" as const] }]) {
        plans.push(...buildPlan(g.id, p, r, catalog, {}, undefined, opts).steps
          .flatMap((s) => [...strings(s.text), ...(s.skipReason ? [s.skipReason] : []), ...(s.demoLabel ? [s.demoLabel] : [])]));
      }
      for (const before of machines) {
        const l = buildLadder(before, p, r.model.id, catalog, g.modelUse);
        ladders.push(...l.tips, ...l.changes.map((c) => c.text), ...l.rungs.flatMap((x) => [x.gain, ...(x.needs ? [x.needs] : [])]));
      }
    }
  }
  // Every kind and outcome, each in its own manifest (records for one target merge into one item).
  const manifests = [
    catalog.models.map((m) => model(m.ollamaTag)),
    [model("mistral:latest")], [model("x;bad")], [model("qwen2.5:7b", "present")],
    [ollama()], [ollama(null)], [rec({ kind: "program-installed", target: "Tailscale.Tailscale", previous: "absent" })],
    [login("logged-out")], [login("logged-in")], [login(null)], [serve("none")], [serve("existing")],
    [env(null)], [env("12000")], [file(null)], [file("C:/Users/me/.setuppilot/backups/1.json")],
    [rec({ stepId: "workflow-rules", kind: "file-written", target: "D:/p/CLAUDE.md" })],
  ];
  const uninstall = manifests.flatMap((records) => planOf(...records).items)
    .flatMap((i) => [i.description, ...(i.file ? [i.file.changedNote] : [])]);
  // Coding-tool content (Phase 2, T4): every model at every context size.
  const tools: string[] = [buildRulesFile()];
  for (const m of catalog.models) {
    for (const ctx of m.contextOptions) {
      const cc = buildClaudeCodeCommand(m, ctx);
      const oc = buildOpenCodeEntry(m, ctx);
      tools.push(cc.text, ...(cc.caveat ? [cc.caveat] : []), ...strings(oc.value), ...(oc.contextNote ? [oc.contextNote] : []));
    }
  }
  return { explanations: strings(explanations), recommendations: rec_, plans, ladders, uninstall, tools };
}

// Numbers coding-tool text may contain: list headings, the documented context figure, the
// catalog's context sizes. Catalog model tags and names (e.g. "Llama 3.2") and the localhost
// URL are removed before checking: they are catalog data, not claims.
const ALLOWED_NUMBERS = new Set(["1", "2", "3", String(TOOL_USE_MIN_CONTEXT),
  ...catalog.models.flatMap((m) => m.contextOptions.map(String))]);
const TAGS = catalog.models.flatMap((m) => [m.ollamaTag, m.displayName]).sort((a, b) => b.length - a.length);

const GB_HINT = /about \S+ GB/;

describe("honesty", () => {
  const all = sources();

  it("gets text from every source", () => {
    for (const [name, list] of Object.entries(all)) atLeast(list, 10, `${name} strings`);
  });

  it("scans uninstall descriptions for every kind of change", () => {
    const u = all.uninstall!;
    for (const pattern of [/Remove the AI model/, /Remove the program/, /Sign this PC out/, /Stop sharing/,
      /leave it signed in/, /AI memory setting/, /Delete the file/, /Restore your previous/, /chose to keep this file/,
      /moved your version/, /isn't in this version's model list/, /damaged/, /already had/]) {
      expect(u.some((t) => pattern.test(t)), String(pattern)).toBe(true);
    }
  });

  it("labels every 'about N GB' as an estimate, in every source", () => {
    expect(atLeast(all.uninstall!.filter((t) => GB_HINT.test(t)), catalog.models.length, "model removal GB hints"));
    const hints = Object.values(all).flat().filter((t) => GB_HINT.test(t));
    atLeast(hints, 30, "GB hints overall");
    expect([...new Set(hints.filter((t) => !/estimate/i.test(t)))]).toEqual([]);
  });

  it("never promises 'unlimited'", () => {
    const everything = atLeast(Object.values(all).flat(), 200, "strings");
    expect(everything.filter((t) => /unlimited/i.test(t))).toEqual([]);
  });

  it("makes no speed, saving or cost claims in coding-tool text", () => {
    const tools = atLeast(all.tools!, 50, "coding-tool strings");
    const claims = /\b(sav(e|es|ed|ing|ings)|cheap\w*|cost\w*|money|free|faster|quicker|tok\/s|per second|times as)\b|\$\d/i;
    expect(tools.filter((t) => claims.test(t))).toEqual([]);
  });

  it("uses only documented or catalog numbers in coding-tool text", () => {
    const stray = new Set<string>();
    for (const t of atLeast(all.tools!, 50, "coding-tool strings")) {
      const bare = TAGS.reduce((s, tag) => s.split(tag).join(" "), t).replace(/https?:\/\/\S+/g, " ");
      for (const n of bare.match(/\d+(\.\d+)?/g) ?? []) if (!ALLOWED_NUMBERS.has(n)) stray.add(n);
    }
    expect([...stray]).toEqual([]);
  });

  it("puts the context caveat on the coding-tool step whenever the context is below the docs' figure", () => {
    const below = atLeast(machines, 5, "machines").map((p) => {
      const r = recommend(p, catalog, "code");
      return [r.context, buildPlan("code", p, r, catalog).steps.find((s) => s.def.id === "connect-coding-tool")!] as const;
    });
    for (const [ctx, step] of below) {
      expect(ctx).toBeLessThan(TOOL_USE_MIN_CONTEXT);
      expect(step.text.smallContext, String(ctx)).toContain(String(TOOL_USE_MIN_CONTEXT));
      expect(step.text.smallContext).toContain(String(ctx));
    }
  });
});
