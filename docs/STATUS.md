# Status (read this first when resuming)

Last updated: 2026-10-28, end of the first Phase 2 session, after T5 + the step 7 change.
Keep this file current at the end of every task.

## RESTART HERE (new session)
**Start Claude Code from inside the `setuppilot/` folder** (not the parent `project-4/`),
so `.claude/settings.json`, the post-edit hook, the slash commands and the three project
agents load. The first session started in the parent folder, so none of them loaded.

**Exact first instruction for the new session** (the human pastes this):
> Read docs/STATUS.md and CLAUDE.md first. Then run the "First thing to do after restart"
> checklist in docs/STATUS.md, show me every result, and stop for my go-ahead before T6.
> Do not start T6.

## First thing to do after restart (show the human every result, then stop)
- [ ] a. **settings.json is active**: try the harmless blocked command `winget --version`
      (Bash tool) and confirm it is refused by the deny rules. Do not try anything else
      that changes the system. If it is NOT refused, stop and tell the human.
- [ ] b. **The post-edit test hook runs**: make a harmless edit in `core/` (e.g. add then
      remove a blank line at the end of `core/hash.ts`), confirm the hook ran Vitest, and
      confirm the file is back to its original bytes.
- [ ] c. **The three agents are loaded**: `safety-reviewer`, `test-writer`,
      `beginner-reviewer` appear as agent types.
- [ ] d. **Run the beginner-reviewer** on: the context caveat
      (`data/explanations.json` `toolConfig.contextNote`, D33), and the step 7 and step 8
      "not available yet" texts (`steps["speed-boost"].disabled`,
      `steps["remote-access"].disabled`). Show its findings; change nothing without approval.
- [ ] e. **Baseline**: `npm test` (expect 573 passing), `npx tsc --noEmit --noUnusedLocals`,
      and all five mutation checks (expect Phase 1 29/29, T2 14/14, T3 18/18, T4 27/27,
      T5 25/25). The T4 check takes several minutes; run long checks in the background and
      don't edit source files while a mutation check runs (it edits files temporarily).
- [ ] Then **stop** and wait for the human's go-ahead before T6.

## Where we are
- **Phase 0** (context files) and **Phase 1** (core/ + tests): closed and approved. Don't redo them.
- **Phase 2** (server/): plan approved with changes (`docs/DECISIONS.md` D29-D42 and
  `docs/CONTRACTS.md`). Build order T0-T19, one module per task. T0-T5 done and accepted.
- **Human decisions in the last session**: step 7 (speed boost) is also off in real mode
  (D42, done); restart now, before T6 (this file); git init + baseline commit will be done
  by the human, who will say when (until then: compare files before deleting them).
- **Next task: T6** `server/executor.ts`: Executor interface, FakeExecutor (tests + demo),
  RealExecutor (absolute exe paths only, `shell: false`, constructed only in real mode),
  timeouts, cancel via `proc.killTree` with the executor's own child pid only, and the
  `privateOutput` guard (see obligations below). Needs a /plan-style outline approved first.

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

Phase 1 mutation check: 29/29. All five checks are re-run after each task.

Mutation scripts: `tools/mutation/` (run from `setuppilot/`):
`node tools/mutation/phase1.cjs .`, `node tools/mutation/t2.cjs`, `t3.cjs`, `t4.cjs`, `t5.cjs`.
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
- **T6 executor / T7 log**: `privateOutput` lines never reach the log, the event stream,
  the stored manifest, or any error/detail message; mutation check removing the guard.
- **T6**: RealExecutor uses absolute exe paths only, `shell: false`, and is constructed only
  in real mode. FakeExecutor for tests and demo.
- **T6 / T15**: no request can supply a pid (cancel takes a run id only).
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
- **Beginner-reviewer** (after restart, checklist item d): context-caveat wording (D33) and
  the step 7 and step 8 "not available yet" texts.

## Open items
- Phase 3 open item 1: vitest upgrade (D29); no `--legacy-peer-deps`; retry only if time.
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

## Only the human can do
- Run the real-install checklist (docs/DEMO_SCRIPT.md) and fill the AI_USAGE.md table.
- Flip `confirmed` flags in server/config.ts and `verified` flags in data/catalog.json.
- Approve every `npm install` (settings "ask"); the agent must never run winget, ollama
  pull or tailscale.
- `git init` + baseline commit (pending; until confirmed, compare files before deleting
  them; afterwards use `git diff`).
- Restart Claude Code in `setuppilot/` so project agents, commands and the hook load.

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
