# 3-minute demo script

## Current build: browser demo (ui/, no server)
Start: `npm run demo:build && npm run demo:preview`, open http://127.0.0.1:4173. Works offline.

**Pitch (one sentence):** "SetupPilot sets up a private AI on your own PC for people who know
nothing about AI: you pick a goal and approve, it does the rest and tells you the truth about
what your PC can do."

| Time | Screen | Say | Click |
|---|---|---|---|
| 0:00 | Welcome | Read the pitch. Point at the honest limit: smaller than ChatGPT or Claude, speed depends on the PC. Point at "Demo mode: simulated". | Start |
| 0:20 | Goal | "The user only says what they want." | "Chat and write", Next |
| 0:30 | Your PC | Sample PC "Older laptop": 8 GB memory, built-in graphics. "It picks a small model that runs well here, says why, and the speed is an estimate word, not a made-up number." Tap a dotted word (e.g. "RAM") for its meaning. Point at "What would unlock a bigger AI". | Next |
| 1:00 | Setup plan | "Every step: what, why, what changes on your PC. Technical details shows the exact command, built from a fixed list, never by an AI." Expand one. "Speed boost: Your PC doesn't need this." | Show technical details, then Approve all |
| 1:30 | Setup runs | Steps tick to "Done (simulated)" one by one; the progress map uses words and symbols, not just colour. "Required steps can't be skipped; skipped steps always say why." | Next |
| 1:50 | Test | "The real app measures the speed after setup. Here it says plainly: simulated, not measured." | Ask (simulated), Next |
| 2:05 | My PC changed | "After an upgrade (RAM 8 to 32 GB, new graphics card), it checks again." Show the ladder: bigger models that fit now, gains labelled estimate, old model kept as rollback. | My PC changed: check again |
| 2:40 | End | **Safety:** "No AI ever writes a command; commands come from a fixed whitelist; nothing runs without your OK; every change is recorded so it can be undone. In this demo nothing runs at all." | |

Backup: start on `npm run demo` (dev server) if the build is missing.

## Older plan (full app with server, not built yet)
Run in demo mode so nothing depends on venue Wi-Fi or hardware:
`DEMO_MODE=1 DEMO_PROFILE=weak-laptop npm run dev`, browser at the printed localhost address.
Backup: the screen recording in `docs/demo-recording.mp4` (made in Phase 4).

Main flow: **weak-laptop -> re-analyze -> upgraded-pc**. It shows the honest "small AI"
path first, then what an upgrade unlocks.

| Time | Screen | Say | Click |
|---|---|---|---|
| 0:00 | Welcome | "Most people can't set up local AI. SetupPilot does it for them: private, no monthly bill, works offline. And it's honest: these models are smaller than ChatGPT." | Start |
| 0:20 | Goal | "The user only says what they want." | "Chat and write" |
| 0:30 | Scan | "It checks the PC and explains it in plain words. This laptop has little free memory and no graphics card. Hover any word for a one-line meaning." | hover "RAM" tip, Next |
| 0:45 | Weak-PC card | "It tells the truth: a small, quick AI now, or connect to a stronger computer you own, or upgrade later." | "Small AI now" |
| 0:55 | Plan | "Every step and every exact command, before anything runs. Speed boost says 'Your PC doesn't need this'." | expand one "technical details", then Approve all |
| 1:20 | Setup | "Each card says what, why and what changes on your PC. Windows will ask permission here; the app warns first." | none (watch) |
| 1:35 | Setup error | Show simulated "Download interrupted" -> plain message + Retry. | Retry |
| 1:50 | Test | "A real prompt. Speed is measured, not promised." (demo mode labels it "demo, not measured") | none |
| 2:05 | Re-analyze | Switch profile to `upgraded-pc`: "RAM 8 -> 32 GB, new graphics card 12 GB". Ladder: three bigger tiers now fit, gains labelled estimate, old model kept as rollback. | show ladder |
| 2:30 | Uninstall | "Everything it changed is in a manifest. It undoes only what it did, keeps what you already had, and moves your own edits to a backup instead of deleting them." | show plan |
| 2:50 | End | "Safety: AI never writes commands; whitelist only; nothing runs without your OK." | |

## Optional segment (20 s, cut if over time): speed boost on big-gpu-rig
Insert after Re-analyze. Switch profile to `big-gpu-rig` (24 GB graphics card).
- Say: "Step 7 only appears when the graphics card has real spare memory. On the 12 GB PC
  it said 'not offered'; here the 27B model leaves room, so it's offered as optional."
- The step card shows **"Demo mode: simulated"**. The real llama.cpp path is not yet
  verified on a machine, so never present it as tested.

## Real-install checklist (human, on a test machine; record results in AI_USAGE.md)
Run in real mode (`SETUPPILOT_MODE=real`). Write down the exact output or exit code for each
line; nothing here is assumed. Completed in Phase 2 docs (T19); these are already required:
- [ ] `whoami /groups /fo csv /nh` as an **admin account, not elevated**: is
      `S-1-5-32-544` (Administrators) listed, and with which attributes?
- [ ] The same as a **standard (non-admin) account**: is S-1-5-32-544 absent?
- [ ] `pnputil /enum-devices /class Display` from a **normal (not elevated)** window: does
      it list the graphics cards, or ask for admin / fail? Exit code?
- [ ] `winget list --id Ollama.Ollama -e --accept-source-agreements --disable-interactivity`
      when Ollama is **not** installed: exit code and output.
- [ ] `reg query HKCU\Environment`: confirm the listing format (one `NAME  REG_SZ  value`
      line per variable). Do not paste the output anywhere: it holds your environment variables.
- [ ] Cancel a running `winget install` from the app: does `taskkill /pid N /t /f` end the
      installer, including the elevated (UAC) part? Does the app then say the step stopped,
      or "it may still be running" (killConfirmed false)? Check Task Manager either way.
- [ ] (T6) Start any winget command from the app in real mode, with winget's `confirmed` path
      pointing at `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe`: does spawning that App
      Installer alias with `shell: false` work, or fail to start (spawnError)?
- [ ] (T6) Console output encoding: run `whoami /groups /fo csv /nh`, `reg query
      HKCU\Environment` and `winget list ...` from the app on a PC with a non-English Windows
      display language (or a user name with an accented letter): are the lines readable in the
      log, or garbled (OEM code page instead of UTF-8)? Don't paste the reg output anywhere.
- [ ] (T6) Child environment allowlist (D46): with the allowlist only, do `winget install`,
      `ollama pull` and `setx` all work? If one fails, note the error; the missing variable is
      added by name. Also test behind a proxy if you have one (HTTPS_PROXY set).
- [ ] OpenCode (D32): after the config is written, open OpenCode and confirm it lists the
      provider "Ollama on this PC (set up by SetupPilot)" and the chosen model. Note the
      OpenCode version, and whether it warns that `provider` is deprecated.

## Pre-demo checklist
- `/demo-check` all PASS.
- Every `ollamaTag` and `q4SizeGb` in `data/catalog.json` checked by hand against the
  Ollama library; set `verified: true` on each entry checked (fix any wrong tag/size).
- Step 7 card shows "Demo mode: simulated" on big-gpu-rig.
- Browser zoom 125%, notifications off, laptop on power.
- Recording ready as a fallback.
