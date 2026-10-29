# server/ rules

- Express binds to `127.0.0.1` only. Never `0.0.0.0`. Reject requests whose Host header is
  not localhost (blocks DNS-rebinding from web pages).
- `runner.ts` is the only module that spawns processes. It accepts a whitelist command id +
  typed params, never a raw string. Use `spawn` with an args array and `shell: false`.
- A command runs only if the request carries an approval id that the UI got after showing
  that exact command (or the full list for "Approve all"). No approval, no run.
- Before running a command that changes the PC, write the intended change to the manifest;
  mark it done or failed afterwards. Uninstall reads only the manifest.
- Log every command, its exit code and output to `~/.setuppilot/logs/<date>.log`.
- Map failures to plain-language error codes (`NO_INTERNET`, `NO_WINGET`, `NO_ADMIN`,
  `LOW_DISK`, `DOWNLOAD_INTERRUPTED`, ...) defined in `docs/CONTRACTS.md`. The UI owns the
  wording; never send raw stack traces as user text.
- `DEMO_MODE=1`: the runner simulates every command (fake progress + output) and detection
  reads `data/mock-profiles/*.json`. Same code paths otherwise.
- OS-specific code lives behind the interface in `detect/index.ts`. Windows first.
  Windows WMI can under-report VRAM above 4 GB: prefer `nvidia-smi` for NVIDIA, and accept
  a manual VRAM override from the UI.
- The narrator model has no tools. Its output is display text only; never parse it into
  commands, file paths or decisions.
- Files are written only to paths decided in core/ and recorded in the manifest. Back up
  any existing file before overwriting it.
