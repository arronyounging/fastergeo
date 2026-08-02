/**
 * CJK (Chinese/Japanese/Korean) text support utilities.
 *
 * Latin-oriented text metrics (whitespace word splitting, [.!?] sentence
 * endings, Flesch readability) silently break on CJK content: a 2,000-character
 * Chinese article counts as a handful of "words" and zero sentences, which
 * makes every length/structure rule misfire. These helpers make the core
 * metrics CJK-aware.
 *
 * Word-equivalent convention: corpus segmentation studies put the average
 * Mandarin word at ~1.6 characters, so we convert CJK characters to
 * word-equivalents with a 0.6 factor. This keeps English-derived thresholds
 * (e.g. "300+ words", "40-word citation blocks") meaningful for Chinese text
 * without maintaining a parallel threshold set.
 */

/** Han ideographs + Japanese kana + Hangul syllables (single source of truth). */
export const CJK_CHAR_PATTERN =
  /[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ가-힯]/g;

/** CJK full-width sentence terminators. */
export const CJK_SENTENCE_ENDINGS = /[。！？]/g; // 。 ！ ？

/**
 * Shared sentence splitter: Latin enders need trailing whitespace,
 * CJK full-width enders end a sentence with no space after them.
 * All sentence-level analysis must use this instead of ad-hoc [.!?] splits.
 */
export const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])\s+|(?<=[。！？])\s*/;

/** Average CJK characters per word (Mandarin segmentation corpora ≈ 1.6). */
export const CJK_CHARS_PER_WORD = 1.6;

/** Count CJK characters in text. */
export function countCjkChars(text: string): number {
  const matches = text.match(CJK_CHAR_PATTERN);
  return matches ? matches.length : 0;
}

/**
 * Whether the text is CJK-dominant: CJK characters outnumber Latin word
 * characters. Used to route language-specific metrics (readability formulas,
 * transition-word lists) that have no meaningful CJK equivalent.
 */
export function isCjkDominant(text: string): boolean {
  const cjk = countCjkChars(text);
  if (cjk === 0) return false;
  const latinWordChars = (text.match(/[A-Za-zÀ-ɏ]/g) ?? []).length;
  // Compare on the word level: latin chars ≈ 5 chars/word, CJK ≈ 1.6 chars/word.
  return cjk / CJK_CHARS_PER_WORD > latinWordChars / 5;
}

/** Convert a CJK character count to word-equivalents. */
export function cjkCharsToWords(cjkChars: number): number {
  return Math.round(cjkChars / CJK_CHARS_PER_WORD);
}

/**
 * Chinese stopwords: particles, pronouns, question words, and connective
 * phrases that carry no keyword value when extracted from titles/headings.
 */
const ZH_STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '被', '把', '对', '从', '向',
  '为', '于', '就', '都', '而', '及', '等', '这', '那', '也', '还', '很',
  '什么', '怎么', '如何', '为什么', '哪些', '哪个', '怎样', '多少',
  '一个', '这个', '那个', '我们', '你们', '他们', '它们',
  '可以', '需要', '通过', '进行', '以及', '还是', '就是', '没有',
  '不是', '但是', '因为', '所以', '如果', '虽然', '然后', '已经',
  '正在', '将会', '能够', '应该', '不会', '不能',
]);

let zhSegmenter: Intl.Segmenter | undefined;

/**
 * Segment CJK-dominant text into significant keyword tokens using
 * Intl.Segmenter (full ICU ships with Node ≥ 20 — zero dependencies).
 * Keeps CJK segments of 2+ characters and Latin tokens of 3+ characters;
 * filters Chinese stopwords.
 */
export function segmentCjkWords(text: string): string[] {
  zhSegmenter ??= new Intl.Segmenter('zh', { granularity: 'word' });
  return [...zhSegmenter.segment(text)]
    .filter(s => s.isWordLike)
    .map(s => s.segment.toLowerCase().trim())
    .filter(w =>
      !ZH_STOPWORDS.has(w) &&
      (countCjkChars(w) >= 2 || /^[a-z0-9][a-z0-9-]{2,}$/.test(w)),
    );
}
