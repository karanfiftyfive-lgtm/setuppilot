// T4 mutation check: break one rule at a time; a T4 test must fail.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const G = "core/goals.ts", T = "core/toolconfig.ts", H = "core/hash.ts", D = "data/explanations.json";
const M = [
  // Hash inputs
  ["hash: file content not hashed", G, sub("contentHash: contentHash(utf8(file.content))", 'contentHash: contentHash(utf8(""))')],
  ["hash: fileWrite left out of planHash", G, sub("s.commands.map((c) => [c.exe, c.args]), s.fileWrite]", "s.commands.map((c) => [c.exe, c.args])]")],
  ["hash: target path left out", G, sub("{ kind: def.writesFile, targetPath: file.targetPath, contentHash", '{ kind: def.writesFile, targetPath: "", contentHash')],
  ["hash: high bit of each byte dropped", H, sub("for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;", "for (const b of bytes) h = Math.imul(h ^ (b & 0x7f), 0x01000193) >>> 0;")],
  ["hash: UTF-16 code units, not bytes", H, sub("for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;", "for (const b of new TextDecoder().decode(bytes)) h = Math.imul(h ^ b.charCodeAt(0), 0x01000193) >>> 0;")],
  // Conflict refusal / merge
  ["merge: overwrites a different entry", T, sub(': { kind: "conflict", reason: `It already has a different', ': { kind: "added", config: { ...parsed, provider: { ...provider, [entry.key]: entry.value } } } || { kind: "conflict", reason: `It already has a different')],
  ["merge: ignores the providers section", T, sub("if (isPlainObject(providers) && Object.hasOwn(providers, entry.key)) {", "if (false) {")],
  ["merge: drops unrelated keys", T, sub('return { kind: "added", config: { ...parsed, provider: added } };', 'return { kind: "added", config: { provider: added } };')],
  ["merge: drops other providers", T, sub("const added = { ...(isPlainObject(provider) ? provider : {}), [entry.key]", "const added = { [entry.key]")],
  ["merge: throws on non-object", T, sub('if (!isPlainObject(parsed)) return { kind: "invalid", reason: "The settings file is not a JSON object." };', "")],
  ["merge: shares the entry object", T, sub("[entry.key]: structuredClone(entry.value) }", "[entry.key]: entry.value }")],
  // Idempotence
  ["idempotence: re-adds when already there", T, sub('? { kind: "unchanged", config: { ...parsed } }', '? { kind: "added", config: { ...parsed } }')],
  ["idempotence: key order matters", T, sub("isPlainObject(x) ? Object.fromEntries(Object.keys(x).sort()", "isPlainObject(x) ? Object.fromEntries(Object.keys(x)")],
  // disabledSteps
  ["disabled: step still runs", G, sub("const reason = disabled.has(id) ? (text.disabled ?? null) : skipReason(id, profile, rec, catalog);", "const reason = skipReason(id, profile, rec, catalog);")],
  ["disabled: sharing refusal wins", G, sub("disabled.has(id) ? (text.disabled ?? null) : skipReason(id, profile, rec, catalog)", "(skipReason(id, profile, rec, catalog) ?? (disabled.has(id) ? (text.disabled ?? null) : null))")],
  ["disabled: required step allowed", G, sub('if (STEP_DEFS[id].required) throw new PlanError', "if (false) throw new PlanError")],
  ["disabled: unknown id allowed", G, sub('if (!Object.hasOwn(STEP_DEFS, id)) throw new PlanError', "if (false) throw new PlanError")],
  ["disabled: reason text missing", D, sub('"disabled": "Not available yet in this version: the sharing commands', '"disabledX": "Not available yet in this version: the sharing commands')],
  // Demo label and context caveat
  ["demo: label on skipped steps", G, sub("demoLabel: opts.demo && !reason ? explanations.labels.demo : null", "demoLabel: opts.demo ? explanations.labels.demo : null")],
  ["demo: label in real mode", G, sub("demoLabel: opts.demo && !reason ? explanations.labels.demo : null", "demoLabel: explanations.labels.demo")],
  ["caveat: never shown", G, sub('const note = id === "connect-coding-tool" && !reason ? contextNote(rec.context) : null;', "const note = null;")],
  ["caveat: threshold off by one", T, sub("if (context >= TOOL_USE_MIN_CONTEXT) return null;", "if (context >= TOOL_USE_MIN_CONTEXT - 1) return null;")],
  ["caveat: shown on every step", G, sub('const note = id === "connect-coding-tool" && !reason ? contextNote(rec.context) : null;', "const note = !reason ? contextNote(rec.context) : null;")],
  ["caveat: blocks the step", G, sub('def, text: filled, status: reason ? "skipped" : "waiting"', 'def, text: filled, status: reason || note ? "skipped" : "waiting"')],
  ["claude: command made persistent", T, sub("`$env:ANTHROPIC_AUTH_TOKEN = \"ollama\"`", "`setx ANTHROPIC_AUTH_TOKEN ollama`")],
  ["claude: caveat dropped", T, sub("return { text: `${lines.join(\"\\n\")}\\n`, caveat: contextNote(context) };", "return { text: `${lines.join(\"\\n\")}\\n`, caveat: null };")],
  ["tag: leading dash allowed", T, sub("const SAFE_TAG = /^[a-z0-9][a-z0-9._-]*", "const SAFE_TAG = /^[a-z0-9._-][a-z0-9._-]*")],
];
const tests = "tests/toolconfig.test.ts tests/content-hash.test.ts tests/build-options.test.ts tests/honesty.test.ts";
let caught = 0;
for (const [name, file, f] of M) {
  const orig = fs.readFileSync(file, "utf8");
  let mutated;
  try { mutated = f(orig); } catch (e) { console.log("NOT APPLIED " + name + " (" + e.message.slice(0, 60) + ")"); continue; }
  fs.writeFileSync(file, mutated);
  let failed = false;
  try { execSync(`npx vitest run ${tests}`, { stdio: "pipe" }); } catch { failed = true; }
  fs.writeFileSync(file, orig);
  if (failed) caught++;
  console.log((failed ? "CAUGHT  " : "MISSED  ") + name);
}
console.log(`${caught}/${M.length} caught`);
