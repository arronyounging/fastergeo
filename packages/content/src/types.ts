/**
 * @fastergeo/content — Content factory types.
 *
 * Doctrine: the fact store is the single source of truth for every asset
 * (drafts, llms.txt, JSON-LD). Every fact carries an evidence grade; what
 * cannot be sourced is marked unconfirmed and excluded from generation.
 * LLM drafts must pass fabrication lint before a human ever sees them.
 */

/**
 * Evidence grades (field-tested discipline):
 * A = 一手可复现（官网/官方文档/工商信息）
 * B = 官方渠道声明（公告/客服确认）
 * C = 三方权威转述（媒体/研报）
 * D = 三方非权威（社区/自媒体）
 * E = 推断/口头 — 不得进入对外内容
 */
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Fact {
  id: string;
  /** The claim, stated exactly as it may appear in content. */
  claim: string;
  grade: EvidenceGrade;
  /** Source URL or document reference. */
  source?: string;
  /** unconfirmed facts are excluded from generation until resolved. */
  status: 'confirmed' | 'unconfirmed';
}

export interface FactStore {
  brand: string;
  /** Canonical one-sentence definition — must be verbatim-consistent across
   * homepage, about page, JSON-LD description, and llms.txt. */
  definition: string;
  facts: Fact[];
  /** Things we explicitly do NOT claim (guardrail for generation). */
  doNotClaim?: string[];
}

export interface FabricationIssue {
  kind: 'unsourced-number' | 'unsourced-superlative' | 'unconfirmed-fact' | 'do-not-claim';
  /** The offending text fragment, quoted. */
  quote: string;
  line: number;
  suggestion: string;
}

export interface OutlineSection {
  heading: string;
  /** Extractable blocks this section must contain. */
  requiredBlocks: Array<'definition' | 'statistics' | 'comparison' | 'steps' | 'faq'>;
  /** Fact ids to weave in. */
  factIds: string[];
  notes?: string;
}

export interface Outline {
  question: string;
  titleCandidates: string[];
  sections: OutlineSection[];
  targetWordCount: number;
  market: 'cn' | 'global';
}
