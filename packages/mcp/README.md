# @fastergeo/mcp

[FasterGEO](https://fastergeo.co) as a [Model Context Protocol](https://modelcontextprotocol.io) server — GEO audits, Brand Entity Funnel metrics, machine-verified tickets, live AI-engine sampling, and the fabrication gate as 9 tools any MCP-capable agent can call.

```bash
claude mcp add fastergeo -- npx -y @fastergeo/mcp     # Claude Code
# or point any MCP client at: npx -y @fastergeo/mcp   (stdio)
```

## Tools

| Tool | What it does |
|---|---|
| `list_engines` | 18 supported engines (10 China-market + 8 global) with key-configured status — booleans only, never key values |
| `sample_engine` | Ask one question to one engine; verbatim answer + citations + model + channel |
| `audit_page` | Six-dimension GEO score for one URL, fetched exactly as AI crawlers see it (no JS) |
| `audit_site` | Site-level audit: robots.txt AI-crawler policy, sitemap, llms.txt, per-page scores; unreachable pages are named in `failedUrls`, never silently dropped |
| `check_ai_crawlers` | Which of the 9 visibility-deciding AI crawlers a site blocks |
| `compute_metrics` | Funnel metrics from raw samples: mention rate, top1/top3, SoV, citations, recognition (knows/unknown/confused with quoted evidence) |
| `generate_tickets` | Findings → prioritized tickets with machine-checkable acceptance criteria |
| `verify_tickets` | Re-check acceptance criteria: todo→done on pass, done→regressed when a fix rots |
| `check_fabrication` | Lint a draft against a fact store: unsourced numbers, superlatives, do-not-claim, E-grade facts |

Engine API keys come from the environment (`ZHIPUAI_API_KEY`, `ARK_API_KEY`, `OPENAI_API_KEY`, …) — same conventions as the [`fastergeo` CLI](https://www.npmjs.com/package/fastergeo). No keys → auditing and metrics still work; only live sampling needs them.

Every metric is publicly defined and traceable to code — see [METHODOLOGY.md](https://github.com/arronyounging/fastergeo/blob/main/METHODOLOGY.md). Unmeasured values are returned as `null`; do not substitute zeros.

## Security note

`audit_page` / `audit_site` / `check_ai_crawlers` fetch caller-supplied URLs. Over the default stdio transport this is equivalent to the local user running `curl` — fine. **Do not expose this server over an HTTP transport to untrusted callers**: in a shared or remote environment those tools become an internal-network probe (SSRF). Run it in local, trusted environments only.

## License

Apache-2.0 · [github.com/arronyounging/fastergeo](https://github.com/arronyounging/fastergeo)
