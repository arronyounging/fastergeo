import { describe, it, expect } from 'vitest';
import { renderHtmlReport } from '../src/render.js';
import type { ReportInput } from '../src/render.js';

const INPUT: ReportInput = {
  brandName: 'Custyle',
  generatedAt: '2026-08-02T12:00:00Z',
  audit: {
    root: 'https://custyle.ai',
    generatedAt: '2026-08-02T12:00:00Z',
    site: { robotsTxtFound: true, blockedAiCrawlers: [], sitemapFound: true, llmsTxtFound: true },
    pages: [{
      url: 'https://custyle.ai/products/hoodie', score: 16, grade: 'D', wordCount: 23,
      dimensions: [
        { key: 'crawlability', score: 11, max: 15, issues: ['spa-shell'] },
        { key: 'relevance', score: null, max: 10, issues: [] },
      ],
      blocks: { definition: false, statistics: false, comparison: false, steps: false, faq: false },
      blockers: ['spa-shell: 页面 HTML 419KB 但可见正文仅 23 词等效'],
    }],
    failedUrls: ['https://custyle.ai/timeout-page'],
    avgScore: 44.6,
    gradeDistribution: { A: 0, B: 2, C: 1, D: 4 },
    blockers: [],
  },
  metrics: {
    generatedAt: '2026-08-02T12:00:00Z', brand: 'Custyle', totalSamples: 64,
    platforms: [{
      providerId: 'doubao', market: 'cn', samples: 14,
      mentionRate: 0, top1Rate: 0, top3Rate: 0, avgRank: null,
      shareOfVoice: 0, ownDomainCiteRate: 0, citationShare: null,
      competitorMentions: { Printful: 1 },
      sentiment: null,
      probe: {
        samples: 2,
        recognition: { knows: 0, unknown: 0, confused: 1, unverified: 1 },
        confusedEvidence: ['主打汽车外观改装件（前后包围、中网）<script>x</script>'],
      },
    }],
  },
  tickets: [{
    id: 'T-001', title: '修复客户端渲染空壳页', priority: 'P0',
    rationale: '3 个页面是空壳', status: 'todo', history: [],
    acceptance: { type: 'auto', check: 'pages.issue_lte:spa-shell:0', desc: '重抓后 ≥120 词' },
  }],
};

describe('renderHtmlReport', () => {
  const html = renderHtmlReport(INPUT);

  it('puts blockers in a red banner with confusion evidence', () => {
    expect(html).toContain('Fix these before anything else');
    expect(html).toContain('spa-shell');
    expect(html).toContain('Brand confusion');
    expect(html).toContain('汽车外观改装件'); // evidence quotes stay verbatim
  });

  it('escapes HTML in evidence quotes (no script injection)', () => {
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders the entity funnel with confusion marked bad', () => {
    expect(html).toContain('Brand Entity Funnel');
    expect(html).toContain('1 confusion');
  });

  it('renders unmeasured values as 未测, never zeros', () => {
    expect(html).toContain('unmeasured');
    // citationShare null → engine table shows 未测 for that cell path (own cite is 0% legitimately)
  });

  it('includes methodology tooltips and honesty footer', () => {
    expect(html).toContain('method');
    expect(html).toContain('never a fabricated zero');
  });

  it('renders headline from the worst findings', () => {
    expect(html).toContain('confuse')
    expect(html).toContain('empty shell');
  });

  it('renders tickets with auto-acceptance count', () => {
    expect(html).toContain('1 machine-verifiable');
    expect(html).toContain('T-001');
  });

  it('is fully self-contained (no external resources)', () => {
    expect(html).not.toMatch(/src=["']https?:/);
    expect(html).not.toMatch(/href=["']https?:/);
  });
});


describe('renderHtmlReport — answer replay', () => {
  const withSamples: ReportInput = {
    ...INPUT,
    metrics: {
      ...INPUT.metrics!,
      platforms: [{
        ...INPUT.metrics!.platforms[0],
        probe: {
          samples: 2,
          recognition: { knows: 0, unknown: 0, confused: 1, unverified: 1 },
          confusedEvidence: ['主打汽车外观改装件（前后包围、中网）'],
        },
      }],
    },
    brandAliases: ['CUSTYLE.ai'],
    samples: [
      {
        providerId: 'doubao', market: 'cn', questionId: 'q1',
        question: '定制周边平台推荐？', brandInQuestion: false,
        answer: '推荐 Printful 和 custyle 两家。<img src=x onerror=alert(1)>',
        citations: ['https://example.com/roundup'], channel: 'api', model: 'doubao-seed',
      },
      {
        providerId: 'doubao', market: 'cn', questionId: 'q2',
        question: 'Custyle 是什么公司？', brandInQuestion: true,
        answer: 'Custyle 主打汽车外观改装件（前后包围、中网）等产品。',
        citations: [],
      },
    ],
  };
  const html = renderHtmlReport(withSamples);

  it('renders verbatim answers grouped by engine', () => {
    expect(html).toContain('Answer Replay (2 samples');
    expect(html).toContain('定制周边平台推荐？');
    expect(html).toContain('doubao · cn');
  });

  it('highlights brand mentions case-insensitively (aliases included)', () => {
    expect(html).toContain('<mark class="hl-brand">custyle</mark>');
  });

  it('does not highlight name echo in probe answers (name echo is not knowledge)', () => {
    // The probe answer's brand mention must NOT be marked as a positive hit.
    const probePart = html.slice(html.indexOf('主打汽车') - 200, html.indexOf('主打汽车') + 50);
    expect(probePart).not.toContain('hl-brand');
  });

  it('highlights confusion evidence in red inside the answer it came from', () => {
    expect(html).toContain('hl-ev');
    expect(html).toContain('confusion evidence');
  });

  it('escapes answer HTML — highlighting cannot enable injection', () => {
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('tags unprompted samples with deterministic mention chips only', () => {
    expect(html).toContain('mentions brand');
    expect(html).toContain('probe');
  });

  it('omits the section entirely without samples', () => {
    expect(renderHtmlReport(INPUT)).not.toContain('Answer Replay');
  });

  it('uses metric word-boundary rules — no mention chip or highlight for lookalike names', () => {
    const lookalike = renderHtmlReport({
      ...withSamples,
      samples: [{
        providerId: 'doubao', market: 'cn', questionId: 'q3',
        question: 'best custom merch?', brandInQuestion: false,
        answer: 'Custylex is a popular platform.', citations: [],
      }],
    });
    expect(lookalike).not.toContain('<mark class="hl-brand">');
    expect(lookalike).toContain('no mention');
    expect(lookalike).not.toContain('>mentions brand<');
  });

  it('never tags unprompted answers with confusion evidence (probe-only)', () => {
    const html2 = renderHtmlReport({
      ...withSamples,
      samples: [{
        providerId: 'doubao', market: 'cn', questionId: 'q4',
        question: 'top platforms?', brandInQuestion: false,
        answer: '有的品牌主打汽车外观改装件（前后包围、中网）。', citations: [],
      }],
    });
    // No red mark and no red chip on the unprompted sample — the evidence
    // note (group-level fallback) is the only place the quote may surface.
    expect(html2).not.toContain('<mark class="hl-ev">');
    expect(html2).not.toContain('class="chip c-bad"');
  });

  it('renders judge evidence that cannot be located verbatim as an explicit note', () => {
    const paraphrased = renderHtmlReport({
      ...withSamples,
      metrics: {
        ...withSamples.metrics!,
        platforms: [{
          ...withSamples.metrics!.platforms[0],
          probe: {
            samples: 1,
            recognition: { knows: 0, unknown: 0, confused: 1, unverified: 0 },
            confusedEvidence: ['裁判改写过的引语（原文里不存在）'],
          },
        }],
      },
    });
    expect(paraphrased).toContain('could not be located verbatim');
    expect(paraphrased).toContain('裁判改写过的引语');
  });

  it('names unreachable pages in the audit section', () => {
    expect(html).toContain('unreachable');
    expect(html).toContain('timeout-page');
  });

  it('renders sentiment column and puts negative evidence in the banner', () => {
    const withSentiment = renderHtmlReport({
      ...INPUT,
      metrics: {
        ...INPUT.metrics!,
        platforms: [{
          ...INPUT.metrics!.platforms[0],
          mentionRate: 0.5, samples: 14,
          sentiment: {
            mentionedSamples: 7,
            verdicts: { positive: 4, neutral: 2, negative: 1, unverified: 0 },
            negativeEvidence: ['不推荐使用该品牌，投诉较多'],
          },
        }],
      },
    });
    expect(withSentiment).toContain('+4');
    expect(withSentiment).toContain('−1');
    expect(withSentiment).toContain('Negative mention');
    expect(withSentiment).toContain('不推荐使用该品牌');
  });

  it('mention rate carries a Wilson CI tooltip, and 0% is an interval too', () => {
    expect(html).toContain('95% CI');
    expect(html).toContain('Wilson');
  });
});

describe('renderHtmlReport — zh locale', () => {
  it('renders Chinese when lang=zh', () => {
    const html = renderHtmlReport({ ...INPUT, lang: 'zh' });
    expect(html).toContain('品牌实体漏斗');
    expect(html).toContain('修复前一切优化无效');
    expect(html).toContain('未测');
    expect(html).toContain('lang="zh-CN"');
  });
});
