// PostToolUse hook: after an Edit/Write inside core/ or tests/, run the Vitest suite.
// Exit 2 shows the failure output to Claude; exit 0 stays silent.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let filePath = "";
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

const normalized = filePath.replace(/\\/g, "/");
if (!/\/(core|tests)\//.test(normalized)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
// Phase 0 has no package.json yet; nothing to test.
if (!existsSync(join(root, "package.json"))) process.exit(0);

const result = spawnSync("npx vitest run --reporter=dot", {
  cwd: root,
  shell: true,
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(`Tests failed after editing ${filePath}:\n`);
  process.stderr.write((result.stdout ?? "") + (result.stderr ?? ""));
  process.exit(2);
}
process.exit(0);
