/**
 * Metrics computation: raw samples → per-platform metrics.
 * Every number is derivable from the input samples — no hidden state.
 */

import type {
  BrandConfig, MetricsReport, PlatformMetrics, RecognitionJudge,
  RecognitionVerdict, Sample, SentimentJudge, SentimentVerdict,
} from './types.js';
import { brandRank, mentions } from './matching.js';
import { classifyRecognition } from './recognition.js';
import { classifySentiment } from './sentiment.js';

function brandNames(brand: BrandConfig): string[] {
  return [brand.name, ...brand.aliases];
}

function competitorSets(brand: BrandConfig): Array<{ name: string; names: string[] }> {
  return brand.competitors.map(c => ({ name: c.name, names: [c.name, ...(c.aliases ?? [])] }));
}

function citesOwnDomain(citations: string[], domains: string[]): boolean {
  return citations.some(url => {
    // Hostname suffix match — 'notcustyle.ai.evil.co' must not count as
    // custyle.ai. Non-URL citation strings fall back to substring.
    try {
      const host = new URL(url).hostname.toLowerCase();
      return domains.some(d => {
        const dom = d.toLowerCase();
        return host === dom || host.endsWith(`.${dom}`);
      });
    } catch {
      return domains.some(d => url.toLowerCase().includes(d.toLowerCase()));
    }
  });
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface ComputeOptions {
  /** LLM judge for probe recognition; without it, undecided → 'unverified'. */
  judge?: RecognitionJudge;
  /** LLM judge for mention sentiment; without it, undecided → 'unverified'. */
  sentimentJudge?: SentimentJudge;
  brandDescription?: string;
}

/** Compute metrics for one provider's samples (already grouped). */
async function computePlatform(
  providerId: string,
  samples: Sample[],
  brand: BrandConfig,
  opts: ComputeOptions,
): Promise<PlatformMetrics> {
  const names = brandNames(brand);
  const comps = competitorSets(brand);

  const unprompted = samples.filter(s => !s.brandInQuestion);
  const probes = samples.filter(s => s.brandInQuestion);

  let mentioned = 0;
  let top1 = 0;
  let top3 = 0;
  const ranks: number[] = [];
  let brandVoice = 0;
  let competitorVoice = 0;
  let ownCiteSamples = 0;
  let ownCitations = 0;
  let allCitations = 0;
  const competitorMentions: Record<string, number> = {};
  const sentimentVerdicts: Record<SentimentVerdict, number> = {
    positive: 0, neutral: 0, negative: 0, unverified: 0,
  };
  const negativeEvidence: string[] = [];

  for (const s of unprompted) {
    const { rank, mentioned: entities } = brandRank(s.answer, names, comps);
    if (rank !== null) {
      mentioned++;
      ranks.push(rank);
      if (rank === 1) top1++;
      if (rank <= 3) top3++;
      brandVoice++;
      const sent = await classifySentiment(s.answer, names, { judge: opts.sentimentJudge });
      sentimentVerdicts[sent.verdict]++;
      if (sent.verdict === 'negative' && sent.evidence) negativeEvidence.push(sent.evidence);
    }
    for (const e of entities) {
      if (e.name !== '__brand__') {
        competitorVoice++;
        competitorMentions[e.name] = (competitorMentions[e.name] ?? 0) + 1;
      }
    }
    allCitations += s.citations.length;
    const own = s.citations.filter(u => citesOwnDomain([u], brand.domains)).length;
    ownCitations += own;
    if (own > 0) ownCiteSamples++;
  }

  let probe: PlatformMetrics['probe'] = null;
  if (probes.length > 0) {
    const recognition: Record<RecognitionVerdict, number> = {
      knows: 0, unknown: 0, confused: 0, unverified: 0,
    };
    const confusedEvidence: string[] = [];
    for (const s of probes) {
      const r = await classifyRecognition(s.answer, brand.name, {
        brandDescription: opts.brandDescription,
        judge: opts.judge,
      });
      recognition[r.verdict]++;
      if (r.verdict === 'confused' && r.evidence) confusedEvidence.push(r.evidence);
    }
    probe = { samples: probes.length, recognition, confusedEvidence };
  }

  return {
    providerId,
    market: samples[0]?.market ?? 'global',
    samples: unprompted.length,
    mentionRate: ratio(mentioned, unprompted.length),
    top1Rate: ratio(top1, unprompted.length),
    top3Rate: ratio(top3, unprompted.length),
    avgRank: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
    shareOfVoice: ratio(brandVoice, brandVoice + competitorVoice),
    ownDomainCiteRate: ratio(ownCiteSamples, unprompted.length),
    citationShare: ratio(ownCitations, allCitations),
    competitorMentions,
    sentiment: mentioned > 0
      ? { mentionedSamples: mentioned, verdicts: sentimentVerdicts, negativeEvidence }
      : null,
    probe,
  };
}

/** Compute the full report: samples grouped by provider, cn/global kept apart. */
export async function computeMetrics(
  samples: Sample[],
  brand: BrandConfig,
  opts: ComputeOptions = {},
): Promise<MetricsReport> {
  const byProvider = new Map<string, Sample[]>();
  for (const s of samples) {
    const list = byProvider.get(s.providerId) ?? [];
    list.push(s);
    byProvider.set(s.providerId, list);
  }
  const platforms: PlatformMetrics[] = [];
  for (const [providerId, group] of byProvider) {
    platforms.push(await computePlatform(providerId, group, brand, opts));
  }
  platforms.sort((a, b) => a.market.localeCompare(b.market) || a.providerId.localeCompare(b.providerId));
  return {
    generatedAt: new Date().toISOString(),
    brand: brand.name,
    totalSamples: samples.length,
    platforms,
  };
}
