// Mutation check: break one rule at a time, run the suite, restore. A mutation "survives"
// if every test still passes (that would mean the rule is untested).
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.argv[2];
const M = [
  ["paths: device names allowed", "core/paths.ts", " && !DEVICE.test(s)", ""],
  ["paths: trailing dot/space allowed", "core/paths.ts", "!BAD_SEGMENT_END.test(s) && ", ""],
  ["paths: control/forbidden chars allowed", "core/paths.ts", "if (BAD_CHARS.test(path)) return false;", ""],
  ["serve: unknown state keeps sharing on", "core/changes.ts", 'undo: (p) => p !== "existing"', 'undo: (p) => p === "none"'],
  ["login: unknown state logs out", "core/changes.ts", 'undo: (p) => p === "logged-out"', 'undo: (p) => p !== "logged-in"'],
  ["model: unknown previous removes it", "core/manifest.ts", 'baseline.previous !== "absent"', 'baseline.previous === "present"', 0],
  ["program: unknown previous removes it", "core/manifest.ts", 'baseline.previous !== "absent"', 'baseline.previous === "present"', 1],
  ["undo order: newest-first instead of fixed", "core/manifest.ts", "rank(a.newest.kind) - rank(b.newest.kind) || b.pos - a.pos", "b.pos - a.pos"],
  ["file restore: newest backup, not oldest", "core/manifest.ts", "const backup = baseline.backupPath;", "const backup = newest.backupPath;"],
  ["programs: trust stored reverseCommandId", "core/manifest.ts", "run(safeRender(p.uninstall, {}, ctx)", "run(safeRender(newest.reverseCommandId ?? p.uninstall, {}, ctx)"],
  ["backups: allowed from target folders", "core/manifest.ts", "!isInsideRoots(backup, roots.backups)", "!isInsideRoots(backup, [...roots.backups, ...roots.targets])"],
  ["uninstall: no target root check", "core/manifest.ts", "if (!isInsideRoots(newest.target, roots.targets)) return damaged;", ""],
  ["duplicate ids not detected", "core/manifest.ts", "idCount.get(r.id)! > 1 || ", ""],
  ["unknown status not detected", "core/manifest.ts", " || !STATUSES.has(r.status)", ""],
  ["uninstallHash ignores args", "core/manifest.ts", "i.command ? [i.command.exe, i.command.args] : null", "i.command ? [i.command.exe] : null"],
  ["baseline: failed run sets the before-state", "core/manifest.ts", 'rest.find((r) => r.status !== "failed") ?? rest[0]!', "rest[0]!"],
  ["workflow-rules: only newest record checked", "core/manifest.ts", 'g.live.some((r) => r.stepId === "workflow-rules")', 'newest.stepId === "workflow-rules"'],
  ["ollama uninstall: no models warning", "core/changes.ts", "warning: \"This may also delete", "nowarning: \"This may also delete"],
  ["workflow-rules file deleted, not kept", "core/manifest.ts", 'g.live.some((r) => r.stepId === "workflow-rules")', "false"],
  ["uninstall text: GB without estimate", "core/manifest.ts", "GB, estimate)`", "GB)`"],
  ["manifest text not sanitised", "core/manifest.ts", 'const c = s.replace(HIDDEN, "");', "const c = s;"],
  ["planHash ignores file writes", "core/goals.ts", "s.commands.map((c) => [c.exe, c.args]), s.fileWrite]", "s.commands.map((c) => [c.exe, c.args])]"],
  ["planHash uses display string", "core/goals.ts", "s.commands.map((c) => [c.exe, c.args])", "s.commands.map((c) => c.display.split(' ')[0])"],
  ["buildPlan: no file target check", "core/goals.ts", "if (file && def.writesFile) checkFileTarget(def.writesFile, file.targetPath, roots);", ""],
  ["remote access: no refusal on existing sharing", "core/steps.ts", 'return profile.tools.tailscaleServe === "existing" ? text.refused! : null;', "return null;"],
  ["changeFor: tailscale.serve not recorded", "core/changes.ts", 'case "tailscale.serve": return { kind: "service-configured", target: "tailscale-serve" };', ""],
  ["contextSize: leading zeros allowed", "core/commands/whitelist.ts", "/^[1-9]\\d*$/", "/^\\d+$/"],
  ["modelTag: catalog not required", "core/commands/whitelist.ts", "!ctx.catalogTags.includes(value) || !ctx.allowedTags.includes(value)", "!ctx.allowedTags.includes(value)"],
  ["whitelist: inherited keys accepted", "core/commands/whitelist.ts", "if (!Object.hasOwn(cmd.params, key)) throw", "if (!(key in cmd.params)) throw"],
];

function replaceNth(text, find, repl, n) {
  let idx = -1;
  for (let i = 0; i <= n; i++) {
    idx = text.indexOf(find, idx + 1);
    if (idx < 0) return null;
  }
  return text.slice(0, idx) + repl + text.slice(idx + find.length);
}

// A flaky failure would count as "caught", so the unmutated code must pass first.
if (spawnSync("npx vitest run", { cwd: ROOT, shell: true, stdio: "pipe" }).status !== 0) {
  console.log("BASELINE FAILED: the tests fail without any mutation; nothing checked.");
  process.exit(1);
}
const results = [];
for (const [label, rel, find, repl, nthGiven] of M) {
  const file = path.join(ROOT, rel);
  const original = fs.readFileSync(file, "utf8");
  const matches = original.split(find).length - 1;
  // A pattern that matches several places must say which one it means.
  if (matches > 1 && nthGiven === undefined) { results.push([label, `NOT APPLIED (ambiguous: ${matches} matches)`, ""]); continue; }
  const mutated = replaceNth(original, find, repl, nthGiven ?? 0);
  if (mutated === null) { results.push([label, "NOT APPLIED (pattern not found)", ""]); continue; }
  try {
    fs.writeFileSync(file, mutated);
    const r = spawnSync("npx vitest run --reporter=json", { cwd: ROOT, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const json = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    const failed = json.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => a.title));
    const loadErrors = json.testResults.filter((f) => f.status === "failed" && f.assertionResults.length === 0).length;
    results.push([label, failed.length > 0 || loadErrors > 0 ? `CAUGHT (${failed.length} failed)` : "SURVIVED", failed[0] ?? ""]);
  } finally {
    fs.writeFileSync(file, original);
  }
}
for (const [label, verdict, example] of results) console.log(`${verdict.padEnd(22)} | ${label} | e.g. ${example}`);
const survived = results.filter((r) => !r[1].startsWith("CAUGHT")).length;
console.log(`\n${results.length - survived}/${results.length} mutations caught`);
