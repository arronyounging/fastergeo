/**
 * Workers-safe text-metric entry: pure functions only, no node:fs.
 * Used by @fastergeo/audit when bundled into edge runtimes.
 */
export { countWords, countSentences, stripMarkdown, getWordStats } from './utils/word-counter.js';
export {
  countCjkChars, isCjkDominant, cjkCharsToWords, segmentCjkWords,
  CJK_CHAR_PATTERN, CJK_SENTENCE_ENDINGS, SENTENCE_SPLIT_PATTERN, CJK_CHARS_PER_WORD,
} from './utils/cjk.js';
