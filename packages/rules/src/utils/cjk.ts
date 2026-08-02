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

/** Han ideographs + Japanese kana + Hangul syllables. */
const CJK_CHAR_PATTERN =
  /[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ가-힯]/g;

/** CJK full-width sentence terminators. */
export const CJK_SENTENCE_ENDINGS = /[。！？]/g; // 。 ！ ？

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
