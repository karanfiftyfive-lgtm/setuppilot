# SetupPilot

**A private AI on your PC: no token limits, no monthly bill, works offline.**
Honest version: local models are smaller than ChatGPT or Claude, and speed depends on your
PC. SetupPilot tells you which model your PC can run well, measures the real speed, and
shows you every step before it happens.

## What it does
1. You pick a goal: chat and write, help me code, use it from my other devices, or everything.
2. It scans your PC (graphics card, memory, disk, internet, admin rights).
3. It shows a plan: every step and the exact command, with "what changes on your PC".
4. You click **Approve all** (or approve step by step). It installs Ollama, downloads the
   right model, sets safe defaults, and optionally connects a coding tool or Tailscale.
5. It runs a real test prompt and shows the measured speed. Then you chat.
6. Later: **Re-analyze** after a hardware upgrade, or **Uninstall** everything it changed.

## Safety
- No AI writes shell commands. A rules engine builds them from a fixed whitelist.
- Nothing runs without your approval. Every command is shown and logged.
- Every change is recorded, so Uninstall can reverse it.
- The server only listens on your own PC (127.0.0.1).

## Run it
> Phase 0: context files only. App code arrives in Phases 1-3.

```bash
npm install
npm test                                   # unit tests for core logic
DEMO_MODE=1 DEMO_PROFILE=mid-pc npm run dev  # full flow, simulated commands
npm run dev                                # real mode (Windows)
```
Demo profiles: `weak-laptop`, `mid-pc`, `gpu-rig`, `upgraded-pc` in `data/mock-profiles/`.

## For judges
- Demo walkthrough: `docs/DEMO_SCRIPT.md`
- How it is built: `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`
- How AI was used (and where it got things wrong): `docs/AI_USAGE.md`
