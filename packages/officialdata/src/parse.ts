/**
 * Official-source export parsing: Google Search Console Gen-AI performance
 * exports and Bing Webmaster Tools AI Performance exports (CSV).
 *
 * These exports are the platforms' OWN ground truth about your pages inside
 * AI surfaces — the free foundation every sampled metric should be checked
 * against. Two honesty rules:
 * - Header matching is tolerant (en + zh UI exports differ) but NEVER
 *   guessed: if required columns can't be identified, parsing fails with
 *   the headers we saw, instead of misreading a column.
 * - GSC reports impressions of pages in gen-AI surfaces; Bing reports
 *   citations. They are different physical quantities and are never merged
 *   into one number.
 */

import { parseCsv } from './csv.js';

export type OfficialSource = 'gsc' | 'bing';

export interface OfficialPageStat {
  source: OfficialSource;
  page: string;
  /** GSC: impressions in gen-AI surfaces. */
  impressions?: number;
  /** Bing: citation count in AI answers. */
  citations?: number;
  clicks?: number;
}

export interface OfficialParseResult {
  source: OfficialSource;
  rows: OfficialPageStat[];
  /** Headers present in the file that we did not map — visibility, not guessing. */
  unmappedHeaders: string[];
  /** Data rows skipped because the page or the metric cell was unusable. */
  skippedRows: number;
}

/** Header aliases, lowercase. GSC exports localize headers with the UI. */
const H = {
  page: ['page', 'pages', 'url', '页面', '网页', '网址'],
  impressions: ['impressions', 'ai impressions', '展示', '展示次数', '曝光次数'],
  clicks: ['clicks', '点击次数', '点击'],
  citations: ['citations', 'total citations', 'citation count', 'cited', '引用次数', '引用'],
  queries: ['grounding queries', 'queries', '查询次数'],
} as const;

function findCol(headers: string[], aliases: readonly string[]): number {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

function parseCount(cell: string): number | null {
  const n = Number(cell.replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse a pages-level official export. `source` decides which metric column
 * is required: GSC → impressions, Bing → citations.
 */
export function parseOfficialCsv(text: string, source: OfficialSource): OfficialParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error('export has no data rows — expected a header row plus at least one page row');
  }
  const headers = rows[0];
  const pageCol = findCol(headers, H.page);
  const metricAliases = source === 'gsc' ? H.impressions : H.citations;
  const metricCol = findCol(headers, metricAliases);
  if (pageCol === -1 || metricCol === -1) {
    throw new Error(
      `cannot identify required columns for ${source} (need page + ${source === 'gsc' ? 'impressions' : 'citations'}). ` +
      `Headers seen: ${headers.join(' | ')}. Export the page-level report; column matching is tolerant but never guessed.`,
    );
  }
  const clicksCol = findCol(headers, H.clicks);

  const out: OfficialPageStat[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const page = (r[pageCol] ?? '').trim();
    const metric = parseCount(r[metricCol] ?? '');
    if (!page || metric === null) { skipped++; continue; }
    const stat: OfficialPageStat = { source, page };
    if (source === 'gsc') stat.impressions = metric;
    else stat.citations = metric;
    if (clicksCol !== -1) {
      const c = parseCount(r[clicksCol] ?? '');
      if (c !== null) stat.clicks = c;
    }
    out.push(stat);
  }

  const mapped = new Set([pageCol, metricCol, clicksCol].filter(i => i !== -1));
  const unmappedHeaders = headers.filter((_, i) => !mapped.has(i)).map(h => h.trim()).filter(Boolean);
  return { source, rows: out, unmappedHeaders, skippedRows: skipped };
}

/** Detect the source from headers when the user doesn't say. */
export function detectSource(text: string): OfficialSource | null {
  const headers = parseCsv(text)[0] ?? [];
  if (findCol(headers, H.citations) !== -1) return 'bing';
  if (findCol(headers, H.impressions) !== -1) return 'gsc';
  return null;
}
