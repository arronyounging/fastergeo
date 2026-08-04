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

## pages (pages/labels.json · 26 snapshots: 17 fetched real sites + 8 crafted pathologies + 1 real 403, gz in repo)

| date | config | labels pass | blocker accuracy | fuzz | notes |
|---|---|---|---|---|---|
| 2026-08-04 | baseline | 24/26 | 25/26 | 300/300 survive | two planted gaps confirmed: meta robots "none" missed as noindex; 559B page mislabeled 'spa-shell' instead of 'thin-text' |
| 2026-08-04 | fixed (robots-none, issue-code split, htmlBytes→true bytes) | **26/26** | **26/26** | **300/300** | labels adjudicated from independent html.parser measurement, never from the tool under test; splitter consolidated into rules/text (sentiment gains decimal safety) |


## engines (engines/questions.json · standard set ×10 reps · live keys: glm/doubao/deepseek/openai)

| date | engine · mode | success | p50 / p95 | citation rate | notes |
|---|---|---|---|---|---|
| 2026-08-04 | deepseek · chat | 50/50 | 16.2s / 31.6s | 0% | no retrieval by implementation |
| 2026-08-04 | openai · chat | 50/50 | 5.8s / 9.8s | 0% | |
| 2026-08-04 | openai · grounded (OPENAI_WEB_SEARCH=1) | 50/50 | 6.3s / 13.3s | **62%** | intent split: recommendation/recency/stat 10/10 · definition 1/10 · howto 0/10 — the two-games thesis, measured |
| 2026-08-04 | glm(gateway, glm-5-2) · chat | 50/50 | 70.2s / 102.5s | 0% | reasoning-heavy tier |
| 2026-08-04 | doubao(2.0-pro) · grounded-try | 50/50 | 75.2s / 107.6s | 0% | grounded silently degraded on this console/model — ops note recorded |

Failure rate across 250 live calls (retry policy active): **0/250 = 0%** (target <2% ✓).

## tickets (executability proxy blind-test · fixture triggers all 21 ticket sources · judge role-plays a non-GEO engineer)

Method: judge scores each ticket 0–2 (2 = executable without asking the issuer anything). Rubric
counts only information the ticket should have provided; writing your own copy / picking your own
data / knowing your own stack is execution work, not a question. Proxy for the human blind test —
human validation pending (custyle.ai end-to-end, Pass 10).

| date | change | judge | zh score-2 | en score-2 | note |
|---|---|---|---|---|---|
| 2026-08-04 | baseline: no fixHint, no pages field | gpt-4o-mini | **0%** (12×1 · 9×0) | — | every complaint = "which file / what content / how verified" |
| 2026-08-04 | + fixHint (all 21 sources, builder branches, snippets) + pages URLs + real brand/domain substitution + rubric v2 precedents | gpt-4o-mini | 33% | 43% | unreliable judge: complained about missing page lists that were present in the ticket — consistent with Pass 1 finding (weak judge misreads) |
| 2026-08-04 | same | glm-5-2 | **100%** (21/21) | **100%** (21/21) | capable judge |
| 2026-08-04 | same + competitor-fallback line + realistic fixture domain | deepseek | **95%** (19/20) | **95%** (18/19) | second capable judge; errors = transient JSON failures, excluded |
| 2026-08-04 | ablation: hints stripped, same judge + rubric | glm-5-2 | 71% | — | lift attributable to hints: 71→100 |
| 2026-08-04 | ablation: hints stripped, same judge + rubric | deepseek | 39% | — | 39→95 |

Target ≥80% score-2 under a capable judge: **met** (glm 100/100, deepseek 95/95). Residual score-1s
are organizational asks (who owns encyclopedia-profile creation) that a ticket cannot answer.
Shipped: `fixHint` + `pages` fields on Ticket, per-code fix-manual fragments (en+zh, builder
branches for Next.js/Nuxt/WordPress/Shopify/static, copy-pasteable JSON-LD/robots snippets),
real brand/domain/competitor substitution, empirically-weighted impact ordering within priority,
rendering in CLI (`plan`) and HTML report (collapsible "how to fix" per ticket).
