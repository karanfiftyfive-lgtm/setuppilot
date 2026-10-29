# SetupPilot

**Sets up a private AI on a Windows PC for people who know nothing about AI.** You pick a goal,
watch, and approve. SetupPilot picks the right model for your PC, plans every step, and explains
it in plain words.

Honest limits: AI models that run on a normal PC are smaller than ChatGPT or Claude, and how
fast they answer depends on your PC.

## Run the demo (browser only, nothing is installed)
```bash
npm install --ignore-scripts
npm run demo            # dev server: open http://127.0.0.1:5173
# or the production build:
npm run demo:build      # builds ui/dist and checks the bundle has no server code
npm run demo:preview    # serves it at http://127.0.0.1:4173
```
Every screen says **"Demo mode: simulated"**. The demo runs the real decision engine (`core/`)
on sample PCs from `data/mock-profiles/` in your browser. There is no server, no network call,
and no command is ever run.

**Not done yet:** screens 7 (Uninstall, simulated) and 8 (Chat, simulated) are not built. No
browser click-through test was run (no headless browser is installed); the demo was checked by
unit, flow and honesty tests on its view models and rendered screens, a production build with a
bundle check, and a smoke test of the built page (HTTP 200, app root present).

Tests and checks:
```bash
npm test                                         # all unit tests (core, server, demo UI)
npx tsc --noEmit --noUnusedLocals                # typecheck
npm run typecheck:ui                             # typecheck the demo UI
```

## What is real and what is simulated
| Part | Status |
|---|---|
| Decision engine: which model fits which PC, goals, step plans, skip rules (`core/`) | **Real**, tested |
| Command whitelist, rendering and re-verification of every command | **Real**, tested |
| Plan hash (approval binds to exactly what was shown) | **Real**, tested |
| Manifest and undo logic (uninstall reverses only what SetupPilot changed) | **Real**, tested |
| Executor safety rules and run log (server side, Phase 2 T6-T7) | **Real code**, tested with fakes; not wired to a server yet |
| Tests | 801 unit tests, mutation checks on every task |
| Scanning your PC | **Simulated**: you pick a sample PC |
| Installs, downloads, settings changes | **Simulated**: labelled output, nothing runs |
| Speed | **Simulated**: estimates only, never a measured number |
| The AI's answer | **Simulated**: a fixed sample answer |

**Real execution is gated.** Every program location is marked unconfirmed until it has been
checked on a real Windows machine, and the server refuses to run anything unconfirmed. The
server (HTTP routes, real detection, the runner, Ollama calls) is not built yet.

## Safety (how the real app is designed)
- No AI ever writes a command. A rules engine builds them from a fixed whitelist.
- Nothing runs without your approval; every command is shown and logged.
- Every change is recorded first, so Uninstall can reverse it.
- The server only listens on your own PC (127.0.0.1).

## More
- Demo walkthrough: `docs/DEMO_SCRIPT.md`
- Status, what's left, and what must be verified on a real machine: `docs/STATUS.md`
- How it is built: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`
- How AI was used (and where it got things wrong): `docs/AI_USAGE.md`
