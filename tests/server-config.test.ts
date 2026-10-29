// Phase 2 T5: server/config.ts (constants only).
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../core/commands/whitelist";
import { checkRoots } from "../core/paths";
import {
  buildConfig, loadConfig, modeFor, openCodeWriteMode, StartupError, startupCheck,
  type ServerConfig, type StartupFs,
} from "../server/config";
import { atLeast } from "./fixtures";

const HOME = "C:\\Users\\me";
const real = buildConfig(HOME, "real");
const demo = buildConfig(HOME, "demo");
const okFs = (): StartupFs & { made: string[] } => {
  const made: string[] = [];
  return { made, exists: () => true, mkdir: (p) => { made.push(p); } };
};

describe("modeFor: real only for exactly 'real' on Windows", () => {
  it("is real for 'real' on win32", () => {
    expect(modeFor({ SETUPPILOT_MODE: "real" }, "win32")).toBe("real");
  });

  const notReal = ["REAL", "Real", "true", "1", "", " real", "real ", "yes", "demo", "real\n", undefined];
  it.each(notReal.map((v) => [JSON.stringify(v), v]))("is demo for %s on win32", (_s, v) => {
    expect(modeFor({ SETUPPILOT_MODE: v }, "win32")).toBe("demo");
  });

  const platforms = ["linux", "darwin", "freebsd", "", "WIN32", "win64", "cygwin"];
  it.each(platforms)("is demo for 'real' on platform %j", (p) => {
    expect(modeFor({ SETUPPILOT_MODE: "real" }, p)).toBe("demo");
  });

  it("is demo when the variable is missing, and checked every value listed", () => {
    expect(modeFor({}, "win32")).toBe("demo");
    atLeast(notReal, 11, "values");
    atLeast(platforms, 7, "platforms");
  });
});

describe("derived locations", () => {
  it("normalises the home folder and keeps every SetupPilot path inside it", () => {
    for (const cfg of [real, demo]) {
      expect(cfg.home).toBe("C:/Users/me");
      const paths = atLeast([cfg.dataDir, cfg.logDir, cfg.manifestPath, cfg.profilePath, cfg.modelsDir,
        cfg.openCodeConfig.path!, ...cfg.roots.targets, ...cfg.roots.backups, ...cfg.roots.reserved], 9, "paths");
      for (const p of paths) expect(p.startsWith(`${cfg.home}/`), p).toBe(true);
    }
  });

  it("normalises slashes and a trailing slash to the same config", () => {
    for (const h of atLeast(["C:\\Users\\me\\", "C:/Users/me/", "C:/Users/me", "C:\\Users/me\\\\"], 4, "spellings")) {
      expect(buildConfig(h, "real"), h).toEqual(real);
    }
  });

  it("keeps a demo's data apart from the real manifest", () => {
    expect(real.manifestPath).toBe("C:/Users/me/.setuppilot/manifest.json");
    expect(demo.manifestPath).toBe("C:/Users/me/.setuppilot/demo/manifest.json");
    expect(demo.roots.reserved).toEqual(real.roots.reserved);
  });

  it("disables steps 8 and 7 in real mode only", () => {
    expect(real.disabledSteps).toEqual(["remote-access", "speed-boost"]);
    expect(demo.disabledSteps).toEqual([]);
  });

  it("has an absolute, unconfirmed candidate for every exe the whitelist uses", () => {
    const exes = atLeast([...new Set(Object.values(COMMANDS).map((c) => c.exe))], 9, "exe names");
    for (const exe of exes) {
      const c = real.exes[exe];
      expect(c, exe).toBeDefined();
      expect(c!.path, exe).toMatch(/^[A-Z]:\/.+\.exe$/);
      expect(c!.confirmed, exe).toBe(false);
    }
  });
});

describe("startup check", () => {
  it("passes for the default roots in both modes, creating only SetupPilot's own folders", () => {
    for (const cfg of [real, demo]) {
      expect(() => checkRoots(cfg.roots)).not.toThrow();
      const fs = okFs();
      startupCheck(cfg, fs);
      expect(fs.made.sort()).toEqual([cfg.logDir, cfg.roots.backups[0]!].sort());
      for (const p of fs.made) expect(p.startsWith(`${cfg.dataDir}/`), p).toBe(true);
    }
  });

  const H = "C:/Users/me";
  const layouts: [string, Partial<ServerConfig["roots"]>][] = [
    ["target equals reserved", { targets: [`${H}/.setuppilot`] }],
    ["target inside reserved", { targets: [`${H}/.setuppilot/opencode`] }],
    ["target equals backups", { targets: [`${H}/.setuppilot/backups`] }],
    ["target contains reserved (the home folder)", { targets: [H] }],
    ["target is the drive root (contains everything)", { targets: ["C:/"] }],
    ["target equals reserved, other case", { targets: ["c:/USERS/ME/.SetupPilot"] }],
    ["target inside backups, backslashes", { targets: ["C:\\Users\\me\\.setuppilot\\backups\\x"] }],
    ["target equals reserved, trailing slash", { targets: [`${H}/.setuppilot/`] }],
    ["backups outside reserved but overlapping the target", { backups: [`${H}/.config/opencode/bak`] }],
  ];
  it.each(layouts)("refuses to start when %s", (_name, change) => {
    const cfg = { ...real, roots: { ...real.roots, ...change } } as ServerConfig;
    expect(() => startupCheck(cfg, okFs())).toThrow(StartupError);
    expect(() => startupCheck(cfg, okFs())).toThrow(/^SetupPilot can't start: its list of allowed folders/);
  });

  it("checked every bad layout listed", () => {
    atLeast(layouts, 8, "layouts");
  });

  it("refuses to start when the models drive is missing or a folder can't be created", () => {
    expect(() => startupCheck(real, { exists: () => false, mkdir: () => {} })).toThrow(/drive where AI models are stored \(C:\/\)/);
    const failing = (bad: string): StartupFs => ({ exists: () => true, mkdir: (p) => { if (p === bad) throw new Error("EACCES"); } });
    expect(() => startupCheck(real, failing(real.logDir))).toThrow(/couldn't create its folder .*logs/);
    expect(() => startupCheck(real, failing(real.roots.backups[0]!))).toThrow(/couldn't create its folder .*backups/);
  });
});

describe("roots can't be changed at runtime", () => {
  it("freezes the whole config, every level", () => {
    const objects = atLeast([real, real.roots, real.roots.targets, real.roots.backups, real.roots.reserved,
      real.exes, real.exes.ollama!, real.openCodeConfig, real.disabledSteps], 9, "objects");
    for (const o of objects) expect(Object.isFrozen(o)).toBe(true);
  });

  it("throws on any attempt to change roots or flags", () => {
    const r = real as unknown as { roots: { targets: string[] }; openCodeConfig: { confirmed: boolean }; mode: string };
    expect(() => r.roots.targets.push("C:/Windows")).toThrow(TypeError);
    expect(() => { r.roots.targets[0] = "C:/Windows"; }).toThrow(TypeError);
    expect(() => { r.openCodeConfig.confirmed = true; }).toThrow(TypeError);
    expect(() => { r.mode = "real"; }).toThrow(TypeError);
    expect(real.roots.targets).toEqual(["C:/Users/me/.config/opencode"]);
  });
});

describe("a tampered home folder fails closed", () => {
  const bad = [
    "C:\\Users\\me\\..\\..\\Windows", "C:/Users/me/../../Windows", "C:/Users/me/.", "C:/Users/./me",
    "C:\\", "C:", "C:/", "Users/me", "\\\\server\\share\\me", "\\\\?\\C:\\Users\\me", "C:/Users/me ",
    "C:/Users/me.", "/home/me", "", "C:/Users/me:stream", "C:/Users/nul",
  ];
  it.each(bad)("refuses %j", (home) => {
    expect(() => buildConfig(home, "real")).toThrow(StartupError);
    expect(() => loadConfig({ homedir: () => home, env: { SETUPPILOT_MODE: "real" }, platform: "win32" })).toThrow(StartupError);
  });

  it("checked every bad home listed", () => {
    atLeast(bad, 16, "homes");
  });

  it("ignores USERPROFILE, HOME and every other env var; reads the home folder once", () => {
    const read: string[] = [];
    const env = new Proxy({ USERPROFILE: "C:/Windows", HOME: "C:/Windows", SETUPPILOT_MODE: "real" } as Record<string, string>, {
      get: (t, k) => { read.push(String(k)); return t[String(k)]; },
    });
    let calls = 0;
    const cfg = loadConfig({ homedir: () => { calls++; return HOME; }, env, platform: "win32" });
    expect(cfg.roots.targets).toEqual(["C:/Users/me/.config/opencode"]);
    expect(cfg.mode).toBe("real");
    expect(read).toEqual(["SETUPPILOT_MODE"]);
    expect(calls).toBe(1);
  });
});

describe("OpenCode config path", () => {
  it("is unconfirmed by default", () => {
    expect(real.openCodeConfig).toEqual({ path: "C:/Users/me/.config/opencode/opencode.json", confirmed: false });
  });

  it("means 'show the snippet only' in real mode until confirmed, and 'simulate' in demo", () => {
    expect(openCodeWriteMode(real)).toBe("snippet");
    expect(openCodeWriteMode(demo)).toBe("simulate");
    const confirmed = { ...real, openCodeConfig: { ...real.openCodeConfig, confirmed: true } } as ServerConfig;
    expect(openCodeWriteMode(confirmed)).toBe("write");
    expect(openCodeWriteMode({ ...demo, openCodeConfig: { ...demo.openCodeConfig, confirmed: true } } as ServerConfig)).toBe("simulate");
  });
});
