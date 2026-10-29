// T7 mutation check: the log rules (guard, cleaning, paths, caps, queue, failures, clock).
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const prepend = (line, f = (s) => s) => (s) => `${line}\n${f(s)}`;
const L = "server/log.ts", C = "server/log/clean.ts", E = "server/log/entry.ts", F = "server/log/files.ts";
const M = [
  // private output and the guard
  ["private line logged", E, prepend('import { readPrivate } from "../executor/output";', sub(
    '  if (line.private) return null;\n  return { event: "command.output", runId, stepId, line: line.text };',
    '  return { event: "command.output", runId, stepId, line: line.private ? readPrivate(line.text) : line.text };'))],
  ["unknown keys allowed (request body)", E, sub("if (!Object.hasOwn(CHECKS, key) || !CHECKS[key as keyof LogEntry](value)) return null;", "if (Object.hasOwn(CHECKS, key) && !CHECKS[key as keyof LogEntry](value)) return null;")],
  ["objects with another prototype allowed", E, sub(" && Object.getPrototypeOf(v) === Object.prototype", "")],
  ["tampered command accepted", E, sub(" && prepare(v as unknown as RenderedCommand) !== null", "")],
  // cleaning
  ["login URL not stripped", C, sub("if (isLoginLink(token, endsLine)) return `${head}${LOGIN_REMOVED}${tail}`;", "")],
  ["login URL cut by the line end kept", C, sub(String.raw`return endsLine && /^https?:\/\/./.test(t) && LOGIN_PREFIXES.some((p) => p.startsWith(t));`, "return false;")],
  ["second half of a split login URL kept", C, sub('return t.includes("tailscale") || LOGIN_PATH.test(t);', 'return t.includes("tailscale");')],
  ["credentials not redacted", C, sub("return `${head}${redactCredentials(token)}${tail}`;", "return raw;")],
  ["credentials cut at the first @ (password with @ leaks)", C, sub('const lastAt = rest.lastIndexOf("@");', 'const lastAt = rest.indexOf("@");')],
  ["newline injection allowed (no neutralising)", C, sub('const flat = text.replace(HIDDEN, " ");', "const flat = text;")],
  // paths
  ["path escape allowed: name check removed", F, sub("  if (!isLogFileName(name)) return null;\n", "")],
  ["path escape allowed: resolved-path layer always true", F, sub("  return dirname(f) === d && basename(f) !== \"\" && f.length > d.length + 1;", "  return true;")],
  ["path escape allowed: both layers removed", F, both(
    sub("  if (!isLogFileName(name)) return null;\n", ""),
    sub("  if (!isDirectlyInside(dir, full) || basename(full) !== name) return null;\n", ""))],
  ["logs folder may be a link elsewhere", L, sub("return resolve(real).toLowerCase() === resolve(expected).toLowerCase() ? real : null;", "return real;")],
  ["delete call added", L, prepend('import { unlink } from "node:fs/promises";')],
  // caps
  ["no size cap per file (no rotation)", L, sub("while (this.current.size + bytes > MAX_FILE_BYTES) {", "while (false) {")],
  ["no size cap per entry", L, sub('while (Buffer.byteLength(text, "utf8") > MAX_ENTRY_BYTES &&', "while (false &&")],
  ["no total cap", L, sub('if (this.total + bytes > MAX_TOTAL_BYTES) return this.drop("cap-reached");', "")],
  // queue, failures, reporting
  ["queue removed (writes run in parallel)", L, sub("this.queue = this.queue.then(() => this.append(utcDate(now), text));", "void this.append(utcDate(now), text);")],
  ["log failure throws into the caller", L, sub("    } catch {\n      this.counts.failedWrites++;", "    } catch (e) {\n      throw e;\n      this.counts.failedWrites++;")],
  ["rejected entry throws", L, sub("      this.counts.rejected++;\n", '      throw new Error("rejected entry");\n')],
  ["marker carries the rejected data", L, sub("record = { ...REJECTED_MARKER };", "record = { ...REJECTED_MARKER, data: JSON.stringify(entry) };")],
  ["problem reported on every line", L, sub("    if (this.reported.has(kind)) return;\n", "")],
  ["clock replaced with real time", L, sub("const now = this.deps.clock.now();", "const now = Date.now();")],
];
function both(f, g) { return (s) => g(f(s)); }
const tests = ["log", "log-clean", "log-entry", "log-files", "log-e2e"].map((t) => `tests/${t}.test.ts`).join(" ");
const run = () => { try { execSync(`npx vitest run ${tests}`, { stdio: "pipe" }); return true; } catch { return false; } };
// A flaky failure would count as "caught", so the unmutated code must pass first.
if (!run()) { console.log("BASELINE FAILED: the tests fail without any mutation; nothing checked."); process.exit(1); }
let caught = 0;
for (const [name, file, f] of M) {
  const orig = fs.readFileSync(file, "utf8");
  let mutated;
  try { mutated = f(orig); } catch (e) { console.log("NOT APPLIED " + name + " (" + e.message.slice(0, 70) + ")"); continue; }
  fs.writeFileSync(file, mutated);
  const failed = !run();
  fs.writeFileSync(file, orig);
  if (failed) caught++;
  console.log((failed ? "CAUGHT  " : "MISSED  ") + name);
}
console.log(`${caught}/${M.length} caught`);
