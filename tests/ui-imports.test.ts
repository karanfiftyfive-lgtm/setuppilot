// Demo UI: the browser code imports no server/ code, no Node module, no child_process, and
// uses no network or storage. (After a build, tools/check-ui-bundle.cjs checks the bundle too.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { atLeast } from "./fixtures";

const SRC = join(__dirname, "..", "ui", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.(ts|tsx)$/.test(n) ? [join(dir, n)] : []));

const RULES: [string, RegExp][] = [
  ["imports server/", /from\s+["'][^"']*\/server\//],
  ["imports a Node module", /from\s+["']node:/],
  ["child_process", /child_process/],
  ["network call", /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/],
  ["browser storage", /localStorage|sessionStorage|indexedDB/],
];

describe("demo UI imports", () => {
  it("ui/src has no server, Node, network or storage use", () => {
    const found = atLeast(files(SRC), 15, "ui source files").flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return RULES.filter(([, re]) => re.test(text)).map(([why]) => `${relative(SRC, f)}: ${why}`);
    });
    expect(found).toEqual([]);
  });

  it("the rules catch bad examples", () => {
    const bad = ['import { x } from "../../server/log";', 'import fs from "node:fs";', 'require("child_process")', "fetch(url)", "localStorage.setItem(a, b)"];
    for (const [i, b] of atLeast(bad, 5, "bad examples").entries()) expect(RULES[i]![1].test(b), b).toBe(true);
  });
});
