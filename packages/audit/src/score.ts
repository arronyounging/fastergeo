/**
 * Six-dimension scoring, evidence-anchored.
 *
 * Bands trace to published empirical findings:
 * - length: top-quartile pages average 1,943 words vs 170 bottom (11.4x);
 *   >2,900-word articles earn 5.1 citations vs 3.2 for <800
 * - blocks: statistics +61.6%, definitions +57.3%, comparisons +55.3%,
 *   how-to +41.2% citation probability; tables 2.8x; FAQ blocks +156%
 * - structure: clean heading hierarchy correlates with 3.2x citations
 * - relevance: strongest single predictor of citation (r = 0.432)
 * - authority: recency <3 months ≈ 3x citation likelihood
 *
 * Weights (100 total): crawlability 15 · length 15 · structure 20 ·
 * blocks 25 · authority 15 · relevance 10.
 */

import { segmentCjkWords, isCjkDominant } from '@fastergeo/rules';
import type {
  BlockSignals, DimensionScore, PageAudit, PageFeatures,
} from './types.js';

/** Words below which a page is treated as a client-rendered empty shell. */
const SHELL_WORD_COUNT = 60;

function scoreCrawlability(f: PageFeatures): DimensionScore {
  const issues: string[] = [];
  let score = 0;
  if (f.status >= 200 && f.status < 400) score += 4; else issues.push('http-error');
  if (!f.noindex) score += 3; else issues.push('noindex');
  if (f.canonical) score += 2; else issues.push('no-canonical');
  if (f.wordCount >= 120) score += 4;
  else issues.push(f.wordCount < SHELL_WORD_COUNT ? 'spa-shell' : 'thin-text');
  if (f.lang) score += 2; else issues.push('no-lang');
  return { key: 'crawlability', score, max: 15, issues };
}

function scoreLength(f: PageFeatures): DimensionScore {
  const w = f.wordCount;
  const score =
    w >= 1500 ? 15 :
    w >= 1000 ? 12.75 :
    w >= 600 ? 9 :
    w >= 300 ? 5.25 :
    (w / 300) * 5.25;
  const issues = w < 600 ? ['content-short'] : [];
  return { key: 'length', score: Math.round(score * 10) / 10, max: 15, issues };
}

function scoreStructure(f: PageFeatures): DimensionScore {
  const issues: string[] = [];
  let score = 0;
  if (f.h1.length === 1) score += 4;
  else issues.push(f.h1.length === 0 ? 'no-h1' : 'multiple-h1');
  const h2 = f.h2.length;
  score += h2 >= 5 ? 6 : (h2 / 5) * 6;
  if (h2 < 2) issues.push('few-h2');
  score += f.paragraphCount >= 5 ? 5 : (f.paragraphCount / 5) * 5;
  if (f.listCount > 0) score += 5; else issues.push('no-lists');
  return { key: 'structure', score: Math.round(score * 10) / 10, max: 20, issues };
}

function scoreBlocks(b: BlockSignals): DimensionScore {
  const issues: string[] = [];
  let score = 0;
  if (b.definition) score += 6; else issues.push('block-gap:definition');
  if (b.statistics) score += 6; else issues.push('block-gap:statistics');
  if (b.comparison) score += 5; else issues.push('block-gap:comparison');
  if (b.steps) score += 5; else issues.push('block-gap:steps');
  if (b.faq) score += 3; else issues.push('block-gap:faq');
  return { key: 'blocks', score, max: 25, issues };
}

function scoreAuthority(f: PageFeatures): DimensionScore {
  const issues: string[] = [];
  let score = 0;
  if (f.hasPublishDate) score += 4; else issues.push('no-date');
  if (f.hasAuthor) score += 2; else issues.push('no-author');
  if (f.externalLinkCount >= 2) score += 4;
  else if (f.externalLinkCount === 1) score += 2;
  else issues.push('no-external-links');
  if (f.jsonLdTypes.length > 0) score += 5; else issues.push('no-jsonld');
  return { key: 'authority', score, max: 15, issues };
}

/** Keyword coverage of the question bank in title + headings (r = 0.432). */
function scoreRelevance(f: PageFeatures, questions?: string[]): DimensionScore {
  if (!questions || questions.length === 0) {
    // Unmeasured, never guessed — weight is redistributed at normalization.
    return { key: 'relevance', score: null, max: 10, issues: [] };
  }
  const haystack = [f.title, ...f.h1, ...f.h2, ...f.h3].join(' ').toLowerCase();
  const keywords = new Set<string>();
  for (const q of questions) {
    const words = isCjkDominant(q)
      ? segmentCjkWords(q)
      : q.toLowerCase().split(/\W+/).filter(w => w.length >= 4);
    words.forEach(w => keywords.add(w));
  }
  if (keywords.size === 0) return { key: 'relevance', score: null, max: 10, issues: [] };
  let hit = 0;
  for (const k of keywords) if (haystack.includes(k)) hit++;
  const coverage = hit / keywords.size;
  return {
    key: 'relevance',
    score: Math.round(coverage * 10 * 10) / 10,
    max: 10,
    issues: coverage < 0.1 ? ['off-topic'] : [],
  };
}

export function scorePage(
  f: PageFeatures,
  blocks: BlockSignals,
  questions?: string[],
): PageAudit {
  const dimensions = [
    scoreCrawlability(f),
    scoreLength(f),
    scoreStructure(f),
    scoreBlocks(blocks),
    scoreAuthority(f),
    scoreRelevance(f, questions),
  ];
  const measured = dimensions.filter(d => d.score !== null);
  const earned = measured.reduce((a, d) => a + (d.score ?? 0), 0);
  const maxMeasured = measured.reduce((a, d) => a + d.max, 0);
  const score = maxMeasured > 0 ? Math.round((earned / maxMeasured) * 1000) / 10 : 0;

  const blockers: string[] = [];
  if (f.wordCount < SHELL_WORD_COUNT && f.htmlBytes > 50_000) {
    blockers.push(
      `spa-shell: 页面 HTML ${Math.round(f.htmlBytes / 1024)}KB 但可见正文仅 ${f.wordCount} 词等效 — AI 爬虫看到的是空壳，修复渲染前其他优化无效`,
    );
  }
  if (f.noindex) blockers.push('noindex: 页面禁止索引');

  return {
    url: f.url,
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 40 ? 'C' : 'D',
    dimensions,
    blocks,
    wordCount: f.wordCount,
    blockers,
  };
}
