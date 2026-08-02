/**
 * Key health checker — answers "why doesn't my engine work" in one call.
 *
 * Born from real onboarding friction: an Ark key that authenticated fine but
 * whose account had no chat model enabled produced a bare NotFound error.
 * The checker separates the three failure layers and returns an actionable
 * hint for each:
 *   no-key → auth-failed → model-unavailable → ok
 */

import type { HealthReport, ResolvedProvider } from './types.js';
import { ask, ProviderError } from './drivers/api.js';

const HINTS: Record<string, Partial<Record<HealthReport['status'], string>>> = {
  doubao: {
    'auth-failed': '检查火山方舟 API Key（控制台 → API Key 管理）。',
    'model-unavailable':
      'Key 有效但模型未开通：到方舟控制台「开通管理」开通该模型，或设 DOUBAO_MODEL/ARK_MODEL 指向已开通的模型 ID（GET /api/v3/models 可列出账号可用模型）。',
  },
  deepseek: {
    'model-unavailable': '确认 DEEPSEEK_MODEL 有效；若经方舟托管，需在方舟开通该 DeepSeek 模型。',
  },
  openai: {
    'auth-failed': '检查 OPENAI_API_KEY 是否有效、项目是否有额度。',
  },
};

function hintFor(providerId: string, status: HealthReport['status']): string | undefined {
  return (
    HINTS[providerId]?.[status] ??
    {
      'no-key': undefined,
      'auth-failed': '密钥被拒绝：检查 Key 是否有效、是否过期、账户是否有余额。',
      'model-unavailable': '鉴权通过但模型不可用：检查模型 ID 是否正确、账号是否已开通该模型。',
      'network-error': '网络不可达：检查代理设置（部分海外端点可能需要 HTTPS_PROXY）。',
      'http-error': '服务端错误（5xx 等）：通常是引擎侧临时故障，稍后重试。',
    }[status as string]
  );
}

/**
 * Probe a provider with a minimal 1-token request and classify the outcome.
 * Costs a fraction of a cent per check; never throws.
 */
export async function checkProvider(p: ResolvedProvider): Promise<HealthReport> {
  if (p.driver === 'manual' || p.driver === 'ui') {
    return { providerId: p.id, configured: true, status: 'manual-driver' };
  }
  if (!p.apiKey) {
    return {
      providerId: p.id,
      configured: false,
      status: 'no-key',
      hint: `设置环境变量 ${p.keyEnv} 后启用自动采样；不设也可走人工采样表。`,
    };
  }

  const t0 = Date.now();
  try {
    // 45s probe: reasoning-tier models (deepseek-v4, o-series) can exceed 20s
    // even on 1-token replies — observed in production onboarding.
    await ask(p, { question: 'hi', maxTokens: 1, timeoutMs: 45_000 });
    return {
      providerId: p.id, configured: true, authOk: true, modelOk: true,
      status: 'ok', latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const e = err as ProviderError;
    const status: HealthReport['status'] =
      e.kind === 'auth' ? 'auth-failed'
      : e.kind === 'model' ? 'model-unavailable'
      : e.kind === 'network' ? 'network-error'
      : 'http-error'; // 5xx / unclassified — NOT an auth problem
    return {
      providerId: p.id,
      configured: true,
      authOk: e.kind !== 'auth',
      modelOk: false,
      status,
      hint: hintFor(p.id, status),
      latencyMs: Date.now() - t0,
    };
  }
}
