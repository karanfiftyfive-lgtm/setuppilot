// Windows path checks for every file SetupPilot writes, restores or deletes.
// Core can only check the text; the server must also resolve the real path (junctions).

import type { AllowedRoots } from "./types";

/**
 * Windows paths compare case-insensitively; normalise slashes and case before comparing.
 * ASCII letters only: full Unicode lowercasing folds signs like Kelvin (U+212A) to "k", which
 * Windows treats as a different name. Non-ASCII must match exactly (fails closed).
 */
export const normPath = (p: string) =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").replace(/[A-Z]/g, (c) => c.toLowerCase());

// Windows silently strips trailing dots/spaces ("x/." == "x"), so they could hide a folder.
const BAD_SEGMENT_END = /[. ]$/;
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f<>"|?*]/;
// Device names stay devices even with an extension ("nul.txt") or spaces before it
// ("nul .txt"); Windows also reserves COM/LPT with 0 and superscript 1-3, CONIN$ and CONOUT$.
const DEVICE = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]) *(\..*)?$/i;

/** An absolute drive path ("C:/...") that Windows will not reinterpret. */
export function isSafePath(path: string): boolean {
  if (BAD_CHARS.test(path)) return false;
  const p = path.replace(/\\/g, "/");
  if (!/^[A-Za-z]:\//.test(p) || p.indexOf(":", 2) !== -1) return false; // no UNC, relative, or ADS
  const segments = p.slice(3).split("/");
  return segments.every((s) => s !== "" && !BAD_SEGMENT_END.test(s) && !DEVICE.test(s));
}

/** True only for a safe path strictly inside one of the given roots (never the root itself). */
export function isInsideRoots(path: string, roots: readonly string[]): boolean {
  if (!isSafePath(path)) return false;
  const p = normPath(path);
  const safeRoots = roots.map((r) => r.replace(/[\\/]+$/, "")).filter(isSafePath);
  return safeRoots.map(normPath).some((r) => p.startsWith(`${r}/`));
}

const trimRoot = (r: string) => normPath(r.replace(/[\\/]+$/, ""));
const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/**
 * Throws unless every root is a safe absolute path and no target root equals, contains or sits
 * inside a backups or reserved root. Otherwise Uninstall could delete backups or the audit trail.
 */
export function checkRoots(roots: AllowedRoots): void {
  const all = [...roots.targets, ...roots.backups, ...roots.reserved];
  const bad = all.find((r) => !isSafePath(r.replace(/[\\/]+$/, "")));
  if (bad !== undefined) throw new Error(`Unsafe root "${bad}"`);
  const guarded = [...roots.backups, ...roots.reserved].map(trimRoot);
  for (const t of roots.targets) {
    if (guarded.some((g) => overlaps(trimRoot(t), g))) throw new Error(`Target root "${t}" overlaps a backups or reserved root`);
  }
}

export const dirOf =(path: string) => path.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
export const baseOf = (path: string) => path.replace(/\\/g, "/").replace(/^.*\//, "");
