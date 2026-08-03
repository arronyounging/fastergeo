import { describe, it, expect } from 'vitest';
import { lintFabrication } from '../src/fabrication.js';
import { buildOutline, draftPrompt } from '../src/outline.js';
import type { FactStore } from '../src/types.js';

const STORE: FactStore = {
  brand: 'Custyle',
  definition: 'Custyle 是 AI 定制商品平台，用户用 AI 把创意变成可购买的个性化商品。',
  facts: [
    { id: 'F-001', claim: '商品价格区间为 $29.00 - $54.99', grade: 'A', source: 'https://custyle.ai', status: 'confirmed' },
    { id: 'F-002', claim: '支持 18 类商品定制', grade: 'A', source: 'https://custyle.ai', status: 'confirmed' },
    { id: 'F-003', claim: '成立于 2024 年', grade: 'E', status: 'unconfirmed' },
  ],
  doNotClaim: ['免费送货'],
};

describe('lintFabrication', () => {
  it('passes numbers that trace to confirmed facts', () => {
    const draft = '价格区间为 $29.00 - $54.99，覆盖 18 类商品。';
    expect(lintFabrication(draft, STORE)).toHaveLength(0);
  });

  it('flags unsourced numbers', () => {
    const draft = '已服务超过 50000 名用户，满意度 98%。';
    const issues = lintFabrication(draft, STORE);
    expect(issues.filter(i => i.kind === 'unsourced-number').length).toBeGreaterThanOrEqual(2);
    expect(issues[0].suggestion).toContain('禁止编造');
  });

  it('ignores structural numbers (list markers, years in text)', () => {
    const draft = '步骤 1：注册。步骤 2：上传设计。2026 年的趋势是个性化。';
    expect(lintFabrication(draft, STORE).filter(i => i.kind === 'unsourced-number')).toHaveLength(0);
  });

  it('flags unbacked superlatives in zh and en', () => {
    const draft = 'Custyle 是行业领先的平台，the best choice for creators。';
    const issues = lintFabrication(draft, STORE).filter(i => i.kind === 'unsourced-superlative');
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('flags do-not-claim phrases', () => {
    const draft = '我们提供免费送货服务。';
    const issues = lintFabrication(draft, STORE);
    expect(issues.some(i => i.kind === 'do-not-claim')).toBe(true);
  });

  it('flags verbatim use of unconfirmed facts', () => {
    const draft = 'Custyle 成立于 2024 年，总部位于……';
    const issues = lintFabrication(draft, STORE);
    expect(issues.some(i => i.kind === 'unconfirmed-fact' && i.quote.includes('成立'))).toBe(true);
  });

  it('flags confirmed grade-E facts entering a draft (hearsay gate)', () => {
    const store: FactStore = {
      ...STORE,
      facts: [...STORE.facts, { id: 'F-004', claim: '团队规模约十人', grade: 'E', status: 'confirmed' }],
    };
    const issues = lintFabrication('据了解团队规模约十人。', store);
    expect(issues.some(i => i.kind === 'e-grade-fact' && i.suggestion.includes('E 级'))).toBe(true);
  });
});

describe('buildOutline', () => {
  it('builds a zh outline with all five block types and canonical definition', () => {
    const o = buildOutline('国内做个性化定制商品的平台有哪些好用的？', STORE);
    expect(o.market).toBe('cn');
    const blocks = o.sections.flatMap(s => s.requiredBlocks);
    for (const b of ['definition', 'statistics', 'comparison', 'steps', 'faq']) {
      expect(blocks).toContain(b);
    }
    expect(o.sections[0].notes).toContain(STORE.definition);
  });

  it('routes statistics facts into the facts section, excluding grade E', () => {
    const o = buildOutline('What is the best custom merch platform?', STORE);
    expect(o.market).toBe('global');
    const statSection = o.sections.find(s => s.requiredBlocks.includes('statistics'))!;
    expect(statSection.factIds).toContain('F-001');
    expect(statSection.factIds).not.toContain('F-003'); // E 级/待确认排除
  });
});

describe('draftPrompt', () => {
  it('embeds only confirmed non-E facts and hard rules', () => {
    const o = buildOutline('国内做个性化定制的平台有哪些？', STORE);
    const p = draftPrompt(o, STORE);
    expect(p).toContain('F-001');
    expect(p).not.toContain('成立于 2024'); // unconfirmed 不入 prompt
    expect(p).toContain('禁止编造');
    expect(p).toContain('红线');
  });
});

describe('lintFabrication — enumerator handling (regression)', () => {
  it('does not flag ordered-list markers or inline enumerations', () => {
    const draft = [
      '1. 第一步先注册',
      '选择平台时看三点：1. 价格 2. 品类 3. 交付周期。',
      '（3）其他注意事项',
    ].join('\n');
    expect(lintFabrication(draft, STORE).filter(i => i.kind === 'unsourced-number')).toHaveLength(0);
  });

  it('still flags real data numbers amid enumerations', () => {
    const draft = '1. 平台 A 号称服务 50000 名用户。';
    const issues = lintFabrication(draft, STORE).filter(i => i.kind === 'unsourced-number');
    expect(issues).toHaveLength(1);
    expect(issues[0].quote).toContain('50000');
  });
});

// ── Bootstrap ───────────────────────────────────────────────────────────────
import { bootstrapProject, validateCompetitor, bootstrapPrompt } from '../src/bootstrap.js';

describe('validateCompetitor (F3 噪音防线)', () => {
  it('rejects generic terms, channels, and AI engines', () => {
    for (const bad of ['小程序定制商品', '云印定制平台', 'ChatGPT', '豆包', 'Etsy', 'x']) {
      expect(validateCompetitor(bad)).toBe(false);
    }
  });
  it('accepts real company names', () => {
    for (const ok of ['Printful', 'Zazzle', 'Redbubble', 'UTme']) {
      expect(validateCompetitor(ok)).toBe(true);
    }
  });
});

describe('bootstrapProject', () => {
  const LLM_OUT = JSON.stringify({
    name: 'Custyle',
    aliases: ['CUSTYLE'],
    description: 'AI 定制商品平台，用 AI 把创意变成个性化商品。',
    industry: 'POD 电商',
    facts: [{ claim: '商品价格区间为 $29.00 - $54.99', source: 'https://custyle.ai' }],
    unresolved: ['成立时间', '工商主体'],
    competitors: [
      { name: 'Printful', confidence: 'high', why: '同为 POD' },
      { name: '小程序定制商品', confidence: 'high', why: '噪音' },
      { name: 'ChatGPT', confidence: 'medium', why: '噪音' },
      { name: 'Zazzle', confidence: 'medium', why: '同类' },
    ],
    questions: {
      cn: [{ group: '推荐', text: '国内做个性化定制的平台有哪些好用的？' }],
      global: [{ group: '推荐', text: 'What are the best custom merch platforms?' }],
    },
  });
  const ask = async () => LLM_OUT;

  it('filters competitor noise deterministically and gates tracking by confidence', async () => {
    const r = await bootstrapProject('https://custyle.ai', [], ask);
    const names = r.competitorCandidates.map(c => c.name);
    expect(names).toContain('Printful');
    expect(names).toContain('Zazzle');
    expect(names).not.toContain('小程序定制商品');
    expect(names).not.toContain('ChatGPT');
    // 只有 high 进追踪清单，全部候选待人审
    expect(r.brand.competitors.map(c => c.name)).toEqual(['Printful']);
    expect(r.competitorCandidates.every(c => c.needsReview)).toBe(true);
  });

  it('turns unresolved items into unconfirmed grade-E facts (never invented)', async () => {
    const r = await bootstrapProject('https://custyle.ai', [], ask);
    const unconfirmed = r.facts.facts.filter(f => f.status === 'unconfirmed');
    expect(unconfirmed.map(f => f.claim)).toEqual(['成立时间', '工商主体']);
    expect(unconfirmed.every(f => f.grade === 'E')).toBe(true);
    expect(r.facts.facts.find(f => f.id === 'F-001')?.grade).toBe('A');
  });

  it('generates probe questions flagged brandInQuestion', async () => {
    const r = await bootstrapProject('https://custyle.ai', [], ask);
    const probes = r.questions.filter(q => q.brandInQuestion);
    expect(probes.length).toBe(3);
    expect(probes.every(q => q.group === '品牌验证')).toBe(true);
    const normal = r.questions.filter(q => !q.brandInQuestion);
    expect(normal.some(q => q.market === 'cn')).toBe(true);
    expect(normal.some(q => q.market === 'global')).toBe(true);
  });

  it('prompt forbids world knowledge and requires sourced facts', () => {
    const p = bootstrapPrompt('https://custyle.ai', [{ url: 'https://custyle.ai', title: 'T', text: '正文' }]);
    expect(p).toContain('不得使用你的世界知识');
    expect(p).toContain('禁止编造');
  });
});
