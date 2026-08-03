import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/csv.js';
import { parseOfficialCsv, detectSource } from '../src/parse.js';
import { reconcile, normalizeUrl } from '../src/reconcile.js';
import type { SiteAudit } from '@fastergeo/audit';

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas/quotes/newlines, CRLF, BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nnext"\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"\nnext']]);
  });
});

describe('parseOfficialCsv', () => {
  it('parses a GSC-style export with English headers', () => {
    const r = parseOfficialCsv('Page,Impressions,Clicks\nhttps://a.com/x,"1,204",37\nhttps://a.com/y,88,2\n', 'gsc');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ source: 'gsc', page: 'https://a.com/x', impressions: 1204, clicks: 37 });
    expect(r.skippedRows).toBe(0);
  });

  it('parses zh-UI headers (页面/展示次数)', () => {
    const r = parseOfficialCsv('页面,展示次数\nhttps://a.com/zh,42\n', 'gsc');
    expect(r.rows[0].impressions).toBe(42);
  });

  it('parses a Bing-style citations export', () => {
    const r = parseOfficialCsv('URL,Total Citations\nhttps://a.com/x,15\n', 'bing');
    expect(r.rows[0]).toEqual({ source: 'bing', page: 'https://a.com/x', citations: 15 });
  });

  it('refuses when required columns cannot be identified, naming what it saw', () => {
    expect(() => parseOfficialCsv('Foo,Bar\n1,2\n', 'gsc'))
      .toThrow(/cannot identify required columns.*Headers seen: Foo \| Bar/);
  });

  it('counts unusable rows and surfaces unmapped headers instead of guessing', () => {
    const r = parseOfficialCsv('Page,Impressions,CTR\nhttps://a.com/x,10,3%\n,5\nhttps://a.com/y,not-a-number\n', 'gsc');
    expect(r.rows).toHaveLength(1);
    expect(r.skippedRows).toBe(2);
    expect(r.unmappedHeaders).toEqual(['CTR']);
  });

  it('detects the source from headers', () => {
    expect(detectSource('Page,Impressions\n')).toBe('gsc');
    expect(detectSource('URL,Total Citations\n')).toBe('bing');
    expect(detectSource('Foo,Bar\n')).toBeNull();
  });
});

describe('reconcile', () => {
  const audit = {
    root: 'https://a.com', generatedAt: '', site: { robotsTxtFound: true, blockedAiCrawlers: [], sitemapFound: true, llmsTxtFound: true },
    pages: [
      { url: 'https://a.com/good/', score: 90, grade: 'A', wordCount: 1500, dimensions: [], blocks: { definition: true, statistics: true, comparison: true, steps: true, faq: true }, blockers: [] },
      { url: 'https://a.com/weak', score: 30, grade: 'D', wordCount: 40, dimensions: [], blocks: { definition: false, statistics: false, comparison: false, steps: false, faq: false }, blockers: ['spa-shell: x'] },
    ],
    failedUrls: [], avgScore: 60, gradeDistribution: { A: 1, B: 0, C: 0, D: 1 }, blockers: [],
  } as unknown as SiteAudit;

  const official = parseOfficialCsv(
    'Page,Impressions\nhttps://a.com/weak,120\nhttps://a.com/unknown-page,80\nhttps://a.com/good,0\n', 'gsc',
  ).rows;

  const r = reconcile(official, audit);

  it('matches URLs across trailing-slash and protocol differences', () => {
    expect(normalizeUrl('https://A.com/good/')).toBe(normalizeUrl('https://a.com/good'));
  });

  it('finds low-score winners: officially present pages our audit grades C/D', () => {
    expect(r.lowScoreWinners).toHaveLength(1);
    expect(r.lowScoreWinners[0].page).toBe('https://a.com/weak');
    expect(r.lowScoreWinners[0].audit!.grade).toBe('D');
  });

  it('finds blind spots: cited pages we never audited', () => {
    expect(r.blindSpots.map(p => p.page)).toEqual(['https://a.com/unknown-page']);
  });

  it('finds silent good pages: audited A/B with zero official presence', () => {
    // /good IS in the export but with metric 0 — officially absent in effect;
    // it appears via the officialUrls set, so NOT silent. Silent = not listed.
    expect(r.silentGoodPages).toHaveLength(0);
    const r2 = reconcile(official.filter(s => !s.page.includes('good')), audit);
    expect(r2.silentGoodPages.map(p => p.page)).toEqual(['https://a.com/good/']);
  });

  it('keeps impressions and citations as distinct metric names', () => {
    expect(r.metricName).toBe('impressions');
    expect(r.totalMetric).toBe(200);
  });
});
