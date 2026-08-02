# FasterGEO

**Open-source GEO (Generative Engine Optimization) platform** — monitor, diagnose, implement, verify. Covers both China (Doubao, DeepSeek, GLM, Kimi…) and global (ChatGPT, Claude, Gemini, Perplexity…) AI engines.

> Status: early development. Blueprint-driven; see design docs.

## Packages

| Package | Description |
|---|---|
| `@fastergeo/rules` | Deterministic GEO/SEO/content rule engine (92+ rules) with agent-fixable suggestions. CJK-aware text metrics. Forked from [@ijonis/geo-lint](https://github.com/IJONIS/geo-lint) (MIT, see packages/rules/NOTICE). |

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

Apache-2.0 (see LICENSE). Vendored code retains its original license — see NOTICE files in each package.
