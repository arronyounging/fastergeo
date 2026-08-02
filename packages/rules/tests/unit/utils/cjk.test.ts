import { describe, it, expect } from 'vitest';
import { countCjkChars, isCjkDominant, cjkCharsToWords, segmentCjkWords } from '../../../src/utils/cjk.js';
import { countWords, countSentences } from '../../../src/utils/word-counter.js';

const ZH_PARAGRAPH =
  '生成式引擎优化是让人工智能在回答用户问题时主动提到并引用你的品牌的一套方法。' +
  '与传统搜索优化不同，它关注的不是网页排名，而是品牌在人工智能回答中的出现率、位次与引用份额。' +
  '研究表明，包含数据、定义与对比内容的页面被引用的概率显著更高！' +
  '你准备好开始了吗？';

const EN_PARAGRAPH =
  'Generative engine optimization helps brands get cited by AI assistants. ' +
  'It focuses on mention rate and citation share instead of page rankings.';

describe('countCjkChars', () => {
  it('counts Han characters', () => {
    expect(countCjkChars('生成式引擎优化')).toBe(7);
  });

  it('returns 0 for pure Latin text', () => {
    expect(countCjkChars(EN_PARAGRAPH)).toBe(0);
  });

  it('ignores punctuation and digits', () => {
    expect(countCjkChars('2026年，GEO！')).toBe(1);
  });
});

describe('isCjkDominant', () => {
  it('detects Chinese-dominant text', () => {
    expect(isCjkDominant(ZH_PARAGRAPH)).toBe(true);
  });

  it('rejects English text', () => {
    expect(isCjkDominant(EN_PARAGRAPH)).toBe(false);
  });

  it('rejects English text with a sprinkle of Chinese', () => {
    expect(isCjkDominant(`${EN_PARAGRAPH} 优化 ${EN_PARAGRAPH}`)).toBe(false);
  });

  it('detects Chinese text with embedded English terms', () => {
    expect(isCjkDominant(`${ZH_PARAGRAPH} GEO SEO AI`)).toBe(true);
  });
});

describe('countWords (CJK-aware)', () => {
  it('converts CJK chars to word-equivalents instead of counting whitespace tokens', () => {
    const words = countWords(ZH_PARAGRAPH);
    const cjkChars = countCjkChars(ZH_PARAGRAPH);
    expect(words).toBe(cjkCharsToWords(cjkChars));
    // ~100 chars → ~60 word-equivalents, definitely not 1-2 tokens
    expect(words).toBeGreaterThan(50);
  });

  it('handles mixed Chinese-English without double counting', () => {
    const words = countWords('GEO 指生成式引擎优化');
    // 1 latin token + round(8 CJK chars / 1.6) = 1 + 5
    expect(words).toBe(6);
  });

  it('keeps pure-English behavior unchanged', () => {
    expect(countWords('one two three')).toBe(3);
  });
});

describe('countSentences (CJK-aware)', () => {
  it('counts full-width terminators 。！？', () => {
    expect(countSentences(ZH_PARAGRAPH)).toBe(4);
  });

  it('counts mixed Latin and CJK sentence endings', () => {
    expect(countSentences('This is English. 这是中文。')).toBe(2);
  });

  it('keeps pure-English behavior unchanged', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
  });
});

describe('segmentCjkWords', () => {
  it('segments a Chinese title into significant keywords', () => {
    const words = segmentCjkWords('什么是生成式引擎优化：品牌被AI引用的完整指南');
    expect(words).toContain('品牌');
    expect(words).toContain('引用');
    expect(words).toContain('指南');
    // stopwords and single chars filtered
    expect(words).not.toContain('什么');
    expect(words).not.toContain('的');
    expect(words).not.toContain('是');
  });

  it('keeps embedded Latin terms of 3+ chars', () => {
    const words = segmentCjkWords('深度解析 GEO 优化方法');
    expect(words).toContain('geo');
  });
});
