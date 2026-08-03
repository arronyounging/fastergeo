# The FasterGEO Handbook

> For `fastergeo@0.10.x`. Every command, flag, file format and environment variable in this handbook is checked against the source; where this document and the code disagree, the code is the fact — [open an issue](https://github.com/arronyounging/fastergeo/issues).
>
> Three audiences: **brand owners / marketers** (read §1, §2, §9, §12), **developers / technical founders** (everything), **agencies / consultants** (§8.3 workflows + §9 report reading).

## Contents

1. [What this is, what it solves](#1-what-this-is-what-it-solves)
2. [Concepts](#2-concepts)
3. [Architecture & data flow](#3-architecture--data-flow)
4. [Installation & environment](#4-installation--environment)
5. [Five-minute start](#5-five-minute-start)
6. [Command reference (all 24)](#6-command-reference)
7. [Data file formats](#7-data-file-formats)
8. [Workflows](#8-workflows)
9. [Reading the report & dashboard](#9-reading-the-report--dashboard)
10. [MCP: for agents](#10-mcp-for-agents)
11. [Web tools & edge APIs](#11-web-tools--edge-apis)
12. [Metric definitions & the seven disciplines](#12-metric-definitions--the-seven-disciplines)
13. [Troubleshooting](#13-troubleshooting)
14. [FAQ, versioning, license](#14-faq-versioning-license)

---

## 1. What this is, what it solves

**One sentence**: FasterGEO is an open-source GEO (Generative Engine Optimization) platform — see what 18 Chinese and global AI engines actually say about your brand, then turn every gap into a machine-verified fix, with verbatim quotes behind every claim.

**It answers a customer's five questions** (the five questions *are* the product's table of contents):

| # | The question | The capability behind it |
|---|---|---|
| 1 | Does AI know me? | Probe sampling + LLM-judged recognition |
| 2 | Does it confuse me with someone else? | Confusion detection (P0, verbatim evidence) |
| 3 | Does it recommend me — or my competitor? | Unprompted mention rate / SoV / rank / sentiment |
| 4 | What's broken, and how do I fix it? | Six-dimension audit + blockers + tickets + earned-media target list |
| 5 | How do I prove the fix worked? | Machine-verified acceptance + regression reopening + period deltas |

**Versus monitoring tools**: monitoring tells you a score (and is being commoditized by official GSC/Bing AI reports and $50/mo products). FasterGEO sells the loop — `detect → diagnose → ticket → fact-constrained content → gated publish → re-crawl verify → regression reopen` — every step machine-checkable, methods in the open.

**Form factors**: CLI (24 commands) + local dashboard + single-file HTML report + MCP server (9 tools) + free web tools. Apache-2.0, self-hosted; your data is plain JSON on your disk — `git init` is your backup strategy.

## 2. Concepts

**Sample** — one record of «question → engine → full answer + citation URLs». The atomic unit of the whole system.

**Probe vs unprompted** — questions that name the brand are probes (they measure *recognition*); questions that don't are unprompted (they measure *whether AI volunteers you*). The two pools are **computed separately, always** — mixing them is the number-one way GEO figures get inflated.

**Market (`cn` / `global`)** — every engine and question carries a market tag. China and global are **never averaged**: Doubao and ChatGPT answer from different corpora for different users; a blended score is a meaningless number.

**Brand Entity Funnel (the five questions)** — knows you → doesn't confuse you → mentions you → ranks you → cites you. Most brands break at the head; most tools only measure the tail.

**Recognition verdicts** — `knows` (judge-only) / `unknown` (deterministic denial patterns) / `confused` (judge-only, **must carry a verbatim quote or it is downgraded**) / `unverified` (cannot be determined — never guessed). Name echo is not knowledge.

**Sentiment verdicts** — mentions classify as `positive / neutral / negative / unverified`. Negative patterns are tested only on sentences that mention the brand (competitor negativity never counts against you); negative requires quoted evidence.

**Visibility metrics** — mentionRate, top1/top3Rate (ranked among brand + *registered* competitors only), avgRank, shareOfVoice (per sample per entity, max once), ownDomainCiteRate / citationShare, plus earlyMentionRate (share of mentions landing in the answer's first 30% — PAWC-lite).

**Wilson intervals** — a rate is a sampled estimate. 0/14 renders as "0% (95% CI 0–22%)", never "certainly zero".

**Six-dimension audit** — crawlability 15 / length 15 / structure 20 / extractable blocks 25 / authority 15 / relevance 10, bands anchored to published citation research. Fetching executes **no JavaScript** — that's the AI-crawler view, by design. No question bank → relevance is null and its weight redistributes; never scored blind.

**Blockers** — problems that void everything else: SPA shells (>50 KB HTML, <60 visible word-equivalents), noindex, blocked *search-serving* AI crawlers.

**Crawler purposes** — blocking training-only crawlers (GPTBot, CCBot, Google-Extended…) is a legitimate policy choice (noted); blocking search-serving crawlers (OAI-SearchBot, PerplexityBot, ChatGPT-User) removes you from AI answers (blocker).

**Tickets & the acceptance DSL** — findings become prioritized tickets, each with a machine-checkable acceptance criterion where possible. `verify` re-measures: pass → done; a previously-done criterion failing again → **regressed**. Unmeasurable leaves the ticket unchanged, with the reason stated.

**Fact store & evidence grades** — the brand's single source of truth. Every fact carries grade A–E (A first-party reproducible / B official statement / C authoritative third-party / D non-authoritative / E inference-hearsay). E and unconfirmed facts never enter generation.

**Fabrication gate** — every number in a draft must trace to a stored fact; unbacked superlatives, do-not-claim phrases and grade-E claims are hard failures. `publish` runs the gate before any network call; `--force` overrides but is recorded.

**Two-period rule** — a single-period change is an observation; only two consecutive same-direction changes make a trend. Deterministic findings (new confusion, blockers rising) alert immediately regardless.

**Citation-source analysis** — aggregate the citation URLs already in your samples into a per-market "who AI trusts in your category" list. ~84% of AI citations are earned media (Muck Rack) — that list is your PR target list.

## 3. Architecture & data flow

### 3.1 Fourteen packages (each usable standalone)

| Package | Role |
|---|---|
| `@fastergeo/rules` | 100+ deterministic content rules (geo-lint fork, full CJK); workers-safe `/text` subpath |
| `@fastergeo/providers` | 18-engine registry, three wire protocols, key health checks, proxy support |
| `@fastergeo/metrics` | funnel metrics + recognition & sentiment judges + Wilson intervals + citation sources + manual sheets + GeoLook adapter |
| `@fastergeo/audit` | six-dimension scoring, site checks, purpose-aware crawler verdicts, entity extraction, failedUrls |
| `@fastergeo/tickets` | ticket generation (incl. off-site & entity tickets) + acceptance DSL |
| `@fastergeo/content` | fact store, fabrication gate, outline/draft prompts, bootstrap, suggest mining |
| `@fastergeo/trends` | period history, two-period rule, immediate P0 alerts |
| `@fastergeo/report` | self-contained HTML report (funnel / engines / audit / tickets / sources / answer replay) |
| `@fastergeo/botlog` | access-log analytics: 19 AI crawler UAs by purpose + 12 AI referral surfaces |
| `@fastergeo/publish` | WordPress / GitHub / signed-webhook connectors behind the mandatory gate |
| `@fastergeo/officialdata` | GSC / Bing official CSV parsing & reconciliation |
| `@fastergeo/commerce` | catalog ingest, buying-intent questions, product-level metrics (wrong-price detection) |
| `@fastergeo/mcp` | MCP server, 9 tools |
| `fastergeo` (CLI) | 24 commands + local dashboard |

### 3.2 Data flow

```
your site ──bootstrap──▶ brand.json / facts.json / questions.json
                                  │
    ┌─────────────────────────────┼──────────────────────────────┐
    ▼                             ▼                              ▼
 audit (six dimensions)   sample/cycle (engine APIs)     sheet/import (zero-key)
    │                             │                              │
    ▼                             ▼──────────────────────────────┘
 SiteAudit ─────────────▶ samples.jsonl ──metrics──▶ MetricsReport (funnel+sentiment+sources)
    │                                                      │
    └────────────── plan (ticket generation) ◀─────────────┘
                             │
                      tickets.json ──verify (re-measure)──▶ done / regressed
                             │
  outline/draft ──fabcheck──▶ clean draft ──publish (gated)──▶ WP / GitHub / webhook
                             │
       history/ ◀── per-period metrics/audit/samples ──▶ trends / ui / report
```

**Files are the database.** A project is a directory: `brand.json`, `questions.json`, `facts.json`, `tickets.json`, `samples-DATE.jsonl`, `history/`, `report-DATE.html`. No hidden state, no cloud.

## 4. Installation & environment

### 4.1 Requirements

Node.js ≥ 20 (macOS / Linux). Zero-install: `npx fastergeo <command>`, or `npm i -g fastergeo`.

### 4.2 Engine keys (all 18)

Convention: `${ID}_API_KEY` unless the registry names otherwise (table below is authoritative). Override model / endpoint with `${ID}_MODEL` / `${ID}_BASE_URL` — a changed base URL is honestly labeled `channel: gateway` on every sample.

| Engine id | Market | Key env var | Default model | Notes |
|---|---|---|---|---|
| `glm` | cn | `ZHIPUAI_API_KEY` | glm-4-flash | Zhipu |
| `doubao` | cn | `ARK_API_KEY` | doubao-seed-1-6-250615 | Volcengine Ark; web search |
| `deepseek` | cn | `DEEPSEEK_API_KEY` | deepseek-chat | |
| `kimi` | cn | `MOONSHOT_API_KEY` | kimi-k2-0905-preview | |
| `minimax` | cn | `MINIMAX_API_KEY` | MiniMax-M2 | |
| `qwen` | cn | `DASHSCOPE_API_KEY` | qwen-plus | Alibaba DashScope |
| `ernie` | cn | `QIANFAN_API_KEY` | ernie-4.0-turbo-8k | Baidu Qianfan v2 |
| `spark` | cn | `SPARK_API_KEY` | generalv3.5 | iFlytek |
| `nano` / `baidu-ai` | cn | — (manual sheets) | — | no public API |
| `openai` | global | `OPENAI_API_KEY` | gpt-4o-mini | |
| `anthropic` | global | `ANTHROPIC_API_KEY` | claude-haiku-4-5 | |
| `gemini` | global | `GEMINI_API_KEY` | gemini-2.0-flash | |
| `grok` | global | `XAI_API_KEY` | grok-3-mini | |
| `perplexity` | global | `PERPLEXITY_API_KEY` | sonar | citations |
| ChatGPT web / Claude web / AI Overviews | global | — (manual sheets) | — | |

Then run `fastergeo check`: it distinguishes *no key / auth failed / **authenticated-but-model-not-enabled** / network error*, each with an actionable hint.

### 4.3 Language & proxy

- **UI language**: English by default; `--lang zh` or `FASTERGEO_LANG=zh` switches reports, ticket copy, CLI output and the dashboard to Chinese. AI evidence quotes are never translated.
- **Proxy**: the CLI and MCP entrypoints honor `HTTPS_PROXY` / `HTTP_PROXY` (Node's fetch ignores them natively; we install a dispatcher). Exclude direct-reachable endpoints with `NO_PROXY`, e.g. `NO_PROXY=ark.cn-beijing.volces.com,dashscope.aliyuncs.com`.

## 5. Five-minute start

```bash
# 1. Bootstrap a project from your site (facts, competitors, question bank —
#    anything underivable is marked unconfirmed, never invented)
npx fastergeo bootstrap --root https://yoursite.com --llm glm --out myproject
cd myproject

# 2. Audit: what AI crawlers see (no keys needed)
npx fastergeo audit --root https://yoursite.com --urls /,/about,/pricing

# 3. Sample (any keys you have; none → §5.1)
npx fastergeo sample --question "best tools for X?" --market global

# 4. One command for a full period: sample → metrics → audit → tickets/verify → report
npx fastergeo cycle --dir . --judge glm

# 5. Local dashboard
npx fastergeo ui --dir .
```

Outputs: `report-DATE.html` (a single file you can send to anyone), `tickets.json` (work through it), `history/`. After fixing, run `npx fastergeo verify --tickets tickets.json --root https://yoursite.com` and watch the machine flip tickets to done.

### 5.1 The zero-key path

```bash
npx fastergeo sheet --questions questions.json --brand brand.json --out sheet.md
# paste questions into engine apps by hand; paste answers back into sheet.md
npx fastergeo import --file sheet.md --questions questions.json --out samples-manual.jsonl
npx fastergeo metrics --samples samples-manual.jsonl --brand brand.json
```

Note: `import` **requires** `--questions` — without the bank, probe flags can't be restored and probe answers would leak into the visibility pool. It refuses rather than fabricate.

## 6. Command reference

All commands accept `--lang zh`; most accept `--json`. `--history <dir>` on metrics/audit/report archives the period for trends and the dashboard.

### 6.1 Measurement

**`check [--providers a,b]`** — key health for every engine; four-state diagnosis with hints. Run this first.

**`sample --question "..." [--providers a,b] [--market cn|global] [--json]`** — one-off sampling, prints each engine's answer + citations. For feel and debugging; use `cycle` for real collection.

**`metrics --samples f.jsonl --brand brand.json [--format geolook] [--judge <engine>] [--json] [--history dir]`** — samples → the full metric set. `--judge` enables the LLM judges for recognition *and* sentiment (without it, undecidable stays `unverified`). `--format geolook` reads GeoLook exports directly. Output includes the five-piece set, earlyMentionRate, sentiment (+ negative evidence), recognition (+ confusion evidence), and the **cited-sources top list**.

**`audit --root <url> [--urls /a,/b] [--json] [--history dir]`** — six-dimension audit + site checks: robots/sitemap/llms.txt, search-crawler blocks (blocker) vs training opt-outs (note), per-page scores and issue codes, entity wiring (Organization + sameAs), unreachable pages named in `failedUrls`.

**`sources --samples f.jsonl --brand brand.json [--format geolook] [--json]`** — citation-source analysis on its own: per-market "who AI trusts", own domains tagged.

**`botlog --file access.log [--format combined|cloudflare] [--json]`** — parse your own access logs: AI crawler hits by purpose (training / search-index / **user-request**), top paths, 4xx-heavy bots flagged as possibly blocked; human visits referred from 12 AI surfaces. Unparsed lines are counted, never hidden. Logs never leave your machine.

**`official --file export.csv [--source gsc|bing] [--audit x.json | --dir project] [--json]`** — reconcile GSC Gen-AI / Bing AI Performance CSV exports with your audit: blind spots (officially used, never audited), low-score winners, silent good pages. Tolerant en/zh headers; refuses (naming what it saw) rather than guess a column. Impressions and citations are different quantities and never merged.

### 6.2 Action

**`plan --root <site> [--urls ...] [--samples f --brand b --format geolook --judge <engine>] [--out tickets.json]`** — audit + metrics → tickets. P0 = shells / search-crawler bans / brand confusion. Low mention rate adds an **off-site ticket naming the exact domains AI already cites**; confusion + weak entity wiring adds an auto-verifiable **entity ticket**.

**`verify --tickets tickets.json [--root <site> --urls ...] [--samples f --brand b]`** — re-measure acceptance criteria: pass→done, fail stays, previously-done fail→regressed, unmeasurable states why. Manual-acceptance tickets are listed, never auto-judged.

**`outline --question "..." --facts facts.json [--json]`** / **`draft --question "..." --facts facts.json --llm <engine> [--out draft.md]`** — outline / first draft from the fact store. Confirmed, non-E facts only.

**`fabcheck --file draft.md --facts facts.json`** — the fabrication gate standalone: unsourced numbers, unbacked superlatives, do-not-claim phrases, grade-E / unconfirmed fact claims, line by line.

**`publish --file draft.md --targets targets.json [--target name] [--facts facts.json] [--title "..."] [--force]`** — gate + publish (WordPress / GitHub / signed webhook). No `--facts` → loud warning that the gate is skipped. Gate failure → refusal with the exact issues; `--force` publishes anyway but records `gateForced`. WordPress defaults to *draft* — a human presses the final button.

### 6.3 Growth inputs

**`expand --seed "custom t-shirts" [--engines baidu,google] [--expand] [--out candidates.json]`** — suggest mining: Baidu suggest + Google autocomplete; `--expand` adds an intent-modifier round (best / vs / review / alternative / how to; 怎么样 / 推荐 / 哪家好 / 对比 / 排行). Output is **candidates only** — never auto-added to the question bank (changing the bank starts a new series; that's a human decision).

**`products --root <shop> [--urls /p/a,/p/b | --shopify] [--out products.json] [--questions-out shopq.json]`** — catalog ingest from Product JSON-LD (incl. `@graph`) or Shopify `/products.json`. Missing price stays `null` with a warning (never 0); Shopify's missing currency recorded as `null`, and the tool says so; a product page without Product JSON-LD is itself reported as a finding.

**`shopping --samples f.jsonl --products products.json --brand brand.json [--format geolook] [--json]`** — product-level metrics: any-product mention rate; per product, price correct / wrong / unquoted, with the **wrong-price evidence sentence**. Prices are read only from sentences that mention the product; sentence splitting is decimal-safe. Stated limitation: numeric comparison, no currency conversion.

### 6.4 Orchestration & UI

**`bootstrap --root <site> --llm <engine> [--urls /about,/faq] [--out dir]`** — project bootstrap: crawl → facts with source URLs (underivable → unconfirmed) → competitor candidates (noise-filtered; low confidence isn't tracked) → question-bank draft. Empty over guessed, always.

**`cycle --dir project [--root url] [--urls ...] [--providers a,b] [--judge <engine>] [--repeat N]`** — the full period in one command: sample (`--repeat N` per question; ≥5 recommended for decision-grade) → metrics → audit → ticket generate/verify → report + trends. A same-day rerun with zero successful samples will not clobber the day's data.

**`schedule --dir project [--every 7d]`** — macOS launchd job that runs `cycle` every N days.

**`trends --history dir`** — period deltas with verdicts (observation / trend / insufficient), immediate P0 alerts (new confusion, blockers rising), observation-level warning on single-period mention drops >10pp.

**`ui [--dir project] [--port 8765]`** — local dashboard: overview, latest report (incl. answer replay), trends, manual-ticket actions. **Binds 127.0.0.1 only**; use an SSH tunnel for remote.

**`report --root <site> [--urls ...] [--samples f --brand b --format geolook --judge <engine>] [--tickets t.json] --out report.html`** — the single-file diagnosis report (see §9).

## 7. Data file formats

**brand.json**
```json
{
  "name": "Acme",
  "aliases": ["acme.dev"],
  "domains": ["acme.dev"],
  "description": "One sentence stating what the brand actually is (confusion-judge reference)",
  "competitors": [{ "name": "CompetitorX", "aliases": [] }],
  "auditUrls": ["/", "/about", "/pricing"]
}
```
Aliases are the disambiguation bedrock (Latin names match on word boundaries; CJK by substring — don't pick CJK aliases that are substrings of other entities). Domains drive citation attribution (hostname-suffix match). `auditUrls` feeds `cycle`.

**questions.json**
```json
[
  { "id": "q101", "text": "best custom merch platforms?", "market": "global", "brandInQuestion": false },
  { "id": "q901", "text": "what is Acme?", "market": "global", "brandInQuestion": true }
]
```
`market` ∈ `cn` / `global` / `both`. Discipline: hold the bank constant across periods; an added question starts its own series.

**samples.jsonl** (one JSON per line)
```json
{ "providerId": "doubao", "market": "cn", "questionId": "q101", "question": "…",
  "brandInQuestion": false, "answer": "…full answer…", "citations": ["https://…"],
  "channel": "api", "model": "doubao-seed-1-6-250615" }
```
`channel` ∈ api / gateway / ui / manual — integrity labeling; gateway routing is disclosed, not hidden.

**tickets.json**
```json
[{ "id": "T-001", "title": "Fix client-rendered empty-shell pages (SSR/prerender)",
   "priority": "P0", "rationale": "…", "baseline": 3, "status": "todo", "history": [],
   "acceptance": { "type": "auto", "check": "pages.issue_lte:spa-shell:0", "desc": "…" } }]
```
`status` ∈ todo / done / regressed / pending-manual. **Acceptance DSL, complete**:
`site.no_ai_block` (zero search-crawler bans) · `site.llms_txt` · `site.sitemap` · `site.entity_schema` (Organization + ≥2 sameAs) · `site.avg_score_gte:N` · `pages.no_blockers` · `pages.issue_lte:<code>:<N>` · `metrics.mention_rate_gte:<market>:<x>` · `metrics.no_confusion:<market>`.
**Ticket-level issue codes**: `spa-shell` `no-jsonld` `block-gap:definition|statistics|comparison|steps|faq` `content-short` `no-date` `answer-below-fold` `context-dependent-paragraphs` `stale-content`. Dimension-level issues also surfaced: `http-error noindex no-canonical thin-text no-lang no-h1 multiple-h1 few-h2 no-lists no-author no-external-links off-topic`.

**facts.json (fact store)**
```json
{ "brand": "Acme",
  "definition": "The canonical one-sentence definition (verbatim-consistent everywhere)",
  "facts": [{ "id": "F-001", "claim": "supports 18 product categories", "grade": "A",
              "source": "https://acme.dev", "status": "confirmed" }],
  "doNotClaim": ["free shipping"] }
```

**targets.json (publish targets — secrets by env var *name*; safe to commit)**
```json
[
 { "type": "wordpress", "name": "blog", "baseUrl": "https://blog.x.com",
   "username": "u", "passwordEnv": "WP_APP_PASSWORD", "status": "draft" },
 { "type": "github", "name": "site", "repo": "me/blog", "dir": "content/posts",
   "branch": "main", "tokenEnv": "GH_CONTENT_TOKEN" },
 { "type": "webhook", "name": "n8n", "url": "https://…", "secretEnv": "HOOK_SECRET" }
]
```
Webhooks are signed: `X-FasterGEO-Signature: sha256=…`.

**products.json** — `{ source, fetchedAt, products: [{ id, name, aliases?, url, price|null, currency|null, category? }], warnings }`

**candidates.json** (from `expand`) — `[{ text, source: "baidu"|"google", market, seedQuery }]`

**history/** — `YYYY-MM-DD-metrics.json`, `-audit.json`, `-samples.json` (the replay's data source). Trends and the dashboard read periods from here.

## 8. Workflows

### 8.1 Solo / startup: weekly periods

```bash
fastergeo bootstrap --root https://yoursite.com --llm glm --out geo && cd geo
# review brand.json competitors and facts.json unconfirmed items by hand
fastergeo cycle --dir . --judge glm --repeat 5
# fix per tickets.json → fastergeo verify … → next week cycle again, read trends
fastergeo schedule --dir . --every 7d     # macOS automation
```

### 8.2 Migrating from GeoLook

```bash
fastergeo metrics --samples geolook-export.jsonl --brand brand.json --format geolook --judge glm
```
Same samples, re-scored — plus recognition verdicts, sentiment, intervals and citation sources.

### 8.3 Agency: the 90-day engagement

| Phase | Commands | Machine exit |
|---|---|---|
| wk 1–2 baseline | `bootstrap → cycle --repeat 5` | baseline report delivered; blocker list signed off |
| wk 2–4 entity & technical | `plan → fix → verify` | P0 tickets flipped by re-crawl |
| wk 3–8 knowledge base | `expand → outline → draft → fabcheck` | content issue codes trending to zero |
| wk 8–12 distribution | `sources → publish → off-site tickets` | presence on ≥1 cited domain per market |
| wk 12+ measurement | `cycle --repeat 5 → trends → official` | delta vs baseline; regressions auto-reopened |

Deliverables are machine-checkable throughout: the diagnosis closes the deal, the verification sheet justifies the invoice.

### 8.4 E-commerce

```bash
fastergeo products --root https://shop.com --shopify --questions-out shopq.json
# review products.json prices/aliases; merge chosen questions into the bank (human decision)
fastergeo cycle --dir . --judge glm
fastergeo shopping --samples samples-*.jsonl --products products.json --brand brand.json
# wrong-price evidence = the commerce version of brand confusion → fix via knowledge base / support copy / third-party corrections
```

### 8.5 Earned-media (off-site) loop

```bash
fastergeo sources --samples samples-*.jsonl --brand brand.json
# per-market "who AI trusts" list; plan already emits off-site tickets naming those domains
# content: draft → fabcheck → publish; after coverage lands, verify the manual ticket; next period shows the mention delta
```

## 9. Reading the report & dashboard

Top to bottom (single-file HTML; `--lang zh` for Chinese):

1. **Headline** — the worst findings first (confusions / shells / mention rate); never buried in an average.
2. **Red banner** — blockers + verbatim confusion quotes + negative-sentiment evidence. Nothing else matters until these are fixed.
3. **Entity funnel** — five stages per market. Reading rules: without a judge, the first two stages show *unmeasured* (grey — not red, not green); with 0% mentions the rank stage shows "— not in the candidate set" (no rank exists; that is not 0%).
4. **Engine table** — per engine: samples, mention rate (Wilson-interval tooltip, ± mark), SoV, own-domain cites, sentiment (`+n =n −n ?n`), probe recognition, competitors seen.
5. **Six-dimension audit** — site checks (robots / search crawlers / sitemap / llms.txt; training opt-outs as a grey note), unreachable pages named, per-page score bars.
6. **Cited sources** — per-market top domains (citations / samples / engines), own domains tagged — your PR target list.
7. **Tickets** — priority / acceptance type (⚙ auto, 👤 manual) / status.
8. **Answer replay** — every sampled answer verbatim: brand hits highlighted (probe answers deliberately not — name echo isn't knowledge), confusion evidence in red; judge quotes that can't be located verbatim are listed explicitly, never silently dropped. Every number above can be cross-examined here — that's the point.

**Dashboard** (`fastergeo ui`): the same report live, plus period list, trend alerts, and manual-ticket actions. Browser-language auto-detection (en/zh).

## 10. MCP: for agents

```bash
claude mcp add fastergeo -- npx -y @fastergeo/mcp
# any stdio MCP client: npx -y @fastergeo/mcp
```

Nine tools: `list_engines` (key presence as booleans, never values) · `sample_engine` · `audit_page` · `audit_site` (failedUrls never silent) · `check_ai_crawlers` (purpose-aware) · `compute_metrics` (optional `judgeEngine` enables both judges) · `generate_tickets` · `verify_tickets` · `check_fabrication`.

Conventions: keys via environment (same as CLI); unmeasured returns `null` and tool descriptions tell the agent not to substitute zeros; malformed params return errors that name the parameter; audit tools accept http/https only. **Security**: over stdio this equals the local user running curl; do not expose it over HTTP to untrusted callers (it would become an internal-network probe).

## 11. Web tools & edge APIs

On [fastergeo.co](https://fastergeo.co): `/` and `/zh/` (full translation mirror), `/agency/` (the 90-day playbook), `/docs/` (this handbook, condensed), and free tools — GEO Score Checker, AI Crawler Access Checker (purpose-aware), llms.txt Generator (honestly labeled: Google ignores it). Edge APIs: `GET /api/scan?url=` and `GET /api/crawlers?url=` — the same engine, running at the edge, free, no sign-up.

## 12. Metric definitions & the seven disciplines

Full definitions live in [`METHODOLOGY.md`](../METHODOLOGY.md) — every metric points to the file that implements it. Quick table:

| Metric | One-line definition |
|---|---|
| mentionRate | share of unprompted samples mentioning brand (name/alias, Latin word-boundary) |
| top1/top3 | rank among **brand + registered competitors** by first-mention position; unmentioned = not in candidate set |
| shareOfVoice | brand presence ÷ (brand + competitor presence), max once per sample per entity |
| earlyMentionRate | of mentioning samples, share with first mention in the answer's first 30% |
| ownDomainCiteRate | samples citing an own domain (hostname-suffix match) |
| sentiment | mentioning samples only; negative requires evidence; no mentions → null |
| recognition | probes only; confused requires a verbatim quote or downgrades |

**The seven disciplines** (in code, not in footnotes):
1. Unmeasured is `null`, never zero. 2. Visibility is a distribution (repetition + intervals + the two-period rule). 3. Verdicts carry evidence or stay unverified. 4. cn/global are never averaged. 5. Fixes are proven by re-measurement, not assertion. 6. Probes are strictly segregated from visibility. 7. The fabrication gate applies to our own docs and marketing too — every statistic has a source.

**Stated limitations**: sampling-based monitoring is inherently partial (official GSC/Bing data is ground truth for your own site — reconcile with `official`); judge verdicts depend on the judge model (`method` recorded); audit anchors are correlational priors, not laws (the Princeton +40% replicated in only 3/54 scenarios); alias-exact matching misses creative misspellings (precision over recall). Judge temperature is pinned at 0; answer-sampling temperature follows engine defaults by design.

## 13. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `check` says model-unavailable | key valid, model not enabled on that console — enable it, or override `${ID}_MODEL` |
| all global engines time out / 403 | you need a proxy: set `HTTPS_PROXY` (the CLI wires Node's fetch to it) |
| domestic engines fail *through* the proxy | add their endpoints to `NO_PROXY` (Ark / DashScope / Qianfan…) |
| audit reports every page unreachable | target unreachable without proxy — confirm `HTTPS_PROXY` (audit uses the global dispatcher too) |
| `import` refuses to run | by design: `--questions` is required to restore probe flags; anything else fabricates mention rates |
| funnel head shows *unmeasured* | no judge ran — add `--judge glm` (any configured engine) |
| rank stage shows "—" | mention rate is 0: not in the candidate set, no rank exists — honest display, not a bug |
| `expand` returns mojibake from Baidu | fixed internally via `ie/oe=utf-8`; include both params if calling the endpoint yourself |
| `publish` says missing env XXX | targets.json stores env *names* — `export XXX=…` first |
| same-day `cycle` rerun lost data? | it didn't: an all-failed rerun never overwrites the day's samples; check the failure count for key/network issues |
| `official` can't identify columns | export the *page-level* report; the error lists the headers it saw — matching is tolerant but never guessed |
| dashboard unreachable remotely | by design (127.0.0.1 only): `ssh -L 8765:127.0.0.1:8765 host` |

## 14. FAQ, versioning, license

**Do I need API keys?** No. Auditing needs none; sampling uses whatever you have; keyless engines go through manual sheets into the same pipeline.

**Does my data leave my machine?** No. Everything is on your disk; the web scan processes transiently at the edge and stores nothing; botlog's logs never need to leave your machine at all.

**Why should I trust these numbers?** You don't have to. Every metric is publicly defined and traceable to code ([METHODOLOGY.md](../METHODOLOGY.md)); unmeasured renders as unmeasured; verdicts carry verbatim quotes; even the statistics on our website are footnoted — the fabrication gate the product enforces on your content applies to our marketing.

**Can you guarantee AI will cite me?** No — and whoever guarantees that is lying to you. What we guarantee: honest measurement, concrete fixes, and verification a machine signs off on.

**Versioning**: semver; any change to metric definitions gets a CHANGELOG entry and a prominent METHODOLOGY note — silent redefinition is the industry disease this project exists to cure.

**License**: Apache-2.0. `packages/rules` is forked from geo-lint (MIT; NOTICE retained). Built on Princeton's GEO paper (KDD '24), the CN-GEO citation corpus, and the open-source GEO community.

---

*Handbook v0.10-1 (2026-08). Found a mismatch with the implementation? [Open an issue.](https://github.com/arronyounging/fastergeo/issues)*
