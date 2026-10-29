// Content for the coding-tool steps (9 and 10). Pure: builds text and objects only. The server
// reads, backs up and writes files (T14), and detects JSONC comments before parsing: a file
// with comments is never rewritten (the user gets the snippet to paste instead).
import { explanations } from "./data";
import type { Model } from "./types";

/** Hash of the exact bytes to write; used in the plan hash for steps 9 and 10. */
export { contentHash, utf8 } from "./hash";

// Docs checked 2026-10-28. docs.ollama.com/context-length: "coding tools should be set to at
// least 64000 tokens"; docs.ollama.com/integrations/opencode: "OpenCode requires a context
// length of 64k or higher"; docs.ollama.com/integrations/claude-code: "64k or higher".
// (opencode.ai/docs/providers itself says "Start around 16k - 32k" if tool calls fail; we use
// the higher, more cautious figure.)
export const TOOL_USE_MIN_CONTEXT = 64000;

// opencode.ai/docs/providers (Ollama): npm "@ai-sdk/openai-compatible", options.baseURL
// "http://localhost:11434/v1", a models map; the provider id "can be any string". We use our
// own id so we never collide with a provider the user set up. opencode.ai/config.json marks
// top-level `provider` deprecated in favour of `providers` (no Ollama example): VERIFY.
export const PROVIDER_KEY = "setuppilot-ollama";
const OPENCODE_NPM = "@ai-sdk/openai-compatible";
const OPENCODE_BASE_URL = "http://localhost:11434/v1";
// docs.ollama.com/integrations/claude-code, manual setup: these three variables. The docs show
// them only as a Bash example; the PowerShell form below is our translation (VERIFY).
const CLAUDE_BASE_URL = "http://localhost:11434";

// Catalog tags only, and never one that starts with "-" (it lands in a copy-paste command).
const SAFE_TAG = /^[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/;

export interface OpenCodeProvider {
  npm: string;
  name: string;
  options: { baseURL: string };
  models: Record<string, { name: string }>;
}
export interface OpenCodeEntry { key: string; value: OpenCodeProvider; contextNote: string | null }
export type MergeResult =
  | { kind: "added" | "unchanged"; config: Record<string, unknown> }
  | { kind: "conflict" | "invalid"; reason: string };

function checkInputs(model: Model, context: number): void {
  if (!SAFE_TAG.test(model.ollamaTag)) throw new Error(`Unsafe model tag "${model.ollamaTag}"`);
  if (!Number.isInteger(context) || context <= 0) throw new Error(`Bad context size ${context}`);
}

/** Plain-words warning when the context is below what the tools' guides recommend. */
export function contextNote(context: number): string | null {
  if (context >= TOOL_USE_MIN_CONTEXT) return null;
  return explanations.toolConfig.contextNote
    .replace("{toolContext}", String(TOOL_USE_MIN_CONTEXT))
    .replace("{context}", String(context));
}

export function buildOpenCodeEntry(model: Model, context: number): OpenCodeEntry {
  checkInputs(model, context);
  return {
    key: PROVIDER_KEY,
    value: {
      npm: OPENCODE_NPM,
      name: explanations.toolConfig.providerName,
      options: { baseURL: OPENCODE_BASE_URL },
      models: { [model.ollamaTag]: { name: model.displayName } },
    },
    contextNote: contextNote(context),
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** JSON with keys sorted at every level, so equal content compares equal. */
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  isPlainObject(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);

/**
 * Adds ONLY provider[PROVIDER_KEY]; every other key is copied as it was. Never overwrites:
 * our key with different content (or under the newer `providers` section) is a conflict.
 */
export function mergeProvider(parsed: unknown, entry: OpenCodeEntry): MergeResult {
  if (!isPlainObject(parsed)) return { kind: "invalid", reason: "The settings file is not a JSON object." };
  const section = (name: string) => (Object.hasOwn(parsed, name) ? parsed[name] : undefined);
  const provider = section("provider");
  const providers = section("providers");
  for (const [name, v] of [["provider", provider], ["providers", providers]] as const) {
    if (v !== undefined && !isPlainObject(v)) return { kind: "invalid", reason: `Its "${name}" section is not an object.` };
  }
  if (isPlainObject(providers) && Object.hasOwn(providers, entry.key)) {
    return { kind: "conflict", reason: `It already has a "${entry.key}" entry in its "providers" section.` };
  }
  if (isPlainObject(provider) && Object.hasOwn(provider, entry.key)) {
    return canonical(provider[entry.key]) === canonical(entry.value)
      ? { kind: "unchanged", config: { ...parsed } }
      : { kind: "conflict", reason: `It already has a different "${entry.key}" entry.` };
  }
  const added = { ...(isPlainObject(provider) ? provider : {}), [entry.key]: structuredClone(entry.value) };
  return { kind: "added", config: { ...parsed, provider: added } };
}

/** The optional CLAUDE.md for a project folder: plan, build, check. Editable by the user. */
export function buildRulesFile(): string {
  return `${explanations.toolConfig.rulesFile.join("\n")}\n`;
}

/**
 * Copy-paste text for Claude Code. Never run and never written by SetupPilot: the variables
 * last only for the PowerShell window the user pastes them into, so their normal Claude Code
 * setup is not changed. (In Windows PowerShell 5.1, setting a variable to "" removes it for
 * that window, which also stops an existing API key being used: VERIFY on the test machine.)
 */
export function buildClaudeCodeCommand(model: Model, context: number): { text: string; caveat: string | null } {
  checkInputs(model, context);
  const lines = [
    ...explanations.toolConfig.claudeCodeHeader,
    `$env:ANTHROPIC_BASE_URL = "${CLAUDE_BASE_URL}"`,
    `$env:ANTHROPIC_AUTH_TOKEN = "ollama"`,
    `$env:ANTHROPIC_API_KEY = ""`,
    `claude --model ${model.ollamaTag}`,
  ];
  return { text: `${lines.join("\n")}\n`, caveat: contextNote(context) };
}
