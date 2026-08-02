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
