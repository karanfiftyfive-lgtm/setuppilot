import { describe, expect, it } from "vitest";
import { COMMANDS, renderCommand, renderContextFromCatalog, WhitelistError } from "../core/commands/whitelist";
import { catalog } from "../core/data";
import { atLeast } from "./fixtures";

const ctx = renderContextFromCatalog(catalog, ["qwen2.5-coder:7b"]);

describe("renderCommand", () => {
  it("renders a valid model pull as a fixed exe and an args array", () => {
    const cmd = renderCommand("ollama.pull", { tag: "qwen2.5:7b" }, ctx);
    expect(cmd).toEqual({
      commandId: "ollama.pull",
      exe: "ollama",
      args: ["pull", "qwen2.5:7b"],
      display: "ollama pull qwen2.5:7b",
    });
  });

  it("renders a valid context size given as a number", () => {
    expect(renderCommand("env.setContext", { size: 8192 }, ctx).args).toEqual(["OLLAMA_CONTEXT_LENGTH", "8192"]);
  });

  it("rejects a command that is not on the whitelist", () => {
    expect(() => renderCommand("powershell.run", {}, ctx)).toThrow(WhitelistError);
    expect(() => renderCommand("toString", {}, ctx)).toThrow(WhitelistError);
  });

  it("rejects unexpected and missing params", () => {
    expect(() => renderCommand("ollama.list", { extra: "x" }, ctx)).toThrow(WhitelistError);
    expect(() => renderCommand("ollama.pull", {}, ctx)).toThrow(WhitelistError);
  });

  it.each([
    "llama3.1:8b && del C:\\",
    "qwen2.5:7b; calc",
    "qwen2.5:7b|calc",
    "$(calc)",
    "qwen2.5:7b`calc`",
    "qwen2.5:7b\ncalc",
    "qwen2.5:7b\tcalc",
    "qwen2.5:7b\0",
    "--insecure",
    "../x",
    "C:\\x",
    "evil:latest",
    "",
  ])("rejects the model tag %j", (tag) => {
    expect(() => renderCommand("ollama.pull", { tag }, ctx)).toThrow(WhitelistError);
  });

  it.each(["8192 & calc", "12345", "-1", "8192.5", "08192", "008192"])("rejects the context size %j", (size) => {
    expect(() => renderCommand("env.setContext", { size }, ctx)).toThrow(WhitelistError);
  });

  it("only removes models that SetupPilot recorded installing", () => {
    expect(renderCommand("ollama.rm", { tag: "qwen2.5-coder:7b" }, ctx).args).toEqual(["rm", "qwen2.5-coder:7b"]);
    expect(() => renderCommand("ollama.rm", { tag: "llama3.1:8b" }, ctx)).toThrow(WhitelistError);
    expect(() => renderCommand("ollama.rm", { tag: "x;del" }, { ...ctx, allowedTags: ["x;del"] })).toThrow(
      WhitelistError,
    );
  });
});

describe("COMMANDS invariants", () => {
  const specs = atLeast(Object.values(COMMANDS), 20, "commands");

  it("never uses a shell interpreter as the executable", () => {
    for (const c of specs) {
      expect(["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "sh", "bash"]).not.toContain(
        c.exe.toLowerCase(),
      );
    }
  });

  it("gives every PC-changing command a reverse command that exists", () => {
    for (const c of atLeast(specs.filter((s) => s.changesPc), 15, "PC-changing commands")) {
      expect(c.reverseId, c.id).not.toBeNull();
      expect(COMMANDS[c.reverseId!], c.id).toBeDefined();
    }
  });

  it("declares a rule for every param placeholder", () => {
    for (const c of specs) {
      for (const a of c.args) if (typeof a !== "string") expect(c.params[a.param], c.id).toBeDefined();
    }
  });

  it("cannot be modified at runtime", () => {
    expect(Object.isFrozen(COMMANDS)).toBe(true);
  });
});

describe("review round 1 fixes", () => {
  it("rejects inherited object keys as params (constructor, toString, __proto__)", () => {
    expect(() => renderCommand("ollama.list", { constructor: "x" }, ctx)).toThrow(WhitelistError);
    expect(() => renderCommand("ollama.list", { toString: "y" }, ctx)).toThrow(WhitelistError);
    const proto = JSON.parse('{"__proto__": "z"}') as Record<string, string>;
    expect(() => renderCommand("ollama.list", proto, ctx)).toThrow(WhitelistError);
  });

  it("removes a model only if it is in BOTH the catalog and the manifest", () => {
    const userOwn = { ...ctx, allowedTags: ["mistral:latest"] };
    expect(() => renderCommand("ollama.rm", { tag: "mistral:latest" }, userOwn)).toThrow(WhitelistError);
    expect(() => renderCommand("ollama.rm", { tag: "llama3.1:8b" }, ctx)).toThrow(WhitelistError);
  });

  it("restores any positive whole-number context the user had, and nothing else", () => {
    expect(renderCommand("env.restoreContext", { value: "12000" }, ctx).display).toBe("setx OLLAMA_CONTEXT_LENGTH 12000");
    for (const value of ["0", "-5", "12000 & calc", "1e5", "12000000", "abc", "012"]) {
      expect(() => renderCommand("env.restoreContext", { value }, ctx), value).toThrow(WhitelistError);
    }
  });

  it("never wipes all Tailscale sharing: no 'serve reset' anywhere", () => {
    for (const c of atLeast(Object.values(COMMANDS), 20, "commands")) expect(c.args.join(" "), c.id).not.toMatch(/\breset\b/);
  });

  it("turns off exactly the sharing it turned on (same flags and target, plus 'off')", () => {
    const on = COMMANDS["tailscale.serve"]!.args;
    expect(COMMANDS["tailscale.serveOff"]!.args).toEqual([...on, "off"]);
  });
});
