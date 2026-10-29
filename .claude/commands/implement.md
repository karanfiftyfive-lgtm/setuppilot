---
description: Implement exactly one module plus its tests, following an approved plan.
argument-hint: <module path, e.g. core/recommend.ts>
---

Implement one module: $ARGUMENTS

Rules:
- Only this module, its tests, and type additions it strictly needs. Nothing else.
- If no approved plan covers this module, stop and run `/plan` instead.
- Read `docs/CONTRACTS.md` first. If the module needs a shape that is not there, stop and
  propose the contract change; do not invent it in code.
- Read the nested `CLAUDE.md` of the target folder and follow it.
- Keep the file under ~200 lines. Comment each non-obvious rule in one line (why, not what).
- core/: pure, no I/O. Write tests in `tests/<module>.test.ts` with Vitest. Cover the
  normal case, the edge cases from the plan, and one failure case.
- server/: commands only via the whitelist id + typed params; record changes in the
  manifest before running; support `DEMO_MODE=1`.
- ui/: plain words; jargon only via `<GlossaryTip>`; estimates labelled as estimates.

Then:
1. Run `npm test` (and `npm run typecheck` if present) and show the result summary.
2. Report: files changed, test count passed/failed, any rule you were unsure about.
3. Append one line to `docs/DECISIONS.md` if you made a design choice.
