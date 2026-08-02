/**
 * @fastergeo/providers — Core types
 *
 * Unified provider layer for AI answer sampling across CN + global engines.
 * Four access modes ("drivers"):
 *   - api:     direct HTTP API (OpenAI-compatible, Anthropic, Ark protocols)
 *   - gateway: an aggregator endpoint (OpenRouter, Volcano Ark hosting
 *              third-party models…) — same protocols, but the sample is
 *              explicitly labeled as gateway-routed for metric integrity
 *   - ui:      browser automation for engines without a public API (Doubao
 *              app, Nano AI, Baidu AI…) — implemented in a later phase
 *   - manual:  human sampling sheets, imported back into the same metrics
 */

/** Which market a provider's answers belong to. Never averaged across. */
export type Market = 'cn' | 'global';

export type DriverKind = 'api' | 'gateway' | 'ui' | 'manual';

export type Protocol = 'openai-compatible' | 'anthropic' | 'ark';

export interface ProviderSpec {
  /** Stable identifier, e.g. 'doubao', 'openai', 'perplexity'. */
  id: string;
  /** Display name, e.g. '豆包(方舟API)'. */
  name: string;
  market: Market;
  driver: DriverKind;
  /** Wire protocol for api/gateway drivers. */
  protocol?: Protocol;
  /** Default base URL; override with `${ID}_BASE_URL`. */
  baseUrl?: string;
  /** Default sampling model; override with `${ID}_MODEL`. */
  model?: string;
  /** Environment variable holding the API key. */
  keyEnv?: string;
  /** Whether the engine can ground answers with web search + citations. */
  webSearch: boolean;
  /** Operator-facing notes: quirks, console setup steps, sampling caveats. */
  notes?: string;
}

/** Provider config after resolving env overrides at call time. */
export interface ResolvedProvider extends ProviderSpec {
  resolvedBaseUrl?: string;
  resolvedModel?: string;
  apiKey?: string;
  /** True when base URL was overridden — sample must be labeled gateway. */
  gatewayRouted: boolean;
}

export interface SampleRequest {
  question: string;
  /** Question id from the question bank, for joinability. */
  questionId?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface SampleResult {
  providerId: string;
  /** Exact model that answered — version-pinned for reproducibility. */
  model: string;
  question: string;
  questionId?: string;
  answer: string;
  /** Source citations when the engine grounds its answers (e.g. Perplexity). */
  citations: string[];
  latencyMs: number;
  /** Sampling channel for metric-integrity labeling. */
  channel: 'api' | 'gateway';
  sampledAt: string;
  tokens?: { input?: number; output?: number };
}

/**
 * Key health check result — the "why doesn't my key work" diagnoser.
 * Distinguishes the three failure layers we hit in real onboarding:
 * missing key vs bad auth vs authenticated-but-model-not-enabled.
 */
export interface HealthReport {
  providerId: string;
  /** Key present in environment. */
  configured: boolean;
  /** Credentials accepted by the endpoint. */
  authOk?: boolean;
  /** The configured model is actually callable. */
  modelOk?: boolean;
  status: 'ok' | 'no-key' | 'auth-failed' | 'model-unavailable' | 'network-error' | 'manual-driver';
  /** Actionable, operator-facing hint (e.g. "开通模型" console steps). */
  hint?: string;
  latencyMs?: number;
}

export interface Driver {
  ask(provider: ResolvedProvider, req: SampleRequest): Promise<SampleResult>;
}
