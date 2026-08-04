import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';
import type { Ticket } from '@fastergeo/tickets';

export type TodayLang = 'en' | 'zh';

/**
 * The daily delivery contract — one function, because it has to be identical in
 * three places (the CLI's first run, the workbench, the site) and three copies
 * of a promise drift into three different promises.
 *
 * Every line here is a claim about behaviour that already ships. Adding a line
 * for something not yet built would make this the most expensive paragraph in
 * the product.
 *
 * That rule was broken once already: the Monday line promised "which station
 * your growth breaks at", and stations exist only in the design docs — no code
 * computes one. It now describes the period comparison that actually runs. When
 * the break funnel ships, this line changes with it and not before.
 */
export function dailyContract(lang: TodayLang = 'en', at = '09:00'): string {
  return lang === 'zh'
    ? `我是你的增长负责人。跟别人不一样的地方是：我说的每句话都会给出处，我修的每件事都会自己复查。

每天早上 ${at} 我给你：

  · AI 说错你的原话 —— 有就逐字给你，没有就说「今天没发现」
  · 1 条最该修的 —— 写明「修到什么程度算好」
  · 昨天修的复查结果 —— 机器重爬判定，不是我说了算

攒够两期之后，每周一多给一条：哪些指标真的动了，哪些只是波动 —— 连续两期同向才算数。`
    : `I'm your head of growth. What's different: every claim I make carries a source, and every fix I make gets re-checked.

Every morning at ${at} you get:

  · the verbatim quote where an AI got you wrong — or "nothing today"
  · one thing worth fixing, with what "fixed" has to look like
  · yesterday's fixes, re-checked by re-crawl rather than by my word

Once two periods exist, one more on Mondays: which numbers actually moved and which were noise — two consecutive same-direction changes, or it does not count.`;
}

export interface TodayInput {
  brandName: string;
  date?: string;
  metrics?: MetricsReport;
  audit?: SiteAudit;
  /** Already ranked — see rankTickets(). */
  today: Ticket[];
  /** Verification counts from this run, when a verify pass happened. */
  verified?: { pass: number; fail: number; regressed: number };
  periodCount: number;
  lang?: TodayLang;
}

interface Msg {
  said: string; nothing: string; notSampled: string;
  fix: (n: number) => string; doneWhen: string;
  yesterday: string;
  verified: (n: number) => string;
  stillOpen: (n: number) => string;
  regressed: (n: number) => string;
  noVerify: string; period: string; firstPeriod: string;
  haveTrend: (n: number) => string;
  nothingQueued: string; foot: string;
  marketCn: string; marketGlobal: string; whyTop: string;
}

const M: Record<TodayLang, Msg> = {
  en: {
    said: 'What AI said about you today',
    nothing: 'Nothing new today — no engine got you wrong in this run.',
    notSampled: 'No sampling this run, so there is nothing to quote. That is not the same as nothing being wrong.',
    fix: (n: number) => `Fix these ${n} today`,
    doneWhen: 'Done when',
    yesterday: 'Since last time',
    verified: (n: number) => `${n} verified done by re-crawl`,
    stillOpen: (n: number) => `${n} still open`,
    regressed: (n: number) => `${n} regressed — a fix that stopped holding`,
    noVerify: 'Nothing to re-check yet — this is the first period.',
    period: 'Period comparison',
    firstPeriod: 'One period so far. A single-period change is an observation; only two consecutive same-direction changes are a trend — so there is nothing honest to compare yet.',
    haveTrend: (n: number) => `${n} periods recorded. Full comparison is in the report.`,
    nothingQueued: 'Nothing queued.',
    foot: 'Every number above can be checked against the verbatim answers in the report.',
    marketCn: 'China', marketGlobal: 'Global',
    whyTop: 'A regression is at the top: work you already did stopped holding, so it outranks everything else regardless of priority.',
  },
  zh: {
    said: 'AI 今天怎么说你',
    nothing: '今天没发现新的认错 —— 本次采样里没有引擎说错你。',
    notSampled: '本次没有采样，所以没有原话可引。这不等于没有问题。',
    fix: (n: number) => `今天修这 ${n} 件`,
    doneWhen: '修到这样算好',
    yesterday: '上次之后',
    verified: (n: number) => `${n} 条重爬验收通过`,
    stillOpen: (n: number) => `${n} 条还没好`,
    regressed: (n: number) => `${n} 条回归 —— 修好过又坏了`,
    noVerify: '还没有可复查的东西 —— 这是第一期。',
    period: '期对比',
    firstPeriod: '目前只有一期。单期变化只算观察，连续两期同向才叫趋势 —— 所以现在还没有可以诚实比较的东西。',
    haveTrend: (n: number) => `已记录 ${n} 期。完整对比在报告里。`,
    nothingQueued: '没有待办。',
    foot: '上面每个数字都能在报告里跟采样原文对质。',
    marketCn: '国内市场', marketGlobal: '海外市场',
    whyTop: '排在最前面的是一条回归：你已经做过的事又坏了，所以它不看优先级，直接压过其它所有条目。',
  },
};

/** The one-line verdict, in the user's words. Says nothing it cannot support. */
function verdict(i: TodayInput, m: Msg): string {
  const parts: string[] = [];
  const confused = (i.metrics?.platforms ?? [])
    .reduce((n, p) => n + (p.probe?.recognition.confused ?? 0), 0);
  if (confused > 0) {
    parts.push(i.lang === 'zh'
      ? `${confused} 个回答把你认成了别的公司`
      : `${confused} answers mistake you for another company`);
  }
  const shells = (i.audit?.pages ?? [])
    .filter(p => p.blockers.some(b => /shell|render/i.test(b))).length;
  if (shells > 0) {
    parts.push(i.lang === 'zh'
      ? `${shells} 个页面对 AI 是空白`
      : `${shells} page${shells > 1 ? 's are' : ' is'} blank to an AI crawler`);
  }
  if (i.verified?.regressed) {
    parts.push(i.lang === 'zh'
      ? `${i.verified.regressed} 条修好过的又坏了`
      : `${i.verified.regressed} previously-fixed item${i.verified.regressed > 1 ? 's' : ''} broke again`);
  }
  if (!parts.length) {
    return i.lang === 'zh'
      ? (i.today.length ? `今天没有致命问题，还有 ${i.today.length} 件可以推进。` : '今天没有发现新问题。')
      : (i.today.length ? `No blockers today; ${i.today.length} item(s) worth moving.` : 'Nothing new today.');
  }
  return parts.join(i.lang === 'zh' ? '；' : '; ') + (i.lang === 'zh' ? '。' : '.');
}

/**
 * The daily digest: short enough to read standing up, and complete enough that
 * reading it is a substitute for opening the dashboard on a day with nothing
 * unusual in it. Also the payload a push notification carries.
 */
export function renderTodayDigest(input: TodayInput): string {
  const lang: TodayLang = input.lang === 'zh' ? 'zh' : 'en';
  const m = M[lang];
  const date = (input.date ?? new Date().toISOString()).slice(0, 10);
  const out: string[] = [`# ${input.brandName} · ${date}`, '', verdict({ ...input, lang }, m), ''];

  out.push(`## ${m.said}`, '');
  const quotes: Array<{ text: string; who: string }> = [];
  for (const p of input.metrics?.platforms ?? []) {
    const market = p.market === 'cn' ? m.marketCn : m.marketGlobal;
    for (const e of p.probe?.confusedEvidence ?? []) {
      quotes.push({ text: e, who: `${p.providerId} · ${market}` });
    }
  }
  if (quotes.length) {
    for (const q of quotes.slice(0, 2)) {
      out.push(`> ${q.text.replace(/\s+/g, ' ').trim()}`, `>`, `> — ${q.who}`, '');
    }
    if (quotes.length > 2) out.push(`_+${quotes.length - 2}_`, '');
  } else {
    out.push(input.metrics ? m.nothing : m.notSampled, '');
  }

  out.push(`## ${m.fix(input.today.length)}`, '');
  if (!input.today.length) {
    out.push(m.nothingQueued, '');
  } else {
    // A P2 sitting above a P0 looks like a bug unless the reason is on the page.
    // Ranking a user cannot predict is ranking they stop trusting.
    if (input.today.some(t => t.status === 'regressed')) out.push(`_${m.whyTop}_`, '');
    const colon = lang === 'zh' ? '：' : ': ';
    input.today.forEach((t, n) => {
      const flag = t.status === 'regressed' ? ' ⚠' : '';
      out.push(`${n + 1}. **${t.priority}${flag} ${t.title}**`);
      out.push(`   ${m.doneWhen}${colon}${t.acceptance?.desc ?? '—'}  \`${t.id}\``, '');
    });
  }

  out.push(`## ${m.yesterday}`, '');
  if (input.verified) {
    const bits = [m.verified(input.verified.pass), m.stillOpen(input.verified.fail)];
    if (input.verified.regressed) bits.push('⚠ ' + m.regressed(input.verified.regressed));
    out.push(bits.join(' · '), '');
  } else {
    out.push(m.noVerify, '');
  }

  out.push(`## ${m.period}`, '');
  out.push(input.periodCount < 2 ? m.firstPeriod : m.haveTrend(input.periodCount), '');
  out.push('---', m.foot);
  return out.join('\n') + '\n';
}
