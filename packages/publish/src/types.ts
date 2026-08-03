/**
 * @fastergeo/publish — distribution connectors with a mandatory honesty gate.
 *
 * Doctrine: measuring without publishing is half a product, but publishing
 * without the fabrication gate is worse than half. publishTo() refuses
 * content that fails lint against the fact store unless explicitly forced —
 * and records that it was forced.
 *
 * Secrets are referenced by ENVIRONMENT VARIABLE NAME in target configs,
 * never stored as values: a targets.json is safe to commit.
 */

export interface WordpressTarget {
  type: 'wordpress';
  name: string;
  /** Site base, e.g. https://blog.example.com */
  baseUrl: string;
  username: string;
  /** Env var holding a WordPress Application Password. */
  passwordEnv: string;
  /** WP post status; default 'draft' — humans press the final button. */
  status?: 'draft' | 'publish';
}

export interface GithubTarget {
  type: 'github';
  name: string;
  /** owner/repo */
  repo: string;
  branch?: string;
  /** Directory for new files, e.g. 'content/posts'. */
  dir: string;
  /** Env var holding a token with contents:write. */
  tokenEnv: string;
}

export interface WebhookTarget {
  type: 'webhook';
  name: string;
  url: string;
  /** Optional env var holding an HMAC secret → X-FasterGEO-Signature. */
  secretEnv?: string;
}

export type PublishTarget = WordpressTarget | GithubTarget | WebhookTarget;

export interface PublishInput {
  title: string;
  /** Markdown source — converted per connector (HTML for WP, raw for GitHub). */
  markdown: string;
  /** Slug for file-based targets; derived from title when omitted. */
  slug?: string;
  tags?: string[];
}

export interface PublishResult {
  ok: boolean;
  target: string;
  /** URL of the created draft/post/file when the platform returns one. */
  url?: string;
  id?: string | number;
  error?: string;
  /** True when the fabrication gate failed but publishing was forced. */
  gateForced?: boolean;
}

/** Injectable fetch for tests. */
export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
