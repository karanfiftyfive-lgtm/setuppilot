---
name: add-step-type
description: Add a new setup step type to SetupPilot safely - step definition, skip rules, whitelisted commands, manifest records, uninstall reversal, plain-language explanation and tests. Use when asked to add a new step, install a new tool, or change what a step does.
---

# Add a new step type

A step is anything the user approves. Every step must be explainable, approvable,
logged, and reversible. Follow all steps; do not skip the safety ones.

## 1. Contract first
- Add the step id to the `StepId` union in `docs/CONTRACTS.md`, then `core/types.ts`.
- Decide: `required` (Skip disabled, with reason) or optional; which goals include it.

## 2. Explanation (data)
- Add an entry to `data/explanations.json` with `what`, `why`, `changes`, and
  `requiredReason` if required. One plain line each. Add `osPromptWarning: true` if Windows
  will show a permission (UAC) prompt.
- Add any new term to `data/glossary.json`.
- Run the `beginner-reviewer` agent on the new text.

## 3. Commands (whitelist)
- Add each command to `core/commands/whitelist.ts` as a `CommandSpec`: fixed exe, fixed
  args, and typed params validated against data (catalog tags, known paths).
- No free-text params. Reject shell metacharacters. `needsAdmin` set correctly.
- Add whitelist tests: valid params pass, unknown/invalid params throw.

## 4. Step definition and skip rules
- Add the step to `core/steps.ts`: `commandIds`, `estimatedMinutes` (estimate),
  `diskGb` (estimate), and a `skipRule(profile, goal)` that returns a plain reason when the
  step is not needed (e.g. "Your PC doesn't need this").
- Add it to the goal step lists in `data/goals.json` in the right order.

## 5. Manifest and uninstall
- Define the `ChangeRecord` kind(s) it produces and how `core/manifest.ts` reverses each
  (reverse command id, or restore backup file, or restore previous env value).
- Test: a manifest containing this record yields an uninstall plan that reverses it.

## 6. Failure handling
- Map expected failures to existing `ErrorCode`s (or add one to CONTRACTS) so the UI can
  show a plain message + Retry.

## 7. Demo mode
- Add simulated output for each new command so `DEMO_MODE=1` runs end to end.

## 8. Verify
- `npm test` passes; run the `safety-reviewer` agent on the diff; `/demo-check`.
- Add a line to `docs/DECISIONS.md`.
