/**
 * HTML → PageFeatures extraction.
 *
 * Deliberately dependency-free (regex-based). This models what non-JS-executing
 * AI crawlers actually see: the raw served HTML. A page whose content only
 * exists after hydration correctly extracts as near-empty — that IS the
 * finding, not an extraction failure.
 */

import { countWords } from '@fastergeo/rules';
import type { BlockSignals, PageFeatures } from './types.js';

function stripTags(html: string): string {
  let t = html;
  t = t.replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/\s+/g, ' ').trim();
}

function matchAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) out.push(stripTags(m[1] ?? ''));
  return out;
}

function metaContent(html: string, nameOrProp: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']` +
    `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nameOrProp}["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

export function extractFeatures(url: string, status: number, html: string): PageFeatures {
  const text = stripTags(html);

  const jsonLdTypes: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const collect = (node: unknown, depth = 0): void => {
        if (depth > 6) return;
        if (Array.isArray(node)) return node.forEach(n => collect(n, depth + 1));
        if (node && typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') jsonLdTypes.push(t);
          if (Array.isArray(t)) t.forEach(x => typeof x === 'string' && jsonLdTypes.push(x));
          // Recurse into nested entities (author, publisher, mainEntity, @graph…)
          for (const v of Object.values(node)) {
            if (v && typeof v === 'object') collect(v, depth + 1);
          }
        }
      };
      collect(data);
    } catch { /* malformed JSON-LD ignored */ }
  }

  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map(m => m[1]);
  let host = '';
  try { host = new URL(url).host; } catch { /* keep '' */ }
  const external = links.filter(h => /^https?:\/\//i.test(h) && !h.includes(host));
  const internal = links.filter(h => h.startsWith('/') || h.includes(host));

  const robotsMeta = metaContent(html, 'robots') ?? '';
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  return {
    url,
    status,
    htmlBytes: html.length,
    title: titleMatch ? stripTags(titleMatch[1]) : '',
    metaDescription: metaContent(html, 'description') ?? '',
    canonical: /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1]
      ?? /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(html)?.[1] ?? null,
    noindex: /noindex/i.test(robotsMeta),
    lang: /<html[^>]+lang=["']([^"']+)["']/i.exec(html)?.[1] ?? null,
    text,
    wordCount: countWords(text),
    h1: matchAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi),
    h2: matchAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi),
    h3: matchAll(html, /<h3[^>]*>([\s\S]*?)<\/h3>/gi),
    paragraphCount: (html.match(/<p[\s>]/gi) ?? []).length,
    listCount: (html.match(/<[uo]l[\s>]/gi) ?? []).length,
    tableCount: (html.match(/<table[\s>]/gi) ?? []).length,
    jsonLdTypes,
    hasPublishDate:
      /datePublished|article:published_time/i.test(html) ||
      /<time[\s>]/i.test(html),
    hasAuthor: /"author"|rel=["']author["']|class=["'][^"']*author/i.test(html),
    externalLinkCount: external.length,
    internalLinkCount: internal.length,
  };
}

/**
 * Detect extractable content blocks — the strongest empirical citation
 * predictors (statistics +61.6%, definitions +57.3%, comparisons +55.3%,
 * how-to +41.2%, tables 2.8x, FAQ +156%).
 */
export function detectBlocks(f: PageFeatures): BlockSignals {
  const text = f.text;
  const headings = [...f.h2, ...f.h3].join(' ');
  return {
    definition:
      /(是指|指的是|的定义|,\s*即|(?<![\w-])is a(?![\w-])|(?<![\w-])refers to(?![\w-])|(?<![\w-])means(?![\w-]))/i.test(text),
    statistics: /\d+(\.\d+)?\s*(%|％|倍|万|亿|percent)|\$\s?\d|(?<!\w)\d{4,}(?!\w)/.test(text),
    comparison:
      f.tableCount > 0 ||
      /(对比|相比|区别|vs\.?|versus|compared (to|with))/i.test(headings + ' ' + text.slice(0, 2000)),
    steps:
      /(步骤|第[一二三四五1-5]步|how to|step \d|首先[\s\S]{0,200}(然后|接着|其次))/i.test(headings + ' ' + text) ||
      /<ol[\s>]/i.test(''), // ordered lists counted in listCount; heading/text signals suffice here
    faq: /(常见问题|FAQ|frequently asked)/i.test(headings) || f.jsonLdTypes.includes('FAQPage'),
  };
}
