# Status (read this first when resuming)

Last updated: 2026-10-30. Phase 2 stopped after T7 (committed) by the human's decision; a
demo-only browser UI was built instead (section "Demo UI" below). Waiting for the human.

## Demo UI (ui/, browser only) - done 2026-10-30
- Run: `npm run demo` (dev) or `npm run demo:build && npm run demo:preview`. No server, no
  executor, no network, no storage; "Demo mode: simulated" on every screen.
- Done: 1 Welcome, 2 Goal, 3 Scan (sample PC picker + recommendation), 4 Plan and setup
  (step cards, technical details, Approve all / Review each step, progress map), 5 Test
  (simulated answer, "simulated, not measured"), 6 Re-analyze (ladder, tips, rollback).
- **Coming next (not built):** 7 Uninstall (simulated plan from core/manifest.ts with a demo
  manifest, fixed order, approval) and 8 Chat (canned, labelled reply).
- Layout: `ui/src/model/` pure view models (tested), `ui/src/components/`, `ui/src/pages/`,
  `ui/src/App.tsx`. Tests: `tests/ui-{model,flow,honesty,imports}.test.ts`. Bundle check:
  `tools/check-ui-bundle.cjs` (runs in `demo:build`).
- New packages (exact, published 14+ days before 2026-10-30, `--ignore-scripts`): react and
  react-dom 19.2.9, @types/react and @types/react-dom 19.3.0; vite pinned to the 7.3.7 already
  installed by vitest. No React plugin: vite's esbuild compiles TSX. `npm audit`: 3 findings
  (2 critical, 1 moderate), all inside vitest 3.2.7, identical before the install (D29 item).
- No change to core/, data/ or existing tests. Config changed: root tsconfig `"jsx":
  "react-jsx"`; package.json scripts and dependencies; README rewritten.
- Not done: no click-through in a real browser (no headless browser installed); smoke test
  only (page and bundle return 200, bundle contains the demo label).

## Final polish (2026-10-30)
- Beginner-reviewer run once on the demo copy. Applied its 8 ui/ must-fixes: Windows-permission
  text names the real box and says the demo shows none; "Approve all" explained, with how many
  permission boxes the real app would show; caption "Example of what the real app would show.
  Nothing ran." above simulated output; plain step names in the progress map; re-analyze
  headings fixed ("Bigger AIs, and what each one needs", "Ways to get more from your AI");
  "You would need ..." as a full sentence; the small-PC note starts with its title.
- Phone/accessibility: long words and code wrap (`overflow-wrap: anywhere`), `pre` scrolls in
  its own box; goal buttons use `aria-pressed` instead of a radio role without arrow keys.
- Repo scan for public sharing: no keys, tokens, passwords, personal paths or emails found
  (only fictional test paths such as C:/Users/kim). `.gitignore` adds local data folders and
  env files. No LICENSE: the human hasn't chosen one.
- Facts for the submission form: `docs/SUBMISSION_FACTS.md`.

## Read-only scan of this PC (2026-10-30, options A + B)
- `npm run demo:scan` (`server/detect/scan.ts`, `scan-cli.ts`): memory, free disk, processor,
  OS version, and whether Ollama / winget / Tailscale files exist. Changes nothing, no network.
  Saves `ui/src/generated/this-pc.json` (gitignored); the demo shows "This PC (scanned <date>)"
  first. Admin rights and internet are not checked (false, never guessed as yes).
- Graphics card (B): reads NVIDIA cards with the whitelisted `detect.gpu` (nvidia-smi) through
  the executor, so it runs only in real mode on Windows with a **confirmed** nvidia-smi path
  (the human flips `"nvidia-smi"` in `server/config.ts` after checking the file exists).
  Otherwise "Graphics card (not read)", never a guess. AMD/Intel cards: not read.
- First real run on the developer's PC: 15.7 GB memory, 223.1 GB free, Intel i5-1135G7,
  Ollama found, graphics not read (demo mode). Tests 813 (8 new); scan mutations 8/8
  (`tools/mutation/tscan.cjs`).
- VERIFY (new): winget showed "not found" because it's a WindowsApps alias that a plain
  file-exists check may not see; confirm on the test machine. Option C (real installs,
  T8-T19) is not started: it needs a plan and per-task approval.

## Phase 3 copy items (from the review, not applied)
- data/ must-fix (data frozen): test step says "real test question" / "real speed" (D1); the
  small-PC body "It will be quick..." is a speed claim without "estimate" (D2).
- ui/ should-fix: explain "(1B)" model sizes; hints on the test and re-analyze screens;
  "No change found" next step; clearer rollback sentence; hide the "can't be skipped" note on
  skipped steps and in Approve-all mode; show the "not in this version" goal note in the demo
  too; glossary taps on goal descriptions and the welcome text; "unknown GB" phrase in
  profileSummary (a test pins today's text: change both together).
- ui/ nits: "Usable, a bit slower"; square-bracket labels; sample PC names; "Waiting for your
  OK" in Approve-all mode; "computer" vs "PC".
- core/ strings: "RAM 8 -> 32 GB" vs "memory"; "usable"; "You can enter it by hand" (no field yet).
- data/ should-fix/nits: demo-output jargon ("pulling manifest", "Successfully installed"),
  contextNote sentence length, "{context} tokens", coding tool not named, Tailscale account,
  glossary "context" vs "RAM" images, NO_ADMIN text without Retry, and smaller wording items.

## Not done (Phase 2 server, stopped)
T8 manifest-store, T9 profile-store, T10 real detection, T11 prerun, T12 runner, T13 Ollama
HTTP calls, T14 tools-config, T15 HTTP routes and server index, T16-T19. No real detection,
no real runner, no real Ollama. Real execution stays gated: all exe paths unconfirmed.
Keep this file current at the end of every task.

## Session start (if Claude Code is restarted)
Start Claude Code from inside `setuppilot/`, so the settings, the post-edit hook, the slash commands
and the three project agents load. Then re-run the baseline below before any new task.

## Restart checklist: done 2026-10-29, all passed (accepted by the human)
a. `winget --version` refused by the deny rules. b. Post-edit hook ran Vitest (results cache
rewritten during the edit); `core/hash.ts` back to its original bytes (sha256 and `git diff`).
c. All three agents loaded. d. Beginner-reviewer findings -> fixed in T5b. e. 573 tests, tsc
clean, 29/14/18/27/25. (One edit slip during item b: see AI_USAGE.md.)

## Baseline now (after T7)
`npm test`: 801 passing (760 + 41 demo UI). `npx tsc --noEmit --noUnusedLocals` and
`npm run typecheck:ui`: clean. `npm run demo:build`: OK. Mutation checks (last run after T7; not re-run for the demo UI, which
changed no core/ or server/ file): Phase 1
29/29, T2 14/14, T3 18/18, T4 27/27, T5 25/25, T5b 13/13, T5c 11/11, T5d 5/5, T6 31/31,
T7 24/24. Every script refuses to
run if its tests fail on unmutated code. Run long checks in the background and don't edit
source files while one runs (they edit files temporarily).
Known flake (DECISIONS open item 3): twice, a hook run after editing
`tests/step7-reason-and-copy.test.ts` failed the same 27 `whitelist-checks` tests
(`whitelist.ts` loaded twice). T5d: the hook now starts Vitest from the real path (plausible
fix, not confirmed). If you see it, re-run once before acting, and note it (CLAUDE.md rule).

## Where we are
- **Phase 0** (context files) and **Phase 1** (core/ + tests): closed and approved. Don't redo them.
- **Phase 2** (server/): plan approved with changes (`docs/DECISIONS.md` D29-D42 and
  `docs/CONTRACTS.md`). Build order T0-T19, one module per task. T0-T5 done and accepted.
- **Done this session**: restart checklist; git repo with baseline commit `7ee907b` (made by
  the human; compare with `git diff` before deleting anything); T5b (copy fixes + D43);
  T5c (goal-screen note D44, first-person copy, `.gitattributes`, baseline guard in every
  mutation script); T5d (goal note leads with what's missing, caveat promises nothing, hook
  realpath, D45); T6 executor (D46, committed by the human as `6374375`); T7 log (D47, not
  committed yet). The agent never runs git add / commit.
- **Waiting for the human**: review of T7. Don't start T8 until the human says go.
- **Next task: T8 `server/manifest-store.ts`**, only after the human says go: plan first.
  Owed there: privateOutput lines and proxy credentials never reach the stored manifest.
- **T6 layout**: `server/executor.ts` (createExecutor) and `server/executor/{types,output,
  env,supervise,fake,real}.ts`; `core/outcome.ts` (outcomeFor); `data/demo-output.json`.
- **T7 layout**: `server/log.ts` (Logger, write queue, caps, tail, and the runner helpers
  `logCommandStart` / `loggingOnLine` / `logCommandEnd`) and `server/log/{entry,clean,files}.ts`.

## Done
| Task | What | Tests after | Mutation check |
|---|---|---|---|
| T0 | Deps pinned exactly (express 5.3.0, zod 4.6.7, tsx 4.23.15, supertest 7.3.1, @types/express 5.0.6, @types/supertest 7.2.1; typescript 5.9.3, vitest 3.2.7, @types/node 22.20.5), `--ignore-scripts`, lock file. vitest 5 upgrade tried once, npm crashed, reverted (D29). | 282 | n/a |
| T1 | Contract changes (CONTRACTS.md + core/types.ts). | 282 | n/a |
| T2 | Core open items OI-2..7, OI-9 (`skip` action, `reversedIdsFor`, `checkRoots`, ASCII case folding, device names, bidi strip, bad-shape records). | 381 | T2 14/14 (incl. 2 hygiene) |
| T3 | Read-only checks (`core/commands/checks.ts`), `proc.killTree` with `ownChildPid`, `verifyRendered` (`core/commands/verify.ts`), source-hygiene guard. | 439 | T3 18/18 (4 missed on first run, fixed) |
| T4 | `core/toolconfig.ts` (OpenCode entry, mergeProvider, rules file, Claude Code copy-paste, contentHash), BuildOptions (`disabledSteps`, `demo`), context caveat (coding steps only, information only), honesty scan extended. | 509 | T4 27/27 (2 missed on first run, fixed) |
| T5 | `server/config.ts`: `modeFor`, `buildConfig` (deep-frozen), `loadConfig` (home read once, only SETUPPILOT_MODE), `startupCheck`, `openCodeWriteMode`; demo data folder separate (D38); exe candidates unconfirmed (D39). | 568 | T5 22/22 (2 missed on first run, fixed) |
| T5+ | Step 7 off in real mode too (D42): `disabledSteps` `["remote-access", "speed-boost"]`, calm "not available yet" text; tests in `tests/build-options-step7.test.ts`. | 573 | T5 25/25 |
| T5b | Beginner-reviewer copy fixes (step 7/8 "not available yet", context caveat, glossary "token" as one sentence); step 7 shows "not needed" before "not available yet" (D43; step 8 unchanged). Tests in `tests/step7-reason-and-copy.test.ts`; 3 existing assertions updated (wording / reason order). | 582 | T5b 13/13 (t4/t5 patterns updated) |
| T5c | `goalAvailability` (`core/availability.ts`, contract first) + `explanations.goalNote`: real-mode note on "remote"/"everything", not "chat"/"code" (step 7 is `advanced`), never in demo (D44). First-person "not available yet" texts, step 7 subject, "There's nothing to do here."; glossary "token" made accurate; `.gitattributes` (LF, no content change); baseline guard in all mutation scripts. 5 assertions updated (listed to the human first). | 589 | T5c 11/11 (1 missed on first run, fixed) |
| T5d | Goal note "Not in this version: ... For now, it works on this PC only." (data, runtime-swap test); caveat's "chat still works" removed + no-claim test; hook starts Vitest from realpath (not confirmed); CLAUDE.md rule on failed hook runs. 2 assertions updated (listed first). | 591 | T5d 5/5 |
| T6 | Executor (D46): contract first; `run(cmd, onLine, signal)` with verified commands only; confirmed exe paths only (all unconfirmed: real mode runs nothing yet); shell off, window hidden; own-child pid set; taskkill on own child, child.kill() only if taskkill is unconfirmed (killConfirmed false); timeout/cancel/5 s wait on an injected clock; output policy log/progress; PrivateText + ChildEnv; env allowlist; spawn-import rule; outcomeFor + fixed details. Fake and real share one supervisor (shared test table). | 663 | T6 31/31 (2 missed on first run, fixed) |
| T7 | Run log (D47): contract first; structured entries only (type-level `@ts-expect-error` tests + runtime guard; rejected entry = one fixed marker, never a throw); line cleaning (control/bidi neutralised, Tailscale login links removed whole incl. cut and split ones, URL credentials removed to the last @); JSON Lines in `<logDir>/<UTC date>[.n].log` from an injected clock; one write queue; failures reported once, never thrown; caps 8 KiB / 5 MiB with rotation .1-.9 / 100 MiB, no file ever deleted (scanned); two-layer path check + no-link logs folder; `tail(n)` with no path. End-to-end test through the fake executor. | 760 | T7 24/24 (resolved-path layer untested until split out, fixed) |

Phase 1 mutation check: 29/29. All five checks are re-run after each task.

Mutation scripts: `tools/mutation/` (run from `setuppilot/`):
`node tools/mutation/phase1.cjs .`, `node tools/mutation/t2.cjs`, `t3.cjs`, `t4.cjs`, `t5.cjs`, `t5b.cjs`, `t5c.cjs`, `t5d.cjs`, `t6.cjs`, `t7.cjs`.
Each mutation is one text replacement in one source file; the named test files must fail;
the file is restored after each run. Add a new script per task (t6.cjs, ...).

## Next (approved build order)
T5 config (done) -> T6 executor -> T7 log -> T8 manifest-store -> T9 profile-store -> T10 detect ->
T11 prerun -> T12 runner + plans -> T13 ollama (HTTP whitelist) -> T14 tools-config ->
T15 http/index -> T16 catalog tag/size comparison table (verified stays false) ->
T17 mutation check (runner + http rules) -> **T18 safety review (max 2 rounds; needs the
safety-reviewer agent loaded; if not loaded, stop after T17 and tell the human)** ->
show the report -> T19 docs (DEMO_SCRIPT checklist, AI_USAGE results table, DECISIONS,
AI_USAGE incl. own mistakes) -> stop. Don't start Phase 3.

## Obligations already promised for later tasks
- **T15 events / T8 manifest-store**: `privateOutput` lines AND proxy credentials (child
  env) never reach the event stream or the stored manifest; one marker test each, plus a
  mutation removing the guard. (Done: executor side in T6, log in T7.)
- **T12 runner**: (a) reproduce the retry-after-partial-install sequence (D46) in a test and
  stop for the human's decision; don't weaken "unknown means keep". (b) Verification split:
  the runner calls verifyRendered with the manifest's tags (modelTag) before the executor,
  which only checks shape and catalog membership; test a catalog tag that isn't in the
  manifest. (c) Log only through `logCommandStart` / `loggingOnLine` / `logCommandEnd`.
  The T12 plan must list (a)-(c).
- **T15**: no request can supply a pid (cancel takes a run id only; T6 executor already takes
  none).
- **T10**: graphics detection must not assume NVIDIA. AMD/Intel: `vramGb: null`, manual
  override, and a warning that the tool can't confirm Ollama will use that card. Check
  Ollama's current Windows GPU docs and cite them; if unconfirmed, keep the warning.
- **T13**: HTTP whitelist: host 127.0.0.1:11434 only, `GET /api/tags`, `POST /api/generate`,
  no query, no redirects, server-built body from a fixed template (model = installed catalog
  tag, fixed prompt / static explanation text, stream false, allowed num_ctx, capped
  num_predict), response size cap + timeout, re-verify before each call. Tests: other host,
  other path, extra body field, non-catalog tag, redirect response all refused.
- **T14**: OpenCode file written in real mode only if the path is confirmed; JSONC with
  comments -> snippet only; backup first; never overwrite CLAUDE.md; record content hash.
  Nothing written in demo mode.
- **T15**: document in docs/ARCHITECTURE.md how the UI gets the session token (served with
  the same-origin page, sent in a header, never in a URL or log).
## Open items
- Phase 3 open item 1: vitest upgrade (D29); no `--legacy-peer-deps`; retry only if time.
- Open item 2 (line endings): fixed in T5c with `.gitattributes`.
- Open item 3: flaky double load of `whitelist.ts` (seen twice; evidence and a fix to try are
  in DECISIONS). All mutation scripts now have the baseline guard.
- Open item 4: caveat "I set this PC to" suggestion (Phase 3 copy pass).
- Open item 5: third beginner review findings, waiting for the human.
- UI (Phase 3): the glossary tip for "tokens" must find the singular "token" entry (and must
  not be taken by the longer "tokens per second" entry).
- Demo mode on macOS/Linux: the server refuses to start there (the home folder isn't a
  Windows drive path). Decide in Phase 3/4 whether judges need a non-Windows demo.

## VERIFY list (stays marked until the human runs it on a real machine)
- Tailscale: winget id, `serve` on/off args (step 8 disabled in real mode until confirmed),
  `status --json` / `serve status --json` shapes, `up` browser behaviour.
- llama.cpp winget id and what it installs (step 7 disabled in real mode until confirmed, D42).
- `ollama.uninstall`: does a silent uninstall delete `%USERPROFILE%\.ollama\models`?
- Read-only checks: `whoami /groups` admin detection (not elevated / standard user),
  `pnputil` without admin, `winget list` "not found" result, `reg query HKCU\Environment`
  listing format, `taskkill /t` on an elevated winget child.
- OpenCode: Windows config path, `provider` vs `providers` (D32), provider + model listed.
- Claude Code PowerShell copy-paste (D34), incl. `$env:X = ""` behaviour.
- Exe locations (`server/config.ts`, all `confirmed: false`): Ollama, Tailscale, winget,
  nvidia-smi, whoami, reg, setx, taskkill, pnputil.
- Every catalog tag and size (`verified: false` on all 10 models).
- T6 executor: spawning `winget.exe` through the WindowsApps alias with `shell: false`; the
  console output encoding (OEM code page vs UTF-8); the exact child env allowlist (D46);
  `taskkill /t` on an elevated winget child (already listed above, now also: does the app
  report "may still be running"). Until the exe paths are confirmed, real mode runs nothing.

## Only the human can do
- Run the real-install checklist (docs/DEMO_SCRIPT.md) and fill the AI_USAGE.md table.
- Flip `confirmed` flags in server/config.ts and `verified` flags in data/catalog.json.
- Approve every `npm install` (settings "ask"); the agent must never run winget, ollama
  pull or tailscale.
- Commit T5b (agent doesn't commit unless asked).

## Working rules (from the human; non-negotiable)
- /plan first per phase; wait for approval. One module per task; show test results after each.
- Contract first (docs/CONTRACTS.md), then code. Files under about 200 lines (types.ts excepted).
- Don't relax any test. List and justify any change to an existing test before editing it.
- Every loop test has a minimum-count guard (`atLeast`). Mutation check on each task's rules.
- Verify, don't guess: check current official docs, cite them in code, mark the rest VERIFY.
- Special characters via `String.fromCodePoint` (tests) / generated escapes (source); never
  delete a file before the comparison passes.
- Safety review after the build, max 2 rounds; fix anything that can delete user data or run
  an unapproved command; smaller items become Phase 3 open items. Show the report before docs.
- Append AI_USAGE.md and DECISIONS.md, including the AI's own mistakes.
- Stop after each task for the human's go-ahead. Ask one question when something is ambiguous.
