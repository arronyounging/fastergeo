import { describe, it, expect } from 'vitest';
import { assessTrend, computeTrends } from '../src/index.js';
import type { PeriodRecord } from '../src/index.js';

function period(date: string, over: {
  mentionRate?: number | null;
  confused?: number;
  avgScore?: number;
  blockers?: number;
} = {}): PeriodRecord {
  return {
    date,
    metrics: {
      generatedAt: date, brand: 'Custyle', totalSamples: 16,
      platforms: [{
        providerId: 'doubao', market: 'cn', samples: 14,
        mentionRate: over.mentionRate ?? 0, top1Rate: 0, top3Rate: 0, avgRank: null,
        shareOfVoice: 0, ownDomainCiteRate: 0, citationShare: null, competitorMentions: {}, sentiment: null,
        probe: {
          samples: 2,
          recognition: { knows: 0, unknown: 2 - (over.confused ?? 0), confused: over.confused ?? 0, unverified: 0 },
          confusedEvidence: [],
        },
      }],
    },
    audit: {
      root: 'https://x.com', generatedAt: date,
      site: { robotsTxtFound: true, blockedAiCrawlers: [], sitemapFound: true, llmsTxtFound: true },
      pages: Array.from({ length: over.blockers ?? 0 }, (_, i) => ({
        url: `https://x.com/p${i}`, score: 16, grade: 'D' as const, wordCount: 20,
        dimensions: [], blocks: { definition: false, statistics: false, comparison: false, steps: false, faq: false },
        blockers: ['spa-shell: x'],
      })),
      avgScore: over.avgScore ?? 50,
      gradeDistribution: { A: 0, B: 0, C: 0, D: over.blockers ?? 0 },
      blockers: [],
    },
  };
}

describe('assessTrend — the two-period discipline', () => {
  it('is insufficient with fewer than two measurements', () => {
    expect(assessTrend([0.1]).kind).toBe('insufficient');
    expect(assessTrend([null, 0.1]).kind).toBe('insufficient');
  });

  it('one change is an observation, never a trend', () => {
    const v = assessTrend([0.1, 0.3]);
    expect(v).toEqual({ kind: 'observation', direction: 'up' });
  });

  it('two consecutive same-direction changes make a trend', () => {
    expect(assessTrend([0.1, 0.2, 0.3])).toEqual({ kind: 'trend', direction: 'up' });
    expect(assessTrend([0.5, 0.4, 0.2])).toEqual({ kind: 'trend', direction: 'down' });
  });

  it('direction reversal downgrades to observation', () => {
    expect(assessTrend([0.1, 0.3, 0.2]).kind).toBe('observation');
  });

  it('nulls (未测) are excluded, not treated as zero', () => {
    expect(assessTrend([0.1, null, 0.2, 0.3])).toEqual({ kind: 'trend', direction: 'up' });
  });
});

describe('computeTrends', () => {
  it('computes per-platform deltas with verdicts', () => {
    const r = computeTrends([
      period('2026-08-02', { mentionRate: 0 }),
      period('2026-08-16', { mentionRate: 0.1 }),
      period('2026-08-30', { mentionRate: 0.25 }),
    ]);
    const d = r.deltas.find(x => x.key === 'doubao.mentionRate')!;
    expect(d.prev).toBe(0.1);
    expect(d.curr).toBe(0.25);
    expect(d.verdict).toEqual({ kind: 'trend', direction: 'up' });
  });

  it('alerts P0 when confusion newly appears', () => {
    const r = computeTrends([
      period('2026-08-02', { confused: 0 }),
      period('2026-08-16', { confused: 1 }),
    ]);
    expect(r.alerts.some(a => a.level === 'P0' && a.message.includes('New brand confusion'))).toBe(true);
  });

  it('does not alert when confusion existed before', () => {
    const r = computeTrends([
      period('2026-08-02', { confused: 1 }),
      period('2026-08-16', { confused: 1 }),
    ]);
    expect(r.alerts.filter(a => a.message.includes('confusion'))).toHaveLength(0);
  });

  it('alerts P0 on blocker count rising', () => {
    const r = computeTrends([
      period('2026-08-02', { blockers: 0 }),
      period('2026-08-16', { blockers: 2 }),
    ]);
    expect(r.alerts.some(a => a.message.includes('Blocker'))).toBe(true);
  });

  it('flags >10pp mention drop as observation-level warning with humble wording', () => {
    const r = computeTrends([
      period('2026-08-02', { mentionRate: 0.4 }),
      period('2026-08-16', { mentionRate: 0.1 }),
    ]);
    const w = r.alerts.find(a => a.level === 'warn')!;
    expect(w.message).toContain('observations by default');
  });

  it('sorts periods by date regardless of input order', () => {
    const r = computeTrends([
      period('2026-08-30', { mentionRate: 0.25 }),
      period('2026-08-02', { mentionRate: 0 }),
      period('2026-08-16', { mentionRate: 0.1 }),
    ]);
    expect(r.periods).toEqual(['2026-08-02', '2026-08-16', '2026-08-30']);
    expect(r.deltas.find(x => x.key === 'doubao.mentionRate')?.curr).toBe(0.25);
  });
});


describe('computeTrends — zh locale', () => {
  it('renders Chinese alerts when lang=zh', () => {
    const r = computeTrends([
      period('2026-08-02', { confused: 0 }),
      period('2026-08-16', { confused: 1 }),
    ], 'zh');
    expect(r.alerts.some(a => a.message.includes('张冠李戴'))).toBe(true);
  });
});
