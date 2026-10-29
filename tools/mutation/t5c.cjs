// T5c mutation check: goal-screen note (core/availability.ts) and the first-person wording.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const A = "core/availability.ts", D = "data/explanations.json", G = "data/goals.json", L = "data/glossary.json";
const M = [
  // Goal-screen note
  ["note text hard-wired (ignores disabledSteps)", A, sub("const off = new Set<StepId>(opts.disabledSteps ?? []);", 'const off = new Set<StepId>(["remote-access"]);')],
  ["note shown in demo mode", A, sub("if (opts.demo) return", "if (false) return")],
  ["note on advanced extras too", A, sub(".filter((id) => !STEP_DEFS[id].advanced)", ".filter(() => true)")],
  ["missing note text allowed", A, sub("if (!name) throw new Error(", "if (!name) return id; void (")],
  ["unknown disabled step allowed", A, sub("if (!Object.hasOwn(STEP_DEFS, id)) throw", "if (false) throw")],
  ["note hard-wired in goals.json", G, sub("only through your own private network.", "only through your own private network. Not available in this version.")],
  ["note text missing from data", D, sub('"remote-access": "using your AI from your other devices"', '"remote-accessX": "using your AI from your other devices"')],
  // First-person wording
  ["step 8: 'We' back", D, sub("isn't available yet in this version. I haven't", "isn't available yet in this version. We haven't")],
  ["step 7: subject dropped", D, sub('"disabled": "Your PC could use the speed boost, but it isn\'t ready in this version.', '"disabled": "Not available yet in this version.')],
  ["step 8: 'nothing to do' dropped", D, sub("this PC only. There's nothing to do here.", "this PC only.")],
  ["glossary: token back to 'a small piece of a word'", L, sub("A short piece of text, often a whole word or part of one, that the AI reads and writes.", "A small piece of a word.")],
];
const tests = "tests/goal-availability.test.ts tests/step7-reason-and-copy.test.ts tests/build-options-step7.test.ts tests/build-options.test.ts";
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
