import { describe, it, expect } from 'vitest';
import { generateTickets } from '../src/generate.js';
import { verifyTickets } from '../src/verify.js';
import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';

function mkAudit(over: Partial<SiteAudit> = {}): SiteAudit {
  return {
    root: 'https://example.com',
    generatedAt: '2026-08-02T00:00:00Z',
    site: { robotsTxtFound: true, blockedAiCrawlers: [], sitemapFound: true, llmsTxtFound: true },
    pages: [],
    avgScore: 50,
    gradeDistribution: { A: 0, B: 0, C: 0, D: 0 },
    blockers: [],
    ...over,
  };
}

function shellPage(url: string): SiteAudit['pages'][0] {
  return {
    url, score: 16, grade: 'D', wordCount: 23,
    dimensions: [
      { key: 'crawlability', score: 11, max: 15, issues: ['spa-shell'] },
      { key: 'blocks', score: 0, max: 25, issues: ['block-gap:definition', 'block-gap:faq'] },
    ],
    blocks: { definition: false, statistics: false, comparison: false, steps: false, faq: false },
    blockers: ['spa-shell: ...'],
  };
}

function mkMetrics(over: Partial<MetricsReport> = {}): MetricsReport {
  return {
    generatedAt: '2026-08-02T00:00:00Z', brand: 'Custyle', totalSamples: 10,
    platforms: [{
      providerId: 'doubao', market: 'cn', samples: 5,
      mentionRate: 0, top1Rate: 0, top3Rate: 0, avgRank: null,
      shareOfVoice: 0, ownDomainCiteRate: 0, citationShare: null,
      competitorMentions: {}, sentiment: null,
      probe: {
        samples: 2,
        recognition: { knows: 0, unknown: 0, confused: 1, unverified: 1 },
        confusedEvidence: ['主打汽车外观改装件'],
      },
    }],
    ...over,
  };
}

describe('generateTickets', () => {
  it('creates P0 for SPA shells and blocked crawlers, ordered first', () => {
    const audit = mkAudit({
      site: { robotsTxtFound: true, blockedAiCrawlers: ['GPTBot'], sitemapFound: true, llmsTxtFound: true },
      pages: [shellPage('https://example.com/p1'), shellPage('https://example.com/p2')],
    });
    const tickets = generateTickets(audit, undefined);
    expect(tickets[0].priority).toBe('P0');
    const shells = tickets.find(t => t.acceptance.type === 'auto' && t.acceptance.check.startsWith('pages.issue_lte:spa-shell'));
    expect(shells?.priority).toBe('P0');
    expect(shells?.baseline).toBe(2);
    const robots = tickets.find(t => t.acceptance.type === 'auto' && t.acceptance.check === 'site.no_ai_block');
    expect(robots?.priority).toBe('P0');
  });

  it('creates P0 entity-disambiguation ticket from confused verdicts with evidence', () => {
    const tickets = generateTickets(undefined, mkMetrics());
    const entity = tickets.find(t => t.title.includes('Entity disambiguation'));
    expect(entity?.priority).toBe('P0');
    expect(entity?.rationale).toContain('汽车'); // evidence stays verbatim
    expect(entity?.market).toBe('cn');
  });

  it('grades llms.txt honestly as P2 (zero weight for Google)', () => {
    const audit = mkAudit({ site: { robotsTxtFound: true, blockedAiCrawlers: [], sitemapFound: true, llmsTxtFound: false } });
    const tickets = generateTickets(audit, undefined);
    const llms = tickets.find(t => t.acceptance.type === 'auto' && t.acceptance.check === 'site.llms_txt');
    expect(llms?.priority).toBe('P2');
  });

  it('creates mention-rate target ticket below 30%', () => {
    const tickets = generateTickets(undefined, mkMetrics());
    const mr = tickets.find(t => t.acceptance.type === 'auto' && t.acceptance.check === 'metrics.mention_rate_gte:cn:0.3');
    expect(mr).toBeDefined();
    expect(mr?.baseline).toBe(0);
  });
});

describe('verifyTickets', () => {
  it('flips todo→done on pass and records history', () => {
    const audit = mkAudit({ pages: [shellPage('https://example.com/p1')] });
    const tickets = generateTickets(audit, undefined);
    const shellTicket = tickets.find(t => (t.acceptance as any).check?.startsWith('pages.issue_lte:spa-shell'))!;
    // 修复后：重抓 audit 无 spa-shell 页面
    const fixedAudit = mkAudit({ avgScore: 75, pages: [] });
    const summary = verifyTickets(tickets, { audit: fixedAudit });
    expect(shellTicket.status).toBe('done');
    expect(shellTicket.history).toHaveLength(1);
    expect(summary.counts.pass).toBeGreaterThan(0);
  });

  it('flips done→regressed when a fix rots', () => {
    const tickets = generateTickets(mkAudit({ pages: [shellPage('https://x.com/p')] }), undefined);
    const t = tickets.find(x => (x.acceptance as any).check?.startsWith('pages.issue_lte:spa-shell'))!;
    verifyTickets(tickets, { audit: mkAudit({ pages: [] }) });
    expect(t.status).toBe('done');
    verifyTickets(tickets, { audit: mkAudit({ pages: [shellPage('https://x.com/p')] }) });
    expect(t.status).toBe('regressed');
    expect(t.history).toHaveLength(2);
  });

  it('reports unmeasurable (status untouched) when inputs missing', () => {
    const tickets = generateTickets(mkAudit({ pages: [shellPage('https://x.com/p')] }), mkMetrics());
    const summary = verifyTickets(tickets, {}); // 无 audit 无 metrics
    expect(summary.counts.unmeasurable).toBe(summary.verdicts.length);
    expect(tickets.every(t => t.status === 'todo' || t.status === 'pending-manual')).toBe(true);
  });

  it('no_confusion passes only with judged samples and zero confused', () => {
    const tickets = generateTickets(undefined, mkMetrics());
    const entity = tickets.find(t => t.title.includes('Entity disambiguation'))!;
    // 下期：全部 unverified（没跑 judge）→ 未测，不能算通过
    const allUnverified = mkMetrics();
    allUnverified.platforms[0].probe!.recognition = { knows: 0, unknown: 0, confused: 0, unverified: 2 };
    allUnverified.platforms[0].probe!.confusedEvidence = [];
    let summary = verifyTickets(tickets, { metrics: allUnverified });
    expect(summary.verdicts.find(v => v.ticketId === entity.id)?.outcome).toBe('unmeasurable');
    expect(entity.status).toBe('todo');
    // 下期：judge 判定 knows×2 → 通过
    const fixed = mkMetrics();
    fixed.platforms[0].probe!.recognition = { knows: 2, unknown: 0, confused: 0, unverified: 0 };
    fixed.platforms[0].probe!.confusedEvidence = [];
    summary = verifyTickets(tickets, { metrics: fixed });
    expect(entity.status).toBe('done');
  });
});


describe('generateTickets — zh locale', () => {
  it('generates Chinese titles when lang=zh', () => {
    const tickets = generateTickets(undefined, mkMetrics(), 'zh');
    expect(tickets.some(t => t.title.includes('实体消歧'))).toBe(true);
  });
});
