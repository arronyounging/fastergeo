/**
 * Markdown → HTML for connectors that need it (WordPress).
 * marked with defaults; no raw-HTML passthrough surprises are expected in
 * gate-checked drafts, but WP sanitizes server-side as the real boundary.
 */

import { marked } from 'marked';

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false });
}

/** Kebab slug from a title; CJK is preserved (WP/GitHub both accept it). */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}
