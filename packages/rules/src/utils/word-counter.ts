/**
 * Word Counter Utility
 * Counts words in MDX content, stripping markdown syntax
 */

import { countCjkChars, cjkCharsToWords, CJK_CHAR_PATTERN } from './cjk.js';

/**
 * Strip markdown syntax to get plain text
 */
export function stripMarkdown(text: string): string {
  let result = text;

  // Remove code blocks (``` ... ```)
  result = result.replace(/```[\s\S]*?```/g, '');

  // Remove inline code (`code`)
  result = result.replace(/`[^`]+`/g, '');

  // Remove images ![alt](url)
  result = result.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // Remove links but keep text [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove HTML/JSX tags
  result = result.replace(/<[^>]+>/g, '');

  // Remove headings markers (#)
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');

  // Remove blockquotes
  result = result.replace(/^>\s+/gm, '');

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, '');

  // Remove list markers
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');
  result = result.replace(/^[\s]*\d+\.\s+/gm, '');

  // Remove frontmatter-style content (import statements, etc.)
  result = result.replace(/^import\s+.*$/gm, '');
  result = result.replace(/^export\s+.*$/gm, '');

  // Remove JSX component tags (like <CalloutBox>...</CalloutBox>)
  result = result.replace(/<\w+[^>]*>[\s\S]*?<\/\w+>/g, (match) => {
    // Try to extract text content from JSX
    return match.replace(/<[^>]+>/g, ' ');
  });

  return result;
}

/**
 * Count words in text
 * Splits on whitespace and counts non-empty tokens.
 * CJK-aware: CJK characters are converted to word-equivalents (chars / 1.6)
 * so Chinese/Japanese content is measured on the same scale as Latin text.
 */
export function countWords(text: string): number {
  const stripped = stripMarkdown(text);

  const cjkChars = countCjkChars(stripped);
  // Remove CJK chars before whitespace tokenization so mixed-language text
  // is not double-counted.
  const latinOnly = cjkChars > 0 ? stripped.replace(CJK_CHAR_PATTERN, ' ') : stripped;

  // Split on whitespace and filter empty strings
  const words = latinOnly
    .split(/\s+/)
    .filter(word => word.length > 0)
    // Filter out remaining non-word characters
    .filter(word => /\w/.test(word));

  return words.length + cjkCharsToWords(cjkChars);
}

/**
 * Count sentences in text
 * Looks for sentence-ending punctuation
 */
export function countSentences(text: string): number {
  const stripped = stripMarkdown(text);

  // Match sentence-ending punctuation followed by:
  // - whitespace or end of string (original)
  // - a capital letter (handles no-space after period)
  // - a newline (handles line-break-separated sentences)
  const latinEndings = stripped.match(/[.!?]+(?:\s|$|(?=[A-ZÄÖÜ]))/g);
  // CJK full-width terminators (。！？) end sentences with no trailing space.
  const cjkEndings = stripped.match(/[。！？]+/g);
  const total = (latinEndings?.length ?? 0) + (cjkEndings?.length ?? 0);

  if (total > 0) {
    return total;
  }

  // Fallback: estimate from paragraph/line breaks
  const lines = stripped.split(/\n+/).filter(l => l.trim().length > 20);
  if (lines.length > 1) {
    return lines.length;
  }

  // Last resort: if there are words, assume at least 1 sentence
  const hasWords = /\w{2,}/.test(stripped);
  return hasWords ? 1 : 0;
}

/**
 * Get word count statistics for content
 */
export function getWordStats(mdxBody: string): {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
} {
  const wordCount = countWords(mdxBody);
  const sentenceCount = countSentences(mdxBody);

  return {
    wordCount,
    sentenceCount,
    avgWordsPerSentence: sentenceCount > 0 ? wordCount / sentenceCount : 0,
  };
}
