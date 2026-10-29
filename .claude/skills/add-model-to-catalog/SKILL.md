---
name: add-model-to-catalog
description: Add or update a model entry in SetupPilot's data/catalog.json safely - correct Ollama tag, estimated Q4 size, min memory, tier, context options and an honest quality note. Use when asked to add, replace or update a model in the catalog.
---

# Add a model to the catalog

The catalog is data, not code. `core/recommend.ts` reads it; never hardcode models in code.

## Steps
1. Confirm the exact Ollama tag (e.g. `qwen2.5:7b`) on the Ollama library page. Do not
   guess a tag. If you cannot verify it, stop and ask.
2. Fill every field of the `Model` shape in `docs/CONTRACTS.md`:
   - `id`: kebab-case, unique.
   - `tier`: one of the tier ids in `catalog.tiers`.
   - `q4SizeGb`: the download size of the default (Q4) tag. Rounded to 0.1.
     It is an estimate; `sizeIsEstimate` stays `true` unless measured.
   - `minMemoryGb`: `q4SizeGb + catalog.overheadGb` (context + runtime), rounded up to 0.5.
   - `contextOptions`: sizes the model supports and that make sense for its tier
     (bigger context = more memory).
   - `goals`: which goals it suits (`chat`, `code`).
   - `requiresDiscreteGpu`: `true` for models too slow on CPU for a good experience.
   - `qualityNote`: one honest sentence for a beginner. Compare to a familiar thing,
     never claim parity with ChatGPT/Claude. No benchmark numbers unless cited.
   - `license`: short name; flag anything non-commercial.
   - `verified`: `false`. Only a human sets it to `true` after checking the tag and size
     on the Ollama library.
3. Keep the list sorted by `minMemoryGb`. Keep 8-12 models total; remove one if over.
4. If the model is a narrator candidate (1-3B, good at plain rewriting), set
   `roles: ["narrator"]`.
5. Run `npm test`. Recommend tests use mock profiles; if a pick changes, check it is the
   intended change and update the test expectation with a one-line reason.
6. Run the `beginner-reviewer` agent on the new `qualityNote`.
7. Add a line to `docs/DECISIONS.md`: "Added <model> to catalog: <why>".

## Do not
- Do not invent speed numbers. Speed is estimated from tier ranges in `catalog.tiers`.
- Do not add models that need a manual license acceptance flow or a login to download.
