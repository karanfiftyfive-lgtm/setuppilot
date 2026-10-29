// Tap-to-explain: splits a text into plain parts and glossary terms (data/glossary.json).
// Longest terms win ("tokens per second" before "token"); matches whole words, any case;
// a plural "s" also matches ("tokens" -> "token").
import glossaryJson from "../../../data/glossary.json";

export const GLOSSARY: Readonly<Record<string, string>> = (glossaryJson as { terms: Record<string, string> }).terms;

export type Segment = { text: string; term: null } | { text: string; term: string; definition: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`\\b(${TERMS.map(escape).join("|")})(s)?\\b`, "gi");

function termFor(match: string): string | null {
  const lower = match.toLowerCase();
  return TERMS.find((t) => t.toLowerCase() === lower) ?? TERMS.find((t) => `${t.toLowerCase()}s` === lower) ?? null;
}

export function splitGlossary(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const term = termFor(m[0]);
    if (!term || m.index === undefined) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), term: null });
    out.push({ text: m[0], term, definition: GLOSSARY[term]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), term: null });
  return out;
}
