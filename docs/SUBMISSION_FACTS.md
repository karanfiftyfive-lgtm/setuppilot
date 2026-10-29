# Submission facts

Facts only, from the repo and a fresh run on 2026-10-30 (Windows 11, Node v22.19.0, npm 10.9.3).
Nothing here is an estimate unless it says so.

## Fresh run (2026-10-30)
| Check | Result |
|---|---|
| `npm test` (whole suite: core, server, demo UI) | **801 passed** of 801, 38 test files |
| Demo UI tests only (`tests/ui-*.test.ts`) | 41 passed (included in the 801) |
| `npx tsc --noEmit --noUnusedLocals` (root) | clean (exit 0) |
| `npm run typecheck:ui` | clean (exit 0) |
| `npm run demo:build` (production build + bundle check) | built; `check-ui-bundle: OK (no server/ code, no child_process, no Node-only modules)`; JS bundle 243.18 kB (77.08 kB gzip) |
| Smoke test of the built page (`vite preview`, localhost) | page HTTP 200 with the app root; JS bundle HTTP 200, contains "Demo mode: simulated" |
| Browser click-through | **not run** (no headless browser installed; none was installed) |

## Mutation checks
- 10 scripts in `tools/mutation/` (phase1, t2, t3, t4, t5, t5b, t5c, t5d, t6, t7), **197 mutations**
  in total: 29 + 14 + 18 + 27 + 25 + 13 + 11 + 5 + 31 + 24. Every script first checks that its
  tests pass on unmutated code.
- Last full run: 2026-10-30, at the end of T7, on the working tree the human then committed as
  `f6a609a`. Result: **197/197 caught**.
- **Not re-run after the demo UI** was built, because no `core/` or `server/` file changed since
  (the UI only reads core/ and data/). Not re-run now either: a full run takes well over 3 minutes.

## Code size (`.ts`, `.tsx`, `.css` files)
| Folder | Files | Lines |
|---|---|---|
| core/ | 16 | 1503 |
| server/ | 12 | 1039 |
| ui/src/ | 20 | 786 |
| tests/ | 42 | 4277 |

## Claude Code setup (`.claude/`)
- Agents: `beginner-reviewer`, `safety-reviewer`, `test-writer`
- Commands: `demo-check`, `implement`, `plan`, `review`
- Skills: `add-model-to-catalog`, `add-step-type`
- Hooks: `hooks/test-core.mjs` (PostToolUse on Edit/Write in core/ or tests/: runs Vitest from the real path)
- Settings: `settings.json` (allow / ask / deny rules; deny includes winget, ollama pull, tailscale, curl, rm -rf, git push)

## Docs
- `README.md`: what it is, how to run the demo, real vs simulated table.
- `docs/ARCHITECTURE.md`: how the parts fit together.
- `docs/CONTRACTS.md`: every shared shape and interface (contract first, then code).
- `docs/DECISIONS.md`: numbered decisions D1-D47 and the open items.
- `docs/DEMO_SCRIPT.md`: 3-minute demo script, plus the real-install checklist.
- `docs/STATUS.md`: what is done, not done, the VERIFY list, and what only the human can do.
- `docs/AI_USAGE.md`: what was delegated to AI, its mistakes and how they were caught, mutation findings.
- `docs/SUBMISSION_FACTS.md`: this file.

## Known limitations (from docs/STATUS.md)
- Browser demo only: scanning, installs, downloads, speed and the AI's answer are simulated.
- Screens 7 (Uninstall, simulated) and 8 (Chat, simulated) are not built.
- Server not built: T8 manifest-store to T19 (real detection, runner, Ollama HTTP calls, HTTP routes).
- Real execution is gated: every program path is unconfirmed until checked on a real Windows machine.
- VERIFY list (only on a real machine): Tailscale and llama.cpp commands, Ollama uninstall
  behaviour, read-only checks (whoami, pnputil, winget list, reg query), taskkill on an elevated
  child, winget alias spawn, console output encoding, the child environment allowlist, OpenCode
  config, Claude Code copy-paste, all exe locations, every catalog model tag and size.
- No browser click-through test; one unexplained, unreproduced test flake (DECISIONS open item 3).

## Dependencies (exact versions)
- dependencies: express 5.3.0, react 19.2.9, react-dom 19.2.9, zod 4.6.7
- devDependencies: @types/express 5.0.6, @types/node 22.20.5, @types/react 19.3.0,
  @types/react-dom 19.3.0, @types/supertest 7.2.1, supertest 7.3.1, tsx 4.23.15,
  typescript 5.9.3, vite 7.3.7, vitest 3.2.7

## npm audit (3 findings, all inside vitest 3.2.7)
| Package | Severity | Status |
|---|---|---|
| tinypool (<= 2.1.1, via vitest) | critical | accepted for now (D29: vitest upgrade is a Phase 3 open item); dev/test only, not in the browser bundle |
| vitest 3.2.7 | critical (via tinypool and @vitest/mocker) | same |
| @vitest/mocker | moderate | same |
The same 3 findings existed before the demo UI packages were added; `npm audit fix` was not run.

## Run the demo
```bash
npm install --ignore-scripts
npm run demo                                 # dev server, http://127.0.0.1:5173
npm run demo:build && npm run demo:preview   # production build, http://127.0.0.1:4173
npm test                                     # all tests
```
