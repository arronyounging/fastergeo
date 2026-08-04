# Engine Profiles（引擎档案）

Two kinds of entries, never mixed:
- **LIVE-PROFILED** — numbers from `bench/run.mjs engines` runs (raw rows in `runs/`), standard
  question set ×10 reps. Dated.
- **SPEC-DOCUMENTED** — what the integration implements and what the operator consoles document;
  no live claims. Upgraded to live-profiled as keys become available.

Retry policy (all engines): `ask()` retries transient failures (network / 429 / 5xx) twice with
exponential backoff; auth/model errors fail fast. Temperature: unset by default (engine defaults —
sampling should reflect what real users get) and recorded on the sample whenever explicitly set.

---

## LIVE-PROFILED (2026-08-04 · standard set ×10 reps each)

_Raw per-call rows in `runs/2026-08-04-*.json`. Retry policy active (failures shown are post-retry)._

| engine | mode | success | p50 | p95 | chars | citation rate | citation by intent |
|---|---|---|---|---|---|---|---|
| deepseek | chat | 50/50 | 16.2s | 31.6s | 1131 | 0% | — (no retrieval, by implementation) |
| openai (gpt-4o-mini) | chat | 50/50 | 5.8s | 9.8s | 2032 | 0% | — |
| openai (gpt-4o-mini) | **grounded** (OPENAI_WEB_SEARCH=1) | 50/50 | 6.3s | 13.3s | 2443 | **62%** | recommendation 10/10 · recency 10/10 · stat 10/10 · definition 1/10 · howto 0/10 |
| glm (via Ark gateway, glm-5-2) | chat | 50/50 | 70.2s | 102.5s | 1707 | 0% | reasoning-heavy; no retrieval on this route |
| doubao (doubao-seed-2-0-pro) | ark grounded-try→chat | 50/50 | 75.2s | 107.6s | 1118 | 0% | grounded /responses degraded silently on this console/model — see note |

**Finding (first-party, publishable)**: with web_search enabled, gpt-4o-mini's citation behavior
splits cleanly by intent — commercial/recency/statistical questions trigger search 10/10, while
definitions and how-tos are answered from parametric memory (1/10, 0/10). This is the
"two games" thesis (retrieval vs parametric) measured directly, and it means **recommendation-intent
questions are exactly where citations — and therefore GEO — are contested**.

### glm （智谱，本次经方舟网关路由）
本环境 GLM_BASE_URL 指向方舟 → channel=gateway、模型 glm-5-2（重推理档，p50 70s）。
直连智谱开放平台 + glm-4-flash 的档案待官方 key 重测（延迟预期低一个量级）。
**运维含义**：glm-5-2/doubao-2.0-pro 这类重推理档跑 64 题周期，4 并发下仍需 ~20 分钟——
决策级采样建议错峰或用 flash 档做筛查、重档做终判。

### doubao（火山方舟）
双路径实现：先试 `/responses` + web_search（需在方舟控制台开通内容插件），失败自动降级纯 chat
（参数化知识采样，绝不让 cycle 中断）。引用来自 responses 的 annotations。
**2026-08-04 实测**：本控制台 + doubao-seed-2-0-pro 组合下 grounded 尝试全部静默降级（引用率 0）——
要么内容插件未对该模型开通，要么 pro 档不支持 /responses。运维含义：引用率长期为 0 时先查控制台插件，
勿误读为"豆包不引用"。p50 75s 属重推理档常态。

### deepseek
纯 chat API，无联网检索 → 引用率恒为 0 属实现事实而非缺陷；答案来自参数记忆。
延迟显著高于其他家（实测 p50 ~20s），cycle 并发时是长尾来源。

### openai（gpt-4o-mini 档）
两种模式：默认纯 chat（参数记忆采样，引用 0）；`OPENAI_WEB_SEARCH=1` 启用 grounded
（Responses API + web_search，探针实证 url_citation 注解），引用率 62%、延迟 +8%。
两种模式测的是两种游戏，都有效——选择权在操作者。

---

## SPEC-DOCUMENTED（未实测，仅记载实现与控制台文档）

| 引擎 | 协议 | 引用行为（实现现状） | 已知注意事项 |
|---|---|---|---|
| kimi (Moonshot) | openai-compatible | 无引用字段解析 | k2 系列长上下文；控制台需开通对应模型 |
| minimax | openai-compatible | 无 | M2 档；接口兼容性好 |
| qwen (DashScope) | openai-compatible | 无（DashScope 有 enable_search 参数，未接——档案升级项） | 灵积计费独立 |
| ernie (千帆 v2) | openai-compatible | 无 | v2 接口才是 OpenAI 兼容；老 v1 不适用 |
| spark (讯飞) | openai-compatible | 无 | generalv3.5 档 |
| anthropic | anthropic | 无（web search 工具未接） | claude-haiku 默认档 |
| gemini | openai-compatible | 无（grounding 未接——升级项） | 经 OpenAI 兼容层 |
| grok (xAI) | openai-compatible | 无（Live Search 未接） | |
| perplexity | openai-compatible | **有**：顶层 citations 数组已解析 | sonar 档天然带引用，是海外引用行为的主要观测口 |
| nano / baidu-ai | manual | 人工表采样 | 无公开 API |
| ChatGPT web / Claude web / AIO | manual | 人工表采样（引用手工录入） | |

**档案升级 BACKLOG**（按引用观测价值排序）：qwen enable_search → gemini grounding →
openai web_search → grok live search → anthropic web search。每接一个，引用观测面 +1。
