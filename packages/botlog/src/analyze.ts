/**
 * Botlog analysis: raw access-log lines → what AI is doing on your site.
 *
 * Two distinct signals, never conflated:
 * - AI crawler hits (by user agent): AI systems reading your pages
 * - AI referral visits (by referer): humans clicking out of AI answers
 *
 * Numbers are counts of matching requests — UA and referer are claims by
 * the client, and the report says so. Unparsed lines are counted.
 */

import { AI_UA_CRAWLERS, AI_REFERRAL_SOURCES } from './crawlers.js';
import type { CrawlerPurpose } from './crawlers.js';
import { parseLogLine } from './parse.js';
import type { LogFormat } from './parse.js';

export interface PathCount {
  path: string;
  hits: number;
}

export interface BotActivity {
  id: string;
  operator: string;
  purpose: CrawlerPurpose;
  hits: number;
  uniquePaths: number;
  topPaths: PathCount[];
  /** HTTP status class counts — a 403-heavy bot is being blocked. */
  statuses: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ReferralActivity {
  id: string;
  label: string;
  market: 'cn' | 'global';
  hits: number;
  topPaths: PathCount[];
}

export interface BotlogReport {
  generatedAt: string;
  totalLines: number;
  parsedLines: number;
  /** Lines that did not match the log format — counted, not hidden. */
  skippedLines: number;
  window: { from: string | null; to: string | null };
  bots: BotActivity[];
  botHitsByPurpose: Record<CrawlerPurpose, number>;
  aiReferrals: ReferralActivity[];
}

export interface AnalyzeOptions {
  format?: LogFormat;
  /** Top paths kept per bot/source (default 10). */
  topN?: number;
}

function refererHost(referer: string): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function analyzeBotlog(input: string, opts: AnalyzeOptions = {}): BotlogReport {
  const topN = opts.topN ?? 10;
  const lines = input.split('\n').filter(l => l.trim().length > 0);

  interface Acc {
    hits: number;
    paths: Map<string, number>;
    statuses: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
    first: Date | null;
    last: Date | null;
  }
  const newAcc = (): Acc => ({
    hits: 0, paths: new Map(), statuses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, first: null, last: null,
  });
  const botAcc = new Map<string, Acc>();
  const refAcc = new Map<string, { hits: number; paths: Map<string, number> }>();

  let parsed = 0;
  let from: Date | null = null;
  let to: Date | null = null;

  for (const line of lines) {
    const e = parseLogLine(line, opts.format ?? 'auto');
    if (!e) continue;
    parsed++;
    if (e.time) {
      if (!from || e.time < from) from = e.time;
      if (!to || e.time > to) to = e.time;
    }

    const bot = AI_UA_CRAWLERS.find(c => c.ua.test(e.ua));
    if (bot) {
      const acc = botAcc.get(bot.id) ?? newAcc();
      acc.hits++;
      acc.paths.set(e.path, (acc.paths.get(e.path) ?? 0) + 1);
      const cls = e.status >= 500 ? '5xx' : e.status >= 400 ? '4xx' : e.status >= 300 ? '3xx' : '2xx';
      acc.statuses[cls]++;
      if (e.time) {
        if (!acc.first || e.time < acc.first) acc.first = e.time;
        if (!acc.last || e.time > acc.last) acc.last = e.time;
      }
      botAcc.set(bot.id, acc);
      continue; // a crawler request is not a human referral
    }

    const host = refererHost(e.referer);
    if (host) {
      const src = AI_REFERRAL_SOURCES.find(s => s.host.test(host));
      if (src) {
        const acc = refAcc.get(src.id) ?? { hits: 0, paths: new Map() };
        acc.hits++;
        acc.paths.set(e.path, (acc.paths.get(e.path) ?? 0) + 1);
        refAcc.set(src.id, acc);
      }
    }
  }

  const topPaths = (paths: Map<string, number>): PathCount[] =>
    [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)
      .map(([path, hits]) => ({ path, hits }));

  const bots: BotActivity[] = AI_UA_CRAWLERS
    .filter(c => botAcc.has(c.id))
    .map(c => {
      const acc = botAcc.get(c.id)!;
      return {
        id: c.id, operator: c.operator, purpose: c.purpose,
        hits: acc.hits, uniquePaths: acc.paths.size, topPaths: topPaths(acc.paths),
        statuses: acc.statuses,
        firstSeen: acc.first?.toISOString() ?? null,
        lastSeen: acc.last?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.hits - a.hits);

  const botHitsByPurpose: Record<CrawlerPurpose, number> = {
    'training': 0, 'search-index': 0, 'user-request': 0,
  };
  for (const b of bots) botHitsByPurpose[b.purpose] += b.hits;

  const aiReferrals: ReferralActivity[] = AI_REFERRAL_SOURCES
    .filter(s => refAcc.has(s.id))
    .map(s => {
      const acc = refAcc.get(s.id)!;
      return { id: s.id, label: s.label, market: s.market, hits: acc.hits, topPaths: topPaths(acc.paths) };
    })
    .sort((a, b) => b.hits - a.hits);

  return {
    generatedAt: new Date().toISOString(),
    totalLines: lines.length,
    parsedLines: parsed,
    skippedLines: lines.length - parsed,
    window: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    bots,
    botHitsByPurpose,
    aiReferrals,
  };
}
