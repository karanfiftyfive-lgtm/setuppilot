// Phase 2 T4: coding-tool content (core/toolconfig.ts). Pure functions; files are T14.
import { describe, expect, it } from "vitest";
import { catalog } from "../core/data";
import {
  buildClaudeCodeCommand, buildOpenCodeEntry, buildRulesFile, mergeProvider, PROVIDER_KEY, TOOL_USE_MIN_CONTEXT,
} from "../core/toolconfig";
import type { Model } from "../core/types";
import { atLeast } from "./fixtures";

const coder = catalog.models.find((m) => m.ollamaTag === "qwen2.5-coder:7b")!;
const entry = buildOpenCodeEntry(coder, 8192);
const isAscii = (s: string) => [...s].every((c) => c.charCodeAt(0) < 128);
const contexts = [...new Set(catalog.models.flatMap((m) => m.contextOptions))];

describe("buildOpenCodeEntry", () => {
  it("builds the documented Ollama provider under our own key", () => {
    expect(entry.key).toBe(PROVIDER_KEY);
    expect(entry.value).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "Ollama on this PC (set up by SetupPilot)",
      options: { baseURL: "http://localhost:11434/v1" },
      models: { "qwen2.5-coder:7b": { name: coder.displayName } },
    });
  });

  it("adds the context caveat for every catalog context size (all are below the docs' figure)", () => {
    for (const ctx of atLeast(contexts, 4, "context sizes")) {
      expect(ctx).toBeLessThan(TOOL_USE_MIN_CONTEXT);
      expect(buildOpenCodeEntry(coder, ctx).contextNote).toContain(`set to ${ctx}`);
    }
    expect(buildOpenCodeEntry(coder, TOOL_USE_MIN_CONTEXT).contextNote).toBeNull();
    expect(buildOpenCodeEntry(coder, TOOL_USE_MIN_CONTEXT - 1).contextNote).not.toBeNull();
  });

  const badTags = ["-rf", "a b", "x;calc", "Qwen:7b", "x$(y)", "", "x:y:z"];
  it.each(badTags)("refuses the unsafe model tag %j", (tag) => {
    expect(() => buildOpenCodeEntry({ ...coder, ollamaTag: tag } as Model, 8192)).toThrow();
    expect(() => buildClaudeCodeCommand({ ...coder, ollamaTag: tag } as Model, 8192)).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses the context size %s", (ctx) => {
    expect(() => buildOpenCodeEntry(coder, ctx)).toThrow();
  });

  it("checked every bad tag listed", () => {
    atLeast(badTags, 7, "tags");
  });
});

describe("mergeProvider", () => {
  it("adds our entry to an empty object", () => {
    expect(mergeProvider({}, entry)).toEqual({ kind: "added", config: { provider: { [PROVIDER_KEY]: entry.value } } });
  });

  it("keeps every unrelated key exactly as it was and never changes the input", () => {
    const user = {
      $schema: "https://opencode.ai/config.json", theme: "dark", model: "anthropic/x",
      provider: { ollama: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://host:1/v1" } } },
      providers: { other: { name: "x" } }, agent: { nested: { deep: [1, 2, { k: "v" }] } },
    };
    const before = structuredClone(user);
    const r = mergeProvider(user, entry);
    expect(r.kind).toBe("added");
    if (r.kind !== "added") return;
    const { provider, ...rest } = r.config as typeof user & { provider: Record<string, unknown> };
    const { provider: userProvider, ...userRest } = before;
    expect(rest).toEqual(userRest);
    expect(provider).toEqual({ ...userProvider, [PROVIDER_KEY]: entry.value });
    expect(user).toEqual(before);
  });

  it("is idempotent: merging twice gives 'unchanged' and the same config", () => {
    const once = mergeProvider({ theme: "dark" }, entry);
    if (once.kind !== "added") throw new Error("expected added");
    const twice = mergeProvider(once.config, entry);
    expect(twice).toEqual({ kind: "unchanged", config: once.config });
  });

  it("treats our entry with keys in a different order as the same", () => {
    const v = entry.value;
    const reordered = { models: v.models, options: v.options, name: v.name, npm: v.npm };
    expect(mergeProvider({ provider: { [PROVIDER_KEY]: reordered } }, entry).kind).toBe("unchanged");
  });

  const conflicts: [string, unknown][] = [
    ["a different model", { provider: { [PROVIDER_KEY]: buildOpenCodeEntry(catalog.models[0]!, 4096).value } }],
    ["a different address", { provider: { [PROVIDER_KEY]: { ...entry.value, options: { baseURL: "http://evil:1/v1" } } } }],
    ["an extra field", { provider: { [PROVIDER_KEY]: { ...entry.value, apiKey: "x" } } }],
    ["a value that is not an object", { provider: { [PROVIDER_KEY]: "x" } }],
    ["our key in the newer providers section", { providers: { [PROVIDER_KEY]: entry.value } }],
  ];
  it.each(conflicts)("refuses to overwrite %s", (_name, cfg) => {
    const before = structuredClone(cfg);
    const r = mergeProvider(cfg, entry);
    expect(r.kind).toBe("conflict");
    expect(r).not.toHaveProperty("config");
    expect(cfg).toEqual(before);
  });

  const invalid: [string, unknown][] = [
    ["null", null], ["undefined", undefined], ["a number", 42], ["a string", "{}"], ["an array", [{}]],
    ["a Date", new Date(0)], ["provider as a string", { provider: "x" }], ["provider as an array", { provider: [] }],
    ["provider as null", { provider: null }], ["providers as a number", { providers: 5 }],
  ];
  it.each(invalid)("reports %s as invalid without throwing", (_name, cfg) => {
    expect(() => mergeProvider(cfg, entry)).not.toThrow();
    expect(mergeProvider(cfg, entry).kind).toBe("invalid");
  });

  it("checked every conflict and invalid input listed", () => {
    atLeast(conflicts, 5, "conflicts");
    atLeast(invalid, 10, "invalid inputs");
  });

  it("is not tricked by a __proto__ key from JSON.parse", () => {
    const parsed = JSON.parse(`{"__proto__": {"${PROVIDER_KEY}": "x"}, "provider": {}}`) as unknown;
    const r = mergeProvider(parsed, entry);
    expect(r.kind).toBe("added");
    expect(({} as Record<string, unknown>)[PROVIDER_KEY]).toBeUndefined();
  });

  it("returns a copy, so changing the result never changes the entry", () => {
    const r = mergeProvider({}, entry);
    if (r.kind !== "added") throw new Error("expected added");
    ((r.config.provider as Record<string, { name: string }>)[PROVIDER_KEY]!).name = "changed";
    expect(entry.value.name).not.toBe("changed");
  });
});

describe("buildRulesFile", () => {
  const text = buildRulesFile();

  it("is short plain-ASCII markdown that says it is optional and editable", () => {
    expect(text.split("\n").length).toBeLessThan(100);
    expect(isAscii(text)).toBe(true);
    expect(text.startsWith("# ")).toBe(true);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toMatch(/Optional/);
    expect(text).toMatch(/edit/i);
  });

  it("covers plan, build and check", () => {
    for (const h of atLeast(["## 1. Plan first", "## 2. Build in small steps", "## 3. Check the work"], 3, "headings")) {
      expect(text).toContain(h);
    }
  });
});

describe("buildClaudeCodeCommand", () => {
  const all = atLeast(catalog.models.map((m) => [m, buildClaudeCodeCommand(m, m.defaultContext)] as const), 10, "models");

  it("sets exactly the three documented variables for this window, then starts claude", () => {
    for (const [m, { text }] of all) {
      expect(text).toContain('$env:ANTHROPIC_BASE_URL = "http://localhost:11434"');
      expect(text).toContain('$env:ANTHROPIC_AUTH_TOKEN = "ollama"');
      expect(text).toContain('$env:ANTHROPIC_API_KEY = ""');
      expect(text.trimEnd().split("\n").at(-1)).toBe(`claude --model ${m.ollamaTag}`);
      expect(text).toMatch(/this PowerShell window only/);
      expect(isAscii(text)).toBe(true);
    }
  });

  it("never makes a lasting change to the user's settings", () => {
    const persistent = /setx|SetEnvironmentVariable|Set-ItemProperty|New-ItemProperty|\breg\b|HKCU|HKLM|\$PROFILE|settings\.json/i;
    for (const [, { text }] of all) expect(text).not.toMatch(persistent);
  });

  it("carries the plain-language caveat whenever the context is below the docs' figure", () => {
    for (const [m, { caveat }] of all) {
      expect(caveat, m.ollamaTag).toContain(String(TOOL_USE_MIN_CONTEXT));
      expect(caveat).toContain(String(m.defaultContext));
      expect(caveat).toMatch(/may not work well/);
    }
    expect(buildClaudeCodeCommand(coder, TOOL_USE_MIN_CONTEXT).caveat).toBeNull();
  });
});
