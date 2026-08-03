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
```

Suites: `recognition` (answers/golden.jsonl, 55 cases). Planned: matching, audit-pages, robots,
catalogs, logs, official-csv — see 产品力打磨计划.
