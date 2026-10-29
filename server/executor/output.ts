// Output handling shared by both executors: PrivateText (D30), line splitting, and the two
// output policies from the command spec (log: capped; progress: latest line only, throttled).
import { StringDecoder } from "node:string_decoder";
import { inspect } from "node:util";
import type { Clock, OutputLine, RunSpec } from "./types";

export const MAX_LINE_CHARS = 4096;
export const MAX_LOG_BYTES = 1024 * 1024;
export const PROGRESS_INTERVAL_MS = 500;
const HIDDEN = "[hidden]";

// The text lives outside the object, so no property walk, clone or serializer can reach it.
const privateTexts = new WeakMap<PrivateText, string>();

/** Output of a privateOutput command: shows as "[hidden]" everywhere; readPrivate() reads it. */
export class PrivateText {
  constructor(text: string) {
    privateTexts.set(this, text);
    Object.freeze(this);
  }
  toString(): string { return HIDDEN; }
  toJSON(): string { return HIDDEN; }
  [Symbol.toPrimitive](): string { return HIDDEN; }
  [inspect.custom](): string { return HIDDEN; }
}

/** For the in-memory parser only. Never log, stream, store or show the result. */
export const readPrivate = (t: PrivateText): string => privateTexts.get(t) ?? "";

/** Splits a byte stream into lines on \r\n, \r or \n; UTF-8 safe across chunks; lines capped. */
export class LineSplitter {
  private readonly decoder = new StringDecoder("utf8");
  private rest = "";

  push(chunk: Buffer): string[] {
    return this.split(this.rest + this.decoder.write(chunk));
  }

  end(): string[] {
    const last = (this.rest + this.decoder.end()).slice(0, MAX_LINE_CHARS);
    this.rest = "";
    return last ? [last] : [];
  }

  private split(text: string): string[] {
    const parts = text.split(/\r\n|\r|\n/);
    // An unfinished line is kept, but never more than one line's worth (bounded memory).
    this.rest = parts.pop()!.slice(0, MAX_LINE_CHARS);
    return parts.filter((p) => p !== "").map((p) => p.slice(0, MAX_LINE_CHARS));
  }
}

/** Applies the command's output policy and wraps private lines. */
export class OutputSink {
  truncated = false;
  private bytes = 0;
  private latest: string | null = null;
  private lastSent = -Infinity;

  constructor(private readonly spec: RunSpec, private readonly emit: (l: OutputLine) => void, private readonly clock: Clock) {}

  line(text: string): void {
    if (this.spec.policy === "progress") {
      this.latest = text; // only the newest line is kept; earlier ones are dropped
      if (this.clock.now() - this.lastSent >= PROGRESS_INTERVAL_MS) this.sendLatest();
      return;
    }
    this.bytes += Buffer.byteLength(text, "utf8");
    if (this.bytes > MAX_LOG_BYTES) {
      this.truncated = true; // dropped; the process keeps running
      return;
    }
    this.send(text);
  }

  /** At the end: a progress line still waiting is sent, so the last state is always shown. */
  flush(): void {
    if (this.latest !== null) this.sendLatest();
  }

  private sendLatest(): void {
    const text = this.latest!;
    this.latest = null;
    this.lastSent = this.clock.now();
    this.send(text);
  }

  private send(text: string): void {
    this.emit(this.spec.isPrivate ? { private: true, text: new PrivateText(text) } : { private: false, text });
  }
}
