// Fixed tables: which record each forward command creates, and the ONLY way to undo each.
// Nothing stored in a manifest record can choose a command.
import type { ChangeRecord, CommandId, RenderedCommand } from "./types";

export const CONTEXT_VAR = "OLLAMA_CONTEXT_LENGTH";

/** Programs SetupPilot may install, and the only command that may remove each. */
// warning: shown on the item. Ollama's uninstaller may delete stored models depending on its
// version (unverified, see VERIFY_IN_PHASE_2), so we say so instead of promising they stay.
export const PROGRAMS: Readonly<Record<string, { uninstall: CommandId; name: string; warning?: string }>> = Object.freeze({
  "Ollama.Ollama": { uninstall: "ollama.uninstall", name: "Ollama",
    warning: "This may also delete AI models stored by Ollama, including ones you downloaded yourself" },
  "Tailscale.Tailscale": { uninstall: "tailscale.uninstall", name: "Tailscale" },
  "ggml.llamacpp": { uninstall: "llamacpp.uninstall", name: "llama.cpp" },
});

interface Service {
  off: CommandId;
  optional: boolean;
  /** Undo only in the direction that is safe when we are not sure what was there before. */
  undo: (previous: string | null) => boolean;
  offText: string;
  keepText: (previous: string | null) => string;
}

export const SERVICES: Readonly<Record<string, Service>> = Object.freeze({
  // Unknown: stay signed in. Signing someone out of their own account is the worse mistake.
  "tailscale-login": {
    off: "tailscale.logout", optional: true, undo: (p) => p === "logged-out",
    offText: "Sign this PC out of Tailscale",
    keepText: (p) => p === "logged-in"
      ? "This PC was signed in to Tailscale before SetupPilot, so I'll leave it signed in."
      : "I can't tell if this PC was signed in to Tailscale before, so I'll leave it signed in. You can sign out in the Tailscale app.",
  },
  // Unknown: turn our sharing off. Leaving the AI shared on the network is the worse mistake.
  "tailscale-serve": {
    off: "tailscale.serveOff", optional: false, undo: (p) => p !== "existing",
    offText: "Stop sharing your AI with your other devices",
    keepText: () => "Sharing on this port was set up before SetupPilot, so I'll leave it as it is.",
  },
});

/** The record each PC-changing forward command produces. The runner (Phase 2) uses this. */
export function changeFor(cmd: RenderedCommand): Pick<ChangeRecord, "kind" | "target"> | null {
  switch (cmd.commandId) {
    case "ollama.install": return { kind: "program-installed", target: "Ollama.Ollama" };
    case "tailscale.install": return { kind: "program-installed", target: "Tailscale.Tailscale" };
    case "llamacpp.install": return { kind: "program-installed", target: "ggml.llamacpp" };
    case "ollama.pull": return { kind: "model-pulled", target: cmd.args[1]! };
    case "env.setContext": return { kind: "env-var-set", target: CONTEXT_VAR };
    case "tailscale.up": return { kind: "service-configured", target: "tailscale-login" };
    case "tailscale.serve": return { kind: "service-configured", target: "tailscale-serve" };
    default: return null;
  }
}

/** Fixed undo order: stop sharing first, remove programs last (models need Ollama to be removed). */
export const UNDO_ORDER: readonly ChangeRecord["kind"][] = [
  "service-configured", "model-pulled", "env-var-set", "file-written", "program-installed",
];
