/**
 * Ticket generation: SiteAudit + MetricsReport → prioritized tickets.
 *
 * Priority discipline (evidence-based ordering):
 *   P0 = ticket problems (SPA shells, blocked crawlers) + factual errors
 *        (brand confusion) — nothing else matters until these are fixed
 *   P1 = extractable-block gaps, authority signals, external presence
 *   P2 = long-tail volume
 *
 * i18n: ticket text is data — generated in the requested language
 * (English default, zh option). Acceptance check strings stay
 * language-neutral (they're a DSL, not prose).
 */

import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';
import type { Ticket } from './types.js';

export type TicketLang = 'en' | 'zh';

interface IssueSpec { title: string; priority: Ticket['priority']; desc: string; toZero?: boolean }

const ISSUE_TICKETS: Record<TicketLang, Record<string, IssueSpec>> = {
  en: {
    'spa-shell': { title: 'Fix client-rendered empty-shell pages (SSR/prerender)', priority: 'P0', desc: 'affected pages show ≥120 word-equivalents on re-crawl' },
    'no-jsonld': { title: 'Add JSON-LD structured data site-wide', priority: 'P1', desc: 'pages missing JSON-LD drops to 0', toZero: true },
    'block-gap:definition': { title: 'Add definition blocks', priority: 'P1', desc: 'pages missing definition blocks drop ≥50%' },
    'block-gap:statistics': { title: 'Add statistics blocks', priority: 'P1', desc: 'pages missing statistics drop ≥50%' },
    'block-gap:comparison': { title: 'Add comparison blocks', priority: 'P1', desc: 'pages missing comparisons drop ≥50%' },
    'block-gap:steps': { title: 'Add how-to step blocks', priority: 'P1', desc: 'pages missing steps drop ≥50%' },
    'block-gap:faq': { title: 'Add FAQ blocks', priority: 'P1', desc: 'pages missing FAQ drop ≥50%' },
    'content-short': { title: 'Expand core pages to 600+ word-equivalents', priority: 'P1', desc: 'short pages drop ≥50%' },
    'no-date': { title: 'Add publish/updated date markup', priority: 'P1', desc: 'pages missing dates drops to 0', toZero: true },
  },
  zh: {
    'spa-shell': { title: '修复客户端渲染空壳页（SSR/预渲染）', priority: 'P0', desc: '受影响页面重抓后可见正文 ≥ 120 词等效' },
    'no-jsonld': { title: '全站补 JSON-LD 结构化数据', priority: 'P1', desc: '缺 JSON-LD 的页面数降为 0', toZero: true },
    'block-gap:definition': { title: '补「定义」抽取块', priority: 'P1', desc: '缺定义块的页面数下降 ≥50%' },
    'block-gap:statistics': { title: '补「数字事实」抽取块', priority: 'P1', desc: '缺数字块的页面数下降 ≥50%' },
    'block-gap:comparison': { title: '补「对比」抽取块', priority: 'P1', desc: '缺对比块的页面数下降 ≥50%' },
    'block-gap:steps': { title: '补「操作步骤」抽取块', priority: 'P1', desc: '缺步骤块的页面数下降 ≥50%' },
    'block-gap:faq': { title: '补「FAQ」抽取块', priority: 'P1', desc: '缺 FAQ 的页面数下降 ≥50%' },
    'content-short': { title: '核心页正文扩到 600+ 词等效', priority: 'P1', desc: '短页面数下降 ≥50%' },
    'no-date': { title: '补发布/更新日期标记', priority: 'P1', desc: '缺日期页面数降为 0', toZero: true },
  },
};

const M = {
  en: {
    unblockRobots: (bots: string) => `Unblock AI crawlers in robots.txt (${bots})`,
    unblockRationale: 'site.blockedAiCrawlers — with crawlers blocked, all content work is void',
    unblockDesc: 'robots.txt no longer blocks AI crawlers site-wide',
    shellRationale: (n: number) => `${n} page(s) are client-rendered empty shells (AI crawlers do not execute JS)`,
    llmsTitle: 'Deploy llms.txt at the site root',
    llmsRationale: 'site.llmsTxtFound=false (note: Google does not use llms.txt; this only helps some engines)',
    llmsDesc: '/llms.txt is reachable',
    sitemapTitle: 'Deploy sitemap.xml',
    sitemapDesc: '/sitemap.xml is reachable',
    issueRationale: (n: number, code: string) => `${n} page(s) carry ${code}`,
    scoreTitle: (s: number) => `Raise site audit average from ${s} to 70`,
    scoreDesc: 'average score ≥ 70 on re-crawl',
    entityTitle: (id: string, mkt: string) => `Entity disambiguation: ${id} confuses the brand (${mkt} market)`,
    entityRationale: (ev: string) => `Evidence: ${ev}`,
    entityDesc: 'next-period probes show zero confused verdicts (build encyclopedia/authority anchors first; sampling verifies automatically)',
    mentionTitle: (mkt: string, p: string) => `${mkt} market unprompted mention rate ${p} → 30%`,
    mentionRationale: 'external-channel building + content coverage, verified by next-period sampling (own sites are ~1.37% of citations — channels are the battlefield)',
    mentionDesc: 'next-period market average mention rate ≥ 30%',
  },
  zh: {
    unblockRobots: (bots: string) => `robots.txt 解除对 AI 爬虫的屏蔽（${bots}）`,
    unblockRationale: 'site.blockedAiCrawlers — 封了爬虫则一切内容工作无效',
    unblockDesc: 'robots.txt 不再整站屏蔽 AI 爬虫',
    shellRationale: (n: number) => `${n} 个页面是客户端渲染空壳（AI 爬虫不执行 JS）`,
    llmsTitle: '部署 llms.txt 到站点根目录',
    llmsRationale: 'site.llmsTxtFound=false（注：Google 不使用 llms.txt，此项仅利于部分引擎）',
    llmsDesc: '/llms.txt 可访问',
    sitemapTitle: '部署 sitemap.xml',
    sitemapDesc: '/sitemap.xml 可访问',
    issueRationale: (n: number, code: string) => `${n} 个页面存在 ${code}`,
    scoreTitle: (s: number) => `站点体检均分从 ${s} 提到 70`,
    scoreDesc: '重抓后均分 ≥ 70',
    entityTitle: (id: string, mkt: string) => `实体消歧：${id} 把品牌张冠李戴（${mkt} 市场）`,
    entityRationale: (ev: string) => `证据：${ev}`,
    entityDesc: '下期采样探测题无 confused 判定（需先建百科/权威阵地锚点，采样自动验证）',
    mentionTitle: (mkt: string, p: string) => `${mkt} 市场无提示提及率 ${p} → 30%`,
    mentionRationale: '外部阵地建设 + 内容承接后由下期采样判定（官网仅占引用 1.37%，阵地是主战场）',
    mentionDesc: '下期采样市场平均提及率 ≥ 30%',
  },
} as const;

function pagesWithIssue(audit: SiteAudit, code: string): number {
  return audit.pages.filter(p =>
    p.dimensions.some(d => d.issues.includes(code)),
  ).length;
}

export function generateTickets(
  audit: SiteAudit | undefined,
  metrics: MetricsReport | undefined,
  lang: TicketLang = 'en',
): Ticket[] {
  const t9 = ISSUE_TICKETS[lang];
  const m = M[lang];
  const tickets: Ticket[] = [];
  let seq = 0;
  const mk = (t: Omit<Ticket, 'id' | 'status' | 'history'>): void => {
    seq += 1;
    tickets.push({
      id: `T-${String(seq).padStart(3, '0')}`,
      status: t.acceptance.type === 'manual' ? 'pending-manual' : 'todo',
      history: [],
      ...t,
    });
  };

  if (audit) {
    // ── P0: ticket problems ──────────────────────────────────────────────
    if (audit.site.blockedAiCrawlers.length > 0) {
      mk({
        title: m.unblockRobots(audit.site.blockedAiCrawlers.join(', ')),
        priority: 'P0',
        rationale: m.unblockRationale,
        acceptance: { type: 'auto', check: 'site.no_ai_block', desc: m.unblockDesc },
      });
    }
    const shells = pagesWithIssue(audit, 'spa-shell');
    if (shells > 0) {
      mk({
        title: t9['spa-shell'].title,
        priority: 'P0',
        rationale: m.shellRationale(shells),
        baseline: shells,
        acceptance: { type: 'auto', check: 'pages.issue_lte:spa-shell:0', desc: t9['spa-shell'].desc },
      });
    }
    if (!audit.site.llmsTxtFound) {
      mk({
        title: m.llmsTitle,
        priority: 'P2', // honest grading: zero weight for Google
        rationale: m.llmsRationale,
        acceptance: { type: 'auto', check: 'site.llms_txt', desc: m.llmsDesc },
      });
    }
    if (!audit.site.sitemapFound) {
      mk({
        title: m.sitemapTitle,
        priority: 'P1',
        rationale: 'site.sitemapFound=false',
        acceptance: { type: 'auto', check: 'site.sitemap', desc: m.sitemapDesc },
      });
    }

    // ── P1: per-issue aggregation ────────────────────────────────────────
    for (const [code, spec] of Object.entries(t9)) {
      if (code === 'spa-shell') continue; // handled above as P0
      const count = pagesWithIssue(audit, code);
      if (count === 0) continue;
      const target = spec.toZero ? 0 : Math.floor(count / 2);
      mk({
        title: spec.title,
        priority: spec.priority,
        rationale: m.issueRationale(count, code),
        baseline: count,
        acceptance: { type: 'auto', check: `pages.issue_lte:${code}:${target}`, desc: spec.desc },
      });
    }

    // ── site score target ────────────────────────────────────────────────
    if (audit.avgScore !== null && audit.avgScore < 70) {
      mk({
        title: m.scoreTitle(audit.avgScore),
        priority: 'P1',
        rationale: `avgScore=${audit.avgScore}`,
        baseline: audit.avgScore,
        acceptance: { type: 'auto', check: 'site.avg_score_gte:70', desc: m.scoreDesc },
      });
    }
  }

  if (metrics) {
    for (const p of metrics.platforms) {
      // ── P0: brand confusion = factual error ────────────────────────────
      if (p.probe && p.probe.recognition.confused > 0) {
        mk({
          title: m.entityTitle(p.providerId, p.market),
          priority: 'P0',
          market: p.market,
          rationale: m.entityRationale(p.probe.confusedEvidence.map(e => e.slice(0, 60)).join(' / ')),
          acceptance: {
            type: 'auto',
            check: `metrics.no_confusion:${p.market}`,
            desc: m.entityDesc,
          },
        });
      }
    }
    // ── mention-rate targets per market ─────────────────────────────────
    const markets = [...new Set(metrics.platforms.map(p => p.market))];
    for (const market of markets) {
      const rates = metrics.platforms
        .filter(p => p.market === market && p.mentionRate !== null)
        .map(p => p.mentionRate as number);
      if (rates.length === 0) continue;
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      if (avg < 0.3) {
        mk({
          title: m.mentionTitle(market, `${(avg * 100).toFixed(0)}%`),
          priority: 'P1',
          market,
          rationale: m.mentionRationale,
          baseline: avg,
          acceptance: {
            type: 'auto',
            check: `metrics.mention_rate_gte:${market}:0.3`,
            desc: m.mentionDesc,
          },
        });
      }
    }
  }

  // P0 first, stable within priority
  const order = { P0: 0, P1: 1, P2: 2 };
  return tickets.sort((a, b) => order[a.priority] - order[b.priority]);
}
