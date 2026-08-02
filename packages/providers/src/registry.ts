/**
 * Engine registry — 15 engines across CN + global markets.
 *
 * Sampling defaults use each vendor's light/fast tier: we measure "does the
 * model know / recommend this brand", not reasoning quality, and a consistent
 * cheap tier keeps the metric comparable across periods.
 *
 * Env conventions per provider ID (upper-cased):
 *   `${ID}_API_KEY` (unless keyEnv says otherwise), `${ID}_MODEL`, `${ID}_BASE_URL`
 */

import type { ProviderSpec, ResolvedProvider } from './types.js';

export const PROVIDERS: Record<string, ProviderSpec> = {
  // ---------------- CN · API ----------------
  glm: {
    id: 'glm', name: '智谱GLM', market: 'cn', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash', keyEnv: 'ZHIPUAI_API_KEY', webSearch: false,
    notes: '不联网；智谱清言网页版联网行为需人工采样。',
  },
  doubao: {
    id: 'doubao', name: '豆包(方舟API)', market: 'cn', driver: 'api',
    protocol: 'ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6-250615', keyEnv: 'ARK_API_KEY', webSearch: true,
    notes: '联网需在方舟控制台开通「内容插件」；未开通自动降级为参数化知识采样。模型需在控制台「开通管理」逐个开通。',
  },
  deepseek: {
    id: 'deepseek', name: 'DeepSeek', market: 'cn', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat', keyEnv: 'DEEPSEEK_API_KEY', webSearch: false,
    notes: '官方 API 不联网，测参数化知识里的品牌认知。可经方舟托管（设 DEEPSEEK_BASE_URL）。',
  },
  kimi: {
    id: 'kimi', name: 'Kimi', market: 'cn', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0905-preview', keyEnv: 'MOONSHOT_API_KEY', webSearch: false,
    notes: '默认不联网；联网行为在网页端人工采样。',
  },
  minimax: {
    id: 'minimax', name: 'MiniMax', market: 'cn', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2', keyEnv: 'MINIMAX_API_KEY', webSearch: false,
    notes: '海螺 AI 网页版需人工采样。',
  },
  // ---------------- CN · 人工采样 ----------------
  nano: {
    id: 'nano', name: '纳米AI搜索', market: 'cn', driver: 'manual', webSearch: true,
    notes: '无公开 API；导出采样表在 App/网页端人工采。',
  },
  'baidu-ai': {
    id: 'baidu-ai', name: '百度AI搜索', market: 'cn', driver: 'manual', webSearch: true,
    notes: '无公开 API；人工采样。',
  },
  // ---------------- Global · API ----------------
  openai: {
    id: 'openai', name: 'OpenAI(ChatGPT)', market: 'global', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY', webSearch: false,
    notes: 'Chat Completions 默认不联网；ChatGPT 网页版联网行为需人工采样。',
  },
  anthropic: {
    id: 'anthropic', name: 'Claude', market: 'global', driver: 'api',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5-20251001', keyEnv: 'ANTHROPIC_API_KEY', webSearch: false,
    notes: 'Anthropic 原生协议（x-api-key + /v1/messages）。',
  },
  gemini: {
    id: 'gemini', name: 'Gemini', market: 'global', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash', keyEnv: 'GEMINI_API_KEY', webSearch: false,
    notes: 'OpenAI 兼容端点，不带 grounding。',
  },
  grok: {
    id: 'grok', name: 'Grok', market: 'global', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3-mini', keyEnv: 'XAI_API_KEY', webSearch: false,
  },
  perplexity: {
    id: 'perplexity', name: 'Perplexity', market: 'global', driver: 'api',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.perplexity.ai',
    model: 'sonar', keyEnv: 'PERPLEXITY_API_KEY', webSearch: true,
    notes: '原生联网并返回 citations，海外证据质量最好。',
  },
  // ---------------- Global · 人工采样 ----------------
  'chatgpt-web': {
    id: 'chatgpt-web', name: 'ChatGPT 网页版', market: 'global', driver: 'manual', webSearch: true,
    notes: 'Web ≠ API：联网与信源行为不同，单独记单独算。',
  },
  'claude-web': {
    id: 'claude-web', name: 'Claude 网页版', market: 'global', driver: 'manual', webSearch: true,
  },
  'ai-overview': {
    id: 'ai-overview', name: 'Google AI Overviews', market: 'global', driver: 'manual', webSearch: true,
    notes: 'SERP 内嵌，需 UI 采样或第三方 SERP API。',
  },
};

/** Env var name for a provider field, e.g. envName('doubao','MODEL') → 'DOUBAO_MODEL'. */
function envName(id: string, suffix: 'MODEL' | 'BASE_URL'): string {
  return `${id.toUpperCase().replace(/-/g, '_')}_${suffix}`;
}

/**
 * Resolve a provider's runtime config from the environment at call time
 * (key, model override, base URL override). A base-URL override marks the
 * provider as gateway-routed so downstream metrics label the channel honestly.
 */
export function resolveProvider(
  id: string,
  env: Record<string, string | undefined> = process.env,
): ResolvedProvider {
  const spec = PROVIDERS[id];
  if (!spec) {
    throw new Error(`Unknown provider: ${id}. Known: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  const baseOverride = env[envName(id, 'BASE_URL')]?.trim() || undefined;
  // Legacy aliases kept for GeoLook .env compatibility
  const legacyModel = id === 'doubao' ? env.ARK_MODEL : id === 'glm' ? env.GLM_MODEL : undefined;
  const norm = (u?: string) => u?.replace(/\/+$/, '');
  return {
    ...spec,
    resolvedBaseUrl: norm(baseOverride ?? spec.baseUrl),
    resolvedModel: env[envName(id, 'MODEL')] ?? legacyModel ?? spec.model,
    apiKey: spec.keyEnv ? env[spec.keyEnv] : undefined,
    gatewayRouted: Boolean(baseOverride && norm(baseOverride) !== norm(spec.baseUrl)),
  };
}

/** Providers with an API driver and a configured key. */
export function configuredProviders(
  env: Record<string, string | undefined> = process.env,
): ResolvedProvider[] {
  return Object.keys(PROVIDERS)
    .map(id => resolveProvider(id, env))
    .filter(p => p.driver === 'api' && Boolean(p.apiKey));
}
