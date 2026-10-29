// T5b mutation check: step 7 reason order (D43) and the reworded texts; a T5b test must fail.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const G = "core/goals.ts", T = "core/toolconfig.ts", D = "data/explanations.json", L = "data/glossary.json";
const ORDER = 'if (!(id === "speed-boost" && reason)) reason = text.disabled;';
const M = [
  // Step 7 reason order
  ["not needed hidden behind the disabled text", G, sub(ORDER, "reason = text.disabled;")],
  ["disabled step runs when also not needed", G, sub(ORDER, 'reason = id === "speed-boost" && reason ? null : text.disabled;')],
  ["step 8 shows its own reason first too", G, sub(ORDER, "if (!reason) reason = text.disabled;")],
  // Wording
  ["step 8: goal limit not said", D, sub(" For now, your AI works on this PC only.", " Your AI still works on this PC.")],
  ["step 8: jargon back", D, sub("Using your AI from your other devices isn't", "The sharing commands aren't")],
  ["step 7: old 'checked on a real PC' wording", D, sub("I haven't finished testing it, so I'm leaving it out. Your AI works without it", "It hasn't been checked on a real PC, so I'm leaving it out. Your AI works without it")],
  ["step 7: 'nothing to do' dropped", D, sub("just without the extra speed. There's nothing to do here.", "just without the extra speed.")],
  ["caveat: no unit after this PC's number", D, sub("set to {context} tokens to fit", "set to {context} to fit")],
  ["caveat: 'nothing to do' dropped", D, sub(" You don't need to do anything.", "")],
  ["caveat: stated as certain", D, sub("may not work well here", "will not work well here")],
  ["caveat: comma in the number", T, sub('.replace("{toolContext}", String(TOOL_USE_MIN_CONTEXT))', '.replace("{toolContext}", TOOL_USE_MIN_CONTEXT.toLocaleString("en-US"))')],
  ["glossary: token in two sentences", L, sub('"A short piece of text, often a whole word or part of one, that the AI reads and writes."', '"A short piece of text. AI reads and writes in tokens."')],
  ["glossary: token entry missing", L, sub('"token": ', '"tokenX": ')],
];
const tests = "tests/step7-reason-and-copy.test.ts tests/build-options-step7.test.ts tests/build-options.test.ts tests/honesty.test.ts tests/toolconfig.test.ts";
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
