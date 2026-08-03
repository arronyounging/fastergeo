/**
 * @fastergeo/metrics — Core types
 *
 * Metric discipline (inherited from field-tested methodology):
 * - cn and global markets are NEVER averaged together
 * - probe questions (that name the brand) are segregated from visibility
 *   metrics — their answers necessarily echo the brand name
 * - anything we cannot compute is reported as null ("not measured"),
 *   never fabricated
 */

export type Market = 'cn' | 'global';

/** One sampled answer, normalized from any source (API, sheet, GeoLook). */
export interface Sample {
  providerId: string;
  market: Market;
  questionId: string;
  question: string;
  /** True when the question names the brand → probe group, not visibility. */
  brandInQuestion: boolean;
  answer: string;
  citations: string[];
  /** Sampling channel for integrity labeling. */
  channel?: 'api' | 'gateway' | 'ui' | 'manual';
  model?: string;
}

export interface BrandConfig {
  name: string;
  /** Aliases and common misspellings — the disambiguation bedrock. */
  aliases: string[];
  /** Own domains for citation attribution, e.g. ['custyle.ai']. */
  domains: string[];
  competitors: Array<{ name: string; aliases?: string[] }>;
}

/**
 * Recognition quality for probe answers. The naive "brand name appears in
 * answer" check is meaningless for probes (the name always echoes back);
 * what matters is whether the engine actually KNOWS the brand:
 * - knows:      correctly describes the brand
 * - unknown:    states it has no information
 * - confused:   attributes the brand to the wrong industry/entity (P0 signal)
 * - unverified: cannot be determined deterministically and no judge ran —
 *               reported as unmeasured, never guessed
 */
export type RecognitionVerdict = 'knows' | 'unknown' | 'confused' | 'unverified';

export interface RecognitionResult {
  verdict: RecognitionVerdict;
  /** Quoted evidence from the answer supporting the verdict. */
  evidence?: string;
  /** 'heuristic' (deterministic patterns) or 'judge' (LLM). */
  method: 'heuristic' | 'judge';
}

/**
 * Optional LLM judge for recognition classification. Receives the answer and
 * brand context, returns a verdict with quoted evidence. When absent,
 * heuristically-undecidable answers stay 'unverified'.
 */
export type RecognitionJudge = (input: {
  answer: string;
  brandName: string;
  /** Short description of what the brand actually is, for confusion checks. */
  brandDescription?: string;
}) => Promise<RecognitionResult>;

/**
 * Sentiment of a brand mention. 'unverified' = could not be determined
 * (no judge, or judge undecided) — reported as unmeasured, never guessed.
 */
export type SentimentVerdict = 'positive' | 'neutral' | 'negative' | 'unverified';

export interface SentimentResult {
  verdict: SentimentVerdict;
  /** Quoted evidence — required for 'negative'. */
  evidence?: string;
  method: 'heuristic' | 'judge';
}

export type SentimentJudge = (input: {
  answer: string;
  brandName: string;
}) => Promise<SentimentResult>;

export interface PlatformMetrics {
  providerId: string;
  market: Market;
  /** Unprompted (non-probe) sample count. */
  samples: number;
  /** Share of unprompted answers mentioning the brand. */
  mentionRate: number | null;
  top1Rate: number | null;
  top3Rate: number | null;
  /** Average 1-based rank among mentioned brands, when mentioned. */
  avgRank: number | null;
  /** Brand mentions / (brand + competitor mentions), unprompted. */
  shareOfVoice: number | null;
  /** Share of unprompted samples citing an own domain. */
  ownDomainCiteRate: number | null;
  /** Own-domain citations / all citations (null when no citations at all). */
  citationShare: number | null;
  competitorMentions: Record<string, number>;
  /**
   * Sentiment of brand mentions in unprompted answers. null when the brand
   * was never mentioned (nothing to judge — not a zero).
   */
  sentiment: {
    mentionedSamples: number;
    verdicts: Record<SentimentVerdict, number>;
    /** Evidence quotes for every 'negative' verdict. */
    negativeEvidence: string[];
  } | null;
  probe: {
    samples: number;
    recognition: Record<RecognitionVerdict, number>;
    /** Evidence quotes for every 'confused' verdict — each is a P0 lead. */
    confusedEvidence: string[];
  } | null;
}

export interface MetricsReport {
  generatedAt: string;
  brand: string;
  totalSamples: number;
  platforms: PlatformMetrics[];
}
