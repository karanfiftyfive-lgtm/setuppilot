// In-memory LogFs for the logger tests: can fail on purpose, fake large sizes, redirect a
// folder's real path (a junction), and records how many appends run at the same time.
import { basename, dirname, resolve } from "node:path";
import type { LogFs } from "../server/log/files";

export const LOG_DIR = resolve("C:/Users/me/.setuppilot/demo/logs");

export class MemFs implements LogFs {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly extraSize = new Map<string, number>();   // pretend a file is this much larger
  readonly realpaths = new Map<string, string>();
  failAppend: Error | null = null;
  failMkdir: Error | null = null;
  active = 0;
  maxActive = 0;
  appends = 0;

  async mkdir(p: string): Promise<void> {
    if (this.failMkdir) throw this.failMkdir;
    this.dirs.add(resolve(p));
  }

  async appendFile(p: string, text: string): Promise<void> {
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.appends++;
    try {
      await new Promise<void>((r) => setImmediate(r)); // a real gap, so overlapping writes would show
      if (this.failAppend) throw this.failAppend;
      const k = resolve(p);
      if (!this.dirs.has(dirname(k))) throw Object.assign(new Error("no folder"), { code: "ENOENT" });
      this.files.set(k, (this.files.get(k) ?? "") + text);
    } finally {
      this.active--;
    }
  }

  async size(p: string): Promise<number> {
    const k = resolve(p);
    return Buffer.byteLength(this.files.get(k) ?? "", "utf8") + (this.extraSize.get(k) ?? 0);
  }

  async list(p: string): Promise<string[]> {
    const dir = resolve(p);
    const names = new Set([...this.files.keys(), ...this.extraSize.keys()].filter((k) => dirname(k) === dir).map((k) => basename(k)));
    return [...names];
  }

  async read(p: string): Promise<string> {
    const v = this.files.get(resolve(p));
    if (v === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return v;
  }

  async realpath(p: string): Promise<string> {
    return this.realpaths.get(resolve(p)) ?? resolve(p);
  }

  /** Every logged line in every file, as text (for "never appears anywhere" checks). */
  allText(): string {
    return [...this.files.values()].join("");
  }

  lines(name: string): Record<string, unknown>[] {
    return (this.files.get(resolve(LOG_DIR, name)) ?? "").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  }
}

export const fixedClock = (ms: number) => ({ now: () => ms });
export const T0 = Date.UTC(2026, 9, 30, 12, 0, 0); // tests may use Date; the log module may not
