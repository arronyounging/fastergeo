# bench history

Every polish pass records before/after here. Numbers come from `node bench/run.mjs …`; no numbers, no merge.

## recognition (answers/golden.jsonl · 55 cases: 8 field + 47 crafted)

| date | config | overall | confused P/R | knows P/R | unknown P/R | notes |
|---|---|---|---|---|---|---|
| 2026-08-03 | heuristic only (keyless) | 30.9% | –/0% | –/0% | 100%/17% | zero false positives where it fires; everything undecidable → unverified, as designed |
| 2026-08-03 | judge=glm · prompt v1 (baseline) | 81.8% | 94%/100% | 100%/92% | 60%/100% | 8 gold-unverified (generic/speculation/refusal) misjudged as unknown; 1 unverified→confused FP |
| 2026-08-03 | judge=glm · **prompt v2** (rulebook precedents + temp=0 + invented-quote guard) | **100%** | **100%/100%** | 100%/100% | 100%/100% | evidence verbatim-located 15/15 |
| 2026-08-03 | judge=glm · prompt v2 · repeat×3 | 100% | — | — | — | consistency 54/55 unanimous = **98.2%** (target drift <5% ✓) |
| 2026-08-03 | judge=openai(gpt-4o-mini) · prompt v2 (cross-judge transfer) | 90.9% | 93%/93% | 100%/100% | 80%/100% | small judge model misses rulebook nuances (speculation/refusal→unknown); guidance: use a capable judge model |

**Honest caveat**: 47/55 cases are crafted from the same rulebook the prompt encodes — by design (the
rulebook is the spec), but field cases will keep being added as they arrive; 100% here ≠ 100% in the wild.

## matching (matching/golden.jsonl · 241 cases: 193 pos / 48 neg, spec M1–M5)

| date | config | precision | recall | case-level (incl. count/range asserts) | notes |
|---|---|---|---|---|---|
| 2026-08-04 | baseline (135 cases) | 99.1% | 100% | 134/135 | found real spec split: mentions() lacked the <2-char guard matchRanges has — metrics vs display could disagree |
| 2026-08-04 | unified guard · expanded corpus | **100%** | **100%** | **241/241** | targets (P≥99/R≥95) exceeded; spec decisions codified in matching/RULES.md (M1–M5); field adjacency survey confirmed boundary design |
