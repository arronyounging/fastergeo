# bench — effect measurement

Unit tests (677) prove the code runs as designed. This directory proves the design reaches
**correct conclusions**, against golden corpora with human-adjudicated labels.

Rules:
- Every polish PR attaches before/after numbers here; no numbers, no merge (`HISTORY.md`).
- Golden labels follow `answers/RULEBOOK.md`; edge-case decisions are appended there as precedent
  so a second annotator can reproduce every label.
- Corpora mix **field data** (`source: field-*`, real engine answers with provenance) and
  **crafted cases** (`source: crafted`, hand-written adversarial edges — clearly marked, never
  passed off as field data).

Run:

```bash
node bench/run.mjs recognition                 # heuristic layer only, keyless
node bench/run.mjs recognition --judge glm     # full pipeline (uses ZHIPUAI_API_KEY etc.)
node bench/run.mjs recognition --judge glm --repeat 3   # + consistency
node bench/run.mjs matching                    # 241 cases, deterministic, keyless
node bench/run.mjs pages --fuzz 300            # 26 labeled snapshots + seeded mutation fuzz
node bench/run.mjs engines --providers glm,openai --reps 10   # live engine profiling
node bench/run.mjs tickets --lang zh --judge glm              # ticket executability proxy blind-test
```

Suites:
- `recognition` — answers/golden.jsonl (55 cases), judge P/R + evidence location + consistency
- `matching` — matching/golden.jsonl (241 cases), spec M1–M5
- `pages` — pages/labels.json (26 snapshots) + seeded fuzz, blocker/issue accuracy
- `engines` — engines/questions.json ×N reps, success/latency/citation-by-intent → PROFILES.md
- `tickets` — executability proxy blind-test: a judge role-plays a non-GEO engineer who owns the
  site (knows their own stack/brand/codebase, sees the whole ticket list) and scores each ticket
  0–2; the target is ≥80% "executable without questions" (score 2). The rubric counts only
  information the ticket should have provided as a question — writing your own copy or picking
  your own data is execution work, not a question. This is a PROXY for the human blind test
  (which needs a real engineer); rubric precedents live in the bench script.

- `report` — 60-second comprehension proxy: 5 reader personas × 3 scenarios scan a text-extract
  of the rendered report (char budget ≈ one minute of reading) and must name the right first fix;
  scored by scenario keyword match. `--budget N` tightens the scan window, `--nocard 1` ablates
  the fix-first card.

Planned: catalogs, logs, official-csv — see 产品力打磨计划.
