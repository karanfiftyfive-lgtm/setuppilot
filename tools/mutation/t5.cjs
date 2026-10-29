// T5 mutation check (server/config.ts): break one rule at a time; a T5 test must fail.
const fs = require("fs");
const { execSync } = require("child_process");
const count = (s, a) => s.split(a).length - 1;
const sub = (a, b) => (s) => { const n = count(s, a); if (n !== 1) throw new Error((n === 0 ? "no text: " : `ambiguous (${n} matches): `) + a); return s.replace(a, b); };
const C = "server/config.ts";
const M = [
  ["mode: real by default", C, sub('return env.SETUPPILOT_MODE === "real" && platform === "win32" ? "real" : "demo";', 'return env.SETUPPILOT_MODE === "demo" ? "demo" : "real";')],
  ["mode: case-insensitive", C, sub('env.SETUPPILOT_MODE === "real" &&', 'env.SETUPPILOT_MODE?.toLowerCase() === "real" &&')],
  ["mode: trims spaces", C, sub('env.SETUPPILOT_MODE === "real" &&', 'env.SETUPPILOT_MODE?.trim() === "real" &&')],
  ["mode: any truthy value", C, sub('env.SETUPPILOT_MODE === "real" &&', '!!env.SETUPPILOT_MODE &&')],
  ["mode: no platform check", C, sub(' && platform === "win32"', "")],
  ["mode: platform prefix only", C, sub('platform === "win32"', 'platform.toLowerCase().startsWith("win")')],
  ["frozen: shallow only", C, sub("    for (const v of Object.values(value)) deepFreeze(v);\n", "")],
  ["frozen: not frozen", C, sub("    Object.freeze(value);\n", "")],
  ["startup: no checkRoots", C, sub("    checkRoots(config.roots);\n", "")],
  ["startup: models drive not checked", C, sub("if (!fs.exists(config.modelsDrive)) {", "if (false) {")],
  ["startup: mkdir failure ignored", C, sub("      fs.mkdir(dir);\n    } catch {\n      throw new StartupError", "      fs.mkdir(dir);\n    } catch {\n      void new StartupError")],
  ["startup: backups folder not created", C, sub("for (const dir of [config.logDir, ...config.roots.backups])", "for (const dir of [config.logDir])")],
  ["confirmed: OpenCode path confirmed by default", C, sub("openCodeConfig: unconfirmed(`${home}/.config/opencode/opencode.json`)", "openCodeConfig: { path: `${home}/.config/opencode/opencode.json`, confirmed: true }")],
  ["confirmed: unconfirmed path still written", C, sub('return config.openCodeConfig.confirmed ? "write" : "snippet";', 'return "write";')],
  ["confirmed: demo writes", C, sub('if (config.mode === "demo") return "simulate";', "")],
  ["confirmed: exe candidates confirmed", C, sub("const unconfirmed = (path: string | null): Candidate => ({ path, confirmed: false });", "const unconfirmed = (path: string | null): Candidate => ({ path, confirmed: true });")],
  ["home: not checked", C, sub("if (!isSafePath(h)) {", "if (false) {")],
  ["home: trailing slash kept (drive root passes as C:/)", C, sub(".replace(/\\\\/g, \"/\").replace(/\\/+$/, \"\");", ".replace(/\\\\/g, \"/\");")],
  ["home: read from USERPROFILE", C, sub("return buildConfig(inputs.homedir(), mode);", "return buildConfig(inputs.env.USERPROFILE ?? inputs.homedir(), mode);")],
  ["home: read twice", C, sub("const mode = modeFor(inputs.env, inputs.platform);", "inputs.homedir(); const mode = modeFor(inputs.env, inputs.platform);")],
  ["demo shares the real manifest", C, sub('const dataDir = mode === "real" ? reserved : `${reserved}/demo`;', "const dataDir = reserved;")],
  ["step 8 enabled in real mode", C, sub('const REAL_MODE_DISABLED: StepId[] = ["remote-access", "speed-boost"];', 'const REAL_MODE_DISABLED: StepId[] = ["speed-boost"];')],
  ["step 7 enabled in real mode", C, sub('const REAL_MODE_DISABLED: StepId[] = ["remote-access", "speed-boost"];', 'const REAL_MODE_DISABLED: StepId[] = ["remote-access"];')],
  ["step 7 disabled in demo mode too", C, sub('disabledSteps: mode === "real" ? [...REAL_MODE_DISABLED] : [],', 'disabledSteps: mode === "real" ? [...REAL_MODE_DISABLED] : ["speed-boost"],')],
  ["step 7 has no 'not available' text", "data/explanations.json", sub('"disabled": "Not available yet in this version: the speed boost', '"disabledX": "Not available yet in this version: the speed boost')],
];
let caught = 0;
for (const [name, file, f] of M) {
  const orig = fs.readFileSync(file, "utf8");
  let mutated;
  try { mutated = f(orig); } catch (e) { console.log("NOT APPLIED " + name + " (" + e.message.slice(0, 70) + ")"); continue; }
  fs.writeFileSync(file, mutated);
  let failed = false;
  try { execSync("npx vitest run tests/server-config.test.ts tests/build-options-step7.test.ts", { stdio: "pipe" }); } catch { failed = true; }
  fs.writeFileSync(file, orig);
  if (failed) caught++;
  console.log((failed ? "CAUGHT  " : "MISSED  ") + name);
}
console.log(`${caught}/${M.length} caught`);
