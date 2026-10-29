// Cleans one public output line before it is logged (CONTRACTS.md "Log", rules 1-3).
// The character class is built from code points, so no special character is typed here.

const HIDDEN_RANGES: [number, number][] = [
  [0x00, 0x1f], [0x7f, 0x9f],   // C0 and C1 controls, incl. \n \r \t
  [0x061c, 0x061c],             // Arabic letter mark
  [0x200b, 0x200f],             // zero-width characters, LRM, RLM
  [0x2028, 0x2029],             // line and paragraph separators
  [0x202a, 0x202e],             // bidi embeddings and overrides
  [0x2066, 0x2069],             // bidi isolates
  [0xfeff, 0xfeff],             // zero-width no-break space
];
const u = (c: number) => `\\u{${c.toString(16)}}`;
const HIDDEN = new RegExp(`[${HIDDEN_RANGES.map(([a, b]) => (a === b ? u(a) : `${u(a)}-${u(b)}`)).join("")}]`, "gu");

export const LOGIN_REMOVED = "[login link removed]";
export const CREDENTIALS_REMOVED = "[credentials removed]";

// A token: no whitespace, quotes, backticks or angle brackets. Trailing punctuation stays outside.
const TOKEN = /[^\s"'`<>]+/g;
const LEADING = /^[([{]+/;
const TRAILING = /[.,;:!?)\]}]+$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOGIN_PREFIXES = ["https://login.tailscale.com/", "http://login.tailscale.com/"];
const LOGIN_PATH = /(^|\/)a\/[0-9a-f]{8,}/i;

function isLoginLink(token: string, endsLine: boolean): boolean {
  const t = token.toLowerCase();
  if (SCHEME.test(t)) {
    if (t.includes("tailscale")) return true;
    // A URL cut off by the end of the line: fail safe if it could be the start of a login link.
    return endsLine && /^https?:\/\/./.test(t) && LOGIN_PREFIXES.some((p) => p.startsWith(t));
  }
  // The second half of a link split across lines has no scheme.
  return t.includes("tailscale") || LOGIN_PATH.test(t);
}

/** user:pass@host with or without a scheme; the password may contain @ : /, so cut to the LAST @. */
function redactCredentials(token: string): string {
  const scheme = SCHEME.exec(token)?.[0] ?? "";
  const rest = token.slice(scheme.length);
  const lastAt = rest.lastIndexOf("@");
  const colon = rest.indexOf(":");
  if (lastAt <= 0 || colon < 0 || colon > lastAt) return token;
  return `${scheme}${CREDENTIALS_REMOVED}@${rest.slice(lastAt + 1)}`;
}

export function cleanLine(text: string): string {
  const flat = text.replace(HIDDEN, " ");
  return flat.replace(TOKEN, (raw, offset: number) => {
    const head = LEADING.exec(raw)?.[0] ?? "";
    const tail = TRAILING.exec(raw.slice(head.length))?.[0] ?? "";
    const token = raw.slice(head.length, raw.length - tail.length);
    if (!token) return raw;
    const endsLine = offset + raw.length === flat.length;
    if (isLoginLink(token, endsLine)) return `${head}${LOGIN_REMOVED}${tail}`;
    return `${head}${redactCredentials(token)}${tail}`;
  });
}
