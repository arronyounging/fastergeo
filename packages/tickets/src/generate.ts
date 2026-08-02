/**
 * Ticket generation: SiteAudit + MetricsReport → prioritized tickets.
 *
 * Priority discipline (evidence-based ordering):
 *   P0 = ticket problems (SPA shells, blocked crawlers) + factual errors
 *        (brand confusion) — nothing else matters until these are fixed
 *   P1 = extractable-block gaps, authority signals, external presence
 *   P2 = long-tail volume
 */

import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';
import type { Ticket } from './types.js';

const ISSUE_TICKETS: Record<string, { title: string; priority: Ticket['priority']; desc: string }> = {
  'spa-shell': {
    title: '修复客户端渲染空壳页（SSR/预渲染）',
    priority: 'P0',
    desc: '受影响页面重抓后可见正文 ≥ 120 词等效',
  },
  'no-jsonld': {
    title: '全站补 JSON-LD 结构化数据',
    priority: 'P1',
    desc: '缺 JSON-LD 的页面数降为 0',
  },
  'block-gap:definition': { title: '补「定义」抽取块', priority: 'P1', desc: '缺定义块的页面数下降 ≥50%' },
  'block-gap:statistics': { title: '补「数字事实」抽取块', priority: 'P1', desc: '缺数字块的页面数下降 ≥50%' },
  'block-gap:comparison': { title: '补「对比」抽取块', priority: 'P1', desc: '缺对比块的页面数下降 ≥50%' },
  'block-gap:steps': { title: '补「操作步骤」抽取块', priority: 'P1', desc: '缺步骤块的页面数下降 ≥50%' },
  'block-gap:faq': { title: '补「FAQ」抽取块', priority: 'P1', desc: '缺 FAQ 的页面数下降 ≥50%' },
  'content-short': { title: '核心页正文扩到 600+ 词等效', priority: 'P1', desc: '短页面数下降 ≥50%' },
  'no-date': { title: '补发布/更新日期标记', priority: 'P1', desc: '缺日期页面数降为 0' },
};

function pagesWithIssue(audit: SiteAudit, code: string): number {
  return audit.pages.filter(p =>
    p.dimensions.some(d => d.issues.includes(code)),
  ).length;
}

export function generateTickets(
  audit: SiteAudit | undefined,
  metrics: MetricsReport | undefined,
): Ticket[] {
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
        title: `robots.txt 解除对 AI 爬虫的屏蔽（${audit.site.blockedAiCrawlers.join(', ')}）`,
        priority: 'P0',
        rationale: 'site.blockedAiCrawlers — 封了爬虫则一切内容工作无效',
        acceptance: { type: 'auto', check: 'site.no_ai_block', desc: 'robots.txt 不再整站屏蔽 AI 爬虫' },
      });
    }
    const shells = pagesWithIssue(audit, 'spa-shell');
    if (shells > 0) {
      mk({
        title: ISSUE_TICKETS['spa-shell'].title,
        priority: 'P0',
        rationale: `${shells} 个页面是客户端渲染空壳（AI 爬虫不执行 JS）`,
        baseline: shells,
        acceptance: { type: 'auto', check: 'pages.issue_lte:spa-shell:0', desc: ISSUE_TICKETS['spa-shell'].desc },
      });
    }
    if (!audit.site.llmsTxtFound) {
      mk({
        title: '部署 llms.txt 到站点根目录',
        priority: 'P2', // 对 Google 零权重，其他引擎低权重可选项——诚实定级
        rationale: 'site.llmsTxtFound=false（注：Google 不使用 llms.txt，此项仅利于部分引擎）',
        acceptance: { type: 'auto', check: 'site.llms_txt', desc: '/llms.txt 可访问' },
      });
    }
    if (!audit.site.sitemapFound) {
      mk({
        title: '部署 sitemap.xml',
        priority: 'P1',
        rationale: 'site.sitemapFound=false',
        acceptance: { type: 'auto', check: 'site.sitemap', desc: '/sitemap.xml 可访问' },
      });
    }

    // ── P1: per-issue aggregation ────────────────────────────────────────
    for (const [code, spec] of Object.entries(ISSUE_TICKETS)) {
      if (code === 'spa-shell') continue; // handled above as P0
      const count = pagesWithIssue(audit, code);
      if (count === 0) continue;
      const target = spec.desc.includes('降为 0') ? 0 : Math.floor(count / 2);
      mk({
        title: spec.title,
        priority: spec.priority,
        rationale: `${count} 个页面存在 ${code}`,
        baseline: count,
        acceptance: { type: 'auto', check: `pages.issue_lte:${code}:${target}`, desc: spec.desc },
      });
    }

    // ── site score target ────────────────────────────────────────────────
    if (audit.avgScore !== null && audit.avgScore < 70) {
      mk({
        title: `站点体检均分从 ${audit.avgScore} 提到 70`,
        priority: 'P1',
        rationale: `avgScore=${audit.avgScore}`,
        baseline: audit.avgScore,
        acceptance: { type: 'auto', check: 'site.avg_score_gte:70', desc: '重抓后均分 ≥ 70' },
      });
    }
  }

  if (metrics) {
    for (const p of metrics.platforms) {
      // ── P0: brand confusion = factual error ────────────────────────────
      if (p.probe && p.probe.recognition.confused > 0) {
        mk({
          title: `实体消歧：${p.providerId} 把品牌张冠李戴（${p.market} 市场）`,
          priority: 'P0',
          market: p.market,
          rationale: `证据：${p.probe.confusedEvidence.map(e => e.slice(0, 60)).join(' / ')}`,
          acceptance: {
            type: 'auto',
            check: `metrics.no_confusion:${p.market}`,
            desc: '下期采样探测题无 confused 判定（需先建百科/权威阵地锚点，采样自动验证）',
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
          title: `${market} 市场无提示提及率 ${(avg * 100).toFixed(0)}% → 30%`,
          priority: 'P1',
          market,
          rationale: '外部阵地建设 + 内容承接后由下期采样判定（官网仅占引用 1.37%，阵地是主战场）',
          baseline: avg,
          acceptance: {
            type: 'auto',
            check: `metrics.mention_rate_gte:${market}:0.3`,
            desc: '下期采样市场平均提及率 ≥ 30%',
          },
        });
      }
    }
  }

  // P0 first, stable within priority
  const order = { P0: 0, P1: 1, P2: 2 };
  return tickets.sort((a, b) => order[a.priority] - order[b.priority]);
}
