// T5d mutation check: goal-note wording source and the caveat's "no claim" rule.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const A = "core/availability.ts", D = "data/explanations.json";
const M = [
  // Goal note: wording lives in data, and says what you get instead
  ["goal note wording hard-wired in code (same output)", A, sub('note: text.replace("{features}", names.join(" and ")) };', 'note: `Not in this version: ${names.join(" and ")}. For now, it works on this PC only.` };')],
  ["goal note back to 'Part of this...'", D, sub('"text": "Not in this version: {features}. For now, it works on this PC only."', '"text": "Part of this isn\'t available in this version: {features}."')],
  ["goal note: 'this PC only' dropped", D, sub("{features}. For now, it works on this PC only.", "{features}.")],
  // Caveat: no claim about what still works
  ["caveat claims chat still works", D, sub("may not work well here. You don't need to do anything.", "may not work well here. Asking about code in the chat still works, and you don't need to do anything.")],
  ["caveat claims the rest works fine", D, sub("may not work well here.", "may not work well here. Everything else works fine.")],
];
const tests = "tests/goal-availability.test.ts tests/step7-reason-and-copy.test.ts tests/build-options.test.ts";
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
