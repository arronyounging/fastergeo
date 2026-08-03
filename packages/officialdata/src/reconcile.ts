/**
 * Reconciliation: official page stats × FasterGEO audit.
 *
 * The interesting findings live in the disagreements:
 * - blind spots: pages the platform says AI uses, that we never audited
 * - low-score winners: officially present pages our audit grades C/D —
 *   either the audit is missing something or the page wins on off-page
 *   authority; both are worth knowing
 * - silent good pages: audited A/B but absent from the official report —
 *   well-built pages AI is not (yet) surfacing
 *
 * Absence from an official report is NOT proof of zero AI usage (reports
 * lag, cover only that platform's surfaces, and threshold small numbers) —
 * the verdict names say "officially absent", not "unused".
 */

import type { SiteAudit, PageAudit } from '@fastergeo/audit';
import type { OfficialPageStat, OfficialSource } from './parse.js';

export interface ReconciledPage {
  page: string;
  metric: number;
  audit?: { score: number; grade: PageAudit['grade']; blockers: number };
}

export interface Reconciliation {
  source: OfficialSource;
  /** 'impressions' (gsc) or 'citations' (bing) — never merged. */
  metricName: 'impressions' | 'citations';
  totalPages: number;
  totalMetric: number;
  topPages: ReconciledPage[];
  blindSpots: ReconciledPage[];
  lowScoreWinners: ReconciledPage[];
  silentGoodPages: Array<{ page: string; score: number; grade: PageAudit['grade'] }>;
}

/** Normalize for matching: strip protocol, host case, trailing slash, hash. */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.hostname.toLowerCase()}${path}${url.search}`;
  } catch {
    return u.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function reconcile(
  official: OfficialPageStat[],
  audit?: SiteAudit,
  opts: { topN?: number } = {},
): Reconciliation {
  const topN = opts.topN ?? 10;
  const source = official[0]?.source ?? 'gsc';
  const metricName = source === 'gsc' ? 'impressions' as const : 'citations' as const;
  const metricOf = (s: OfficialPageStat): number => (source === 'gsc' ? s.impressions : s.citations) ?? 0;

  const auditByUrl = new Map<string, PageAudit>();
  for (const p of audit?.pages ?? []) auditByUrl.set(normalizeUrl(p.url), p);

  const pages: ReconciledPage[] = official
    .map(s => {
      const a = auditByUrl.get(normalizeUrl(s.page));
      return {
        page: s.page,
        metric: metricOf(s),
        ...(a ? { audit: { score: a.score, grade: a.grade, blockers: a.blockers.length } } : {}),
      };
    })
    .sort((a, b) => b.metric - a.metric);

  const officialUrls = new Set(official.map(s => normalizeUrl(s.page)));
  const silentGoodPages = (audit?.pages ?? [])
    .filter(p => (p.grade === 'A' || p.grade === 'B') && !officialUrls.has(normalizeUrl(p.url)))
    .map(p => ({ page: p.url, score: p.score, grade: p.grade }));

  return {
    source,
    metricName,
    totalPages: pages.length,
    totalMetric: pages.reduce((a, p) => a + p.metric, 0),
    topPages: pages.slice(0, topN),
    blindSpots: pages.filter(p => !p.audit && p.metric > 0).slice(0, topN),
    lowScoreWinners: pages.filter(p => p.audit && (p.audit.grade === 'C' || p.audit.grade === 'D') && p.metric > 0).slice(0, topN),
    silentGoodPages: silentGoodPages.slice(0, topN),
  };
}
