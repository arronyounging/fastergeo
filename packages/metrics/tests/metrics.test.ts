import { describe, it, expect } from 'vitest';
import { firstMentionIndex, brandRank } from '../src/matching.js';
import { classifyRecognition } from '../src/recognition.js';
import { computeMetrics } from '../src/compute.js';
import { parseGeoLookSamples } from '../src/geolook.js';
import type { BrandConfig, Sample } from '../src/types.js';

const BRAND: BrandConfig = {
  name: 'Custyle',
  aliases: ['CUSTYLE.AI'],
  domains: ['custyle.ai'],
  competitors: [
    { name: 'Printful' },
    { name: 'Zazzle' },
    { name: 'Redbubble' },
  ],
};

// ── Real dogfood answers (2026-08-02 sampling run) ──────────────────────────

const DEEPSEEK_DENIAL =
  '对不起，我无法提供关于"Custyle"品牌的具体信息，因为我没有相关的数据或评价来源。';

const DOUBAO_CONFUSED =
  'Custyle是一个深耕细分领域的小众品牌。主打汽车外观改装件（前后包围、中网、内饰装饰件等），' +
  '优势是性价比远高于原厂改装件。';

const CHATGPT_KNOWS =
  'Custyle is an AI-powered merchandise platform that lets users turn ideas into custom apparel and products.';

describe('matching', () => {
  it('matches latin brand names on word boundaries only', () => {
    expect(firstMentionIndex('Try Custyle today', ['Custyle'])).toBeGreaterThanOrEqual(0);
    expect(firstMentionIndex('Try custylex today', ['Custyle'])).toBe(-1);
  });

  it('matches case-insensitively and with dotted aliases', () => {
    expect(firstMentionIndex('visit CUSTYLE.AI now', ['Custyle', 'CUSTYLE.AI'])).toBe(6);
  });

  it('matches CJK names by substring', () => {
    expect(firstMentionIndex('可以试试云印定制服务', ['云印'])).toBe(4);
  });

  it('ranks brand by first occurrence among competitors', () => {
    const text = 'Popular options include Zazzle, Printful, and Custyle for custom merch.';
    const { rank, mentioned } = brandRank(text, ['Custyle'], [
      { name: 'Zazzle', names: ['Zazzle'] },
      { name: 'Printful', names: ['Printful'] },
    ]);
    expect(rank).toBe(3);
    expect(mentioned.map(m => m.name)).toEqual(['Zazzle', 'Printful', '__brand__']);
  });

  it('returns null rank when brand absent', () => {
    const { rank } = brandRank('Use Zazzle or Printful.', ['Custyle'], [
      { name: 'Zazzle', names: ['Zazzle'] },
    ]);
    expect(rank).toBeNull();
  });
});

describe('recognition classification', () => {
  it('classifies explicit denial as unknown (real DeepSeek answer)', async () => {
    const r = await classifyRecognition(DEEPSEEK_DENIAL, 'Custyle');
    expect(r.verdict).toBe('unknown');
    expect(r.method).toBe('heuristic');
    expect(r.evidence).toBeTruthy();
  });

  it('classifies English denial as unknown', async () => {
    const r = await classifyRecognition(
      "I don't have specific information about this brand.", 'Custyle');
    expect(r.verdict).toBe('unknown');
  });

  it('stays unverified without a judge — never guesses knows/confused', async () => {
    const r = await classifyRecognition(DOUBAO_CONFUSED, 'Custyle');
    expect(r.verdict).toBe('unverified');
  });

  it('delegates undecided answers to the judge', async () => {
    const judge = async () => ({
      verdict: 'confused' as const,
      evidence: '主打汽车外观改装件',
      method: 'judge' as const,
    });
    const r = await classifyRecognition(DOUBAO_CONFUSED, 'Custyle', { judge });
    expect(r.verdict).toBe('confused');
    expect(r.evidence).toContain('汽车');
  });
});

describe('computeMetrics', () => {
  const mk = (over: Partial<Sample>): Sample => ({
    providerId: 'openai', market: 'global', questionId: 'q1',
    question: 'best custom merch?', brandInQuestion: false,
    answer: '', citations: [], ...over,
  });

  it('computes mention rate, rank, and SoV on unprompted samples', async () => {
    const samples: Sample[] = [
      mk({ answer: 'Zazzle and Custyle are solid choices.', questionId: 'q1' }),
      mk({ answer: 'Use Printful or Redbubble.', questionId: 'q2' }),
      mk({ answer: 'Custyle leads the AI merch space.', questionId: 'q3' }),
      mk({ answer: 'Nothing relevant here.', questionId: 'q4' }),
    ];
    const report = await computeMetrics(samples, BRAND);
    const p = report.platforms[0];
    expect(p.samples).toBe(4);
    expect(p.mentionRate).toBeCloseTo(0.5);
    expect(p.top1Rate).toBeCloseTo(0.25); // q3 only (q1 has Zazzle first)
    expect(p.top3Rate).toBeCloseTo(0.5);
    expect(p.avgRank).toBeCloseTo(1.5); // ranks 2 and 1
    // voice: brand 2, competitors: Zazzle 1 + Printful 1 + Redbubble 1
    expect(p.shareOfVoice).toBeCloseTo(2 / 5);
    expect(p.competitorMentions).toEqual({ Zazzle: 1, Printful: 1, Redbubble: 1 });
  });

  it('segregates probe samples and classifies recognition', async () => {
    const samples: Sample[] = [
      mk({ answer: 'Printful is popular.', questionId: 'q1' }),
      mk({ answer: DEEPSEEK_DENIAL, questionId: 'q900', brandInQuestion: true }),
      mk({ answer: CHATGPT_KNOWS, questionId: 'q901', brandInQuestion: true }),
    ];
    const report = await computeMetrics(samples, BRAND);
    const p = report.platforms[0];
    expect(p.samples).toBe(1); // probes excluded from visibility
    expect(p.mentionRate).toBe(0);
    expect(p.probe?.samples).toBe(2);
    expect(p.probe?.recognition.unknown).toBe(1);
    expect(p.probe?.recognition.unverified).toBe(1); // no judge → not guessed
  });

  it('computes citation attribution', async () => {
    const samples: Sample[] = [
      mk({ answer: 'See sources.', citations: ['https://custyle.ai/faq', 'https://other.com/a'] }),
      mk({ answer: 'More.', citations: ['https://other.com/b'], questionId: 'q2' }),
    ];
    const report = await computeMetrics(samples, BRAND);
    const p = report.platforms[0];
    expect(p.ownDomainCiteRate).toBeCloseTo(0.5);
    expect(p.citationShare).toBeCloseTo(1 / 3);
  });

  it('reports null (not fabricated zeros) when nothing is measurable', async () => {
    const samples: Sample[] = [
      mk({ answer: DEEPSEEK_DENIAL, brandInQuestion: true }),
    ];
    const report = await computeMetrics(samples, BRAND);
    const p = report.platforms[0];
    expect(p.mentionRate).toBeNull();
    expect(p.citationShare).toBeNull();
    expect(p.avgRank).toBeNull();
  });

  it('keeps cn and global platforms separate', async () => {
    const samples: Sample[] = [
      mk({ providerId: 'openai', market: 'global', answer: 'Custyle rocks.' }),
      mk({ providerId: 'doubao', market: 'cn', answer: '推荐 Printful。' }),
    ];
    const report = await computeMetrics(samples, BRAND);
    expect(report.platforms).toHaveLength(2);
    expect(report.platforms.map(p => p.market)).toEqual(['cn', 'global']);
  });
});

describe('GeoLook adapter', () => {
  it('parses jsonl rows and maps probe flags', () => {
    const jsonl = [
      JSON.stringify({
        platform: 'openai', market: 'global', question_id: 'q101',
        question: 'best merch?', brand_in_question: false, ok: true,
        answer: 'Zazzle is popular.', citations: [], sample_mode: 'api',
      }),
      JSON.stringify({
        platform: 'doubao', market: 'cn', question_id: 'q900',
        question: 'Custyle 是什么？', brand_in_question: true, ok: true,
        answer: DOUBAO_CONFUSED, citations: [],
      }),
      JSON.stringify({ platform: 'glm', market: 'cn', question_id: 'q1', ok: false }),
      'not json',
    ].join('\n');
    const samples = parseGeoLookSamples(jsonl);
    expect(samples).toHaveLength(2);
    expect(samples[0].channel).toBe('api');
    expect(samples[1].brandInQuestion).toBe(true);
  });
});

import { makeLlmJudge } from '../src/recognition.js';
import { matchRanges } from '../src/matching.js';

describe('makeLlmJudge — evidence discipline', () => {
  it('downgrades confused-without-evidence to unverified', async () => {
    const judge = makeLlmJudge(async () => '{"verdict":"confused"}');
    const r = await judge({ answer: '……', brandName: 'Custyle' });
    expect(r.verdict).toBe('unverified');
  });

  it('accepts confused with quoted evidence', async () => {
    const judge = makeLlmJudge(async () => '{"verdict":"confused","evidence":"主打汽车外观改装件"}');
    const r = await judge({ answer: '主打汽车外观改装件等产品', brandName: 'Custyle' });
    expect(r.verdict).toBe('confused');
    expect(r.evidence).toContain('汽车');
  });
});

describe('matchRanges — display matching shares metric boundary rules', () => {
  it('does not match Latin names inside longer words', () => {
    expect(matchRanges('Try GeoLookPro today', ['GeoLook'])).toHaveLength(0);
    expect(matchRanges('Try GeoLook today', ['GeoLook'])).toHaveLength(1);
  });

  it('finds all case-insensitive occurrences with correct offsets', () => {
    const text = 'custyle and CUSTYLE and Custylex';
    const ranges = matchRanges(text, ['Custyle']);
    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('custyle');
    expect(text.slice(ranges[1].start, ranges[1].end)).toBe('CUSTYLE');
  });

  it('matches CJK names by substring', () => {
    expect(matchRanges('推荐定制优选和别家', ['定制优选'])).toHaveLength(1);
  });
});

describe('citesOwnDomain via computeMetrics — hostname suffix, not substring', () => {
  it('rejects lookalike domains and accepts subdomains', async () => {
    const brand: BrandConfig = { name: 'Custyle', aliases: [], domains: ['custyle.ai'], competitors: [] };
    const mk = (cites: string[]): Sample => ({
      providerId: 'openai', market: 'global', questionId: 'q1', question: 'best?',
      brandInQuestion: false, answer: 'Custyle is one option.', citations: cites,
    });
    const bad = await computeMetrics([mk(['https://notcustyle.ai.evil.co/page'])], brand);
    expect(bad.platforms[0].ownDomainCiteRate).toBe(0);
    const good = await computeMetrics([mk(['https://www.custyle.ai/about'])], brand);
    expect(good.platforms[0].ownDomainCiteRate).toBe(1);
  });
});

import { classifySentiment, makeSentimentJudge } from '../src/sentiment.js';
import { wilsonInterval } from '../src/stats.js';

describe('classifySentiment — precision-first discipline', () => {
  it('flags clear negative with the offending sentence as evidence (zh)', async () => {
    const r = await classifySentiment('不推荐使用 Custyle，投诉很多。', ['Custyle']);
    expect(r.verdict).toBe('negative');
    expect(r.evidence).toContain('不推荐');
  });

  it('ignores negativity about competitors in other sentences', async () => {
    const r = await classifySentiment('Printful 投诉很多，质量差。Custyle 也是一个选择。', ['Custyle']);
    expect(r.verdict).toBe('unverified'); // no judge → never guessed positive/neutral
  });

  it('stays unverified without a judge instead of guessing', async () => {
    const r = await classifySentiment('Custyle is a customization platform.', ['Custyle']);
    expect(r.verdict).toBe('unverified');
  });

  it('uses the judge when heuristics find nothing', async () => {
    const judge = makeSentimentJudge(async () => '{"verdict":"positive","evidence":"highly recommended"}');
    const r = await classifySentiment('Custyle is highly recommended.', ['Custyle'], { judge });
    expect(r.verdict).toBe('positive');
  });

  it('downgrades judge negative-without-evidence to unverified', async () => {
    const judge = makeSentimentJudge(async () => '{"verdict":"negative"}');
    const r = await judge({ answer: 'x', brandName: 'Custyle' });
    expect(r.verdict).toBe('unverified');
  });
});

describe('computeMetrics — sentiment aggregation', () => {
  const brand: BrandConfig = { name: 'Custyle', aliases: [], domains: [], competitors: [] };
  const mk = (answer: string): Sample => ({
    providerId: 'glm', market: 'cn', questionId: 'q1', question: '推荐？',
    brandInQuestion: false, answer, citations: [],
  });

  it('is null when the brand was never mentioned (nothing to judge)', async () => {
    const r = await computeMetrics([mk('推荐 Printful。')], brand);
    expect(r.platforms[0].sentiment).toBeNull();
  });

  it('aggregates verdicts with negative evidence', async () => {
    const r = await computeMetrics([mk('不推荐使用 Custyle。'), mk('Custyle 也可以。')], brand);
    const s = r.platforms[0].sentiment!;
    expect(s.mentionedSamples).toBe(2);
    expect(s.verdicts.negative).toBe(1);
    expect(s.verdicts.unverified).toBe(1);
    expect(s.negativeEvidence[0]).toContain('不推荐');
  });
});

describe('wilsonInterval', () => {
  it('behaves at the extremes GEO data lives at', () => {
    const zero = wilsonInterval(0, 14)!;
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0.1); // 0/14 does NOT mean "certainly 0%"
    expect(zero.high).toBeLessThan(0.3);
    const all = wilsonInterval(5, 5)!;
    expect(all.high).toBe(1);
    expect(all.low).toBeLessThan(0.9);
  });

  it('returns null for invalid inputs, never a fabricated interval', () => {
    expect(wilsonInterval(3, 0)).toBeNull();
    expect(wilsonInterval(5, 3)).toBeNull();
  });
});

import { analyzeCitationSources } from '../src/sources.js';

describe('analyzeCitationSources — the earned-media target list', () => {
  const brand: BrandConfig = { name: 'Custyle', aliases: [], domains: ['custyle.ai'], competitors: [] };
  const mk = (providerId: string, market: 'cn' | 'global', citations: string[], probe = false): Sample => ({
    providerId, market, questionId: 'q1', question: 'best?', brandInQuestion: probe,
    answer: 'x', citations,
  });

  it('aggregates per market with own-domain tagging, www stripped, probes excluded', () => {
    const r = analyzeCitationSources([
      mk('openai', 'global', ['https://www.reddit.com/r/x', 'https://reddit.com/r/y', 'https://custyle.ai/blog']),
      mk('perplexity', 'global', ['https://reddit.com/r/z']),
      mk('doubao', 'cn', ['https://zhihu.com/question/1']),
      mk('doubao', 'cn', ['https://zhihu.com/question/2'], true), // probe — excluded
    ], brand);
    const reddit = r.find(s => s.domain === 'reddit.com')!;
    expect(reddit.citations).toBe(3);
    expect(reddit.samples).toBe(2);
    expect(reddit.engines).toEqual(['openai', 'perplexity']);
    expect(reddit.own).toBe(false);
    expect(r.find(s => s.domain === 'custyle.ai')!.own).toBe(true);
    expect(r.find(s => s.domain === 'zhihu.com')!.citations).toBe(1); // probe excluded
    expect(r[0].market).toBe('cn'); // market-grouped ordering
  });

  it('skips malformed citation strings without inventing domains', () => {
    const r = analyzeCitationSources([mk('openai', 'global', ['not a url', 'https://ok.com/a'])], brand);
    expect(r).toHaveLength(1);
    expect(r[0].domain).toBe('ok.com');
  });
});

describe('earlyMentionRate — PAWC-lite', () => {
  const brand: BrandConfig = { name: 'Custyle', aliases: [], domains: [], competitors: [] };
  const mk = (answer: string): Sample => ({
    providerId: 'openai', market: 'global', questionId: 'q1', question: 'best?',
    brandInQuestion: false, answer, citations: [],
  });

  it('measures share of mentions falling in the first 30% of the answer', async () => {
    const early = 'Custyle is a great option. ' + 'x'.repeat(200);
    const late = 'x'.repeat(200) + ' Finally, Custyle exists.';
    const r = await computeMetrics([mk(early), mk(late), mk('no brand here')], brand);
    expect(r.platforms[0].earlyMentionRate).toBe(0.5);
  });

  it('is null when never mentioned — not a zero', async () => {
    const r = await computeMetrics([mk('nothing relevant')], brand);
    expect(r.platforms[0].earlyMentionRate).toBeNull();
  });
});

describe('makeLlmJudge — invented-quote guard (prompt v2)', () => {
  it('downgrades confused whose evidence is not verbatim in the answer', async () => {
    const judge = makeLlmJudge(async () => '{"verdict":"confused","evidence":"这句话在原文里不存在"}');
    const r = await judge({ answer: '该品牌主要做汽车配件。', brandName: 'X' });
    expect(r.verdict).toBe('unverified');
  });

  it('accepts confused whose evidence matches after whitespace normalization', async () => {
    const judge = makeLlmJudge(async () => '{"verdict":"confused","evidence":"主要做 汽车配件"}');
    const r = await judge({ answer: '该品牌主要做汽车配件。', brandName: 'X' });
    expect(r.verdict).toBe('confused');
  });
});

import { suggestAliases } from '../src/aliases.js';

describe('suggestAliases — candidates only, never auto-added', () => {
  it('proposes domain forms and multiword variants, deduped against existing', () => {
    const out = suggestAliases({ name: 'Faster GEO', domains: ['https://www.fastergeo.co/x'], aliases: [] });
    // one representative per case-insensitive equivalence class
    const keys = out.map(a => a.alias.toLowerCase());
    expect(keys).toContain('fastergeo.co');
    expect(keys).toContain('fastergeo');    // domain label ≡ no-space join (one survives)
    expect(keys).toContain('faster-geo');   // hyphen join
    expect(keys).toContain('fg');           // acronym
    expect(keys).not.toContain('faster geo');
    expect(new Set(keys).size).toBe(keys.length); // no duplicate classes
    // case-variant of an existing alias is redundant (Latin matching is
    // case-insensitive) and must be deduped:
    const out2 = suggestAliases({ name: 'Faster GEO', domains: [], aliases: ['fastergeo'] });
    expect(out2.map(a => a.alias)).not.toContain('FasterGEO');
  });

  it('returns nothing new for a single-word brand with matching domain label', () => {
    const out = suggestAliases({ name: 'Custyle', domains: ['custyle.ai'], aliases: ['custyle.ai'] });
    expect(out.map(a => a.alias)).toEqual([]);
  });
});
