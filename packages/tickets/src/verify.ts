/**
 * Machine verification: re-measured context → ticket status transitions.
 *
 * Transitions: todo→done on pass · done→regressed on fail · regressed→done
 * on pass again. Missing measurement inputs → 'unmeasurable', status
 * untouched (never guessed). Manual tickets are listed, not judged.
 */

import type { SiteAudit } from '@fastergeo/audit';
import type {
  Ticket, TicketVerdict, TicketStatus, VerifyContext, VerifySummary,
} from './types.js';

function pagesWithIssue(audit: SiteAudit, code: string): number {
  return audit.pages.filter(p =>
    p.dimensions.some(d => d.issues.includes(code)),
  ).length;
}

function evaluate(check: string, ctx: VerifyContext, T: typeof VM.en | typeof VM.zh): { pass: boolean; detail: string } | null {
  const [head, ...args] = check.split(':');
  switch (head) {
    case 'site.no_ai_block':
      if (!ctx.audit) return null;
      return {
        pass: ctx.audit.site.blockedAiCrawlers.length === 0,
        detail: `blocked=[${ctx.audit.site.blockedAiCrawlers.join(',')}]`,
      };
    case 'site.llms_txt':
      if (!ctx.audit) return null;
      return { pass: ctx.audit.site.llmsTxtFound, detail: `llmsTxtFound=${ctx.audit.site.llmsTxtFound}` };
    case 'site.sitemap':
      if (!ctx.audit) return null;
      return { pass: ctx.audit.site.sitemapFound, detail: `sitemapFound=${ctx.audit.site.sitemapFound}` };
    case 'site.avg_score_gte': {
      if (!ctx.audit || ctx.audit.avgScore === null) return null;
      const target = Number(args[0]);
      return { pass: ctx.audit.avgScore >= target, detail: `avgScore=${ctx.audit.avgScore} target=${target}` };
    }
    case 'pages.no_blockers':
      if (!ctx.audit) return null;
      return {
        pass: ctx.audit.pages.every(p => p.blockers.length === 0),
        detail: `pagesWithBlockers=${ctx.audit.pages.filter(p => p.blockers.length > 0).length}`,
      };
    case 'pages.issue_lte': {
      if (!ctx.audit) return null;
      const code = args.slice(0, -1).join(':'); // issue codes may contain ':'
      const target = Number(args[args.length - 1]);
      const count = pagesWithIssue(ctx.audit, code);
      return { pass: count <= target, detail: T.pagesDetail(code, count, target) };
    }
    case 'metrics.mention_rate_gte': {
      if (!ctx.metrics) return null;
      const [market, targetRaw] = args;
      const target = Number(targetRaw);
      const rates = ctx.metrics.platforms
        .filter(p => p.market === market && p.mentionRate !== null)
        .map(p => p.mentionRate as number);
      if (rates.length === 0) return null;
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      return { pass: avg >= target, detail: T.mentionDetail(market, (avg * 100).toFixed(1), target) };
    }
    case 'metrics.no_confusion': {
      if (!ctx.metrics) return null;
      const market = args[0];
      const platforms = ctx.metrics.platforms.filter(p => p.market === market && p.probe);
      if (platforms.length === 0) return null;
      // unverified 不计通过也不计失败——只有明确无 confused 且有已判定样本才算过
      const confused = platforms.reduce((a, p) => a + (p.probe?.recognition.confused ?? 0), 0);
      const judged = platforms.reduce(
        (a, p) => a + (p.probe ? p.probe.samples - p.probe.recognition.unverified : 0), 0);
      if (judged === 0) return null; // 全是 unverified → 未测
      return { pass: confused === 0, detail: T.confusionDetail(market, confused, judged) };
    }
    default:
      return { pass: false, detail: T.unknownCheck(check) };
  }
}

export type VerifyLang = 'en' | 'zh';

const VM = {
  en: {
    pagesDetail: (code: string, n: number, t: number) => `${code}: ${n} page(s) (target ≤${t})`,
    mentionDetail: (mkt: string, avg: string, t: number) => `${mkt} avg mention rate=${avg}% target≥${t * 100}%`,
    confusionDetail: (mkt: string, c: number, j: number) => `${mkt} confused=${c} (${j} judged)`,
    unknownCheck: (c: string) => `unknown acceptance check: ${c}`,
    unmeasurable: 'missing measurable inputs (no re-crawl / no samples) — status unchanged',
    regressed: (d: string) => `regressed: ${d}`,
  },
  zh: {
    pagesDetail: (code: string, n: number, t: number) => `${code}: ${n} 页（目标 ≤${t}）`,
    mentionDetail: (mkt: string, avg: string, t: number) => `${mkt} 平均提及率=${avg}% 目标≥${t * 100}%`,
    confusionDetail: (mkt: string, c: number, j: number) => `${mkt} confused=${c}（已判定 ${j} 题）`,
    unknownCheck: (c: string) => `未知验收检查: ${c}`,
    unmeasurable: '缺少可测量输入（未重抓/未采样）——状态不变',
    regressed: (d: string) => `回归: ${d}`,
  },
} as const;

export function verifyTickets(tickets: Ticket[], ctx: VerifyContext, lang: VerifyLang = 'en'): VerifySummary {
  const T = VM[lang];
  const verdicts: TicketVerdict[] = [];
  const transitions: VerifySummary['transitions'] = [];
  const counts = { pass: 0, fail: 0, unmeasurable: 0, manual: 0 };
  const now = new Date().toISOString();

  const move = (t: Ticket, to: TicketStatus, note: string): void => {
    if (t.status === to) return;
    transitions.push({ ticketId: t.id, from: t.status, to });
    t.history.push({ at: now, from: t.status, to, note });
    t.status = to;
  };

  for (const t of tickets) {
    if (t.acceptance.type === 'manual') {
      counts.manual++;
      verdicts.push({ ticketId: t.id, outcome: 'manual', detail: t.acceptance.desc });
      continue;
    }
    const result = evaluate(t.acceptance.check, ctx, T);
    if (result === null) {
      counts.unmeasurable++;
      verdicts.push({ ticketId: t.id, outcome: 'unmeasurable', detail: T.unmeasurable });
      continue;
    }
    if (result.pass) {
      counts.pass++;
      verdicts.push({ ticketId: t.id, outcome: 'pass', detail: result.detail });
      if (t.status === 'todo' || t.status === 'regressed') move(t, 'done', result.detail);
    } else {
      counts.fail++;
      verdicts.push({ ticketId: t.id, outcome: 'fail', detail: result.detail });
      if (t.status === 'done') move(t, 'regressed', T.regressed(result.detail));
    }
  }

  return { verifiedAt: now, verdicts, transitions, counts };
}
