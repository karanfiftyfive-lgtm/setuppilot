// Log file names, dates and the file system the log may use. Dates are UTC, computed from the
// injected clock's milliseconds with plain arithmetic (no Date): a day's file is the UTC day.
// The file system interface can't remove, move or shorten a file: the log never removes one.
import { appendFile, mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const DAY_MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** "YYYY-MM-DD" of the UTC day (Howard Hinnant's civil-from-days algorithm). */
export function utcDate(ms: number): string {
  const z = Math.floor(ms / DAY_MS) + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return `${yoe + era * 400 + (m <= 2 ? 1 : 0)}-${pad(m)}-${pad(d)}`;
}

/** ISO time in UTC, e.g. "2026-10-30T23:59:59.000Z". */
export function utcIso(ms: number): string {
  const t = ((ms % DAY_MS) + DAY_MS) % DAY_MS;
  return `${utcDate(ms)}T${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)}.${pad(t % 1000, 3)}Z`;
}

export const MAX_ROTATIONS = 9;
const NAME = /^\d{4}-\d{2}-\d{2}(\.[1-9])?\.log$/;

/** "<date>.log" or "<date>.<n>.log" (n 1..9), or null for anything else. */
export function logFileName(date: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(n) || n < 0 || n > MAX_ROTATIONS) return null;
  return n === 0 ? `${date}.log` : `${date}.${n}.log`;
}

export const isLogFileName = (name: string) => NAME.test(name);

/** True only when full (already resolved) is a direct child of dir: the second, independent layer. */
export function isDirectlyInside(dir: string, full: string): boolean {
  const d = resolve(dir);
  const f = resolve(full);
  return dirname(f) === d && basename(f) !== "" && f.length > d.length + 1;
}

/** The full path of a log file directly inside dir, or null if the name could leave it. */
export function resolveLogFile(dir: string, name: string): string | null {
  if (!isLogFileName(name)) return null;
  const full = resolve(dir, name);
  if (!isDirectlyInside(dir, full) || basename(full) !== name) return null;
  return full;
}

/** Sort key: newest day first, then the highest rotation first. */
export function newestFirst(a: string, b: string): number {
  const key = (n: string) => [n.slice(0, 10), Number(/^\S{10}\.(\d)\.log$/.exec(n)?.[1] ?? 0)] as const;
  const [da, ra] = key(a);
  const [db, rb] = key(b);
  return da === db ? rb - ra : db < da ? -1 : 1;
}

/** What the log may do to the disk. Deliberately nothing that removes, moves or shortens a file. */
export interface LogFs {
  mkdir(path: string): Promise<void>;
  appendFile(path: string, text: string): Promise<void>;
  size(path: string): Promise<number>;       // 0 when the file doesn't exist yet
  list(path: string): Promise<string[]>;
  read(path: string): Promise<string>;
  realpath(path: string): Promise<string>;
}

export const nodeLogFs: LogFs = {
  mkdir: async (p) => { await mkdir(p, { recursive: true }); },
  appendFile: (p, text) => appendFile(p, text, "utf8"),
  size: async (p) => {
    try {
      return (await stat(p)).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw e;
    }
  },
  list: (p) => readdir(p),
  read: (p) => readFile(p, "utf8"),
  realpath: (p) => realpath(p),
};
