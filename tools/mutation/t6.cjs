// T6 mutation check: the executor rules (spawn, exe paths, kill, timeout/cancel, output
// policy, privateOutput, env allowlist, spawn-import rule, outcome mapping).
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const both = (f, g) => (s) => g(f(s));
const O = "server/executor/output.ts", S = "server/executor/supervise.ts", R = "server/executor/real.ts", E = "server/executor/env.ts";
const C = "core/outcome.ts", W = "core/commands/whitelist.ts", X = "server/config.ts";
const M = [
  // privateOutput
  ["PrivateText toString shows the text", O, sub("toString(): string { return HIDDEN; }", "toString(): string { return privateTexts.get(this) ?? \"\"; }")],
  ["PrivateText toJSON shows the text", O, sub("toJSON(): string { return HIDDEN; }", "toJSON(): string { return privateTexts.get(this) ?? \"\"; }")],
  ["private flag ignored", O, sub("this.spec.isPrivate ? { private: true, text: new PrivateText(text) } : { private: false, text }", "{ private: false, text }")],
  ["result carries output", S, both(
    sub('import { LineSplitter, OutputSink } from "./output";', 'import { LineSplitter, OutputSink, readPrivate } from "./output";'),
    sub("const out = new OutputSink(spec, onLine, clock);", "const out = new OutputSink(spec, (l) => { (base as unknown as Record<string, unknown>).output = l.private ? readPrivate(l.text) : l.text; onLine(l); }, clock);"))],
  // spawn options and exe paths
  ["shell: true", R, sub("{ shell: false, windowsHide: true, stdio", "{ shell: true as false, windowsHide: true, stdio")],
  ["windowsHide: false", R, sub("shell: false, windowsHide: true, stdio:", "shell: false, windowsHide: false as true, stdio:")],
  ["unconfirmed exe allowed", R, sub("if (!c?.confirmed || !c.path) return null;", "if (!c?.path) return null;")],
  ["unsafe path allowed (relative, UNC, device name)", R, sub("if (!isSafePath(c.path)) return null;", "")],
  ["another program's name allowed", R, sub("if (baseOf(c.path).toLowerCase() !== `${exe.toLowerCase()}.exe`) return null;", "")],
  ["RealExecutor built in demo mode", R, sub('if (config.mode !== "real" || (deps.platform', 'if (false && (deps.platform')],
  ["executor skips verifyRendered", S, sub("    verifyRendered(cmd, verifyContext());\n", "")],
  // kill
  ["kill targets process.pid", R, sub("{ pid }, { ...renderContextFromCatalog(catalog), ownChildPids: [pid] }", "{ pid: process.pid }, { ...renderContextFromCatalog(catalog), ownChildPids: [process.pid] }")],
  ["fallback even when a confirmed taskkill fails", R, sub('k.on("close", (code: number | null) => resolve(code === 0 ? "tree" : "failed"));', 'k.on("close", (code: number | null) => { if (code !== 0) child.kill(); resolve(code === 0 ? "tree" : "failed"); });')],
  ["fallback claims a confirmed kill", R, sub('return Promise.resolve("fallback");', 'return Promise.resolve("tree");')],
  ["pid kept after exit (kill after exit)", S, sub("    child.on(\"exit\", () => {\n      if (child.pid !== undefined) own.delete(child.pid);\n    });\n", "")],
  // timeout, cancel, wait
  ["timeout not enforced", S, sub('timer = clock.setTimeout(() => void stop("timeout"), spec.timeoutMs);', "timer = null;")],
  ["cancel ignored", S, sub('signal.addEventListener("abort", onAbort, { once: true });', "")],
  ["5 s wait off the injected clock", S, sub("waitTimer = clock.setTimeout(() => ended(false), KILL_WAIT_MS);", "waitTimer = null; setTimeout(() => ended(false), KILL_WAIT_MS);")],
  // output policy
  ["log cap removed", O, sub("if (this.bytes > MAX_LOG_BYTES) {", "if (false) {")],
  ["progress history kept (every line forwarded)", O, sub("if (this.clock.now() - this.lastSent >= PROGRESS_INTERVAL_MS) this.sendLatest();", "this.sendLatest();")],
  ["cap applied to progress (progress treated as log)", O, sub('if (this.spec.policy === "progress") {', "if (false) {")],
  ["ollama.pull no longer 'progress'", W, sub('timeoutSec: 7200, output: "progress" }', "timeoutSec: 7200 }")],
  // env allowlist
  ["full env inheritance", E, sub("if (value !== undefined && wanted.has(name.toLowerCase())) out[name] = value;", "if (value !== undefined) out[name] = value;")],
  ["secret var passed", E, sub('"HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",', '"HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "GITHUB_TOKEN",')],
  ["child env toString shows the values", E, sub("toString(): string { return HIDDEN; }", "toString(): string { return JSON.stringify(envValues.get(this)); }")],
  ["child env hidden guard removed", E, sub("toJSON(): string { return HIDDEN; }", "toJSON(): string { return JSON.stringify(envValues.get(this)); }")],
  ["child env logged", R, sub('if (!path) return Promise.resolve(notRun("refused"));', 'if (!path) return Promise.resolve(notRun("refused"));\n    console.info("spawn env", readChildEnv(this.env));')],
  // spawn-import rule
  ["child_process imported outside real.ts", X, (s) => `import "node:child_process";\n${s}`],
  // outcome mapping
  ["unconfirmed-exe detail same as generic", C, sub('case "refused": return fail("COMMAND_FAILED", "exeUnconfirmed");', 'case "refused": return fail("COMMAND_FAILED", "commandFailed");')],
  ["timeout claims the program stopped", C, sub('r.killConfirmed === true ? "timedOut" : "timedOutMayRun"', '"timedOut"')],
  ["winget not found is a generic failure", C, sub('spec.exe === "winget" ? fail("NO_WINGET", "notFound") : ', "")],
];
const tests = ["executor-shared", "executor-real", "executor-output", "executor-env", "outcome", "spawn-rule"].map((t) => `tests/${t}.test.ts`).join(" ");
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
