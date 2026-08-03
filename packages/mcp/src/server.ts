/**
 * @fastergeo/mcp — FasterGEO as Model Context Protocol tools.
 *
 * Design doctrine, same as everywhere else in this repo:
 * - unmeasured stays unmeasured: tools return null fields verbatim, and their
 *   descriptions tell the calling agent NOT to substitute zeros
 * - no secrets cross the wire: engine listing reports key presence as a
 *   boolean, never values
 * - verdicts carry evidence; sampling tools label their channel
 *
 * Every tool returns a single JSON text block — agents parse it directly.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  auditPage, auditSite, checkSite,
} from '@fastergeo/audit';
import {
  computeMetrics, makeLlmJudge, parseGeoLookSamples,
} from '@fastergeo/metrics';
import type { BrandConfig, Sample } from '@fastergeo/metrics';
import { generateTickets, verifyTickets } from '@fastergeo/tickets';
import type { Ticket } from '@fastergeo/tickets';
import { lintFabrication } from '@fastergeo/content';
import type { FactStore } from '@fastergeo/content';
import { PROVIDERS, resolveProvider, configuredProviders, ask } from '@fastergeo/providers';

const VERSION = '0.1.0';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const json = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
  isError: true,
});

/** Parse a JSON param with a contextful error the calling agent can act on. */
function parseJsonParam<T>(raw: string, param: string, expected: string): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    throw new Error(`param "${param}" is not valid JSON (${(err as Error).message}) — expected ${expected}`);
  }
  return value as T;
}

/** Resolve page URLs against a root; reject non-http(s) schemes by name. */
function resolveUrls(root: string, urls: string[]): string[] {
  return urls.map(u => {
    let abs: URL;
    try {
      abs = new URL(u, root);
    } catch {
      throw new Error(`cannot resolve url "${u}" against root "${root}"`);
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') {
      throw new Error(`url "${u}" resolves to unsupported scheme "${abs.protocol}" — only http/https can be audited`);
    }
    return abs.href;
  });
}

/** Parse samples from JSONL, a JSON array, or GeoLook export format. */
function parseSamples(raw: string, format?: string): Sample[] {
  if (format === 'geolook') return parseGeoLookSamples(raw);
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as Sample[];
  return trimmed.split('\n').filter(Boolean).map(l => JSON.parse(l) as Sample);
}

const brandShape = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  description: z.string().optional(),
  competitors: z.array(z.object({ name: z.string(), aliases: z.array(z.string()).optional() })).default([]),
});

export function createFastergeoServer(): McpServer {
  const server = new McpServer({ name: 'fastergeo', version: VERSION });

  server.registerTool('list_engines', {
    title: 'List AI engines',
    description:
      'List all 18 supported AI answer engines (10 China-market: Doubao, DeepSeek, GLM, Kimi, MiniMax, Qwen, ERNIE, Spark, …; 8 global: ChatGPT, Claude, Gemini, Perplexity, …) with market, protocol, and whether an API key is configured in the environment (boolean only — never the key). Engines without keys can still be measured via manual sample sheets.',
    inputSchema: {},
  }, async () => {
    const configured = new Set(configuredProviders().map(p => p.id));
    return json(Object.values(PROVIDERS).map(p => ({
      id: p.id, name: p.name, market: p.market, driver: p.driver,
      webSearch: p.webSearch,
      keyEnv: p.keyEnv ?? null,
      configured: configured.has(p.id),
    })));
  });

  server.registerTool('sample_engine', {
    title: 'Sample one engine',
    description:
      'Ask one question to one AI engine and return the verbatim answer with citations, model, and channel. Requires ${ENGINE}_API_KEY in the environment. Set brandInQuestion=true when the question names the brand — probe samples are segregated from visibility metrics downstream and must be labeled honestly.',
    inputSchema: {
      engine: z.string().describe('Engine id, e.g. "glm", "doubao", "deepseek"'),
      question: z.string(),
      brandInQuestion: z.boolean().default(false)
        .describe('true if the question names the brand (probe); probes are excluded from visibility metrics'),
      questionId: z.string().optional(),
    },
  }, async ({ engine, question, brandInQuestion, questionId }) => {
    try {
      const p = resolveProvider(engine);
      const r = await ask(p, { question, questionId });
      const sample: Sample = {
        providerId: p.id, market: p.market, questionId: questionId ?? '',
        question, brandInQuestion, answer: r.answer, citations: r.citations,
        channel: r.channel, model: r.model,
      };
      return json(sample);
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('audit_page', {
    title: 'Audit one page',
    description:
      'Fetch a URL exactly as AI crawlers do (no JavaScript execution) and score it 0-100 across six evidence-anchored dimensions: crawlability 15, length 15, structure 20, extractable blocks 25, authority 15, relevance 10. Pass the project question bank to measure relevance; without it, relevance is null and its weight is redistributed — do not treat null as zero. Blockers (SPA shells, noindex) override scores: nothing else matters until they are fixed.',
    inputSchema: {
      url: z.string().url(),
      questions: z.array(z.string()).optional()
        .describe('Question bank for the relevance dimension; omitted → relevance reported as null (unmeasured)'),
    },
  }, async ({ url, questions }) => {
    try {
      const [abs] = resolveUrls(url, [url]);
      const page = await auditPage(abs, { questions });
      return page ? json(page) : fail(`fetch failed: ${abs}`);
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('audit_site', {
    title: 'Audit a site',
    description:
      'Site-level GEO audit: robots.txt AI-crawler policy (9 crawlers: GPTBot, ClaudeBot, PerplexityBot, …), sitemap, llms.txt, plus six-dimension scores for each given page. Returns per-page grades, site blockers first. Fetches without JavaScript — this measures exactly what AI crawlers see.',
    inputSchema: {
      root: z.string().url().describe('Site root, e.g. https://example.com'),
      urls: z.array(z.string()).optional()
        .describe('Pages to audit (absolute or root-relative); defaults to the root page only'),
      questions: z.array(z.string()).optional(),
    },
  }, async ({ root, urls, questions }) => {
    try {
      const abs = resolveUrls(root, urls ?? [root]);
      return json(await auditSite(root, abs, { questions }));
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('check_ai_crawlers', {
    title: 'Check AI crawler access',
    description:
      'Check whether a site blocks any of the 9 AI crawlers that decide AI-search visibility (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Bytespider, CCBot) in robots.txt, and whether sitemap.xml / llms.txt exist.',
    inputSchema: { root: z.string().url() },
  }, async ({ root }) => json(await checkSite(root)));

  server.registerTool('compute_metrics', {
    title: 'Compute funnel metrics',
    description:
      'Compute Brand Entity Funnel metrics from raw samples: mention rate, top1/top3, avg rank, share of voice, own-domain citation rate, citation share, and probe recognition (knows/unknown/confused/unverified with quoted evidence). Discipline enforced in code: probe questions are segregated; China and global markets are never averaged; anything not computable is null — report it as unmeasured, never as zero. Optionally pass judgeEngine (a configured engine id) to run the LLM recognition judge; without it, heuristically undecidable probes stay "unverified".',
    inputSchema: {
      samples: z.string().describe('Samples as JSONL, a JSON array, or GeoLook export JSON'),
      format: z.enum(['fastergeo', 'geolook']).default('fastergeo'),
      brand: brandShape,
      judgeEngine: z.string().optional()
        .describe('Engine id to use as LLM recognition judge (requires its API key)'),
    },
  }, async ({ samples, format, brand, judgeEngine }) => {
    try {
      const parsed = parseSamples(samples, format);
      let judge;
      if (judgeEngine) {
        const jp = resolveProvider(judgeEngine);
        judge = makeLlmJudge(async prompt =>
          (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
      }
      const report = await computeMetrics(parsed, brand as BrandConfig, {
        judge, brandDescription: brand.description,
      });
      return json(report);
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('generate_tickets', {
    title: 'Generate action tickets',
    description:
      'Turn an audit and/or metrics report into prioritized action tickets, each with machine-checkable acceptance criteria where possible. P0 = blockers (SPA shells, robots bans, brand confusion). Priorities are impact-honest: llms.txt is P2 because engine adoption is unproven.',
    inputSchema: {
      audit: z.string().optional().describe('SiteAudit JSON from audit_site'),
      metrics: z.string().optional().describe('MetricsReport JSON from compute_metrics'),
      lang: z.enum(['en', 'zh']).default('en'),
    },
  }, async ({ audit, metrics, lang }) => {
    if (!audit && !metrics) return fail('need at least one of audit / metrics');
    try {
      return json(generateTickets(
        audit ? parseJsonParam(audit, 'audit', 'the SiteAudit JSON object returned by audit_site') : undefined,
        metrics ? parseJsonParam(metrics, 'metrics', 'the MetricsReport JSON object returned by compute_metrics') : undefined,
        lang,
      ));
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('verify_tickets', {
    title: 'Verify tickets against fresh measurements',
    description:
      'Re-check every ticket\'s acceptance criteria against fresh audit/metrics data. Transitions: todo→done when criteria pass, done→regressed when a previously passing fix rots. Criteria that cannot be measured with the given context leave the ticket unchanged with the reason stated — verification never guesses. Returns the verdict summary AND the updated tickets array (persist it yourself).',
    inputSchema: {
      tickets: z.string().describe('Tickets JSON array (from generate_tickets or a previous verify)'),
      audit: z.string().optional().describe('Fresh SiteAudit JSON'),
      metrics: z.string().optional().describe('Fresh MetricsReport JSON'),
      lang: z.enum(['en', 'zh']).default('en'),
    },
  }, async ({ tickets, audit, metrics, lang }) => {
    try {
      const list = parseJsonParam<Ticket[]>(tickets, 'tickets', 'a JSON array of tickets from generate_tickets');
      if (!Array.isArray(list)) return fail('param "tickets" must be a JSON array of tickets, got ' + typeof list);
      const summary = verifyTickets(list, {
        audit: audit ? parseJsonParam(audit, 'audit', 'the SiteAudit JSON object returned by audit_site') : undefined,
        metrics: metrics ? parseJsonParam(metrics, 'metrics', 'the MetricsReport JSON object returned by compute_metrics') : undefined,
      }, lang);
      return json({ summary, tickets: list });
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  server.registerTool('check_fabrication', {
    title: 'Fabrication gate for drafts',
    description:
      'Lint a content draft against a fact store: every number must trace to a sourced fact, superlatives need grade-A/B evidence, do-not-claim phrases are hard failures. Returns the issue list; an empty list means the draft passed the gate. Use before publishing any brand content an LLM helped write.',
    inputSchema: {
      draft: z.string().describe('The draft text (markdown or plain)'),
      facts: z.string().describe('FactStore JSON: { brand, definition, facts: [{id, claim, grade, source, status}], doNotClaim: [...] }'),
    },
  }, async ({ draft, facts }) => {
    try {
      const store = parseJsonParam<FactStore>(facts, 'facts', 'a FactStore object: { brand, definition, facts: [...], doNotClaim?: [...] }');
      if (!Array.isArray(store?.facts)) {
        return fail('param "facts" must contain a "facts" array — expected shape { brand, definition, facts: [{id, claim, grade, source, status}], doNotClaim?: [] }');
      }
      const issues = lintFabrication(draft, store);
      return json({ pass: issues.length === 0, issues });
    } catch (err) {
      return fail(String((err as Error).message ?? err));
    }
  });

  return server;
}
