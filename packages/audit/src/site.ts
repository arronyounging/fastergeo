/**
 * Site-level checks + crawl orchestration.
 * robots.txt AI-crawler audit, sitemap/llms.txt presence, page auditing.
 */

import { extractFeatures, detectBlocks } from './extract.js';
import { scorePage } from './score.js';
import { detectBotWall, wallBlocker } from './botwall.js';
import { AI_CRAWLERS, AI_CRAWLER_PURPOSES, type AuditOptions, type PageAudit, type SiteAudit, type SiteChecks } from './types.js';

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
  const blockedAiCrawlers =
    robots && robots.status === 200 ? blockedAiCrawlersFromRobots(robots.body) : [];
  const purpose = (c: string): string =>
    AI_CRAWLER_PURPOSES[c as (typeof AI_CRAWLERS)[number]] ?? 'training';
  return {
    robotsTxtFound: Boolean(robots && robots.status === 200),
    blockedAiCrawlers,
    blockedSearchCrawlers: blockedAiCrawlers.filter(c => purpose(c) !== 'training'),
    blockedTrainingCrawlers: blockedAiCrawlers.filter(c => purpose(c) === 'training'),
    sitemapFound: Boolean(sitemap),
    llmsTxtFound: Boolean(llms),
  };
}

export async function auditPage(url: string, opts: AuditOptions = {}): Promise<PageAudit | null> {
  const res = await fetchText(url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res) return null;
  const features = extractFeatures(url, res.status, res.body);
  // Blocks in the first 30% of visible text — where extraction actually reaches.
  const earlyBlocks = detectBlocks({
    ...features,
    text: features.text.slice(0, Math.ceil(features.text.length * 0.3)),
  });
  const audit = scorePage(features, detectBlocks(features), opts.questions, { earlyBlocks });
  // A challenge page scores well — it is well-formed HTML with plenty of text —
  // so the score has to be suppressed, not just annotated. Reporting 87/100 for
  // a wall is how a whole run of derived numbers ends up describing nothing.
  const wall = detectBotWall(features, res.body);
  if (wall) {
    return { ...audit, wall, score: 0, grade: 'D', blockers: [wallBlocker(wall), ...audit.blockers] };
  }
  return audit;
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
  // Unmeasured stays unmeasured: pages that could not be fetched are named,
  // never silently dropped from the average.
  const failedUrls = urls.filter((_, i) => results[i] === null);

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of pages) gradeDistribution[p.grade]++;

  const blockers: string[] = [];
  // Only SEARCH-serving crawlers are blocker-level: blocking them removes the
  // site from AI answers. Training-only blocks are a policy choice, not an
  // error — flagging them would misreport a legitimate opt-out.
  const searchBlocked = site.blockedSearchCrawlers ?? site.blockedAiCrawlers;
  if (searchBlocked.length > 0) {
    blockers.push(
      `robots-blocks-ai-search: robots.txt blocks ${searchBlocked.join(', ')} — these serve AI search answers; blocking them removes the site from those answers`,
    );
  }
  // A wall on the entry page invalidates the run. Said first and said loudly:
  // every downstream number was derived from the interception page.
  const walled = pages.filter(p => p.wall);
  if (walled.length > 0) {
    blockers.unshift(
      `bot-wall-site: ${walled.length}/${pages.length} pages returned an interception page `
      + `(${walled[0].wall!.vendor}) instead of your site. Nothing measured in this run describes `
      + `your content — it describes the wall. Allow-list AI crawlers or run the audit from an `
      + `allowed network, then re-run.`,
    );
  }
  const shellPages = pages.filter(p => p.blockers.some(b => b.startsWith('spa-shell')));
  if (shellPages.length > 0 && shellPages.length >= pages.length / 2) {
    blockers.push(
      `spa-shell-site: ${shellPages.length}/${pages.length} pages are client-rendered empty shells — a ticket problem; all content work is void until fixed`,
    );
  }

  // Entity wiring from the root page (fallback: any page declaring it) —
  // weak entity signals are the leading cause of AI misdescribing a brand.
  const rootNorm = root.replace(/\/$/, '');
  const rootPage = pages.find(p => p.url.replace(/\/$/, '') === rootNorm) ?? pages[0];
  const entity = rootPage?.entity;

  return {
    root,
    generatedAt: new Date().toISOString(),
    site,
    pages,
    failedUrls,
    ...(entity ? { entity } : {}),
    avgScore: pages.length > 0
      ? Math.round((pages.reduce((a, p) => a + p.score, 0) / pages.length) * 10) / 10
      : null,
    gradeDistribution,
    blockers,
    // One boolean the whole product can branch on, rather than each consumer
    // re-deriving "was this real" from a blocker string.
    readable: walled.length === 0 && pages.length > 0,
  };
}
