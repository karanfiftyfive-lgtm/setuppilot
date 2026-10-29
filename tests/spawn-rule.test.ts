// Phase 2 T6: only server/executor/real.ts may start processes, so it is the only server file
// allowed to import child_process (server/CLAUDE.md). Any import form counts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { atLeast } from "./fixtures";

const ROOT = join(__dirname, "..");
const ALLOWED = "server/executor/real.ts";
// from "...", import "...", import("..."), require("..."), with or without "node:", any quote.
const CHILD_PROCESS = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`](?:node:)?child_process["'`]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(c|m)?[jt]s$/.test(name) ? [p] : [];
  });
}

describe("spawn rule: only RealExecutor imports child_process", () => {
  it("recognises every import form", () => {
    const forms = atLeast([
      `import { spawn } from "node:child_process";`,
      `import { spawn } from 'child_process';`,
      `import type { ChildProcess } from "node:child_process";`,
      `import * as cp from "child_process";`,
      `import "node:child_process";`,
      `const cp = require("child_process");`,
      `const cp = require( 'node:child_process' );`,
      `import cp = require("child_process");`,
      "const cp = await import(`node:child_process`);",
      `const cp = await import("child_process");`,
    ], 10, "import forms");
    for (const f of forms) expect(CHILD_PROCESS.test(f), f).toBe(true);
    for (const f of [`// starts processes via node:child_process`, `import { readFileSync } from "node:fs";`, `const s = "child_process";`]) {
      expect(CHILD_PROCESS.test(f), f).toBe(false);
    }
  });

  it("finds no child_process import in server/ outside server/executor/real.ts", () => {
    const files = atLeast(sourceFiles(join(ROOT, "server")), 1, "server source files");
    const offenders = files
      .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
      .filter((rel) => rel !== ALLOWED && CHILD_PROCESS.test(readFileSync(join(ROOT, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
