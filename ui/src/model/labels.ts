// Status labels: a word AND a symbol for every status, so colour is never the only signal.
// Symbols are built from code points (no special characters typed in source).
import type { StepStatus } from "../../../core/types";

const icon = (cp: number) => String.fromCodePoint(cp);

export const STATUS_LABEL: Record<StepStatus, { word: string; icon: string }> = {
  waiting: { word: "Waiting for your OK", icon: icon(0x25cb) },       // white circle
  running: { word: "Working (simulated)", icon: icon(0x25d4) },       // circle, quarter filled
  done: { word: "Done (simulated)", icon: icon(0x2713) },             // check mark
  failed: { word: "Didn't work", icon: icon(0x2717) },                // ballot x
  skipped: { word: "Skipped", icon: icon(0x2212) },                   // minus sign
};
