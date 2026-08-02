/**
 * @fastergeo/audit — Six-dimension page audit types.
 *
 * Dimension weights are anchored to published empirical citation research
 * (see score.ts for the evidence behind each band). Discipline: a dimension
 * that cannot be measured (e.g. relevance without a question bank) is
 * reported as null and its weight redistributed — never scored blind.
 */

export interface PageFeatures {
  url: string;
  status: number;
  /** Raw HTML size in bytes. */
  htmlBytes: number;
  title: string;
  metaDescription: string;
  canonical: string | null;
  noindex: boolean;
  lang: string | null;
  /** Visible text after stripping scripts/styles/tags. */
  text: string;
  /** CJK-aware word-equivalent count of visible text. */
  wordCount: number;
  h1: string[];
  h2: string[];
  h3: string[];
  paragraphCount: number;
  listCount: number;
  tableCount: number;
  /** JSON-LD @type values found in the page. */
  jsonLdTypes: string[];
  hasPublishDate: boolean;
  hasAuthor: boolean;
  externalLinkCount: number;
  internalLinkCount: number;
}

/** Extractable content blocks — the strongest citation predictors. */
export interface BlockSignals {
  definition: boolean;
  statistics: boolean;
  comparison: boolean;
  steps: boolean;
  faq: boolean;
}

export type DimensionKey =
  | 'crawlability' | 'length' | 'structure' | 'blocks' | 'authority' | 'relevance';

export interface DimensionScore {
  key: DimensionKey;
  /** Points earned; null = not measurable with given inputs. */
  score: number | null;
  max: number;
  /** Machine-readable issues found while scoring, for ticket generation. */
  issues: string[];
}

export interface PageAudit {
  url: string;
  /** 0-100 normalized; unmeasured dimensions' weight redistributed. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  dimensions: DimensionScore[];
  blocks: BlockSignals;
  wordCount: number;
  /** Blocker-level problems (SPA shell, noindex, blocked crawlers). */
  blockers: string[];
}

/** The 9 crawlers whose access decides AI-search visibility. */
export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai',
  'PerplexityBot', 'Google-Extended', 'Bytespider', 'CCBot',
] as const;

export interface SiteChecks {
  robotsTxtFound: boolean;
  /** AI crawlers explicitly disallowed for the whole site. */
  blockedAiCrawlers: string[];
  sitemapFound: boolean;
  llmsTxtFound: boolean;
}

export interface SiteAudit {
  root: string;
  generatedAt: string;
  site: SiteChecks;
  pages: PageAudit[];
  avgScore: number | null;
  gradeDistribution: Record<'A' | 'B' | 'C' | 'D', number>;
  /** Site-wide blockers, e.g. all product pages are client-rendered shells. */
  blockers: string[];
}

export interface AuditOptions {
  /** Question bank for the relevance dimension; omit → relevance unmeasured. */
  questions?: string[];
  timeoutMs?: number;
}
