---
description: Review the current diff against SetupPilot's safety, honesty and plain-language rules.
argument-hint: "[optional path filter]"
---

Review the current changes ($ARGUMENTS if given, else everything uncommitted).

1. Get the diff: `git diff` and `git status` (if not a git repo, compare against the
   files named in the latest plan).
2. Delegate in parallel:
   - `safety-reviewer` agent: whitelist, approval, manifest, localhost binding, logging.
   - `beginner-reviewer` agent: only if the diff touches `ui/` or `data/*.json` copy.
3. Check yourself:
   - core/ has no I/O and no imports from server/ or ui/.
   - Types match `docs/CONTRACTS.md`.
   - Every number before the test run is labelled "estimate"; no invented benchmarks.
   - No file over ~200 lines; one purpose per file.
   - Tests exist for new core/ logic and pass (`npm test`).
4. Output a table: severity (blocker / should-fix / nit), file:line, rule broken, fix.
   Blockers first. If nothing is wrong, say so plainly.

Do not edit files during review.
