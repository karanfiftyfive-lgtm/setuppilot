# ui/ rules

- Plain language for someone who has never used AI tools. Short sentences, no jargon.
  Any technical word (GPU, RAM, model, token...) must be wrapped in `<GlossaryTip>` using
  `data/glossary.json`, or replaced with an everyday word.
- Lead with outcomes ("You can chat privately, even offline"), not technology.
- Every number shown before the test run carries the word "estimate". After the test,
  show the measured speed and say it was measured on this PC.
- Never write "unlimited" without the caveat: smaller than ChatGPT/Claude, speed depends
  on this PC.
- Every step uses `StepCard`: what I'm doing / why it matters / what changes on your PC /
  "Show technical details" (exact command) / Approve + Skip / status icon.
  Required steps: Skip is disabled and the card says why.
- Before a Windows permission prompt, warn: "Windows will ask permission. Click Yes. That's me."
- Errors go through `ErrorRescue`: what happened, what to do, Retry button. No stack traces.
- The UI never builds commands. It displays what the server returns and sends approvals.
- Accessible: real buttons, visible focus, text contrast AA, works at 400px wide.
- Keep components under ~200 lines; pages compose components, no business logic in pages.
- Run the `beginner-reviewer` agent on any new user-facing copy.
