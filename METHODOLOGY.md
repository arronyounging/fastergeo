# FasterGEO Methodology

**An open, auditable standard for measuring brand visibility in AI answers.**

Every commercial GEO tool ships a proprietary "visibility score" you cannot inspect,
reproduce, or dispute. This document is the opposite: the complete definition of every
number FasterGEO produces, with the source file that implements it. If a claim here
diverges from the code, the code is the bug — [open an issue](https://github.com/arronyounging/fastergeo/issues).

*中文注：本文档是 FasterGEO 全部指标的公开定义。任何数字都可以追溯到实现代码；这是与黑箱评分的根本区别。*

---

## 1. Principles

1. **Unmeasured is `null`, never zero.** A metric that cannot be computed from the
   available inputs is reported as unmeasured and excluded from aggregates. We never
   substitute a guess, a default, or a zero.
2. **Visibility is a distribution, not a point value.** LLM answers are stochastic.
   A single sample is an anecdote; conclusions require repetition (§3.4) and
   period-over-period confirmation (§8).
3. **Every verdict carries evidence or stays unverified.** A claim that an engine
   "confused" your brand must be supported by a verbatim quote from the answer.
   No quote → `unverified`, not a verdict.
4. **Markets are never averaged.** Chinese engines (Doubao, DeepSeek, GLM, Kimi, Qwen,
   ERNIE, Spark…) and global engines (ChatGPT, Claude, Gemini, Perplexity…) answer from
   different corpora for different users. A blended "global score" is a meaningless
   number; `cn` and `global` are reported side by side, never combined.
5. **Fixes are verified by re-measurement, not by assertion.** A ticket is `done` only
   when its machine-checkable acceptance criteria pass on a fresh crawl or a fresh
   sampling run (§7).

## 2. Terms

| Term | Definition |
|---|---|
| **Sample** | One question sent to one engine at one time, with the full answer text and any citation URLs captured. |
| **Unprompted question** | A question that does **not** contain the brand name (e.g. "best custom merch platforms"). Measures whether the engine volunteers the brand. |
| **Probe question** | A question that **does** contain the brand name (e.g. "what is Custyle?"). Measures whether the engine actually knows the brand. |
| **Engine / provider** | One AI answer engine (`providerId`), tagged with a market: `cn` or `global`. |
| **Period** | One dated measurement run. Trends compare periods (§8). |

**Segregation rule:** probe and unprompted samples are computed in disjoint pools
(`packages/metrics/src/compute.ts`). Mixing them is the single most common way GEO
numbers are inflated — a brand-in-question sample trivially "mentions" the brand.

## 3. Sampling protocol

### 3.1 Question bank
Questions come from a versioned question bank per project, split into unprompted and
probe sets. Protocol rule (operational discipline, not yet enforced in code): hold
questions constant across periods; treat an added question as starting its own
series rather than contaminating existing per-platform series.

### 3.2 Collection
API-reachable engines are sampled via `fastergeo sample`; the responding model is
recorded per sample. Temperature currently follows each engine's default and is
not pinned — pinning it per sample is on the roadmap. Engines without APIs are
sampled manually through the zero-key sample sheet (`fastergeo sheet`) — a human
pastes real app answers; the parser is tolerant but never invents fields.
Importing a sheet **requires** the question bank so probe flags are restored:
without it, `fastergeo import` refuses rather than let probe answers leak into
the visibility pool.

### 3.3 Market separation
Every sample carries its engine's market. All downstream computation groups by
provider and reports `cn` and `global` separately (Principle 4).

### 3.4 Repetition
Because answers are stochastic, one sample per question per engine per period is the
floor, not the goal. Community practice has converged on ≥30 repetitions per question
for stable rates; FasterGEO's pragmatic protocol is:

- **Screening** (is there any signal?): 1 pass per question.
- **Decision-grade** (before/after comparisons, reporting to stakeholders): ≥5
  repetitions per question, and conclusions only under the two-period rule (§8).

Confidence intervals on rates are on the roadmap; until then, small-sample rates are
reported with their `n` so readers can judge stability themselves.

## 4. Visibility metrics

All computed per engine, unprompted pool only (`packages/metrics/src/compute.ts`).
`ratio(a, b)` returns `null` when `b = 0` — never `0`.

| Metric | Definition |
|---|---|
| `mentionRate` | Fraction of unprompted samples whose answer mentions the brand (name or registered alias). |
| `top1Rate` / `top3Rate` | Fraction of unprompted samples where the brand is 1st / within the first 3 **among the brand and registered competitors**, ordered by first-mention position. Unregistered entities do not occupy ranks. An unmentioned brand has no rank — it is **absent from the candidate set**, not "rank ∞". |
| `avgRank` | Mean rank across samples where the brand appeared. `null` if it never appeared. |
| `shareOfVoice` | Brand presence ÷ (brand + tracked-competitor presence), counted **per sample per entity** — each entity counts at most once per answer, however often it is repeated. Only *registered* competitors count; unknown entities are not silently added to the denominator. |
| `ownDomainCiteRate` | Fraction of unprompted samples citing ≥1 URL on the brand's own domains. |
| `citationShare` | Brand-domain citation URLs ÷ all citation URLs across the pool. |
| `competitorMentions` | Raw per-competitor counts, for the SoV breakdown. |

Brand/competitor matching uses exact name + alias matching, not fuzzy matching —
false positives inflate every metric downstream, so precision is preferred to
recall. Latin names match on word boundaries, case-insensitive ("Custyle" does
not hit "Custylex"); CJK names match by substring, since CJK has no word
boundaries — pick CJK aliases that are not substrings of other entity names.
Citation attribution matches by hostname suffix (`custyle.ai` matches
`www.custyle.ai`, never `notcustyle.ai.evil.co`).

## 5. Recognition classification

Probe answers are classified into four verdicts (`packages/metrics/src/recognition.ts`):

| Verdict | Meaning | How it is assigned |
|---|---|---|
| `knows` | Engine correctly describes the brand | LLM judge only, with the brand's actual description as reference |
| `unknown` | Engine admits it doesn't know | High-precision denial patterns (zh + en), deterministic; the judge may also return it |
| `confused` | Engine attributes the brand to a different entity/industry | LLM judge only, **must include a quoted evidence passage** — a confused verdict without one is downgraded to `unverified` (enforced in code) |
| `unverified` | Cannot be determined | The default whenever the above cannot be established, including unparseable judge output |

**Why this exists:** name-echo counting scores every probe as "recognized" — the engine
repeats the name you typed. In our first field run, four engines all scored 100% under
name echo, while in reality one knew the brand, two admitted ignorance, and one
confidently described it as a company in a different industry. Name echo is not
knowledge.

The judge is instructed to default to `unverified` when unsure. A human-readable
`confused` finding always ships with the quoted passage, so it can be disputed.

## 6. Page audit — six dimensions

`fastergeo audit` scores pages 0–100 across six dimensions
(`packages/audit/src/score.ts`). Weights: **crawlability 15 · length 15 ·
structure 20 · blocks 25 · authority 15 · relevance 10**.

Bands are anchored to published empirical citation research, not taste:

- **Length (15):** top-quartile cited pages average ~1,943 words vs ~170 for the
  bottom quartile; long-form (>2,900 words) earns ~5.1 citations vs 3.2 for <800.
  Full score from 1,500 word-equivalents.
- **Blocks (25, the heaviest):** statistics (+61.6%), definitions (+57.3%),
  comparisons (+55.3%), step-by-step content (+41.2%) raise citation probability.
  Current weights: definition 6 · statistics 6 · comparison 5 · steps 5 · FAQ 3.
  FAQ shows a large multiplier in the research but its regex detection is the
  noisiest of the five, hence the conservative weight; tables are extracted but
  not yet scored. Both are candidates for re-weighting as detection improves.
- **Structure (20):** clean single-H1 hierarchy with ≥5 H2 sections correlates with
  ~3.2× citations.
- **Relevance (10):** keyword coverage of the project question bank in title +
  headings — the strongest single citation predictor in the research we anchor to
  (r ≈ 0.432). **Without a question bank this dimension is `null`** and its weight
  is redistributed across measured dimensions — never scored blind.
- **Authority (15):** publish date, author, external references, JSON-LD.
- **Crawlability (15):** HTTP status, `noindex`, canonical, visible text volume, `lang`.

**Blockers override scores.** A page with >50 KB of HTML but <60 visible
word-equivalents is a client-rendered shell: AI crawlers (which do not execute
JavaScript) see an empty page, and no other dimension matters until rendering is
fixed. Blockers are reported first, above any score.

**CJK correctness:** all length thresholds are word-*equivalents*. For CJK-dominant
text, characters are converted at 1.6 chars/word and sentences split on full-width
terminators (`。！？`), so Chinese pages are not systematically punished by
Latin-word counting (`packages/rules/src/utils/cjk.ts`).

## 7. Tickets and machine verification

Findings become tickets with **machine-checkable acceptance criteria** — a small DSL
over re-measurable facts (`packages/tickets/src/verify.ts`): site-level checks
(robots/llms.txt/sitemap), per-page issue thresholds, and metric gates
(`metrics.mention_rate_gte`, `metrics.no_confusion`, …).

- `fastergeo verify` re-crawls / re-reads current measurements and transitions
  tickets `todo → done` only when criteria pass.
- A previously-`done` ticket whose criteria now fail transitions to **`regressed`** —
  fixes are monitored, not archived.
- A criterion that cannot currently be measured leaves the ticket unchanged, with the
  reason stated. Verification never guesses (Principle 1).

Priorities are impact-ordered: P0 = blockers (shells, robots bans, brand confusion);
`llms.txt` is honestly a P2 — adoption by engines is unproven, so we refuse to
market it as a P0 fix.

## 8. Trend discipline

`packages/trends/src/index.ts`, in code, not in a style guide:

- A change between two periods is an **observation**, never a conclusion.
- Only **two consecutive same-direction changes** constitute a **trend**
  (consecutive *measured* periods — unmeasured gaps are skipped, not interpolated).
- Deterministic findings alert immediately regardless (P0): a new engine starting to
  confuse the brand, blocker counts rising — these are facts, not sampled
  distributions. Ticket regressions are raised by `verify` itself at transition
  time (`done → regressed`), not by the trends layer.
- A single-period mention-rate drop >10pp emits a *warning* explicitly labelled as
  observation-level.

## 9. Content and the fabrication gate

Generated content (drafts, llms.txt, JSON-LD) draws exclusively from a per-project
**fact store** where every claim carries an evidence grade
(`packages/content/src/types.ts`):

> **A** first-party reproducible · **B** official statement · **C** authoritative
> third-party · **D** non-authoritative third-party · **E** inference/hearsay —
> **grade E never enters published content.**

Generation excludes grade-E and unconfirmed facts at the source; `fastergeo
fabcheck` then lints drafts for unsourced numbers, superlatives, do-not-claim
phrases, and any grade-E or unconfirmed fact claim that made it into the text
(via human edits or LLM priors) before a human ever reviews them. The tool that
tells you AI engines misrepresent your brand must not itself fabricate claims
about you.

## 10. Known limitations

Stated here because honesty is the product:

1. **Sampling-based monitoring is inherently partial.** Engines personalize,
   A/B-test, and update; no third-party tool observes the full answer distribution.
   Official sources (Google Search Console Gen-AI reports, Bing AI Performance) are
   ground truth for *your own* citations where available — use them alongside this.
2. **Recognition judging depends on the judge model.** Verdicts record their method
   (`heuristic` / `judge`); unparseable judge output, and confusion verdicts
   lacking quoted evidence, resolve to `unverified`.
3. **Audit anchors come from published cross-sectional studies** — correlations, not
   causal guarantees. We cite bands, we do not promise citations.
4. **Alias-exact matching misses creative misspellings.** By design: precision over
   recall (§4).

## 11. Versioning

This methodology is versioned with the repository. Definition changes that alter
computed values get a CHANGELOG entry and a major note here — silent metric
redefinition is the industry disease this document exists to cure.
