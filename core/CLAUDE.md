# core/ rules

- Pure functions only. No I/O: no `fs`, `child_process`, `fetch`, `process.env`, timers,
  `Date.now()` or randomness. Pass time or data in as arguments.
- Never import from `server/` or `ui/`. Only import from `core/` and JSON in `data/`.
- Types live in `core/types.ts` and must match `docs/CONTRACTS.md` exactly.
- Every exported function has Vitest tests in `tests/`, including edge cases
  (zero free RAM, no GPU, GPU with unknown VRAM, catalog with one model, empty manifest).
- `commands/whitelist.ts` is the ONLY place a command (exe + args) is defined.
  Arguments come from typed parameters validated against data (e.g. a model tag must
  exist in `data/catalog.json`). No string concatenation of user or AI text into args.
- Thresholds (tiers, margins, overhead) come from `data/catalog.json`. Explain each rule
  in a short comment where it is applied.
- Speed and memory numbers produced here are estimates; their types carry
  `isEstimate: true`.
- A post-edit hook runs the tests after any edit in core/. Fix failures before moving on.
