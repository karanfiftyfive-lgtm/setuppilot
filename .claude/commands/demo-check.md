---
description: Run the demo readiness checklist (demo mode, mock profiles, script timing).
---

Check that the 3-minute demo in `docs/DEMO_SCRIPT.md` will work. Do not change code;
report only.

1. `npm test` passes. `npm run typecheck` passes.
2. Each mock profile in `data/mock-profiles/` gives the expected pick from
   `core/recommend.ts` (weak-laptop -> 1B tier, mid-pc -> 7-8B tier, gpu-rig -> 14B tier,
   upgraded-pc -> 14B tier). Show the actual result for each.
3. For each goal in `data/goals.json`, list the step ids produced for `mid-pc` and check
   every id exists in `data/explanations.json`.
4. Every command id referenced by steps exists in `core/commands/whitelist.ts`.
5. Every term used in `data/explanations.json` that is in the glossary has a glossary entry;
   list jargon words that are missing.
6. Demo mode: confirm `DEMO_MODE=1` makes the runner simulate commands (read
   `server/runner.ts`) and that no real install command can run in demo mode.
7. Re-analyze: diff `mid-pc` -> `upgraded-pc` produces a ladder with at least one step up.
8. Uninstall: a sample manifest produces a plan that reverses every record.
9. Walk `docs/DEMO_SCRIPT.md` and flag any step that depends on internet or real hardware
   without a fallback.

Output: a checklist with PASS / FAIL / NOT YET BUILT per item, then the top 3 fixes.
