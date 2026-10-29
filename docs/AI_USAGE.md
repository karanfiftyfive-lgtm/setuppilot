# AI usage log

How AI (Claude Code) was used to build SetupPilot, what stayed human, and what went wrong.
Append after every phase.

## Delegated vs human work

| Phase | Delegated to AI | Done or decided by a human |
|---|---|---|
| 0 Context | Drafted all context files: CLAUDE.md files, settings + hook, commands, agents, skills, docs, data JSON. Checked current Claude Code docs for settings/hooks/permission syntax. | Wrote the product brief, safety rules, structure and phase plan. Reviewed Phase 0; decided speed = words only, approved D7/D9, kept installs blocked for the agent, required `verified` flags on the catalog. |
| 1 core/ | Planned Phase 1; wrote all core modules (whitelist, recommend, steps, goals, manifest, analyze, paths, hash, changes) and 282 tests; ran three adversarial safety reviews via subagents; wrote a mutation check; fixed every finding. | Approved the plan and each contract change; decided the 5th mock profile (D17), step-7 wording (D18), "unknown never removes" rules, fixed undo order, uninstall hash, test discipline (minimum counts, mutation check), and the rule "3 review rounds, blockers fixed, nits logged". |
| 2 server/ | _pending_ | _pending_ |
| 3 ui/ | _pending_ | _pending_ |
| 4 Polish | _pending_ | _pending_ |

## Real install runs (human, on a test machine)
One row per checklist line in docs/DEMO_SCRIPT.md ("Real-install checklist").
| Date | Machine | Check | Result | Notes |
|---|---|---|---|---|
| _pending_ | | whoami as admin, not elevated / as standard user | | |
| _pending_ | | pnputil without admin | | |
| _pending_ | | winget list, package not installed | | |
| _pending_ | | reg query HKCU\Environment listing format | | don't paste the output |
| _pending_ | | Cancel during winget install (taskkill /t), incl. the elevated (UAC) part | | app said stopped / "may still be running"? |
| _pending_ | | T6: spawn winget.exe via the WindowsApps alias with shell: false | | |
| _pending_ | | T6: console output encoding (OEM code page vs UTF-8) | | non-English display language |
| _pending_ | | T6: env allowlist enough for winget install, ollama pull, setx (D46) | | proxy tested? |
| _pending_ | | OpenCode lists the provider and model (D32) | | OpenCode version |

## Prompts that worked
- **Phase 0 brief**: one long, structured brief (journey, step card format, safety rules,
  exact tree, "do Phase 0 then STOP"). The explicit stop point kept the AI from writing
  app code early.
- **"Check the current docs before writing settings.json"**: made the AI fetch the live
  permissions/hooks pages instead of relying on memory (found exec-form hooks with
  `args`, `PowerShell(...)` rules, and `blockReadsOutsideWorkingDirectories`).
- **"Don't relax any test; list and justify any whose expected behaviour changes before
  editing."** Forced every changed assertion into the open (7 listed in round 2, all
  stricter or mechanical, none loosened).
- **"Run the reviewer as a fresh pass and tell it to break the new code, not confirm the
  old findings."** Round 2 and 3 each found real bugs that the existing tests passed.
- **"Classify each finding: can it delete user data? can it run an unapproved command?"**
  Turned the close-out rule into a yes/no per finding, so nits could be deferred safely.
- **"No test may pass with nothing checked" + "break one rule at a time"**: the `atLeast`
  guard and the mutation check (29/29 caught) proved the tests actually test the rules.
- **"Pin exact versions published at least 14 days ago; install with --ignore-scripts;
  one attempt, then revert"** (Phase 2 deps): the AI checked every version's date against the
  registry, found an unpinned peer that would have broken the rule, and reverted cleanly when
  npm crashed instead of working around it.
- **"Don't guess syntax from memory"** (Tailscale serve off): the AI fetched Tailscale's docs
  and still marked the inferred args "verify in Phase 2".

## AI mistakes and how they were caught
| Phase | Mistake | How caught | Fix |
|---|---|---|---|
| 0 | Inserted the "Real install runs" table into the middle of the phase table in this file. | AI re-read the file while writing Phase 1 docs. | Restructured the file. |
| 1 | Purity test (no clock/I/O in core) would pass if it found zero files. | AI self-review. | Requires at least 4 files. |
| 1 | Tailscale login/serve had no manifest record kind, so Uninstall left Ollama shared on the network. | Safety review round 1 (blocker). | `service-configured` kind; walk test over every PC-changing command. |
| 1 | **Newest-record restore**: Uninstall used the newest record per target, so running setup twice "restored" SetupPilot's own earlier value instead of the user's original setting/file. | Safety review round 1, reproduced with a probe. | Restore from the earliest record per target; tests for setup-run-twice. |
| 1 | **Reverse-command check**: the reverse came from the record's stored `reverseCommandId`; my first fix (only allow `*.uninstall`) still let "remove Ollama" run Tailscale's uninstall. | Safety review round 1, probed. | Reverse derived only from fixed tables; stored value ignored. |
| 1 | Model removal accepted any tag the manifest named (could delete the user's own `mistral:latest`); file paths unchecked (`C:/Windows/System32/x.dll`); plan hash ignored file writes. | Safety review round 1. | Tag must be in catalog AND manifest; allowed roots; hash covers `[exe, args]` + file target + content hash. |
| 1 | **Round 2 item 1 (paths)**: my path check accepted paths Windows rewrites to the root folder itself (`.../ `, `.../...`, `.../. .`), plus control chars and device names (`nul`). | Safety review round 2, verified with Win32 `GetFullPathNameW`. | `core/paths.ts`: reject trailing dot/space, control/forbidden chars, device names; 76 path tests. |
| 1 | **Round 2 item 2 (sharing)**: unknown Tailscale sharing state kept sharing ON after uninstall, with a false "set up before SetupPilot" message; existing sharing could be silently replaced. | Safety review round 2. | Unknown = turn ours off; step 8 refuses when sharing exists (`SHARING_IN_USE`). |
| 1 | **Round 2 item 4 (undo order)**: items ordered by newest record, so after a second setup run Ollama was uninstalled before its model, stranding ~5 GB. | Safety review round 2, probed. | Fixed order: services, models, settings, files, programs. |
| 1 | **Round 2 item 14 (my honesty test)**: could pass with nothing checked and never scanned service/setting/file text. | Safety review round 2. | Rewritten: every source must contribute text, each uninstall kind must appear, minimum counts. |
| 1 | **Round 2 item 15 (my walk test)**: half its cases returned early and passed trivially, it skipped file writes, only checked "something exists", and one test was misnamed. | Safety review round 2. | Walks forward commands only, checks the exact reverse `[exe, args]`, covers file writes, renamed. |
| 1 | The new `atLeast` guard exposed an old analyze test that only ever checked 3 tips, none of the templated ones it existed for. | The guard itself (test failed). | Test now produces and asserts every kind of tip. |
| 1 | **Round 3 blocker**: I applied "a failed run doesn't set the before-state" to settings only; models, programs, login and files still used the oldest record, so a user's own model could be removed. | Safety review round 3, probed. | One baseline rule for every kind; 5 regression tests; 2 new mutations. |
| 1 | Tooling: shell heredocs/sed dropped backslashes several times (a regex became `[1-9]d{0,6}`, Windows paths in tests, search patterns). | A new test failed on valid input; the typecheck; a script that refused to apply. | Edits with backslashes done via the Edit/Write tools only. |
| 1 | Two of my new tests were wrong (hash compared two plans with different record ids; three login records merged into one item by design). | The tests failed; analysed before touching code. | Fixed the tests, not the code. |
| 1 | Project agents/commands didn't load because the session started in the parent folder. | Agent launch error. | Used a general-purpose agent with the safety-reviewer file; open item 11. |
| 2 | My vitest 5 upgrade plan missed that vitest 5 makes `vite` a peer dependency, which npm would have installed at its newest version (8.3.5, 6 days old), breaking the 14-day rule. | AI caught it while checking `npm view vitest@5.0.4 peerDependencies`, before installing. | Pinned `vite` 7.3.7 (21 days) explicitly in the attempt. |
| 2 | The vitest 5.0.4 install failed: npm 10.9.3 crashed in its peer resolver (not a vitest or test problem). | npm error on both install routes. | One attempt only, as instructed: reverted, stayed on 3.2.7, D29 + Phase 3 open item 1. |
| 2 | My T0 transitive-dependency counts only followed top-level (hoisted) packages, so they can undercount. | AI self-check while reporting. | Stated as a caveat in the report. |
| 2 | Tooling, same class as the Phase 1 backslash problem: `\uXXXX` escapes above U+0085 that I typed reached the file as the raw characters. In `core/manifest.ts` the raw U+2028/2029 split the display-cleaning regex across lines, which broke parsing of 5 test files. | Typecheck error and failing test files, before any new test was written. | Rebuilt both lines from code points in a script, checked that the files are plain ASCII, and the new tests build special characters with `String.fromCodePoint`. |
| 2 | When splitting the T2 test file I deleted the original before my "identical bodies" comparison had passed (the comparison itself had a bug: it dropped one blank line between blocks). | The script printed `false`; the original was already gone. | Showed indirect proof instead (unchanged block line offsets, same test count and names). Rule for me: compare first, delete after. |
| 2 | My first verifyRendered tests always changed the display together with the args, so no test covered "the display shows `ollama pull` but `ollama rm` would run". Three of my checks were redundant with one later comparison. | T3 mutation check: 4 of 18 mutations survived. | Simplified to one strict args comparison plus separate exe and display checks; added 6 tests where the display stays honest; 18/18 caught. |
| 2 | Tooling: a backslash in a mutation-script search pattern (`\d`) was lost again. | The script stopped with "no text" before changing any file. | Built the pattern with `String.fromCharCode(92)`. |
| 2 | T4: the first Claude Code header said "Nothing is saved or changed"; my own savings-claim check flagged "saved". | The new honesty test failed. | Reworded the copy ("Nothing on this PC is changed") instead of loosening the check. |
| 2 | T4: my number check flagged "3.2", "2.5", "7" from catalog display names ("Llama 3.2") inside the OpenCode entry. | The new honesty test failed. | The check strips catalog tags and display names (catalog data, not claims); every other number must be 1/2/3, 64000 or a catalog context size. |
| 2 | T5: one of my "bad root layout" test cases built a path and then threw it away (`.map(() => home)`), so it silently duplicated another case. | Re-reading the test before running it. | Replaced it with a genuinely different layout (drive root as target). |
| 2 | T5: I added a home-folder regex that `isSafePath` already covered, so a mutation removing it survived; and nothing tested that a home with a trailing slash is accepted. | T5 mutation check (2 survivors over two runs). | Removed the redundant regex; added a normalisation test (4 spellings give the same config). 22/22. |
| 2 | Tooling: backslashes in mutation-script patterns were lost three more times in T5 (`\/` in regexes). | The scripts reported "NOT APPLIED" before changing any file. | Patterns built with `String.fromCharCode(92)`; nothing was changed by a broken pattern. |
| 2 | After adding step 7's "not available yet" text, a T4 mutation pattern (`"disabled": "Not available yet...`) matched step 7's text first instead of step 8's, so it mutated the wrong step and was reported MISSED (26/27). | Re-running all earlier mutation checks after the change. | Pattern pinned to step 8's own wording (one match). All five scripts hardened: a pattern that matches more than one place is reported "NOT APPLIED (ambiguous)" instead of mutating the first match (Phase 1 entries may name an explicit occurrence). Dry run: 0 ambiguous across 113 mutations. (The first hardening attempt lost a `\n` again; it threw before writing, so nothing changed.) |
| 2 | Guard added for the Unicode mistake: `tests/source-hygiene.test.ts` scans the raw bytes of core/, server/, tests/ and data/ for U+0085, U+2028/2029, LRM/RLM, U+061C and bidi controls; 2 hygiene mutations in the T2 check. | Requested by the human after T2. | CLAUDE.md now says how to write special characters. |
| 2 | Restart checklist item b: I sent "add a blank line" and "remove it" as two edits in one batch. The first was refused (its text matched twice), but the second still ran and removed the real blank line after `fnv1a()` in `core/hash.ts`. | `git diff core/hash.ts` right after, before running any other command. | Put the line back, and checked the sha256 was the same as before and `git diff` was empty. New CLAUDE.md rule: send dependent edits one at a time, and after any refused edit re-read the file before the next one. |
| 2 | T5b: a test labelled its cases with `p.id`, a field `MachineProfile` doesn't have. Vitest passed (no type checking), so only `tsc` caught it. | `npx tsc --noEmit --noUnusedLocals`. | Labelled the cases by profile name from `Object.entries`. |
| 2 | T5c/T5d: three times I inserted a new table row (AI_USAGE twice, STATUS once) above the previous task's row instead of below it, by anchoring the edit on that row's start. | Grepping the row order after each insert. | Swapped the two rows with a script that first checks they are adjacent and in the expected order. Anchor new rows on the end of the previous row. |
| 2 | T6: I sent two dependent edits to `tests/executor-env.test.ts` together (a use of `outcomeFor`, then its import), against the new CLAUDE.md rule. Both applied, but the hook ran between them and failed on "outcomeFor is not defined". | The hook output. | Re-ran the suite after both had landed (663/663), per the "failed hook run is unproven" rule. Logged here; dependent edits strictly one at a time. **This is a repeat** of restart-checklist item b (also two dependent edits sent together), and the third edit mistake overall with the T5c/T5d table-row slips, so CLAUDE.md now makes it a hard rule: each dependent edit is its own tool call, and an import never goes in with its first use. |
| 2 | T6: in `exePath` I added a drive-letter regex in front of `isSafePath`, which already rejects relative and UNC paths: redundant, so its mutation survived (the same mistake as T5's home-folder regex). | T6 mutation check (1 of 2 survivors). | Removed the regex; the mutation now removes `isSafePath` itself, which the relative / UNC / device-name cases catch. |
| 2 | T6: my PrivateText and ChildEnv tests used String(), templates, JSON and inspect, but never called `.toString()` directly. String() goes through `Symbol.toPrimitive`, so a `toString` that leaked would have passed. | T6 mutation check (the other survivor). | Added direct `.toString()` checks for both, plus a ChildEnv toString mutation. |
| 2 | T7: in the AI_USAGE repeat note I first wrote that "the T5b caveat rows" were one of the batched-edit cases. That wasn't true. | Re-reading the note against the actual history before moving on. | Corrected in the next edit: two batched-edit cases (restart item b, T6), three edit mistakes overall. |
| 2 | T7: my first token rule kept a leading "(" or "[" inside the URL token, so "(https://login.tailscale.com/...)" lost its opening bracket. The token itself was still removed. | The new bracket and parenthesis cases in `tests/log-clean.test.ts`. | Leading ( [ { now stay outside the token, like trailing punctuation; the contract says so. |
| 2 | T7: comments in `server/log/files.ts` used the words "rename" and "truncate", which the new no-delete scan flags. | The scan test itself. | Reworded the comments instead of loosening the scan. |
| 2 | T7: my path-escape mutation removed both guard layers at once, which hid that the resolved-path check alone was never tested: the strict name pattern already stops every escape. | A one-off check of each layer on its own (name check: caught; resolved-path check: MISSED). | Moved the resolved-path check into `isDirectlyInside`, tested directly with 7 outside paths; t7 now mutates each layer separately as well as both together. |

## What the mutation check found
The mutation check breaks one rule at a time and expects a test to fail. When a mutation
survives, the rule is not really tested, even if every test passes.

| Phase / task | Mutations | Survived first run | What it showed | Fix |
|---|---|---|---|---|
| 1 close | 29 | 0 (after round 2 rewrite) | Earlier walk and honesty tests passed with nothing checked; found by review, then proven by the mutation run. | `atLeast` guards; tests rewritten. |
| 2 / T2 | 12 (+2 hygiene) | 0 | All open-item fixes are tested. | none needed |
| 2 / T3 | 18 | **4** | No test covered **"the display shows `ollama pull` but `ollama rm` would run"**: every tampering test changed the display too, so the display check alone caught them, and three per-slot checks were redundant. A runner could have shown an honest command and run a different one, and the suite would still have passed. | One strict args comparison plus separate exe and display checks; 6 tests with an honest display and changed args; 18/18. |
| 2 / T4 | 24, then 25 (27 after T5 notes) | **2** (+1 not applied) | (a) My only non-ASCII hash test compared two inputs hashed by the same (mutated) code, so dropping each byte's high bit went unnoticed. (b) "A required step can be disabled" survived because another check (no "disabled" text) threw first: the required-step rule wasn't tested on its own. (c) One mutation pattern lost its `\n` (tooling). | (a) Test against an independent BigInt FNV-1a reference over all 256 byte values, plus a "UTF-16 code units instead of bytes" mutation. (b) Test checks the "is required" message. (c) Pattern built with `String.fromCharCode(92)`. 25/25. |
| 2 / T5 | 22 | **2** (+3 not applied, tooling) | A redundant home-folder regex (already covered by `isSafePath`), and no test that a trailing-slash home is accepted. | Removed the regex; added the normalisation test; 22/22. |
| 2 / T5b | 13 | 0 | Step 7 reason order (incl. "disabled step runs when also not needed" and "step 8 shows its own reason first too"), every reworded text, the caveat's unit and "may", a comma in the number (the honesty scan still rejects it), and the glossary entry. The script first checks that its tests pass on unmutated code, so a flaky failure can't count as caught. t4/t5 patterns moved to the new code and wording (still 27/27 and 25/25). | none needed |
| 2 / T5c | 11 | **1** | "Glossary 'token' back to 'a small piece of a word'" survived: the test only checked "one sentence", not the accuracy point the human had raised, so the inaccurate wording would have passed. | Added an assertion that the entry says a token is often a whole word; 11/11. All five older scripts now also refuse to run if their tests fail on unmutated code (shown working: pointed at a missing test file, t3 printed BASELINE FAILED and changed nothing). |
| 2 / T5d | 5 | 0 | Includes "goal note wording hard-wired in code with the same output": only a test that swaps the data text at runtime can catch that, so one was added. Hook change (realpath): plausible fix for the WhitelistError double load, **not confirmed**: not reproducible with either drive-letter spelling before or after. | none needed |
| 2 / T6 | 30, then 31 | **2** | (a) "PrivateText toString shows the text" survived: the tests only used String()/templates, which go through `Symbol.toPrimitive`, so an explicit `.toString()` call could have leaked private output. (b) "relative / UNC path allowed" survived: my drive-letter regex in `exePath` was redundant with `isSafePath`. | (a) Direct `.toString()` checks for PrivateText and ChildEnv, plus a ChildEnv toString mutation. (b) Regex removed; the mutation now removes `isSafePath`, caught by the relative / UNC / device-name cases. 31/31. All eight earlier scripts unchanged in result. |
| 2 / T7 | 22, then 24 | 0 in the script, **1** found by a one-off check | Every mutation was caught. But the "path escape" mutation removed both guard layers at once; checking each layer alone showed that the resolved-path check was never tested (MISSED): the strict file-name pattern already blocked every escape. | Resolved-path check moved into `isDirectlyInside` and tested directly; t7 now has three path mutations (name check only, resolved-path layer only, both). 24/24. All nine earlier scripts unchanged in result. |

Things to watch for (expected failure modes):
- Invented model tags or sizes -> verify every `ollamaTag` against the Ollama library.
- Invented benchmark speeds -> D8 bans numeric speed before measurement.
- Commands built by string concatenation -> safety-reviewer agent rule 1-2.
- Jargon in UI copy -> beginner-reviewer agent.
- "Unknown" treated as permission to remove -> D20; mutation check covers it.
