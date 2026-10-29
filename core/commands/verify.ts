// Re-checks a stored command against the whitelist right before the runner spawns it.
import type { RenderContext, RenderedCommand } from "../types";
import { COMMANDS, renderCommand, WhitelistError } from "./whitelist";

function refuse(why: string): never {
  throw new WhitelistError(`Stored command refused: ${why}`);
}

/**
 * Throws unless `cmd` is exactly what renderCommand produces for its id: the same exe and args
 * (what runs), the same display (what the user saw), every param valid for ctx, no extra
 * fields. The runner calls this on every stored command right before running it.
 */
export function verifyRendered(cmd: RenderedCommand, ctx: RenderContext): void {
  if (typeof cmd !== "object" || cmd === null) refuse("not a command");
  if (Object.keys(cmd).sort().join(",") !== "args,commandId,display,exe") refuse("unexpected fields");
  const spec = typeof cmd.commandId === "string" && Object.hasOwn(COMMANDS, cmd.commandId) ? COMMANDS[cmd.commandId] : undefined;
  if (!spec) refuse(`"${String(cmd.commandId)}" is not on the whitelist`);
  if (!Array.isArray(cmd.args)) refuse(`${spec.id} has no argument list`);
  // Take each param from its slot; everything else is checked by re-rendering below.
  const params: Record<string, string | number> = {};
  spec.args.forEach((a, i) => {
    const got = cmd.args[i];
    if (typeof a === "string" || typeof got !== "string") return;
    // Rendered args are text; a pid slot goes back to a number so the pid rule still applies.
    params[a.param] = spec.params[a.param]?.kind === "ownChildPid" && /^[1-9]\d{0,9}$/.test(got) ? Number(got) : got;
  });
  const expected = renderCommand(spec.id, params, ctx);
  // Checked separately: an honest display must not hide different args, and vice versa.
  const sameArgs = cmd.args.length === expected.args.length && expected.args.every((a, i) => a === cmd.args[i]);
  if (cmd.exe !== expected.exe || !sameArgs || cmd.display !== expected.display) {
    refuse(`${spec.id} does not match the whitelist`);
  }
}
