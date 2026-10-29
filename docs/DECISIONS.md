# Decisions (ADR log)

Short entries: choice + why. Newest last.

## Phase 0
- **D1. Ollama as the default runtime.** One installer via winget, simple model pulls, a
  local HTTP API for the test and chat. llama.cpp only for the optional speed-boost step.
- **D2. Rules engine builds every command; AI never does.** Commands are `CommandSpec`s
  with fixed exe + args and typed, validated params. Removes the prompt-injection-to-shell
  path entirely.
- **D3. Approvals bind to a hash of the rendered commands.** "Approve all" approves exactly
  the list shown; any change to the plan invalidates the approval.
- **D4. Manifest written before each change, not after.** If the app crashes mid-step,
  Uninstall still knows what may have changed.
- **D5. Catalog drives tiers.** Fit = `minMemoryGb + safetyMarginGb <= usableMemoryGb`;
  no hardcoded tier thresholds in code. `minMemoryGb = q4SizeGb + overheadGb (1.5)`.
- **D6. Usable memory = dedicated VRAM if a discrete GPU, else 65% of FREE RAM.** Manual
  VRAM override wins, because Windows WMI can report at most ~4 GB for some cards.
- **D7. 27B tier requires a discrete GPU.** On CPU it would be too slow to feel usable.
  Note: gemma3:27b at Q4 is ~17 GB (estimate), so with the 1.5 GB overhead it needs about
  19 GB of VRAM; a 16 GB card gets the 14B tier. Approved (overrides the brief's
  "16+ VRAM -> up to 27B" rough guide).
- **D8. No numeric speed claims before the test run.** Tiers carry a word ("fast / okay /
  slow", labelled estimate). `tokPerSecRange` is optional and always `null`. If a range is
  ever added, it must be labelled "theoretical maximum" (not expected speed) and shown
  only when memory speed is actually detected. Approved: words only.
- **D9. Remote access via `tailscale serve`, not binding Ollama to 0.0.0.0.** Ollama stays
  on localhost; only the user's own tailnet can reach it. Approved; verify in Phase 2.
- **D10. Server binds 127.0.0.1 and checks the Host header.** Stops other web pages from
  driving the installer (DNS rebinding).
- **D11. Settings: deny system-changing commands for the dev agent** (winget, ollama pull,
  tailscale, setx, rm -rf, git push). The app installs things at runtime; Claude Code
  building the app never should. `blockReadsOutsideWorkingDirectories: true`.
- **D12. Added `.claude/hooks/test-core.mjs`** (not in the brief's tree) because a hook
  needs a script; it runs Vitest after edits in core/ or tests/, exits 2 on failure so the
  output reaches Claude, and is a no-op until package.json exists.
- **D13. Step ids merge the brief's 10 host steps into 10 user-facing steps**: scan-pc (1),
  choose-model (2-3), install-runtime (5), download-model (4), safe-defaults (6),
  speed-boost (7), remote-access (8), connect-coding-tool (9), workflow-rules (10),
  plus test-run. Runtime is installed before the download because `ollama pull` needs it.
- **D14. Some allow rules are Bash-only** (e.g. `npm run build`, `git show`). The same
  commands via the PowerShell tool will prompt. Accepted as is.
- **D15. Catalog entries carry `verified: false`** until a human checks each tag and size
  against the Ollama library (pre-demo checklist item).
- **D16. System-changing commands stay blocked for the dev agent; demo mode is the
  default during development.** The real install path is run by a human on a test machine
  and logged in `docs/AI_USAGE.md`.

## Phase 1 (core/ + tests)
- **D17. 5th mock profile `big-gpu-rig` (RTX 4090, 24 GB) to show step 7 honestly.** The
  speed-boost rule stays strict: offered only with at least 2 GB of graphics memory left
  after the main model. gpu-rig (12 GB, 14B model) is NOT loosened to qualify; it shows its
  own "not offered" reason. In demo mode step 7 is simulated and the UI labels it "Demo mode:
  simulated". The llama.cpp install and its winget id stay "verify in Phase 2"; the real
  path is untested until a human runs it. The main demo stays weak-laptop -> re-analyze ->
  upgraded-pc; step 7 on big-gpu-rig is an optional 20-second segment.
- **D18. Step 7 makes no helper-model claim yet.** Its text says only "adds llama.cpp". The
  helper-model download becomes a whitelisted command in Phase 2, once the method is chosen
  and verified. No draft-model entry in the catalog.
- **D19. Every reverse comes from fixed tables in `core/changes.ts`.** `changeFor` maps each
  PC-changing forward command to one record kind; `PROGRAMS`/`SERVICES` give the only undo.
  A record's stored `reverseCommandId` is informational. A test walks every whitelisted
  command so a new PC-changing command without a record kind fails CI.
- **D20. Records carry the state BEFORE SetupPilot (`previous`), captured by the server right
  before the run, not at scan time.** Models/programs: "absent" | "present". Unknown never
  removes anything; the one exception is Tailscale sharing, where unknown means "turn our
  sharing off" (leaving the AI shared is the worse mistake). Login: unknown = stay signed in.
  The baseline is the oldest live record that did not fail.
- **D21. Fixed undo order: services, models, settings, files, programs.** Models need Ollama
  to be removed; record order can't break this after a second setup run.
- **D22. Tailscale: turn off only our own sharing, never `serve reset`; log out only if
  SetupPilot did the first login; refuse step 8 if sharing already exists on the port**
  (`SHARING_IN_USE`). Exact serve on/off args are inferred from Tailscale's docs ("add `off`
  to the original command, all flags required") and marked verify in Phase 2.
- **D23. Allowed write locations are server constants, split into `targets` (coding-tool
  config folder) and `backups` (`~/.setuppilot/backups`).** Core checks every path for
  Windows tricks (trailing dot/space, control chars, `<>"|?*`, device names, UNC, `\\?\`,
  ADS) and rejects anything outside. `~/.setuppilot` itself is never a target, so Uninstall
  can't delete the audit trail. Server: non-recursive delete only, real-path re-check.
- **D24. User edits are never lost.** File records store `writtenHash`; if the file changed
  since, the server moves the user's version to backups instead of deleting/overwriting.
  The workflow-rules file is a new `CLAUDE.md` in a user-chosen folder, never overwrites,
  and Uninstall always keeps it.
- **D25. Approval binds to a hash of exactly what was shown, for setup AND uninstall.**
  `planHash` covers each active step's `[exe, args]` as data plus file target and content
  hash; `uninstallHash` covers each item's action, `[exe, args]`, file, records, optional.
  FNV-1a is not collision-resistant, so in Phase 2 **the runner executes only from its own
  stored copy of the plan, re-checks the hash before each step, and never runs commands,
  paths or content sent by the UI** (also in CONTRACTS.md).
- **D26. New core files `hash.ts`, `paths.ts`, `changes.ts`** (not in the brief's tree) to
  keep each file under ~200 lines and single-purpose. `core/types.ts` (229 lines) is the
  one exception: it mirrors CONTRACTS.md one-to-one.
- **D27. Test discipline.** Loop tests must assert a minimum number of items checked
  (`atLeast`), so none can pass with nothing checked. Before closing a phase, a mutation
  check breaks each safety rule one at a time and confirms a test fails (29/29 at close).
- **D28. Three safety-review rounds, then close.** Round 3 found one data-loss blocker
  (fixed) plus should-fix/nits, logged below as Phase 2 open items.

## Open items for Phase 2 (from safety review round 3, and carried over)
Must be done in Phase 2; none can delete user data or run an unapproved command in core today.
1. **Verify on a real machine** (`VERIFY_IN_PHASE_2`): Tailscale and llama.cpp winget ids,
   `tailscale serve` on/off args, `tailscale status --json` shape, and whether a silent
   `ollama.uninstall` keeps or deletes `%USERPROFILE%\.ollama\models` (the UI already warns).
2. **Device names**: also reject `COM¹`-`COM³`, `LPT¹`-`LPT³`, `CONIN$`, `CONOUT$`, and names
   with spaces before the dot (`nul .txt`).
3. **Malformed records** (non-string `target` etc.) currently throw and block the whole
   uninstall; validate record shape and mark the group damaged instead.
4. **Case folding**: lowercase ASCII only in `normPath` (Kelvin/Angstrom signs fold to
   different names than Windows uses).
5. **Workflow-rules folder**: reject paths inside `roots.backups` and `~/.setuppilot`.
6. **Root overlap**: core should reject a target root that contains or sits inside a backup
   root or `~/.setuppilot`.
7. **Display text**: also strip bidi controls (U+202A-U+202E, U+2066-U+2069), U+2028/2029, U+0085.
8. **Contract wording**: env `previous: null` means "no value" (the server must confirm the
   variable was absent before recording null), not "unknown".
9. **Damaged/declined items**: the server must NOT mark their `recordIds` reversed; consider
   a separate `action: "skip"`.
10. **Phase 2 runtime** (not yet built): runner (`shell:false`, stored plan only, hash
    re-check, records written before each run with `previous` captured right before),
    sharing re-check when the scan left it unknown, tools-config file rules (backup first,
    real-path check, never overwrite CLAUDE.md, move changed files to backups), 127.0.0.1 +
    Host check, logging, DEMO_MODE, narrator isolation.
11. **Tooling**: open Claude Code in `setuppilot/` (not the parent folder) so the project's
    agents, slash commands and test hook load.

## Phase 2 (server/)
- **D29. Stay on vitest 3.2.7 for now: a known dev-tool risk, accepted.** `npm audit` reports
  2 critical (tinypool GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) and 1 moderate
  (@vitest/mocker GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8) inside vitest 3.2.7. There is
  no 3.2.x fix; 4.1.12 is under 14 days old; vitest 5.0.4 (15 days, Node ^22.12 met, no
  longer depends on tinypool) was tried once with `vite` pinned to 7.3.7, but npm 10.9.3
  crashed in its peer-dependency resolver (`Cannot read properties of null (reading
  'edgesOut')`, build-ideal-tree.js #loadPeerSet) before installing anything. Reverted; lock
  file unchanged. Why the risk is accepted (from reading the advisories): the mocker issues
  need a reachable Vite dev server plus `mockerPlugin()`/`interceptorPlugin()` in a Vite
  config, or browser mode; we use `vitest run` in Node mode with no Vite config. The tinypool
  issues need an attacker to already be able to pollute `Object.prototype` inside the test
  process; our tests load only our own code and data. vitest is a dev dependency and never
  ships in the app. Phase 3 open item 1 tracks the upgrade.

- **D30. Confirm "the setting was absent" by listing `HKCU\Environment`, not `reg query /v`.**
  Microsoft's reg query page documents only exit 0 = success and 1 = failure, so a missing
  value looks the same as any other failure. The listing includes the user's other environment
  variables (which may hold secrets), so the command is `privateOutput`: parsed in memory only,
  never logged, streamed or stored. Anything other than a clean listing means "unknown", and
  the safe-defaults step does not run (OI-8).
- **D31. Read-only checks live in `core/commands/checks.ts`; `verifyRendered` in
  `core/commands/verify.ts`.** Keeps whitelist.ts under 200 lines. Read-only commands may not
  have a reverse, need admin or be recorded as changes (tested). `proc.killTree` takes a pid
  only as a number that the executor itself put in `ctx.ownChildPids`; every context built
  from the catalog has an empty list, so no plan can carry a usable kill command.

- **D32. OpenCode entry follows the documented `provider` example, under our own key
  `setuppilot-ollama`.** opencode.ai/docs/providers shows Ollama as `provider.<id>` with
  `npm: "@ai-sdk/openai-compatible"`, `options.baseURL: "http://localhost:11434/v1"` and a
  `models` map, and says the id "can be any string". opencode.ai/config.json marks top-level
  `provider` deprecated in favour of `providers` (different entry shape, no Ollama example), so
  this stays VERIFY against the installed OpenCode version. Our own key never collides with a
  user's `ollama` entry; our key already present with different content, or under `providers`,
  is a conflict (snippet only, nothing written). The merge adds only our entry.
- **D33. Tool-use caveat at 64000 tokens.** docs.ollama.com/context-length: coding tools
  "should be set to at least 64000 tokens"; Ollama's OpenCode and Claude Code pages: "64k or
  higher". (OpenCode's own page says 16k-32k if tool calls fail; we use the higher figure.)
  Every catalog context (max 32768) is below it, so the coding-tool step always says plainly
  that tool use may not work well, with both numbers. No other new numbers in user text.
- **D34. Claude Code: copy-paste only, this PowerShell window only.** The three documented
  variables set with `$env:` for the current window, then `claude --model <catalog tag>`.
  Never run or written by SetupPilot. The docs show only a Bash example, so the PowerShell
  form (and `$env:X = ""` removing the variable in Windows PowerShell 5.1) is VERIFY.
- **D35. File content is hashed as UTF-8 bytes** (`contentHash`), not JavaScript string code
  units, so the server can hash the file on disk the same way (T14). Checked against an
  independent reference for all 256 byte values.
- **D36. `buildPlan(..., opts)`.** `disabledSteps` (server constant, real mode: step 8) wins
  over every other skip reason, is left out of the hash, and may not name a required or
  unknown step. `demo` adds "Demo mode: simulated" to every step that would run (display
  only, not hashed).

- **D37. Server constants come from two inputs only** (`os.homedir()` read once, and
  `SETUPPILOT_MODE`). Real mode only for exactly `"real"` on `win32`. The home folder must
  pass core's `isSafePath` after normalising (fails closed on `..`, UNC, `\\?\`, device names,
  drive roots, trailing dots/spaces). The whole config is deep-frozen.
- **D38. Demo mode keeps its own data folder** (`~/.setuppilot/demo/`: manifest, profile,
  logs, backups), so a demo can never read or add to the real manifest, and an Uninstall shown
  in a demo never lists real changes. `roots.reserved` is `~/.setuppilot` in both modes.
- **D39. Every exe location is a candidate with `confirmed: false`** (Ollama per-user under
  AppData\Local\Programs, Tailscale under Program Files, winget's App Installer alias, system
  tools and nvidia-smi under C:\Windows\System32). No env var such as LOCALAPPDATA or
  SystemRoot is read, so these assume the default locations and stay VERIFY until the human
  checks them. How T6 treats an unconfirmed exe is decided in T6.
- **D40. The startup check fails closed with a plain message** ("SetupPilot can't start:
  ...") when roots overlap or are unsafe, the models drive is missing, or the logs/backups
  folder can't be created. It creates only SetupPilot's own folders inside the data folder.
- **D42. Step 7 (speed boost) is also off in real mode** (human decision after T5). It runs
  `winget install --id ggml.llamacpp`, not yet checked on a real machine, and our rule is that
  unverified commands stay disabled in real mode. Real-mode `disabledSteps` is
  `["remote-access", "speed-boost"]`; both show a calm "Not available yet in this version"
  text, are left out of the plan hash, and are still offered in demo mode, labelled
  "Demo mode: simulated".
- **D41. Mutation scripts are kept in the project** (`tools/mutation/`), so a restarted session
  can re-run every earlier check. Each pattern must match exactly one place in its file (or, in
  phase1.cjs, name the occurrence it means); otherwise the script reports "NOT APPLIED
  (ambiguous)" and changes nothing.

## Phase 2 test obligations (must land in the named task)
- **T6 executor / T7 log, `privateOutput` enforced where output is consumed** (D30): lines
  from a `privateOutput` command never reach the log file, the event stream (SSE), the stored
  manifest, or any error message or `detail` text (including a failure/timeout message). The
  only consumer is the in-memory parser. Plus a mutation check that removes that guard and
  shows these tests fail.

## Open items for Phase 3
1. **vitest upgrade** (D29): retry vitest 5.0.4 (or later, 14+ days old) with `vite` pinned,
   either with a newer npm or with `--legacy-peer-deps` (needs approval: it skips npm's
   automatic peer installs, so every peer must be pinned by hand). Then the audit must be clean.
   Human decision after T2: no `--legacy-peer-deps`, no retry during Phase 2; retry in Phase 3
   only if there is time.
