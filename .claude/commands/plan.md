---
description: Plan a phase or module. Produces a plan only, writes no code.
argument-hint: <phase number or module name>
---

Make an implementation plan for: $ARGUMENTS

Do NOT write or edit any code or data files. Read only.

1. Read `CLAUDE.md`, the nested `CLAUDE.md` for the folders involved, `docs/CONTRACTS.md`
   and `docs/ARCHITECTURE.md`.
2. List the files you will create or change (each under ~200 lines, single-purpose).
3. For each file: purpose, exported functions/types, which contract shapes it uses.
4. List the tests you will write (core/ logic) with concrete input -> expected output cases,
   including edge cases: no GPU, unknown VRAM, low free RAM, no internet, no admin.
5. Safety check: which whitelist commands are involved, where approval is enforced, what
   the manifest records, how Uninstall reverses it. Say "none" if none.
6. Contract changes needed (if any) as a diff to `docs/CONTRACTS.md`.
7. Open questions: at most one, the most important one.
8. A numbered task list, one module per task, in build order.

End with: "Waiting for your approval before writing code."
