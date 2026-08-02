import { describe, it, expect, vi, afterEach } from 'vitest';
import { PROVIDERS, resolveProvider, configuredProviders } from '../src/registry.js';
import { ask, ProviderError } from '../src/drivers/api.js';
import { checkProvider } from '../src/health.js';

function mockFetchOnce(status: number, json: unknown) {
  const fn = vi.fn(async () => ({ status, json: async () => json }) as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('registry', () => {
  it('covers 15 engines with cn/global split', () => {
    const ids = Object.keys(PROVIDERS);
    expect(ids).toHaveLength(15);
    const cn = ids.filter(id => PROVIDERS[id].market === 'cn');
    const global = ids.filter(id => PROVIDERS[id].market === 'global');
    expect(cn).toHaveLength(7);
    expect(global).toHaveLength(8);
  });

  it('resolves env overrides and flags gateway routing', () => {
    const p = resolveProvider('deepseek', {
      DEEPSEEK_API_KEY: 'k',
      DEEPSEEK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
      DEEPSEEK_MODEL: 'deepseek-v4-flash-260425',
    });
    expect(p.apiKey).toBe('k');
    expect(p.resolvedModel).toBe('deepseek-v4-flash-260425');
    expect(p.gatewayRouted).toBe(true);
  });

  it('is not gateway-routed when override equals default modulo trailing slash', () => {
    const p = resolveProvider('deepseek', {
      DEEPSEEK_API_KEY: 'k',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1/',
    });
    expect(p.gatewayRouted).toBe(false);
  });

  it('is not gateway-routed on default base URL', () => {
    const p = resolveProvider('openai', { OPENAI_API_KEY: 'k' });
    expect(p.gatewayRouted).toBe(false);
  });

  it('supports legacy ARK_MODEL alias for doubao', () => {
    const p = resolveProvider('doubao', { ARK_API_KEY: 'k', ARK_MODEL: 'doubao-seed-2-0-pro-260215' });
    expect(p.resolvedModel).toBe('doubao-seed-2-0-pro-260215');
  });

  it('configuredProviders filters to api drivers with keys', () => {
    const list = configuredProviders({ OPENAI_API_KEY: 'k' });
    expect(list.map(p => p.id)).toEqual(['openai']);
  });
});

describe('api driver', () => {
  it('parses openai-compatible responses with citations', async () => {
    mockFetchOnce(200, {
      model: 'sonar',
      choices: [{ message: { content: 'answer text' } }],
      citations: ['https://a.com', 'https://b.com'],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    const p = resolveProvider('perplexity', { PERPLEXITY_API_KEY: 'k' });
    const r = await ask(p, { question: 'q' });
    expect(r.answer).toBe('answer text');
    expect(r.citations).toHaveLength(2);
    expect(r.channel).toBe('api');
    expect(r.tokens?.output).toBe(20);
  });

  it('labels gateway-routed samples', async () => {
    mockFetchOnce(200, { choices: [{ message: { content: 'a' } }] });
    const p = resolveProvider('deepseek', {
      DEEPSEEK_API_KEY: 'k',
      DEEPSEEK_BASE_URL: 'https://gateway.example/v1',
    });
    const r = await ask(p, { question: 'q' });
    expect(r.channel).toBe('gateway');
  });

  it('parses anthropic content blocks', async () => {
    mockFetchOnce(200, {
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }],
      usage: { input_tokens: 5, output_tokens: 7 },
    });
    const p = resolveProvider('anthropic', { ANTHROPIC_API_KEY: 'k' });
    const r = await ask(p, { question: 'q' });
    expect(r.answer).toBe('hello world');
  });

  it('classifies 401 as auth error', async () => {
    mockFetchOnce(401, { error: { message: 'bad key' } });
    const p = resolveProvider('openai', { OPENAI_API_KEY: 'bad' });
    await expect(ask(p, { question: 'q' })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('classifies Ark InvalidEndpointOrModel as model error', async () => {
    // ark tries /responses first (catch → null), then chat/completions
    const fn = vi.fn(async () => ({
      status: 404,
      json: async () => ({ error: { code: 'InvalidEndpointOrModel.NotFound', message: 'not enabled' } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fn);
    const p = resolveProvider('doubao', { ARK_API_KEY: 'k' });
    await expect(ask(p, { question: 'q' })).rejects.toMatchObject({ kind: 'model' });
  });

  it('throws no-key without credentials', async () => {
    const p = resolveProvider('openai', {});
    await expect(ask(p, { question: 'q' })).rejects.toMatchObject({ kind: 'no-key' });
  });
});

describe('health checker', () => {
  it('reports no-key with manual-sheet hint', async () => {
    const r = await checkProvider(resolveProvider('glm', {}));
    expect(r.status).toBe('no-key');
    expect(r.configured).toBe(false);
    expect(r.hint).toContain('ZHIPUAI_API_KEY');
  });

  it('reports manual-driver for sheet-based engines', async () => {
    const r = await checkProvider(resolveProvider('nano', {}));
    expect(r.status).toBe('manual-driver');
  });

  it('reports ok on successful probe', async () => {
    mockFetchOnce(200, { choices: [{ message: { content: 'hi' } }] });
    const r = await checkProvider(resolveProvider('openai', { OPENAI_API_KEY: 'k' }));
    expect(r.status).toBe('ok');
    expect(r.modelOk).toBe(true);
  });

  it('distinguishes model-unavailable from auth failure, with console hint', async () => {
    const fn = vi.fn(async () => ({
      status: 404,
      json: async () => ({ error: { code: 'InvalidEndpointOrModel.NotFound' } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fn);
    const r = await checkProvider(resolveProvider('doubao', { ARK_API_KEY: 'valid-key' }));
    expect(r.status).toBe('model-unavailable');
    expect(r.authOk).toBe(true);
    expect(r.hint).toContain('开通管理');
  });
});
