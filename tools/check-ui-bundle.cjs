// After `vite build`: the browser bundle must contain no server code, no executor, no
// child_process and no Node-only modules. Fails the build script if it finds any.
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "ui", "dist");
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|html)$/.test(name)) files.push(p);
  }
})(dist);
if (files.length === 0) { console.error("check-ui-bundle: no built files found in ui/dist"); process.exit(1); }

// Markers of server/ code and Node-only modules. (Command ids like "taskkill" are plain data
// from core/commands and are allowed; they are text, not code that runs anything.)
const FORBIDDEN = [/child_process/, /RealExecutor/, /FakeExecutor/, /createExecutor/, /\bnode:fs\b/, /\bnode:os\b/,
  /\bnode:path\b/, /express/i, /server\/(config|executor|log)/, /SETUPPILOT_MODE/, /realpathSync/, /appendFile/];
const hits = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${path.relative(dist, f)}: ${re}`);
}
if (hits.length) { console.error("check-ui-bundle: forbidden code in the browser bundle:\n" + hits.join("\n")); process.exit(1); }
console.log(`check-ui-bundle: OK (${files.length} files, no server/ code, no child_process, no Node-only modules)`);
