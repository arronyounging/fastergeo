<div align="center">

# FasterGEO

**Open-source GEO (Generative Engine Optimization) platform — see how AI engines actually talk about your brand, then fix it with machine-verified tickets.**

The only tool covering both China (Doubao, DeepSeek, GLM, Kimi…) and global (ChatGPT, Claude, Gemini, Perplexity…) AI engines.

English · [简体中文](README.zh-CN.md)

</div>

---

## Why this exists

We ran the first diagnosis on our own site. In 20 minutes, the machine found what humans had missed:

- **Product pages told AI "No products for this category"** — 429KB of HTML, 23 visible words. AI crawlers don't execute JavaScript; every product page was an empty shell.
- **Two engines confused the brand with entirely different companies** — one described it as an auto-parts maker; another confidently fabricated user reviews for a made-to-measure menswear brand of the same name. The LLM judge caught both, with quoted evidence. A human reading the same answers had missed one.
- Unprompted mention rate across four engines: **0%** — while competitors owned every recommendation question.

Most brands are not losing the AI recommendation race — they're not in it: unknown, or worse, mistaken for someone else. That's what the **Brand Entity Funnel** measures:

```
knows you → doesn't confuse you → considers you → ranks you → cites you
```

Monitoring dashboards measure the tail. Most brands break at the head.

## Who is this for

- **Brand owners / marketers** — paste your URL into [the free scan](https://fastergeo.co) and see what AI crawlers see; no technical setup.
- **Developers / technical founders** — `npx fastergeo` runs the full loop on your machine: sampling, funnel metrics, verified tickets.
- **Agencies / consultants** — deliver GEO services clients can verify: diagnosis reports, ticket backlogs, machine-generated verification sheets. See [fastergeo.co/agency](https://fastergeo.co/agency/).

## Quickstart

```bash
# 1. Bootstrap a project from your site (facts, competitors, question bank)
npx fastergeo bootstrap --root https://yoursite.com --llm glm

# 2. See what AI crawlers see (no API key needed)
npx fastergeo audit --root https://yoursite.com --urls /,/about,/pricing

# 3. Sample AI answers (any keys you have; none = manual sheets)
npx fastergeo sample --question "best tools for X?" --providers openai,deepseek
npx fastergeo sheet --questions questions.json    # zero-key path

# 4. Metrics with recognition-quality judging
npx fastergeo metrics --samples samples.jsonl --brand brand.json --judge glm

# 5. Tickets with machine-verifiable acceptance — verify after you fix
npx fastergeo plan   --root https://yoursite.com --out tickets.json
npx fastergeo verify --tickets tickets.json --root https://yoursite.com

# 6. One-file HTML report
npx fastergeo report --root https://yoursite.com --out report.html
```

Every command works standalone. Data is plain JSON on your machine — `git init` is your backup strategy.

## What makes it different

| | Monitoring SaaS | FasterGEO |
|---|---|---|
| China engines (Doubao, GLM, Kimi…) | ✗ | ✓ API + manual sheets (UI automation on the roadmap) |
| Recognition quality | name-echo counting | **knows / unknown / confused** with quoted evidence; confusion = P0 alert |
| Action loop | suggestions | tickets → re-crawl → **auto-verified** done / regressed |
| Content generation | free-form drafts | facts-constrained drafts gated by a **fabrication lint** — every number must trace to a sourced fact |
| Metric integrity | black box | reproducible: unmeasured renders as *unmeasured*, never fabricated zeros; single-period changes are observations — only two consecutive same-direction changes count as a trend |
| Your data | vendor cloud | your disk |
| Price | $99–5,000/mo | free, self-hosted — bring your own API keys, or none |

Migrating from GeoLook? `fastergeo metrics --format geolook` re-scores your existing samples directly.

## The 18 engines

| Market | API sampling | Manual sheets |
|---|---|---|
| 🇨🇳 China | GLM · Doubao (Ark) · DeepSeek · Kimi · MiniMax · Qwen 通义 · ERNIE 文心 · Spark 星火 | 纳米AI · 百度AI |
| 🌍 Global | ChatGPT · Claude · Gemini · Grok · Perplexity | ChatGPT web · Claude web · Google AI Overviews |

`fastergeo check` diagnoses every key — *no key / auth failed / **authenticated-but-model-not-enabled** / network* — each with an actionable hint. `HTTPS_PROXY` honored (`NO_PROXY` for domestic endpoints).

## Principles

1. **Never invent.** Facts are extracted from your site with source URLs, or marked unconfirmed. Bootstrap returns an *empty* competitor list rather than guessing. Drafts fail the gate if a number can't be traced.
2. **Verification is the product.** A ticket is done when a re-crawl proves it — and flips back to regressed when the fix rots.
3. **Humble attribution.** Sampling AI answers is noisy. The two-period rule is enforced in code, not footnotes.
4. **CJK is first-class.** Word-equivalent counting, full-width sentence handling, Chinese segmentation, zh-calibrated thresholds — Latin-only text metrics silently break on Chinese content; ours don't.

## Architecture

Monorepo of nine packages, each usable standalone: `rules` (100+ deterministic lint rules with agent-fixable suggestions, forked from [geo-lint](https://github.com/IJONIS/geo-lint) with CJK support) · `providers` (18-engine adapters + key health checks) · `metrics` (funnel metrics + LLM recognition judge + manual sheets) · `audit` (six-dimension scoring, evidence-anchored) · `tickets` (acceptance DSL + verification) · `content` (fact store + fabrication gate + bootstrap) · `trends` (period history + attribution discipline) · `report` (self-contained HTML) · `cli`

```bash
pnpm install && pnpm -r build && pnpm -r test   # 578 tests
```

## License

Apache-2.0. Vendored code retains its original license — see NOTICE files. Built on the shoulders of the GEO research community: Princeton's GEO paper (KDD '24), the CN-GEO citation corpus, and the open-source projects credited in our design docs.
