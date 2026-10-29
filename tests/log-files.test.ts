// Phase 2 T7: UTC dates from the injected clock, safe file names, and no delete anywhere.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isDirectlyInside, isLogFileName, logFileName, newestFirst, resolveLogFile, utcDate, utcIso } from "../server/log/files";
import { atLeast } from "./fixtures";
import { LOG_DIR } from "./log-helpers";

describe("UTC dates without Date", () => {
  it("matches Date's own UTC date and ISO time across many instants", () => {
    const samples = atLeast([
      0, -1, 86_399_999, 86_400_000, Date.UTC(2000, 1, 29, 23, 59, 59, 999), Date.UTC(2024, 1, 29),
      Date.UTC(2026, 9, 30, 23, 59, 59), Date.UTC(2026, 9, 31), Date.UTC(2099, 11, 31, 23, 59, 59, 999), Date.UTC(1969, 11, 31, 12),
      ...Array.from({ length: 200 }, (_, i) => 1_700_000_000_000 + i * 7_777_777_777),
    ], 200, "instants");
    for (const ms of samples) {
      expect(utcDate(ms), String(ms)).toBe(new Date(ms).toISOString().slice(0, 10));
      expect(utcIso(ms), String(ms)).toBe(new Date(ms).toISOString());
    }
  });

  it("puts 23:59:59 UTC and 00:00:00 UTC in different files", () => {
    const before = Date.UTC(2026, 9, 30, 23, 59, 59);
    const after = Date.UTC(2026, 9, 31, 0, 0, 0);
    expect(logFileName(utcDate(before), 0)).toBe("2026-10-30.log");
    expect(logFileName(utcDate(after), 0)).toBe("2026-10-31.log");
  });
});

describe("file names and paths", () => {
  it("builds only <date>.log and <date>.<1-9>.log", () => {
    expect(logFileName("2026-10-30", 0)).toBe("2026-10-30.log");
    expect(logFileName("2026-10-30", 9)).toBe("2026-10-30.9.log");
    const bad: readonly [string, number][] = atLeast<[string, number]>([
      ["2026-10-30", 10], ["2026-10-30", -1], ["2026-10-30", 1.5], ["../../evil", 0], ["2026-10-30/../../x", 0],
      ["2026-10-30\\..\\x", 0], ["C:/Windows/x", 0], ["", 0], ["2026-1-3", 0], ["2026-10-30.log", 0],
    ], 10, "bad date/rotation pairs");
    for (const [d, n] of bad) expect(logFileName(d, n), `${d} ${n}`).toBeNull();
  });

  it("refuses any name that would leave the logs folder", () => {
    expect(resolveLogFile(LOG_DIR, "2026-10-30.log")).toBe(resolve(LOG_DIR, "2026-10-30.log"));
    const escapes = atLeast([
      "../2026-10-30.log", "..\\2026-10-30.log", "../../evil.log", "sub/2026-10-30.log", "C:/2026-10-30.log",
      "2026-10-30.log/../../x.log", "2026-10-30.log:stream", "2026-10-30.0.log", "evil.log", "2026-10-30.LOG ",
    ], 10, "escape names");
    for (const name of escapes) {
      expect(isLogFileName(name), name).toBe(false);
      expect(resolveLogFile(LOG_DIR, name), name).toBeNull();
    }
  });

  it("second layer: the resolved path must be a direct child of the logs folder", () => {
    expect(isDirectlyInside(LOG_DIR, join(LOG_DIR, "2026-10-30.log"))).toBe(true);
    const outside = atLeast([
      join(LOG_DIR, "..", "2026-10-30.log"), join(LOG_DIR, "..", "..", "evil.log"), join(LOG_DIR, "sub", "x.log"),
      LOG_DIR, resolve(LOG_DIR, ".."), resolve("C:/Windows/System32/x.log"), `${LOG_DIR}-evil${"\\"}x.log`,
    ], 7, "outside paths");
    for (const p of outside) expect(isDirectlyInside(LOG_DIR, p), p).toBe(false);
  });

  it("orders files newest day first, then the highest rotation first", () => {
    const names = ["2026-10-29.log", "2026-10-30.log", "2026-10-30.2.log", "2026-10-30.1.log", "2026-10-28.9.log"];
    expect([...names].sort(newestFirst)).toEqual(["2026-10-30.2.log", "2026-10-30.1.log", "2026-10-30.log", "2026-10-29.log", "2026-10-28.9.log"]);
  });
});

describe("the log never deletes", () => {
  const ROOT = join(__dirname, "..");
  const sources = atLeast(["server/log.ts", ...readdirSync(join(ROOT, "server/log")).map((f) => `server/log/${f}`)], 4, "log sources");
  const DELETE = /\b(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|truncate|truncateSync|ftruncate|ftruncateSync|rename|renameSync)\b/;

  it("no log source imports or calls a delete, truncate or rename function", () => {
    for (const f of sources) expect(DELETE.test(readFileSync(join(ROOT, f), "utf8")), f).toBe(false);
  });

  it("the check itself recognises such calls", () => {
    for (const s of [`import { unlink } from "node:fs/promises";`, "await rm(p)", "fs.unlinkSync(p)", "truncate(p, 0)", "await rename(a, b)"]) {
      expect(DELETE.test(s), s).toBe(true);
    }
  });
});
