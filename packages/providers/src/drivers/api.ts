/**
 * API driver — three wire protocols behind one ask() call.
 *
 * - openai-compatible: POST {base}/chat/completions, Bearer auth
 * - anthropic:         POST {base}/v1/messages, x-api-key auth
 * - ark (豆包/方舟):    Responses API + web_search first, falls back to
 *                      chat/completions when the content plugin is not
 *                      enabled on the account (no hard failure)
 */

import { EnvHttpProxyAgent, type Dispatcher } from 'undici';
import type { ResolvedProvider, SampleRequest, SampleResult } from '../types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Node's built-in fetch ignores HTTP(S)_PROXY env vars, which strands users
 * behind restrictive networks (a hard requirement for CN-based operators
 * reaching global engines). Honor the standard proxy envs when present.
 */
let proxyDispatcher: Dispatcher | undefined | null = null; // null = not yet resolved
function getDispatcher(): Dispatcher | undefined {
  if (proxyDispatcher === null) {
    const hasProxy =
      process.env.HTTPS_PROXY || process.env.https_proxy ||
      process.env.HTTP_PROXY || process.env.http_proxy;
    proxyDispatcher = hasProxy ? new EnvHttpProxyAgent() : undefined;
  }
  return proxyDispatcher;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly kind: 'no-key' | 'auth' | 'model' | 'http' | 'network',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  providerId: string,
): Promise<{ status: number; json: any }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      // undici extension: route through HTTP(S)_PROXY when configured
      ...(getDispatcher() ? { dispatcher: getDispatcher() } : {}),
    } as RequestInit);
  } catch (err) {
    throw new ProviderError(
      `network error calling ${url}: ${(err as Error).message}`,
      providerId, 'network',
    );
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function classify(status: number, json: any, providerId: string): ProviderError {
  const detail = JSON.stringify(json?.error ?? json).slice(0, 300);
  if (status === 401 || status === 403) {
    return new ProviderError(`auth failed (${status}): ${detail}`, providerId, 'auth', status);
  }
  if (status === 404 || json?.error?.code === 'InvalidEndpointOrModel.NotFound') {
    return new ProviderError(`model unavailable: ${detail}`, providerId, 'model', status);
  }
  return new ProviderError(`HTTP ${status}: ${detail}`, providerId, 'http', status);
}

function requireKeyAndModel(p: ResolvedProvider): { key: string; model: string; base: string } {
  if (!p.apiKey) {
    throw new ProviderError(`missing env ${p.keyEnv}`, p.id, 'no-key');
  }
  if (!p.resolvedModel || !p.resolvedBaseUrl) {
    throw new ProviderError(`provider ${p.id} has no model/baseUrl`, p.id, 'model');
  }
  return { key: p.apiKey, model: p.resolvedModel, base: p.resolvedBaseUrl };
}

function buildResult(
  p: ResolvedProvider, req: SampleRequest, model: string,
  answer: string, citations: string[], startedAt: number,
  tokens?: { input?: number; output?: number },
): SampleResult {
  return {
    providerId: p.id,
    model,
    question: req.question,
    questionId: req.questionId,
    answer,
    citations,
    latencyMs: Date.now() - startedAt,
    channel: p.gatewayRouted ? 'gateway' : 'api',
    sampledAt: new Date().toISOString(),
    tokens,
  };
}

async function askOpenAICompatible(p: ResolvedProvider, req: SampleRequest): Promise<SampleResult> {
  const { key, model, base } = requireKeyAndModel(p);
  const t0 = Date.now();
  const { status, json } = await post(
    `${base}/chat/completions`,
    { Authorization: `Bearer ${key}` },
    {
      model,
      messages: [{ role: 'user', content: req.question }],
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    },
    req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    p.id,
  );
  if (status !== 200) throw classify(status, json, p.id);
  const answer: string = json.choices?.[0]?.message?.content ?? '';
  // Perplexity returns citations as a top-level array of URLs
  const citations: string[] = Array.isArray(json.citations) ? json.citations : [];
  return buildResult(p, req, json.model ?? model, answer, citations, t0, {
    input: json.usage?.prompt_tokens,
    output: json.usage?.completion_tokens,
  });
}

async function askAnthropic(p: ResolvedProvider, req: SampleRequest): Promise<SampleResult> {
  const { key, model, base } = requireKeyAndModel(p);
  const t0 = Date.now();
  const { status, json } = await post(
    `${base}/v1/messages`,
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: req.question }],
    },
    req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    p.id,
  );
  if (status !== 200) throw classify(status, json, p.id);
  const answer = (json.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return buildResult(p, req, json.model ?? model, answer, [], t0, {
    input: json.usage?.input_tokens,
    output: json.usage?.output_tokens,
  });
}

async function askArk(p: ResolvedProvider, req: SampleRequest): Promise<SampleResult> {
  const { key, model, base } = requireKeyAndModel(p);
  const t0 = Date.now();
  // Try the Responses API with web_search (needs 内容插件 enabled in console)
  const grounded = await post(
    `${base}/responses`,
    { Authorization: `Bearer ${key}` },
    { model, input: req.question, tools: [{ type: 'web_search' }] },
    req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    p.id,
  ).catch(() => null);

  if (grounded && grounded.status === 200) {
    const out = grounded.json.output ?? [];
    const answer = out
      .flatMap((o: any) => o.content ?? [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('');
    const citations = out
      .flatMap((o: any) => o.content ?? [])
      .flatMap((c: any) => c.annotations ?? [])
      .map((a: any) => a.url)
      .filter(Boolean);
    if (answer) return buildResult(p, req, model, answer, citations, t0);
  }
  // Degrade to plain chat (parameterized-knowledge sampling) — never abort a cycle
  return askOpenAICompatible(p, req);
}

/** Ask one question through the provider's protocol. */
export async function ask(p: ResolvedProvider, req: SampleRequest): Promise<SampleResult> {
  switch (p.protocol) {
    case 'anthropic': return askAnthropic(p, req);
    case 'ark': return askArk(p, req);
    case 'openai-compatible': return askOpenAICompatible(p, req);
    default:
      throw new ProviderError(`provider ${p.id} has no API protocol (driver: ${p.driver})`, p.id, 'http');
  }
}
