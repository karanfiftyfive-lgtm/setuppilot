// T3 mutation check: break one whitelist/verify rule at a time; a new test must fail.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const W = "core/commands/whitelist.ts", V = "core/commands/verify.ts", C = "core/commands/checks.ts";
const M = [
  ["read-only check gets a reverse", C, sub(`args: ["/groups", "/fo", "csv", "/nh"] }`, `args: ["/groups", "/fo", "csv", "/nh"], reverseId: "ollama.install" }`)],
  ["read-only check needs admin", C, sub(`({ params: {}, needsAdmin: false,`, `({ params: {}, needsAdmin: true,`)],
  ["read-only check counted as a change", C, sub(`changesPc: false, reverseId: null, timeoutSec: 15`, `changesPc: true, reverseId: "ollama.install", timeoutSec: 15`)],
  ["pid not checked against own children", W, sub(` || !ctx.ownChildPids.includes(Number(value))`, ``)],
  ["pid may be a string", W, sub(`if (rule.kind === "ownChildPid" && typeof raw !== "number")`, `if (false)`)],
  ["pid 0 allowed", W, sub("/^[1-9]\\d{0,9}$/.test(value) || !ctx.ownChildPids", "/^[0-9]\\d{0,9}$/.test(value) || !ctx.ownChildPids")],
  ["catalog context carries a pid", W, sub(`ownChildPids: [], // only`, `ownChildPids: [4321], // only`)],
  ["winget check accepts any package", C, sub(`params: { pkg: { kind: "enum", values: WINGET_PACKAGES } }`, `params: { pkg: { kind: "catalogTag" } }`)],
  ["env listing not private", C, sub("args: [\"query\", \"HKCU\\\\Environment\"], privateOutput: true", "args: [\"query\", \"HKCU\\\\Environment\"]")],
  ["new check not marked VERIFY", W, sub(`"detect.admin", "detect.displays", "prerun.wingetList"`, `"detect.displays", "prerun.wingetList"`)],
  ["verify: exe not compared", V, sub(`cmd.exe !== expected.exe || `, ``)],
  ["verify: display not compared", V, sub(` || cmd.display !== expected.display`, ``)],
  ["verify: args not compared (shows pull, runs rm)", V, sub("if (cmd.exe !== expected.exe || !sameArgs || ", "if (cmd.exe !== expected.exe || ")],
  ["verify: arg count not compared", V, sub("cmd.args.length === expected.args.length && ", "")],
  ["verify: arg values not compared", V, sub(" && expected.args.every((a, i) => a === cmd.args[i])", "")],
  ["verify: args may be any value", V, sub("if (!Array.isArray(cmd.args)) refuse(`${spec.id} has no argument list`);", "")],
  ["verify: extra fields allowed", V, sub(`if (Object.keys(cmd).sort().join(",") !== "args,commandId,display,exe") refuse("unexpected fields");`, ``)],
  ["verify: inherited ids allowed", V, sub(`Object.hasOwn(COMMANDS, cmd.commandId)`, `cmd.commandId in COMMANDS`)],
];
let caught = 0;
for (const [name, file, f] of M) {
  const orig = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, f(orig));
  let failed = false;
  try { execSync("npx vitest run tests/whitelist-checks.test.ts", { stdio: "pipe" }); } catch { failed = true; }
  fs.writeFileSync(file, orig);
  if (failed) caught++;
  console.log((failed ? "CAUGHT  " : "MISSED  ") + name);
}
console.log(`${caught}/${M.length} caught`);
