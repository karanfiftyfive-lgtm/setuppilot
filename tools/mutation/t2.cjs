const fs = require("fs");
const { execSync } = require("child_process");
const line = (start, replacement) => (s) => {
  const L = s.split("\n"); const i = L.findIndex((l) => l.startsWith(start)); if (L.filter((l) => l.startsWith(start)).length > 1) throw new Error("ambiguous line " + start);
  if (i < 0) throw new Error("no line " + start); L[i] = replacement; return L.join("\n");
};
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const M = [
  ["OI-2 old device list", "core/paths.ts", line("const DEVICE = ", String.raw`const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;`)],
  ["OI-4 Unicode lowercase", "core/paths.ts", sub(`.replace(/[A-Z]/g, (c) => c.toLowerCase())`, `.toLowerCase()`)],
  ["OI-5 no guarded check", "core/goals.ts", sub(` && !isInsideRoots(targetPath, guarded)`, ``)],
  ["OI-6 buildPlan skips checkRoots", "core/goals.ts", sub(`  checkRoots(roots);\n`, ``)],
  ["OI-6 checkRoots ignores overlap", "core/paths.ts", sub(`if (guarded.some((g) => overlaps(trimRoot(t), g)))`, `if (false)`)],
  ["OI-6 overlap misses 'contains'", "core/paths.ts", sub(` || b.startsWith(\`\${a}/\`)`, ``)],
  ["OI-7 old strip set", "core/manifest.ts", line("const HIDDEN = ", String.raw`const HIDDEN = /[\u0000-\u001f\u007f]/g;`)],
  ["OI-3 trusts every record", "core/manifest.ts", sub(`if (!wellFormed(r)) {`, `if (false) {`)],
  ["OI-9 reversedIdsFor ignores skip", "core/manifest.ts", sub(`item.action === "skip" || outcome !== "done"`, `outcome !== "done"`)],
  ["OI-9 reversedIdsFor ignores declined", "core/manifest.ts", sub(`outcome !== "done"`, `outcome === "failed"`)],
  ["OI-9 damaged back to run-command", "core/manifest.ts", sub(`recordIds, action: "skip",`, `recordIds, action: "run-command",`)],
  ["OI-9 reversedIdsFor returns same array", "core/manifest.ts", sub(`return [...item.recordIds];`, `return item.recordIds;`)],
  ["hygiene: raw U+2028 in a core file", "core/hash.ts", (s) => s + "// x" + String.fromCodePoint(0x2028) + "y"],
  ["hygiene: raw RLO in a data file", "data/glossary.json", (s) => s.replace("{", "{" + String.fromCodePoint(0x202e))],
];
let caught = 0;
for (const [name, file, f] of M) {
  const orig = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, f(orig));
  let failed = false;
  try { execSync("npx vitest run tests/core-open-items-paths.test.ts tests/core-open-items-manifest.test.ts tests/source-hygiene.test.ts", { stdio: "pipe" }); } catch { failed = true; }
  fs.writeFileSync(file, orig);
  if (failed) caught++;
  console.log((failed ? "CAUGHT  " : "MISSED  ") + name);
}
console.log(`${caught}/${M.length} caught`);
