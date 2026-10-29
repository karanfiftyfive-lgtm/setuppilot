// Phase 2 T7: cleaning of a logged output line (CONTRACTS.md "Log", rules 1-3).
import { describe, expect, it } from "vitest";
import { cleanLine, CREDENTIALS_REMOVED as CR, LOGIN_REMOVED as LR } from "../server/log/clean";
import { atLeast } from "./fixtures";

const ch = (...cps: number[]) => String.fromCodePoint(...cps);
const TOKEN = "1a2b3c4d5e6f";

describe("neutralises characters that could forge or disguise a line", () => {
  const cases: [string, string][] = [
    ["newline", `ok${ch(0x0a)}{"event":"run.end"}`],
    ["carriage return", `ok${ch(0x0d)}fake`],
    ["tab and escape", `a${ch(0x09)}b${ch(0x1b)}[31mred`],
    ["C1 next line", `a${ch(0x85)}b`],
    ["line separator", `a${ch(0x2028)}b`],
    ["paragraph separator", `a${ch(0x2029)}b`],
    ["right-to-left override", `file${ch(0x202e)}txt.exe`],
    ["bidi isolate", `a${ch(0x2066)}b${ch(0x2069)}`],
    ["zero-width and RLM", `a${ch(0x200b)}b${ch(0x200f)}`],
    ["byte order mark", `${ch(0xfeff)}start`],
  ];
  it.each(cases)("%s", (_n, input) => {
    const out = cleanLine(input);
    expect(out).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/u);
    expect(out.length).toBe(input.length); // replaced by a space, not silently dropped
  });
  it("checked every case", () => atLeast(cases, 10, "characters"));
});

describe("Tailscale login links are removed whole", () => {
  const cases: [string, string, string][] = [
    ["plain", `To authenticate, visit: https://login.tailscale.com/a/${TOKEN}`, `To authenticate, visit: ${LR}`],
    ["uppercase", `visit HTTPS://LOGIN.TAILSCALE.COM/A/${TOKEN} now`, `visit ${LR} now`],
    ["http", `http://login.tailscale.com/a/${TOKEN}`, LR],
    ["look-alike host", `go https://login.tailscale.com.evil.example/a/${TOKEN} x`, `go ${LR} x`],
    ["in double quotes", `"https://login.tailscale.com/a/${TOKEN}"`, `"${LR}"`],
    ["in single quotes", `'https://login.tailscale.com/a/${TOKEN}'`, `'${LR}'`],
    ["in brackets", `[https://login.tailscale.com/a/${TOKEN}]`, `[${LR}]`],
    ["in parentheses", `(https://login.tailscale.com/a/${TOKEN})`, `(${LR})`],
    ["in angle brackets", `<https://login.tailscale.com/a/${TOKEN}>`, `<${LR}>`],
    ["followed by punctuation", `visit https://login.tailscale.com/a/${TOKEN}.`, `visit ${LR}.`],
    ["followed by comma and text", `https://login.tailscale.com/a/${TOKEN}, then wait`, `${LR}, then wait`],
    ["two in one line", `a https://login.tailscale.com/a/${TOKEN} b https://login.tailscale.com/a/ffff0000aaaa c`, `a ${LR} b ${LR} c`],
    ["with credentials and tailscale", `https://bob:pw@login.tailscale.com/a/${TOKEN}`, LR],
    ["cut by the end of the line", `To authenticate, visit: https://login.tails`, `To authenticate, visit: ${LR}`],
    ["second half on the next line", `cale.com/a/${TOKEN}`, LR],
    ["second half, path only", `/a/${TOKEN}`, LR],
  ];
  it.each(cases)("%s", (_n, input, expected) => {
    expect(cleanLine(input)).toBe(expected);
    expect(cleanLine(input)).not.toContain(TOKEN);
  });
  it("checked every shape", () => atLeast(cases, 16, "URL shapes"));
});

describe("credentials in a URL are removed, fail safe", () => {
  const cases: [string, string, string][] = [
    ["proxy URL", "proxy http://alice:Secret1@proxy.example:8080 ok", `proxy http://${CR}@proxy.example:8080 ok`],
    ["password with @", "http://alice:p@ss@proxy:3128", `http://${CR}@proxy:3128`],
    ["password with :", "https://alice:pa:ss@proxy:3128/x", `https://${CR}@proxy:3128/x`],
    ["password with /", "http://alice:pa/ss@proxy:3128", `http://${CR}@proxy:3128`],
    ["all three", "http://al:p@:/s@h:1", `http://${CR}@h:1`],
    ["no scheme", "HTTPS_PROXY=alice:Secret1@proxy.example:8080", `${CR}@proxy.example:8080`],
    ["no scheme, in quotes", `set "bob:hunter2@10.0.0.1:3128"`, `set "${CR}@10.0.0.1:3128"`],
    ["socks scheme", "socks5://u:p@host:1080", `socks5://${CR}@host:1080`],
  ];
  it.each(cases)("%s", (_n, input, expected) => {
    expect(cleanLine(input)).toBe(expected);
  });
  it("checked every shape", () => atLeast(cases, 8, "credential shapes"));

  const unchanged = atLeast([
    "pulling manifest",
    "Downloading https://ollama.com/library/qwen2.5:7b now",
    "Found Ollama [Ollama.Ollama] Version 0.12.0",
    "mail alice@example.com about it",
    "C:\\Users\\me\\AppData\\Local\\Programs\\Ollama\\ollama.exe",
    "see https://tailnet.example/docs (not ours)".replace("tailnet", "tail-net"),
  ], 6, "plain lines");
  it.each(unchanged)("leaves a line without credentials or login links unchanged: %s", (line) => {
    expect(cleanLine(line)).toBe(line);
  });
});
