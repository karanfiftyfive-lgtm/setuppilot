// Read-only scan mutation check: break one rule at a time; a scan test must fail.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const S = "server/detect/scan.ts", D = "ui/src/model/demo.ts";
const M = [
  ["unread graphics card guessed as 'no card'", S, sub("gpus: nvidia.length ? nvidia : [GPU_NOT_READ],", "gpus: nvidia,")],
  ["graphics memory left in MiB", S, sub("vramGb: Math.round((Number(m[2]) / 1024) * 10) / 10", "vramGb: Number(m[2])")],
  ["memory in decimal GB instead of GiB", S, sub("const GIB = 1024 ** 3;", "const GIB = 1e9;")],
  ["a failed nvidia-smi run still counts", S, sub("return result.exitCode === 0 ? lines : null;", "return lines;")],
  ["admin rights guessed as yes", S, sub("    isAdmin: false,", "    isAdmin: true,")],
  ["internet guessed as yes", S, sub("    internet: false,", "    internet: true,")],
  ["demo accepts a malformed scan file", D, sub("p.schemaVersion !== 1 || ", "")],
  ["unread card shown as 'built-in graphics'", D, sub('p.gpus.some((g) => g.vramSource === "none")', "false")],
];
const tests = "tests/detect-scan.test.ts";
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
