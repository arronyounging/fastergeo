/**
 * Site-level checks + crawl orchestration.
 * robots.txt AI-crawler audit, sitemap/llms.txt presence, page auditing.
 */

import { extractFeatures, detectBlocks } from './extract.js';
import { scorePage } from './score.js';
import { AI_CRAWLERS, type AuditOptions, type PageAudit, type SiteAudit, type SiteChecks } from './types.js';

const DEFAULT_TIMEOUT_MS = 20_000;

/** Fetch a page and extract features (exported for bootstrap and tooling). */
export async function fetchPage(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<import('./types.js').PageFeatures | null> {
  const res = await fetchText(url, timeoutMs);
  if (!res) return null;
  return extractFeatures(url, res.status, res.body);
}

async function fetchText(url: string, timeoutMs: number): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'FasterGEO-Audit/0.1 (+https://fastergeo.co)' },
      redirect: 'follow',
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

/**
 * Parse robots.txt for AI crawlers disallowed from the whole site
 * (a `Disallow: /` under their user-agent or under `*`).
 */
export function blockedAiCrawlersFromRobots(robotsTxt: string): string[] {
  const blocked = new Set<string>();
  let currentAgents: string[] = [];
  let sawRuleForBlock = false;
  const flush = (disallowAll: boolean) => {
    if (!disallowAll) return;
    for (const agent of currentAgents) {
      if (agent === '*') AI_CRAWLERS.forEach(c => blocked.add(c));
      else {
        const hit = AI_CRAWLERS.find(c => c.toLowerCase() === agent.toLowerCase());
        if (hit) blocked.add(hit);
      }
    }
  };
  let disallowAll = false;
  for (const raw of robotsTxt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [keyRaw, ...restParts] = line.split(':');
    const key = keyRaw.trim().toLowerCase();
    const value = restParts.join(':').trim();
    if (key === 'user-agent') {
      if (sawRuleForBlock) {
        flush(disallowAll);
        currentAgents = [];
        disallowAll = false;
        sawRuleForBlock = false;
      }
      currentAgents.push(value);
    } else if (key === 'disallow') {
      sawRuleForBlock = true;
      if (value === '/') disallowAll = true;
    } else if (key === 'allow') {
      sawRuleForBlock = true;
      if (value === '/') disallowAll = false;
    }
  }
  flush(disallowAll);
  return [...blocked];
}

export async function checkSite(root: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SiteChecks> {
  const origin = new URL(root).origin;
  const [robots, sitemap, llms] = await Promise.all([
    fetchText(`${origin}/robots.txt`, timeoutMs),
    fetch(`${origin}/sitemap.xml`, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
      .then(r => r.ok).catch(() => false),
    fetch(`${origin}/llms.txt`, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
      .then(r => r.ok).catch(() => false),
  ]);
  return {
    robotsTxtFound: Boolean(robots && robots.status === 200),
    blockedAiCrawlers:
      robots && robots.status === 200 ? blockedAiCrawlersFromRobots(robots.body) : [],
    sitemapFound: Boolean(sitemap),
    llmsTxtFound: Boolean(llms),
  };
}

export async function auditPage(url: string, opts: AuditOptions = {}): Promise<PageAudit | null> {
  const res = await fetchText(url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res) return null;
  const features = extractFeatures(url, res.status, res.body);
  return scorePage(features, detectBlocks(features), opts.questions);
}

/** Audit a set of URLs plus site-level checks. */
export async function auditSite(
  root: string,
  urls: string[],
  opts: AuditOptions = {},
): Promise<SiteAudit> {
  const site = await checkSite(root, opts.timeoutMs);
  const results = await Promise.all(urls.map(u => auditPage(u, opts)));
  const pages = results.filter((p): p is PageAudit => p !== null);

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of pages) gradeDistribution[p.grade]++;

  const blockers: string[] = [];
  if (site.blockedAiCrawlers.length > 0) {
    blockers.push(`robots-blocks-ai: robots.txt 屏蔽了 ${site.blockedAiCrawlers.join(', ')}`);
  }
  const shellPages = pages.filter(p => p.blockers.some(b => b.startsWith('spa-shell')));
  if (shellPages.length > 0 && shellPages.length >= pages.length / 2) {
    blockers.push(
      `spa-shell-site: ${shellPages.length}/${pages.length} 页面是客户端渲染空壳 — 门票问题，修复前一切内容优化无效`,
    );
  }

  return {
    root,
    generatedAt: new Date().toISOString(),
    site,
    pages,
    avgScore: pages.length > 0
      ? Math.round((pages.reduce((a, p) => a + p.score, 0) / pages.length) * 10) / 10
      : null,
    gradeDistribution,
    blockers,
  };
}
