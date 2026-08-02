import { describe, it, expect } from 'vitest';
import { renderSampleSheet, parseSampleSheet, enrichWithQuestionBank } from '../src/sheet.js';
import type { SheetQuestion, SheetEngine } from '../src/sheet.js';

const QUESTIONS: SheetQuestion[] = [
  { id: 'q001', group: '推荐', market: 'cn', text: '有什么AI平台能生成周边商品？' },
  { id: 'q101', group: '推荐', market: 'global', text: 'Best AI merch platforms?' },
  { id: 'q900', group: '品牌验证', market: 'both', text: 'Custyle 是什么公司？', brandInQuestion: true },
];

const ENGINES: SheetEngine[] = [
  { id: 'nano', name: '纳米AI搜索', market: 'cn' },
  { id: 'chatgpt-web', name: 'ChatGPT 网页版', market: 'global' },
];

describe('renderSampleSheet', () => {
  const sheet = renderSampleSheet(QUESTIONS, ENGINES, 'Custyle', '2026-08-02');

  it('routes questions by market; both-market probes go everywhere', () => {
    const nanoSection = sheet.split('## 引擎: chatgpt-web')[0];
    expect(nanoSection).toContain('q001');
    expect(nanoSection).not.toContain('q101');
    expect(nanoSection).toContain('q900');
    const gptSection = sheet.split('## 引擎: chatgpt-web')[1];
    expect(gptSection).toContain('q101');
    expect(gptSection).toContain('q900');
    expect(gptSection).not.toContain('q001');
  });
});

describe('parseSampleSheet — tolerant round-trip', () => {
  it('parses filled answers and skips empty/placeholder/short blocks', () => {
    let sheet = renderSampleSheet(QUESTIONS, ENGINES, 'Custyle');
    // 人工只填了 nano 的 q001（带引用）和 chatgpt-web 的 q900；q101 留占位
    sheet = sheet.replace(
      /## 引擎: nano[\s\S]*?### q001[\s\S]*?答：\n（把 AI 的完整回答粘贴到这里）/,
      (m) => m.replace('（把 AI 的完整回答粘贴到这里）',
        '国内可以试试 Custyle 和 Printful，都是不错的选择，支持一件起订。'),
    );
    sheet = sheet.replace(
      /### q900 · 品牌验证\nQ: Custyle 是什么公司？\n\n答：\n（把 AI 的完整回答粘贴到这里）\n\n引用：\n(?=[\s\S]*$)/,
      '### q900 · 品牌验证\nQ: Custyle 是什么公司？\n\n答：\nCustyle is an AI merch platform that turns ideas into products.\n\n引用：\nhttps://custyle.ai\n- https://example.com/review\n',
    );
    const r = parseSampleSheet(sheet);
    expect(r.samples.length).toBeGreaterThanOrEqual(2);
    const q001 = r.samples.find(s => s.questionId === 'q001' && s.providerId === 'nano')!;
    expect(q001.market).toBe('cn');
    expect(q001.channel).toBe('manual');
    expect(q001.answer).toContain('Printful');
    const q900 = r.samples.find(s => s.questionId === 'q900')!;
    expect(q900.citations).toEqual(['https://custyle.ai', 'https://example.com/review']);
    // 未填的题被跳过并说明原因
    expect(r.skipped.some(s => s.questionId === 'q101' && s.reason.includes('未填写'))).toBe(true);
  });

  it('rejects suspiciously short answers with a reason', () => {
    const sheet = [
      '## 引擎: nano (纳米) · 市场: cn', '',
      '### q001 · 推荐', 'Q: 测试题', '', '答：', '好的', '', '引用：', '',
    ].join('\n');
    const r = parseSampleSheet(sheet);
    expect(r.samples).toHaveLength(0);
    expect(r.skipped[0].reason).toContain('过短');
  });

  it('survives full-width colons and stray whitespace', () => {
    const sheet = [
      '## 引擎：nano (纳米) · 市场：cn', '',
      '### q001 · 推荐', 'Q： 测试题', '',
      '答：', '  这是一段足够长度的回答内容，用于验证宽容解析器能处理全角冒号。  ', '',
    ].join('\n');
    const r = parseSampleSheet(sheet);
    expect(r.samples).toHaveLength(1);
  });
});

describe('enrichWithQuestionBank', () => {
  it('re-derives probe flags from the bank, not the sheet', () => {
    const imported = {
      samples: [{
        providerId: 'nano', market: 'cn' as const, questionId: 'q900',
        question: 'Custyle 是什么公司？', brandInQuestion: false,
        answer: '一段足够长的回答内容，二十个字符以上没问题。', citations: [], channel: 'manual' as const,
      }],
      skipped: [],
    };
    const r = enrichWithQuestionBank(imported, QUESTIONS);
    expect(r.samples[0].brandInQuestion).toBe(true);
  });
});
