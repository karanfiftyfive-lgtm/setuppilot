# SetupPilot

## Goal
SetupPilot sets up a private, local AI on a Windows PC for people who know nothing about AI.
The user picks a goal, then only watches and clicks Approve. We pick, install, configure and
test everything, and explain each step in plain language. Honest about limits, always.

## Safety rules (non-negotiable)
1. No AI ever chooses or writes shell commands. The rules engine (core/) builds them.
2. Commands run only from the whitelist in `core/commands/whitelist.ts`.
3. Nothing runs without explicit approval: per step, or one "Approve all" click after the
   full command list was shown.
4. Exact commands are viewable on request; every run is logged to a local file.
5. Every change to the PC is recorded in the manifest so Uninstall can reverse it.
6. Handle no internet, no winget, no admin rights, low disk, interrupted download:
   a plain message plus a Retry button.
7. Never say "unlimited" without the caveat: local models are smaller than ChatGPT/Claude,
   and speed depends on the machine.

## Honesty rules
- Label every number before the test run as an **estimate**. Show measured speed after.
- Never invent benchmark numbers. Unknown = say "unknown" or "estimate".

## Stack
TypeScript everywhere. React + Vite (ui/), Node + Express on localhost only (server/),
Vitest (tests/). Windows first; OS-specific code behind the interface in `server/detect/`.

## Folder map
- `core/`     pure logic, no I/O (recommend, goals, steps, analyze, manifest, whitelist)
- `server/`   side effects: detection, command runner, Ollama, file writes, stores
- `ui/`       React screens and components; plain language only
- `data/`     catalog, goals, glossary, explanations, mock profiles (data, not code)
- `tests/`    Vitest unit tests for core/
- `docs/`     ARCHITECTURE, DECISIONS, CONTRACTS, AI_USAGE, DEMO_SCRIPT
- `.claude/`  settings, slash commands, agents, skills, hooks

## Commands (once Phase 1 adds package.json)
- `npm install`        install dependencies
- `npm test`           run all Vitest tests
- `npm run typecheck`  tsc --noEmit
- `npm run dev`        server + UI; add `DEMO_MODE=1` to simulate all commands

## How to work
- Read `docs/CONTRACTS.md` before touching any interface. Change the contract first.
- Plan before coding (`/plan`). Wait for approval of each phase.
- One module per task (`/implement <module>`), with tests in the same task.
- Keep every file under ~200 lines and single-purpose.
- Data over code: tiers, goals and copy live in `data/*.json`, not in `if` chains.
- After each phase: run the `safety-reviewer` and `beginner-reviewer` agents on the diff,
  then append to `docs/AI_USAGE.md` and `docs/DECISIONS.md`.
- Ambiguous? Ask one question instead of guessing.
- Do not install system software (winget, ollama pull, tailscale) while developing;
  the app's runner does that at runtime, in demo mode for tests.
- Special characters: never type them raw or as hand-written escapes above U+007F in an
  edit. In tests build them with `String.fromCodePoint(0x...)`; in source, generate the
  escape from the code point with a script and check the bytes. Write anything containing
  backslashes with the Edit/Write tools, not shell heredocs or sed.
  `tests/source-hygiene.test.ts` fails on invisible line breaks or bidi controls.
- Never delete or overwrite a file until the check that proves it is no longer needed has
  passed (e.g. a split file is compared with the original first). Use `git diff` against the
  baseline commit for the comparison; an untracked file still can't be recovered.
- Send dependent edits one at a time (wait for each result). After any refused edit, re-read
  the file before the next edit to it.
- A failed post-edit hook run is unproven until a rerun confirms it: if the failures can't be
  explained by the edit (e.g. the `whitelist-checks` WhitelistError double load, DECISIONS
  open item 3), rerun `npx vitest run` before acting on them, and record the occurrence.
