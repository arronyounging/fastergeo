/**
 * Self-contained HTML diagnosis report.
 *
 * Layout doctrine:
 * 1. Blockers first — ticket problems and brand-confusion evidence go in a
 *    red banner at the top, not buried in averages (an audit that hides its
 *    most dangerous finding in a score is lying by composition).
 * 2. The Brand Entity Funnel is the primary view: knows → not-confused →
 *    mentioned → ranked → cited. Most brands break at the head, not the tail.
 * 3. Every metric links to a methodology note; unmeasured renders as
 *    "unmeasured" — never a fabricated zero.
 *
 * i18n: English default; zh via input.lang = 'zh'.
 */

import type { SiteAudit } from '@fastergeo/audit';
import { matchRanges, mentions, wilsonInterval } from '@fastergeo/metrics';
import type { MetricsReport, PlatformMetrics, Sample } from '@fastergeo/metrics';
import type { Ticket } from '@fastergeo/tickets';
import type { TrendReport, MetricDelta } from '@fastergeo/trends';

export type ReportLang = 'en' | 'zh';

export interface ReportInput {
  brandName: string;
  audit?: SiteAudit;
  metrics?: MetricsReport;
  tickets?: Ticket[];
  /** Raw sampled answers → the Answer Replay section (full traceability). */
  samples?: Sample[];
  /** Brand aliases, for mention highlighting in the replay. */
  brandAliases?: string[];
  generatedAt?: string;
  /** Period-over-period comparison (from @fastergeo/trends computeTrends). */
  trend?: TrendReport;
  lang?: ReportLang;
}

const MSG = {
  en: {
    reportTitle: 'GEO Diagnosis Report',
    metaHint: 'hover ⓘ to see how every number is computed',
    unmeasured: 'unmeasured',
    headlineConfusion: (n: number) => `${n} engine${n > 1 ? 's' : ''} confuse${n > 1 ? '' : 's'} the brand with other industries`,
    headlineShells: (n: number) => `${n} page${n > 1 ? 's are' : ' is'} an empty shell to AI crawlers`,
    headlineMention: (p: string) => `unprompted mention rate ${p}`,
    headlineScore: (s: number) => `site audit average ${s}/100`,
    headlineEmpty: 'Not enough data yet — run sampling and an audit first.',
    sep: '; ', period: '.',
    blockersTitle: (n: number) => `🔴 Fix these before anything else (${n})`,
    confusionItem: (id: string, mkt: string, e: string) =>
      `Brand confusion (${id} · ${mkt}): AI said "${e}…"`,
    funnelTitle: 'Brand Entity Funnel',
    funnelTip: 'Left to right: does AI actually know the brand (probe questions judged by an LLM — not name-echo counting) → does it confuse you with someone else → are you mentioned in unprompted questions → your position when mentioned → does it cite your site. Most brands break at the head.',
    methodology: 'ⓘ method',
    marketCn: 'China market', marketGlobal: 'Global market',
    stKnows: 'Knows you', stNotConfused: 'Not confused', stConsidered: 'Considered',
    stRanked: 'Top-3', stCited: 'Cited',
    knowsNote: 'probes · LLM-judged', judgeHint: 'run with --judge to measure',
    confusedNote: 'P0 entity disambiguation', confusedVal: (n: number) => `${n} confusion${n > 1 ? 's' : ''}`,
    mentionNote: 'unprompted mention rate',
    noRank: 'not in the candidate set — no rank exists', top3Note: 'top-3 rate',
    citeNote: 'own-domain citation rate',
    enginesTitle: 'Engine Performance',
    enginesTip: 'Mention rate = share of unprompted answers mentioning the brand (brand-naming probes are strictly segregated). SoV = brand mentions / (brand + competitor mentions). China and global markets are never averaged together. Anything not computable renders as unmeasured.',
    thEngine: 'engine', thMarket: 'market', thSamples: 'samples', thMention: 'mention',
    thSov: 'SoV', thCite: 'own cite', thSentiment: 'sentiment', thRecognition: 'recognition', thCompetitors: 'competitors seen',
    ciNote: (lo: string, hi: string, n: number) => `95% CI ${lo}–${hi} (n=${n}, Wilson) — a rate from few samples is an interval, not a point`,
    sentimentNone: '—no mentions', sentimentUnverified: 'unverified',
    negativeItem: (id: string, mkt: string, e: string) =>
      `Negative mention (${id} · ${mkt}): AI said "${e}…"`,
    auditTitle: 'Six-Dimension Audit',
    auditTip: 'Crawlability 15 / length 15 / structure 20 / extractable blocks 25 / authority 15 / relevance 10. Thresholds anchored to published empirical citation data. Fetching does not execute JS — this measures exactly what AI crawlers see.',
    aiNotBlocked: 'AI search crawlers not blocked', avg: 'avg',
    trainingOptOut: (bots: string) => `training opt-out: ${bots} (policy choice, not an error)`,
    thScore: 'score', thPage: 'page', thWords: 'word-eq', thDims: 'dimensions',
    ticketsTitle: (n: number, a: number) => `Action Tickets (${n} · ${a} machine-verifiable)`,
    thTicket: 'ticket', thAcceptance: 'acceptance', thStatus: 'status',
    accAuto: '⚙ auto', accManual: '👤 manual', fixHow: 'How to fix',
    execReadiness: 'Site AI-readiness', execReadinessTip: 'Six-dimension audit average across crawled pages (0–100). This scores whether AI crawlers can read and extract from your site — visibility metrics are measured separately per market and never blended into this number.',
    execVisibility: (mkt: string) => `${mkt} · unprompted mention`,
    execConfusions: 'brand confusions', execSamples: 'samples analyzed', execEngines: 'engines',
    execPages: 'pages audited', gradeWord: (g: string) => ({ A: 'Strong', B: 'Good', C: 'Weak', D: 'Critical' }[g] ?? g),
    printBtn: '⤓ Export PDF', vsPrev: 'vs previous period',
    wallTitle: (n: number) => `What ${n} AI engine${n > 1 ? 's' : ''} said about you`,
    wallTip: 'Quoted from this period\'s samples, unedited. A verdict without a locatable quote is downgraded to unverified and never shown here.',
    wallConfused: 'mistaken identity', wallNegative: 'negative',
    wallNoQuotes: 'No mistaken-identity or negative quotes found this period.',
    wallReplay: 'Every sampled answer, verbatim, is at the bottom of this report.',
    todayTitle: 'Today — fix these first',
    startTitle: 'What to fix first',
    startWhy: 'why', startAcc: 'done when', startThen: 'then',
    startMore: (id: string) => `full instructions in ticket ${id} below`,
    trendTitle: 'Period Comparison',
    trendTip: 'This period vs the previous one. Discipline: a single-period change is an OBSERVATION, never a conclusion; only two consecutive same-direction changes count as a TREND. Deterministic events (new confusion, blockers rising) alert immediately.',
    thMetric: 'metric', thPrev: 'previous', thCurr: 'current', thVerdict: 'reading',
    vTrendUp: '↑ trend', vTrendDown: '↓ trend', vObs: 'observation', vInsuff: 'needs more periods',
    replayTitle: (n: number) => `Answer Replay (${n} samples, verbatim)`,
    replayTip: 'Every sampled answer, unedited, with brand mentions and confusion evidence highlighted. Every number above can be checked against this record — that is the point. Samples that named the brand are tagged "probe" and are excluded from visibility metrics.',
    rpProbe: 'probe', rpMention: 'mentions brand', rpNoMention: 'no mention',
    rpEvidence: 'confusion evidence', rpCitations: 'citations', rpSamples: (n: number) => `${n} samples`,
    rpEvUnlocated: 'Judge-quoted confusion evidence (could not be located verbatim in a stored answer — quote may be paraphrased):',
    sourcesTitle: 'Cited Sources — who AI trusts in your category',
    sourcesTip: 'Domains AI actually cited when answering your category questions, from your own samples. Cross-corpus studies find ~84% of AI citations are earned media (Muck Rack, 25M citations): owned content shapes how AI describes you; third-party presence decides whether it recommends you. The third-party domains below are your PR target list. cn and global are never merged.',
    thDomain: 'domain', thCitations: 'citations', thInSamples: 'in samples', thEngines: 'engines',
    ownTag: 'own',
    earlyTip: 'Of the answers mentioning the brand, the share where the first mention falls in the answer\'s first 30% — position-weighted visibility, after Princeton\'s PAWC.',
    auditFailed: (n: number) => `${n} page${n > 1 ? 's' : ''} unreachable (excluded from the average, not scored as zero):`,
    footer: 'FasterGEO · open source & reproducible: unmeasured stays unmeasured, never a fabricated zero · single-period changes are observations; only two consecutive same-direction changes count as a trend',
  },
  zh: {
    reportTitle: 'GEO 诊断报告',
    metaHint: '悬停 ⓘ 查看每个数字的计算口径',
    unmeasured: '未测',
    headlineConfusion: (n: number) => `${n} 个引擎把品牌张冠李戴到其他行业`,
    headlineShells: (n: number) => `${n} 个页面对 AI 爬虫是空壳`,
    headlineMention: (p: string) => `无提示提及率 ${p}`,
    headlineScore: (s: number) => `站点体检均分 ${s}/100`,
    headlineEmpty: '数据不足，先完成采样与体检。',
    sep: '；', period: '。',
    blockersTitle: (n: number) => `🔴 修复前一切优化无效（${n} 项）`,
    confusionItem: (id: string, mkt: string, e: string) =>
      `张冠李戴（${id} · ${mkt}）：AI 原文「${e}…」`,
    funnelTitle: '品牌实体漏斗',
    funnelTip: '漏斗从左到右：AI 是否真的认识品牌（探测题+LLM裁判判定，非名字回声）→ 是否张冠李戴 → 无提示问题中是否被提及 → 提及时的位次 → 是否引用官网。多数品牌断在头部。',
    methodology: 'ⓘ 口径',
    marketCn: '国内市场', marketGlobal: '海外市场',
    stKnows: '真认识', stNotConfused: '不认错', stConsidered: '进候选集',
    stRanked: '前三位次', stCited: '引用官网',
    knowsNote: '点名探测 · LLM judge 判定', judgeHint: '加 --judge 后判定',
    confusedNote: 'P0 实体消歧', confusedVal: (n: number) => `${n} 起混淆`,
    mentionNote: '无提示提及率',
    noRank: '未进候选集，无位次可言', top3Note: 'Top3 率',
    citeNote: '官网引用率',
    enginesTitle: '引擎表现',
    enginesTip: '提及率=无提示问题中品牌被提及的比例（点名探测题严格隔离，不计入）。SoV=品牌提及/(品牌+竞品提及)。国内与海外分开计算，永不平均。算不出的显示未测，不编数。',
    thEngine: '引擎', thMarket: '市场', thSamples: '样本', thMention: '提及率',
    thSov: 'SoV', thCite: '官网引用', thSentiment: '口碑', thRecognition: '点名认知', thCompetitors: '竞品出现',
    ciNote: (lo: string, hi: string, n: number) => `95% 置信区间 ${lo}–${hi}（n=${n}，Wilson）— 少量样本得出的比率是区间，不是点值`,
    sentimentNone: '—无提及', sentimentUnverified: '未判定',
    negativeItem: (id: string, mkt: string, e: string) =>
      `负面提及（${id} · ${mkt}）：AI 原文「${e}…」`,
    auditTitle: '六维体检',
    auditTip: '可抓取性15/长度15/结构20/可抽取块25/权威信号15/对题性10。阈值锚定公开实证数据。抓取不执行 JS——测的就是 AI 爬虫看到的东西。',
    aiNotBlocked: 'AI 搜索爬虫未被屏蔽', avg: '均分',
    trainingOptOut: (bots: string) => `训练退出：${bots}（政策选择，非错误）`,
    thScore: '分', thPage: '页面', thWords: '词等效', thDims: '维度',
    ticketsTitle: (n: number, a: number) => `行动工单（${n} 条 · ${a} 条机器自动验收）`,
    thTicket: '工单', thAcceptance: '验收', thStatus: '状态',
    accAuto: '⚙ 自动', accManual: '👤 人工', fixHow: '怎么修',
    execReadiness: '站点 AI 就绪度', execReadinessTip: '已抓取页面的六维体检均分（0–100）。此分衡量 AI 爬虫能否读取并抽取你的站点——可见度指标分市场单独测量，永不混入此分。',
    execVisibility: (mkt: string) => `${mkt} · 无提示提及率`,
    execConfusions: '张冠李戴', execSamples: '分析样本', execEngines: '引擎',
    execPages: '体检页面', gradeWord: (g: string) => ({ A: '强', B: '良', C: '弱', D: '危' }[g] ?? g),
    printBtn: '⤓ 导出 PDF', vsPrev: '较上期',
    wallTitle: (n: number) => `${n} 个 AI 引擎是这么说你的`,
    wallTip: '原文摘自本期采样，未经编辑。定位不到原话的判定会降级为 unverified，不会出现在这里。',
    wallConfused: '认错了', wallNegative: '负面',
    wallNoQuotes: '本期没有发现认错或负面的原话。',
    wallReplay: '全部采样回答的原文在报告最后。',
    todayTitle: '今天先修这几件',
    startTitle: '先修什么',
    startWhy: '为什么', startAcc: '做到什么算完成', startThen: '其次',
    startMore: (id: string) => `完整操作指引见下方工单 ${id}`,
    trendTitle: '期对比',
    trendTip: '本期 vs 上期。纪律：单期变化只是观察，绝不下结论；连续两期同向才算趋势。确定性事件（新增混淆、blocker 上升）不受此限，立即告警。',
    thMetric: '指标', thPrev: '上期', thCurr: '本期', thVerdict: '判读',
    vTrendUp: '↑ 趋势', vTrendDown: '↓ 趋势', vObs: '观察', vInsuff: '期数不足',
    replayTitle: (n: number) => `答案回放（${n} 条采样原文，逐字留档）`,
    replayTip: '全部采样回答原文未经删改，品牌命中与混淆证据高亮。上面每个数字都可以对照这里的原文质证——这正是目的。点名品牌的样本标记为「探测」，不计入可见度指标。',
    rpProbe: '探测·点名', rpMention: '提及品牌', rpNoMention: '未提及',
    rpEvidence: '混淆证据', rpCitations: '引用', rpSamples: (n: number) => `${n} 条`,
    rpEvUnlocated: '裁判引用的混淆证据（未能在留档答案中逐字定位——引语可能被裁判改写）：',
    sourcesTitle: '引用来源 — AI 在你的品类信任谁',
    sourcesTip: '从你自己的采样中统计：AI 回答品类问题时实际引用了哪些域名。跨语料研究显示约 84% 的 AI 引用来自第三方（Muck Rack，2500 万条引用）：自有内容决定 AI 如何描述你，第三方阵地决定它是否推荐你。下面的第三方域名就是你的公关目标清单。国内海外永不合并。',
    thDomain: '域名', thCitations: '引用数', thInSamples: '出现样本', thEngines: '引擎',
    ownTag: '自有',
    earlyTip: '在提及品牌的回答中，首次提及落在答案前 30% 的比例——位置加权可见度（源自 Princeton PAWC 思想）。',
    auditFailed: (n: number) => `${n} 个页面抓取失败（不计入均分，不按零分计）：`,
    footer: 'FasterGEO · 开源可复现：算不出的显示未测，不编数 · 单期波动只作观察相关，连续两期同向才算趋势',
  },
} as const;

type M = typeof MSG.en | typeof MSG.zh;

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pctWith = (m: M) => (v: number | null | undefined): string =>
  v === null || v === undefined ? `<span class="na">${m.unmeasured}</span>` : `${(v * 100).toFixed(0)}%`;

function confusionCount(metrics?: MetricsReport): number {
  return metrics?.platforms.filter(p => (p.probe?.recognition.confused ?? 0) > 0).length ?? 0;
}

function headline(input: ReportInput, m: M): string {
  const parts: string[] = [];
  const conf = confusionCount(input.metrics);
  if (conf > 0) parts.push(m.headlineConfusion(conf));
  const shells = input.audit?.pages.filter(p => p.blockers.some(b => b.startsWith('spa-shell'))).length ?? 0;
  if (shells > 0) parts.push(m.headlineShells(shells));
  if (input.metrics) {
    const rates = input.metrics.platforms.filter(p => p.mentionRate !== null).map(p => p.mentionRate as number);
    if (rates.length > 0) {
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      parts.push(m.headlineMention(`${(avg * 100).toFixed(0)}%`));
    }
  }
  if (parts.length === 0 && input.audit?.avgScore != null) {
    parts.push(m.headlineScore(input.audit.avgScore));
  }
  return parts.length > 0 ? parts.join(m.sep) + m.period : m.headlineEmpty;
}

/**
 * The 60-second answer: the single highest-impact ticket, stated plainly.
 * Tickets arrive already impact-ordered (P0 first, empirical weights within
 * priority), so tickets[0] IS the answer to "what do I fix first".
 */
/** Semicircular score gauge, pure SVG — no dependencies, prints cleanly. */
function gaugeSvg(score: number | null, grade: string, gradeWord: string, na: string): string {
  const R = 74, CX = 90, CY = 92, SW = 15;
  const arc = (from: number, to: number, color: string, w = SW): string => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    const x0 = CX + R * Math.cos(a0), y0 = CY - R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1), y1 = CY - R * Math.sin(a1);
    const large = to - from > 0.5 ? 1 : 0;
    return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  };
  const col = score === null ? '#C9C4B8' : score >= 85 ? '#20714A' : score >= 70 ? '#5B8A46' : score >= 50 ? '#8A6100' : '#B23A26';
  return `<svg viewBox="0 0 180 104" class="gauge" role="img" aria-label="score ${score ?? 'n/a'}">
    ${arc(0, 1, '#ECE8DD')}
    ${score !== null ? arc(0, Math.max(0.02, score / 100), col) : ''}
    <text x="90" y="74" text-anchor="middle" class="gauge-n">${score !== null ? score : '—'}</text>
    <text x="90" y="94" text-anchor="middle" class="gauge-g">${score !== null ? `${grade} · ${gradeWord}` : na}</text>
  </svg>`;
}

function deltaChip(d: MetricDelta | undefined, m: M): string {
  if (!d || d.prev === null || d.curr === null) return '';
  const pp = (d.curr - d.prev) * 100;
  if (Math.abs(pp) < 0.5) return '';
  const cls = pp > 0 ? 'up' : 'down';
  return `<span class="delta ${cls}" title="${esc(m.vsPrev)}">${pp > 0 ? '▲' : '▼'} ${Math.abs(pp).toFixed(0)}pp</span>`;
}

/**
 * The verbatim wall — the first thing in the report.
 *
 * A score is an abstraction the reader has to be taught to care about; an AI
 * describing them as a different company is not. The quotes were always in the
 * data (Answer Replay, last section), which meant the strongest evidence sat
 * below everything a reader had to scroll past. This lifts it to the top,
 * unedited and attributed, and every claim above it is checkable against the
 * replay below. Renders nothing when there was no sampling — an empty wall
 * would imply "nothing bad found" when the truth is "nothing was measured".
 */
function evidenceWall(input: ReportInput, m: M): string {
  const metrics = input.metrics;
  if (!metrics || metrics.totalSamples === 0) return '';
  const quotes: { tag: string; cls: string; who: string; text: string }[] = [];
  for (const p of metrics.platforms) {
    const who = `${p.providerId} · ${p.market === 'cn' ? m.marketCn : m.marketGlobal}`;
    for (const e of p.probe?.confusedEvidence ?? []) {
      quotes.push({ tag: m.wallConfused, cls: 'q-bad', who, text: e });
    }
    for (const e of p.sentiment?.negativeEvidence ?? []) {
      quotes.push({ tag: m.wallNegative, cls: 'q-warn', who, text: e });
    }
  }
  const engines = new Set(metrics.platforms.map(p => p.providerId)).size;
  const body = quotes.length > 0
    ? `<div class="wall-qs">${quotes.slice(0, 4).map(q => `
        <figure class="wall-q ${q.cls}">
          <blockquote>“${esc(q.text.trim())}”</blockquote>
          <figcaption><span class="wall-tag">${esc(q.tag)}</span> ${esc(q.who)}</figcaption>
        </figure>`).join('')}</div>
      ${quotes.length > 4 ? `<div class="wall-more">+${quotes.length - 4}</div>` : ''}`
    : `<div class="wall-none">${m.wallNoQuotes}</div>`;
  return `<section class="wall">
    <h2>${m.wallTitle(engines)} <span class="m" title="${esc(m.wallTip)}">${m.methodology}</span></h2>
    ${body}
    <div class="wall-foot">${m.wallReplay}</div>
  </section>`;
}

/** Plain-language verdict, promoted out of the score panel to sit under the wall. */
function verdictBar(input: ReportInput, m: M): string {
  return `<section class="verdict-bar"><div class="verdict">${esc(headline(input, m))}</div></section>`;
}

/** The three things to do today. Tickets arrive impact-ordered, so this is a slice. */
function todaySection(input: ReportInput, m: M): string {
  const actions = (input.tickets ?? []).slice(0, 3).map((t, i) => `
    <div class="action"><div class="action-k"><span class="action-n">${i + 1}</span><span class="action-pr pr-${t.priority}">${t.priority}</span></div>
      <div class="action-t">${esc(t.title)}</div>
      <div class="action-why">${esc(t.rationale.slice(0, 120))}</div>
      <div class="action-acc"><b>${m.startAcc}</b> ${esc(t.acceptance.desc.slice(0, 90))} · ${esc(t.id)}</div></div>`).join('');
  if (!actions) return '';
  return `<section class="exec today"><div class="actions-h">${m.todayTitle}</div><div class="actions">${actions}</div></section>`;
}

/** Score gauge + market visibility + key counts. Below the evidence, not above it. */
function scorePanel(input: ReportInput, m: M): string {
  const audit = input.audit;
  const metrics = input.metrics;
  const score = audit?.avgScore ?? null;
  const grade = score === null ? '' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const markets = [...new Set((metrics?.platforms ?? []).map(p => p.market))];
  const kpis: string[] = [];
  for (const mkt of markets) {
    const ps = (metrics?.platforms ?? []).filter(p => p.market === mkt && p.mentionRate !== null);
    if (ps.length === 0) continue;
    const avg = ps.reduce((a, p) => a + (p.mentionRate as number), 0) / ps.length;
    const dl = input.trend?.deltas.find(d => d.key.endsWith('.mentionRate') && d.market === mkt);
    kpis.push(`<div class="kpi"><div class="kpi-v">${(avg * 100).toFixed(0)}%${deltaChip(dl, m)}</div>
      <div class="kpi-l">${esc(m.execVisibility(mkt === 'cn' ? m.marketCn : m.marketGlobal))}</div></div>`);
  }
  const confusions = (metrics?.platforms ?? []).reduce((a, p) => a + (p.probe?.recognition.confused ?? 0), 0);
  kpis.push(`<div class="kpi"><div class="kpi-v ${confusions > 0 ? 'kpi-bad' : 'kpi-ok'}">${metrics ? confusions : `<span class="na">${m.unmeasured}</span>`}</div><div class="kpi-l">${m.execConfusions}</div></div>`);
  if (metrics) kpis.push(`<div class="kpi"><div class="kpi-v">${metrics.totalSamples}</div><div class="kpi-l">${m.execSamples} · ${new Set(metrics.platforms.map(p => p.providerId)).size} ${m.execEngines}</div></div>`);
  if (audit) kpis.push(`<div class="kpi"><div class="kpi-v">${audit.pages.length}</div><div class="kpi-l">${m.execPages}</div></div>`);

  return `<section class="exec">
    <div class="exec-grid">
      <div class="exec-gauge">${gaugeSvg(score, grade, score !== null ? m.gradeWord(grade) : '', m.unmeasured)}
        <div class="exec-gauge-l">${m.execReadiness} <span class="m" title="${esc(m.execReadinessTip)}">${m.methodology}</span></div></div>
      <div class="exec-main">
        <div class="kpis">${kpis.join('')}</div>
      </div>
    </div>
  </section>`;
}

function trendVerdictChip(d: MetricDelta, m: M): string {
  const v = d.verdict;
  if (v.kind === 'trend') {
    return v.direction === 'up'
      ? `<span class="chip c-ok">${m.vTrendUp}</span>`
      : `<span class="chip c-bad">${m.vTrendDown}</span>`;
  }
  if (v.kind === 'observation') return `<span class="chip c-dim">${m.vObs}${v.direction === 'up' ? ' ↑' : v.direction === 'down' ? ' ↓' : ''}</span>`;
  return `<span class="chip c-dim">${m.vInsuff}</span>`;
}

function trendSection(trend: TrendReport | undefined, m: M): string {
  if (!trend || trend.periods.length < 2) return '';
  const fmt = (v: number | null, key: string): string => {
    if (v === null) return `<span class="na">${m.unmeasured}</span>`;
    return key === 'site.avgScore' ? String(v) : `${(v * 100).toFixed(0)}%`;
  };
  const rows = trend.deltas
    .filter(d => d.prev !== null || d.curr !== null)
    .map(d => `<tr><td class="url">${esc(d.key)}${d.market ? ` <span class="comps">${d.market}</span>` : ''}</td>
      <td>${fmt(d.prev, d.key)}</td><td>${fmt(d.curr, d.key)}</td>
      <td>${trendVerdictChip(d, m)}</td></tr>`).join('');
  const alerts = trend.alerts.map(a =>
    `<li class="${a.level === 'P0' ? 'bad-t' : ''}">${a.level === 'P0' ? '🔴 ' : '⚠ '}${esc(a.message)}</li>`).join('');
  return `<section><h2>${m.trendTitle} <span class="m" title="${esc(m.trendTip)}">${m.methodology}</span></h2>
    ${alerts ? `<ul class="trend-alerts">${alerts}</ul>` : ''}
    <table><thead><tr><th>${m.thMetric}</th><th>${m.thPrev}</th><th>${m.thCurr}</th><th>${m.thVerdict}</th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
}

/**
 * @param quotesShown the evidence wall already carried the verbatim quotes at
 *   the top of the report; repeating them here would pad the blocker count and
 *   make the same finding look like two.
 */
function blockerBanner(input: ReportInput, m: M, quotesShown = false): string {
  const items: string[] = [];
  for (const b of input.audit?.blockers ?? []) items.push(esc(b));
  for (const p of input.audit?.pages ?? []) {
    for (const b of p.blockers) items.push(`${esc(b)}<div class="ev-url">${esc(p.url)}</div>`);
  }
  if (!quotesShown) {
    for (const p of input.metrics?.platforms ?? []) {
      for (const e of p.probe?.confusedEvidence ?? []) {
        items.push(esc(m.confusionItem(p.providerId, p.market, e.slice(0, 120))));
      }
      for (const e of p.sentiment?.negativeEvidence ?? []) {
        items.push(esc(m.negativeItem(p.providerId, p.market, e.slice(0, 120))));
      }
    }
  }
  if (items.length === 0) return '';
  return `<section class="blockers"><h2>${m.blockersTitle(items.length)}</h2>
    <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></section>`;
}

/** The signature view: where does the brand break in the entity funnel. */
function funnel(metrics: MetricsReport | undefined, m: M): string {
  if (!metrics) return '';
  const pct = pctWith(m);
  const markets = [...new Set(metrics.platforms.map(p => p.market))];
  const rows = markets.map(market => {
    const ps = metrics.platforms.filter(p => p.market === market);
    const probeTotal = ps.reduce((a, p) => a + (p.probe?.samples ?? 0), 0);
    const knows = ps.reduce((a, p) => a + (p.probe?.recognition.knows ?? 0), 0);
    const confused = ps.reduce((a, p) => a + (p.probe?.recognition.confused ?? 0), 0);
    const unverified = ps.reduce((a, p) => a + (p.probe?.recognition.unverified ?? 0), 0);
    const rates = ps.filter(p => p.mentionRate !== null).map(p => p.mentionRate as number);
    const mention = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const top3 = ps.filter(p => p.top3Rate !== null).map(p => p.top3Rate as number);
    const t3 = top3.length ? top3.reduce((a, b) => a + b, 0) / top3.length : null;
    const cite = ps.filter(p => p.ownDomainCiteRate !== null).map(p => p.ownDomainCiteRate as number);
    const c = cite.length ? cite.reduce((a, b) => a + b, 0) / cite.length : null;
    const judged = probeTotal - unverified;
    const stage = (label: string, value: string, tone: 'ok' | 'bad' | 'na', note: string) =>
      `<div class="stage ${tone}"><div class="stage-v">${value}</div><div class="stage-l">${label}</div><div class="stage-n">${note}</div></div>`;
    // Unjudged probes never render red/green verdicts — the funnel obeys
    // "unmeasured stays unmeasured" too.
    return `<h3>${market === 'cn' ? m.marketCn : m.marketGlobal}</h3><div class="funnel">
      ${stage(m.stKnows,
        judged > 0 ? `${knows}/${judged}` : m.unmeasured,
        judged > 0 ? (knows === 0 ? 'bad' : 'ok') : 'na',
        judged > 0 ? m.knowsNote : m.judgeHint)}
      ${stage(m.stNotConfused,
        judged > 0 ? (confused === 0 ? '✓' : m.confusedVal(confused)) : m.unmeasured,
        judged > 0 ? (confused > 0 ? 'bad' : 'ok') : 'na',
        confused > 0 ? m.confusedNote : judged > 0 ? '' : m.judgeHint)}
      ${stage(m.stConsidered, pct(mention), mention === null ? 'na' : mention === 0 ? 'bad' : 'ok', m.mentionNote)}
      ${stage(m.stRanked,
        mention === 0 ? '—' : pct(t3),
        mention === 0 || t3 === null ? 'na' : t3 > 0 ? 'ok' : 'bad',
        mention === 0 ? m.noRank : m.top3Note)}
      ${stage(m.stCited, pct(c), c === null ? 'na' : c === 0 ? 'bad' : 'ok', m.citeNote)}
    </div>`;
  });
  return `<section><h2>${m.funnelTitle} <span class="m" title="${esc(m.funnelTip)}">${m.methodology}</span></h2>${rows.join('')}</section>`;
}

function engineTable(metrics: MetricsReport | undefined, m: M): string {
  if (!metrics) return '';
  const pct = pctWith(m);
  const pctS = (v: number): string => `${(v * 100).toFixed(0)}%`;
  const bar = (v: number | null): string =>
    v === null ? '' : `<span class="bar"><i style="width:${Math.max(2, v * 100)}%"></i></span>`;
  const row = (p: PlatformMetrics): string => {
    const comps = Object.entries(p.competitorMentions).sort((a, b) => b[1] - a[1])
      .slice(0, 4).map(([k, n]) => `${esc(k)}×${n}`).join(' ');
    const rec = p.probe
      ? Object.entries(p.probe.recognition).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(' ')
      : '—';
    // Mention rate cell carries its Wilson interval — a rate is a sampled
    // estimate, and the tooltip says so instead of implying false precision.
    let mentionCell = pct(p.mentionRate);
    if (p.mentionRate !== null && p.samples >= 2) {
      const ci = wilsonInterval(Math.round(p.mentionRate * p.samples), p.samples);
      if (ci) mentionCell = `<span title="${esc(m.ciNote(pctS(ci.low), pctS(ci.high), p.samples))}">${pct(p.mentionRate)}<span class="ci">±</span></span>`;
    }
    let sent = `<span class="na">${m.sentimentNone}</span>`;
    if (p.sentiment) {
      const v = p.sentiment.verdicts;
      const parts = [
        v.positive ? `<span class="ok">+${v.positive}</span>` : '',
        v.neutral ? `<span>=${v.neutral}</span>` : '',
        v.negative ? `<span class="bad-t">−${v.negative}</span>` : '',
        v.unverified ? `<span class="na" title="${m.sentimentUnverified}">?${v.unverified}</span>` : '',
      ].filter(Boolean).join(' ');
      sent = parts || `<span class="na">${m.unmeasured}</span>`;
    }
    return `<tr><td class="eng">${esc(p.providerId)}</td><td>${p.market}</td><td class="num">${p.samples}</td>
      <td class="mention-td">${bar(p.mentionRate)}${mentionCell}</td><td>${pct(p.shareOfVoice)}</td><td>${pct(p.ownDomainCiteRate)}</td>
      <td>${sent}</td><td>${rec}</td><td class="comps">${comps || '—'}</td></tr>`;
  };
  return `<section><h2>${m.enginesTitle} <span class="m" title="${esc(m.enginesTip)}">${m.methodology}</span></h2>
    <table><thead><tr><th>${m.thEngine}</th><th>${m.thMarket}</th><th>${m.thSamples}</th><th>${m.thMention}</th><th>${m.thSov}</th><th>${m.thCite}</th><th>${m.thSentiment}</th><th>${m.thRecognition}</th><th>${m.thCompetitors}</th></tr></thead>
    <tbody>${metrics.platforms.map(row).join('')}</tbody></table></section>`;
}

function auditSection(audit: SiteAudit | undefined, m: M): string {
  if (!audit) return '';
  const s = audit.site;
  const chk = (ok: boolean, label: string) => `<span class="${ok ? 'ok' : 'bad-t'}">${ok ? '✓' : '✗'} ${label}</span>`;
  const pageRow = (p: SiteAudit['pages'][0]): string => {
    const dims = p.dimensions.map(d => {
      const ratio = d.score === null ? 0 : (d.score ?? 0) / d.max;
      const cls = d.score === null ? 'na' : ratio < 0.4 ? 'low' : '';
      const tip = `${d.key}: ${d.score === null ? m.unmeasured : `${d.score}/${d.max}`}${d.issues.length ? ' · ' + d.issues.join(',') : ''}`;
      return `<span class="dim ${cls}" title="${tip}"><i style="width:${Math.round(ratio * 100)}%"></i></span>`;
    }).join('');
    return `<tr class="g-${p.grade}"><td><span class="grade">${p.grade}</span></td><td class="num">${p.score}</td>
      <td class="url">${esc(p.url)}</td><td class="num">${p.wordCount}</td><td class="dims">${dims}</td></tr>`;
  };
  const failedUrls = audit.failedUrls ?? [];
  const failed = failedUrls.length
    ? `<p class="bad-t">${m.auditFailed(failedUrls.length)} <span class="url">${failedUrls.map(esc).join(' · ')}</span></p>`
    : '';
  const searchBlocked = s.blockedSearchCrawlers ?? s.blockedAiCrawlers;
  const trainingBlocked = s.blockedTrainingCrawlers ?? [];
  const trainingNote = trainingBlocked.length
    ? ` <span class="na">${esc(m.trainingOptOut(trainingBlocked.join(', ')))}</span>` : '';
  return `<section><h2>${m.auditTitle} <span class="m" title="${esc(m.auditTip)}">${m.methodology}</span></h2>
    <p>${chk(s.robotsTxtFound, 'robots.txt')} ${chk(!searchBlocked.length, m.aiNotBlocked)}${trainingNote} ${chk(s.sitemapFound, 'sitemap')} ${chk(s.llmsTxtFound, 'llms.txt')}
    　${m.avg} <b>${audit.avgScore ?? m.unmeasured}</b> · A${audit.gradeDistribution.A} B${audit.gradeDistribution.B} C${audit.gradeDistribution.C} D${audit.gradeDistribution.D}</p>
    ${failed}
    <table><thead><tr><th></th><th>${m.thScore}</th><th>${m.thPage}</th><th>${m.thWords}</th><th>${m.thDims}</th></tr></thead>
    <tbody>${audit.pages.map(pageRow).join('')}</tbody></table></section>`;
}

const HAS_CJK_RE = /[一-鿿぀-ゟ゠-ヿ가-힯]/;
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locate a judge-quoted evidence string inside an answer. Case-insensitive
 * regex on the ORIGINAL string — offsets never shift (toLowerCase can change
 * string length, e.g. 'İ'). CJK evidence needs only 4 chars to be a
 * meaningful quote; Latin needs 8. Returns null when not found verbatim.
 */
function findEvidence(answer: string, evidence: string): { start: number; end: number } | null {
  const needle = evidence.trim();
  if (needle.length < (HAS_CJK_RE.test(needle) ? 4 : 8)) return null;
  const m = new RegExp(escapeRegExp(needle), 'i').exec(answer);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * Highlight brand-name and confusion-evidence matches inside an answer.
 * Brand matching uses matchRanges from @fastergeo/metrics — the SAME
 * word-boundary rules that computed the metrics, so the replay can never
 * contradict the numbers it exists to prove ('Custyle' must not light up
 * inside 'Custylex' here either). Char-mark pass (0 plain, 1 brand,
 * 2 evidence; evidence wins), then segments are HTML-escaped — highlighting
 * can never un-escape attacker-controlled answer text.
 */
function highlightAnswer(answer: string, names: string[], evidence: string[]): string {
  const marks = new Uint8Array(answer.length);
  for (const r of matchRanges(answer, names)) marks.fill(1, r.start, r.end);
  for (const e of evidence) {
    const r = findEvidence(answer, e);
    if (r) marks.fill(2, r.start, r.end);
  }
  let html = '';
  let seg = '';
  let cur: 0 | 1 | 2 = 0;
  const flush = (): void => {
    if (!seg) return;
    const escd = esc(seg);
    html += cur === 2 ? `<mark class="hl-ev">${escd}</mark>`
      : cur === 1 ? `<mark class="hl-brand">${escd}</mark>` : escd;
    seg = '';
  };
  for (let i = 0; i < answer.length; i++) {
    const mk = marks[i] as 0 | 1 | 2;
    if (mk !== cur) { flush(); cur = mk; }
    seg += answer[i];
  }
  flush();
  return html;
}

/**
 * Answer Replay: the traceability layer. Aggregates are claims; this is the
 * verbatim record they can be checked against. No per-sample verdicts are
 * invented here — only deterministic facts render (name match, evidence match).
 */
function replaySection(input: ReportInput, m: M): string {
  const samples = input.samples ?? [];
  if (samples.length === 0) return '';
  const names = [input.brandName, ...(input.brandAliases ?? [])];
  const evidenceByProvider = new Map<string, string[]>();
  for (const p of input.metrics?.platforms ?? []) {
    if (p.probe?.confusedEvidence.length) evidenceByProvider.set(p.providerId, p.probe.confusedEvidence);
  }
  const byProvider = new Map<string, Sample[]>();
  for (const s of samples) {
    const list = byProvider.get(s.providerId) ?? [];
    list.push(s);
    byProvider.set(s.providerId, list);
  }
  const providers = [...byProvider.entries()]
    .sort((a, b) => String(a[1][0].market ?? '').localeCompare(String(b[1][0].market ?? '')) || a[0].localeCompare(b[0]));

  const groups = providers.map(([id, group]) => {
    const evidence = evidenceByProvider.get(id) ?? [];
    // Evidence quotes come from probe answers — they are only searched for
    // in probe samples, so a correct unprompted answer can never be tagged
    // with someone else's confusion evidence.
    const located = new Set<string>();
    const items = group.map(s => {
      const mentioned = mentions(s.answer, names);
      const evHits = s.brandInQuestion ? evidence.filter(e => findEvidence(s.answer, e) !== null) : [];
      evHits.forEach(e => located.add(e));
      const chips = [
        s.brandInQuestion ? `<span class="chip c-probe">${m.rpProbe}</span>` : '',
        !s.brandInQuestion ? (mentioned
          ? `<span class="chip c-ok">${m.rpMention}</span>`
          : `<span class="chip c-dim">${m.rpNoMention}</span>`) : '',
        evHits.length ? `<span class="chip c-bad">${m.rpEvidence}</span>` : '',
      ].filter(Boolean).join('');
      const meta = [s.model, s.channel].filter(Boolean).map(esc).join(' · ');
      const cites = s.citations.length
        ? `<div class="rp-cite">${m.rpCitations}: ${s.citations.map(esc).join(' · ')}</div>` : '';
      return `<details class="rp"><summary><span class="rp-q">${esc(s.question)}</span>${chips}</summary>
        <div class="rp-a">${highlightAnswer(s.answer, s.brandInQuestion ? [] : names, evHits)}</div>
        ${cites}${meta ? `<div class="rp-meta">${meta}</div>` : ''}</details>`;
    }).join('');
    // Judge quotes that could not be located verbatim in any probe answer
    // still render — a P0 confusion finding must never become invisible just
    // because the judge paraphrased its quote.
    const unlocated = evidence.filter(e => !located.has(e));
    const evNote = unlocated.length
      ? `<div class="rp-ev-note">${m.rpEvUnlocated}${unlocated.map(e => `<div class="rp-ev-q">「${esc(e.slice(0, 160))}」</div>`).join('')}</div>`
      : '';
    const market = group[0].market;
    return `<h3>${esc(id)} · ${esc(market ?? '?')} · ${m.rpSamples(group.length)}</h3>${evNote}${items}`;
  }).join('');

  return `<section><h2>${m.replayTitle(samples.length)} <span class="m" title="${esc(m.replayTip)}">${m.methodology}</span></h2>${groups}</section>`;
}

function sourcesSection(metrics: MetricsReport | undefined, m: M): string {
  const sources = metrics?.citationSources ?? [];
  if (sources.length === 0) return '';
  const markets = [...new Set(sources.map(s => s.market))];
  const groups = markets.map(market => {
    const rows = sources.filter(s => s.market === market).slice(0, 10).map(s =>
      `<tr><td class="url">${esc(s.domain)}${s.own ? ` <span class="chip c-ok">${m.ownTag}</span>` : ''}</td>
       <td class="num">${s.citations}</td><td class="num">${s.samples}</td>
       <td class="comps">${s.engines.map(esc).join(' ')}</td></tr>`).join('');
    return `<h3>${market === 'cn' ? m.marketCn : m.marketGlobal}</h3>
      <table><thead><tr><th>${m.thDomain}</th><th>${m.thCitations}</th><th>${m.thInSamples}</th><th>${m.thEngines}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }).join('');
  return `<section><h2>${m.sourcesTitle} <span class="m" title="${esc(m.sourcesTip)}">${m.methodology}</span></h2>${groups}</section>`;
}

function ticketSection(tickets: Ticket[] | undefined, m: M): string {
  if (!tickets || tickets.length === 0) return '';
  const row = (t: Ticket): string =>
    `<tr class="pr-${t.priority}"><td><b>${t.priority}</b></td><td>${t.id}</td><td>${esc(t.title)}
      <div class="rationale">${esc(t.rationale.slice(0, 110))}</div>${t.pages
    ? `<div class="rationale">${t.pages.map(esc).join(' · ')}</div>` : ''}${t.fixHint
    ? `<details class="fixhint"><summary>${m.fixHow}</summary><pre>${esc(t.fixHint)}</pre></details>` : ''}</td>
      <td>${t.acceptance.type === 'auto' ? m.accAuto : m.accManual}</td><td>${t.status}</td></tr>`;
  const auto = tickets.filter(t => t.acceptance.type === 'auto').length;
  return `<section><h2>${m.ticketsTitle(tickets.length, auto)}</h2>
    <table><thead><tr><th></th><th>ID</th><th>${m.thTicket}</th><th>${m.thAcceptance}</th><th>${m.thStatus}</th></tr></thead>
    <tbody>${tickets.map(row).join('')}</tbody></table></section>`;
}

const CSS = `
/* FasterGEO report — the Evidence File, in daylight: paper ground, ink text,
   serif display, mono data, one proof-red accent. Built to be handed to a client. */
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{--paper:#F3F1EA;--card:#FFFFFF;--well:#F8F6F0;--line:#E4E0D4;--rule:#D8D3C4;
--tx:#1C1A15;--dim:#5C574D;--faint:#98917F;--red:#B23A26;--red-soft:#F8ECE8;
--ok:#20714A;--ok-soft:#EAF1EB;--amber:#8A6100;--amber-soft:#F5EFDE;--acc:#1C1A15;--acc-soft:#EFECE2}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--tx);padding:34px 26px;-webkit-font-smoothing:antialiased;
font:14px/1.65 -apple-system,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:1020px;margin:0 auto}
h1{font-family:"Newsreader",Georgia,"Songti SC",serif;font-size:27px;font-weight:700;letter-spacing:-.01em;margin:0}
h2{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:11.5px;font-weight:500;letter-spacing:.14em;
text-transform:uppercase;color:var(--dim);margin:0 0 16px;border-bottom:1px solid var(--rule);padding-bottom:9px}
h3{font-size:13px;color:var(--dim);margin:18px 0 10px;font-weight:600}
.num,td.num{font-variant-numeric:tabular-nums}
/* Header bar */
.rp-head{display:flex;align-items:center;gap:18px;border-top:3px solid var(--tx);border-bottom:1px solid var(--rule);
padding:16px 2px 14px;margin-bottom:22px}
.rp-brand{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:13px;font-weight:500;letter-spacing:.16em}
.rp-brand span{color:var(--red)}
.rp-title{flex:1}
.meta{color:var(--faint);font-size:12.5px;margin-top:3px}
.printbtn{font:12px ui-monospace,"IBM Plex Mono",Menlo,monospace;color:var(--tx);background:var(--card);
border:1px solid var(--rule);border-radius:6px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.printbtn:hover{border-color:var(--tx)}
/* Sections as paper cards */
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:24px 26px;margin-bottom:18px;
box-shadow:0 1px 2px rgba(28,26,21,.04)}
/* Evidence wall — first screen. The quotes carry the weight, so they get the
   display face and the size; everything around them stays out of the way. */
.wall{padding:26px 28px}
.wall-qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:16px}
.wall-q{margin:0;padding:18px 20px;border-radius:8px;background:var(--well);border-left:3px solid var(--rule)}
.wall-q.q-bad{background:var(--red-soft);border-left-color:var(--red)}
.wall-q.q-warn{background:var(--amber-soft);border-left-color:var(--amber)}
.wall-q blockquote{margin:0;font-family:"Newsreader",Georgia,"Songti SC",serif;font-size:17px;line-height:1.55;font-style:italic}
.wall-q figcaption{margin-top:10px;font:500 11px ui-monospace,"IBM Plex Mono",Menlo,monospace;color:var(--dim);letter-spacing:.04em}
.wall-tag{display:inline-block;padding:1px 7px;border-radius:3px;background:var(--red);color:#fff;margin-right:7px;letter-spacing:.06em;text-transform:uppercase;font-size:9.5px}
.q-warn .wall-tag{background:var(--amber)}
.wall-more{margin-top:10px;font-size:12px;color:var(--dim)}
.wall-none{margin-top:14px;padding:16px 18px;border-radius:8px;background:var(--well);color:var(--dim);font-size:13.5px}
.wall-foot{margin-top:14px;font-size:11.5px;color:var(--faint)}
.verdict-bar{padding:20px 28px}
.verdict-bar .verdict{margin-bottom:0}
/* Executive summary */
.exec{padding:26px 28px}
.exec-grid{display:flex;gap:30px;align-items:center;flex-wrap:wrap}
.exec-gauge{text-align:center;flex:0 0 190px}
.gauge{width:180px;height:104px}
.gauge-n{font:700 34px "Newsreader",Georgia,serif;fill:var(--tx)}
.gauge-g{font:500 11px ui-monospace,"IBM Plex Mono",Menlo,monospace;fill:var(--dim);letter-spacing:.08em}
.exec-gauge-l{font-size:11.5px;color:var(--dim);margin-top:2px}
.exec-main{flex:1;min-width:300px}
.verdict{font-family:"Newsreader",Georgia,"Songti SC",serif;font-size:19px;line-height:1.5;font-weight:500;
border-left:3px solid var(--red);padding-left:14px;margin-bottom:18px}
.kpis{display:flex;gap:0;flex-wrap:wrap}
.kpi{padding:2px 22px 2px 0;margin-right:22px;border-right:1px solid var(--line)}
.kpi:last-child{border-right:none}
.kpi-v{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:23px;font-weight:500;font-variant-numeric:tabular-nums}
.kpi-v.kpi-bad{color:var(--red)}.kpi-v.kpi-ok{color:var(--ok)}
.kpi-l{font-size:11.5px;color:var(--faint);margin-top:2px}
.delta{font-size:11px;margin-left:7px;vertical-align:2px}
.delta.up{color:var(--ok)}.delta.down{color:var(--red)}
.actions-h{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:11.5px;letter-spacing:.14em;
text-transform:uppercase;color:var(--dim);margin:24px 0 12px;border-top:1px solid var(--rule);padding-top:18px}
/* The action list now opens its own card, so the divider that separated it from
   the gauge above has nothing left to separate. */
.today .actions-h{margin-top:0;border-top:none;padding-top:0}
.actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.action{background:var(--well);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
.action-k{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.action-n{font-family:"Newsreader",Georgia,serif;font-weight:700;font-size:17px;color:var(--faint)}
.action-pr{font:500 11px ui-monospace,"IBM Plex Mono",Menlo,monospace;padding:1px 7px;border-radius:4px}
.action-pr.pr-P0{background:var(--red-soft);color:var(--red)}
.action-pr.pr-P1{background:var(--amber-soft);color:var(--amber)}
.action-pr.pr-P2{background:var(--acc-soft);color:var(--dim)}
.action-t{font-weight:600;font-size:13.5px;line-height:1.45}
.action-why{color:var(--dim);font-size:12px;margin-top:6px;line-height:1.55}
.action-acc{color:var(--faint);font-size:11.5px;margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}
.action-acc b{color:var(--dim);font-weight:600}
/* Blockers */
.blockers{border-color:rgba(178,58,38,.4);background:linear-gradient(135deg,var(--red-soft),var(--card) 60%)}
.blockers h2{color:var(--red);border-color:rgba(178,58,38,.3)}
.blockers ul{margin:0;padding-left:18px}.blockers li{margin:8px 0;font-size:13.5px}
.ev-url{color:var(--faint);font-size:12px;font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace}
/* Entity funnel */
.funnel{display:flex;gap:0;align-items:stretch}
.stage{flex:1;min-width:100px;position:relative;background:var(--well);border:1px solid var(--line);border-radius:8px;
padding:16px 12px 12px;text-align:center;margin-right:26px}
.stage:last-child{margin-right:0}
.stage:not(:last-child)::after{content:"→";position:absolute;right:-21px;top:50%;
transform:translateY(-50%);color:var(--faint);font-size:15px}
.stage.ok{border-top:3px solid var(--ok)}
.stage.bad{border-top:3px solid var(--red);background:linear-gradient(180deg,var(--red-soft),var(--well) 75%)}
.stage.na{border-top:3px solid var(--rule);opacity:.72}
.stage.na .stage-v{color:var(--faint);font-size:17px}
.stage-v{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.stage.bad .stage-v{color:var(--red)}
.stage-l{font-size:13px;font-weight:600;margin-top:4px}
.stage-n{font-size:11px;color:var(--faint);margin-top:4px;line-height:1.4}
/* Tables */
table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--faint);font-weight:500;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;padding:8px;border-bottom:1px solid var(--rule)}
td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:var(--well)}
td.eng{font-weight:600}
.na{color:var(--faint)}
.ci{color:var(--faint);font-size:10px;vertical-align:super;cursor:help}
.ok{color:var(--ok)}.bad-t{color:var(--red)}
.mention-td{min-width:130px}
.bar{display:inline-block;width:64px;height:7px;background:var(--acc-soft);border-radius:4px;margin-right:8px;
position:relative;overflow:hidden;vertical-align:1px}
.bar i{position:absolute;left:0;top:0;bottom:0;background:var(--tx);border-radius:4px}
/* Grade badges + dimension bars */
.grade{display:inline-flex;width:26px;height:26px;border-radius:6px;align-items:center;
justify-content:center;font-weight:700;font-size:13px;font-family:"Newsreader",Georgia,serif}
.g-A .grade,.g-B .grade{background:var(--ok-soft);color:var(--ok)}
.g-C .grade{background:var(--amber-soft);color:var(--amber)}
.g-D .grade{background:var(--red-soft);color:var(--red)}
.url{word-break:break-all;font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;font-size:12px;color:var(--dim)}
.dims{white-space:nowrap}
.dim{display:inline-block;width:34px;height:6px;background:var(--acc-soft);border-radius:3px;
margin-right:4px;position:relative;overflow:hidden;vertical-align:middle}
.dim i{position:absolute;left:0;top:0;bottom:0;background:var(--tx);border-radius:3px}
.dim.low i{background:var(--red)}.dim.na{opacity:.3}
/* Tickets */
.pr-P0 td:first-child b{color:var(--red)}
.pr-P1 td:first-child b{color:var(--amber)}
.pr-P2 td:first-child b{color:var(--faint)}
.rationale{color:var(--dim);font-size:12px;margin-top:3px}
.fixhint{margin-top:6px}
.fixhint summary{cursor:pointer;color:var(--red);font-size:12px;user-select:none;font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace}
.fixhint pre{white-space:pre-wrap;color:var(--dim);font-size:12px;line-height:1.6;font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;
background:var(--well);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:6px 0 0}
.comps{color:var(--dim);font-size:12px}
.m{font-size:11px;color:var(--faint);cursor:help;font-weight:400;letter-spacing:0;text-transform:none}
/* Trend */
.trend-alerts{margin:0 0 14px;padding-left:18px}.trend-alerts li{margin:6px 0;font-size:13px}
/* Answer replay */
details.rp{border:1px solid var(--line);border-radius:8px;margin:8px 0;background:var(--well)}
details.rp summary{cursor:pointer;padding:10px 14px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:none}
details.rp summary::-webkit-details-marker{display:none}
details.rp summary::before{content:"▸";color:var(--faint);font-size:11px}
details.rp[open] summary::before{content:"▾"}
.rp-q{flex:1;min-width:200px}
.rp-a{padding:2px 16px 12px 28px;font-size:13px;color:var(--dim);white-space:pre-wrap;line-height:1.85;border-top:1px solid var(--line);margin-top:2px;padding-top:12px}
mark.hl-brand{background:var(--acc-soft);color:var(--tx);border-radius:3px;padding:0 2px;font-weight:600}
mark.hl-ev{background:var(--red-soft);color:var(--red);border-radius:3px;padding:0 2px;font-weight:600}
.chip{font-size:11px;padding:2px 8px;border-radius:99px;white-space:nowrap;font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace}
.c-probe{background:var(--acc-soft);color:var(--dim)}
.c-ok{background:var(--ok-soft);color:var(--ok)}
.c-dim{background:var(--well);color:var(--faint);border:1px solid var(--line)}
.c-bad{background:var(--red-soft);color:var(--red);font-weight:600}
.rp-cite{padding:0 16px 10px 28px;font-size:12px;color:var(--faint);font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace;word-break:break-all}
.rp-meta{padding:0 16px 12px 28px;font-size:11px;color:var(--faint)}
.rp-ev-note{border:1px solid rgba(178,58,38,.35);background:var(--red-soft);border-radius:8px;padding:10px 14px;margin:8px 0;font-size:12.5px;color:var(--red)}
.rp-ev-q{color:var(--tx);font-size:12.5px;margin-top:4px}
footer{color:var(--faint);font-size:12px;text-align:center;padding:18px 0 6px;border-top:1px solid var(--rule);margin-top:8px}
/* Print / PDF */
@media print{
body{padding:0;font-size:12px;background:#fff}
section{border:1px solid var(--line);box-shadow:none;break-inside:avoid;page-break-inside:avoid;margin-bottom:14px;padding:16px 18px}
.exec{break-inside:avoid}
tr{break-inside:avoid}
.m,.printbtn{display:none}
details.rp,.fixhint{break-inside:avoid}
a{color:var(--tx);text-decoration:none}
}`;

export function renderHtmlReport(input: ReportInput): string {
  const lang: ReportLang = input.lang === 'zh' ? 'zh' : 'en';
  const m: M = MSG[lang];
  const at = input.generatedAt ?? new Date().toISOString();
  const wall = evidenceWall(input, m);
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${esc(input.brandName)} · ${m.reportTitle} · FasterGEO</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body><main>
<header class="rp-head">
  <div class="rp-brand">FASTER<span>GEO</span></div>
  <div class="rp-title"><h1>${esc(input.brandName)}</h1><div class="meta">${m.reportTitle} · ${esc(at.slice(0, 10))}${input.audit ? ` · ${esc(input.audit.root)}` : ''} · ${m.metaHint}</div></div>
  <button class="printbtn" onclick="print()">${m.printBtn}</button>
</header>
${wall}
${verdictBar(input, m)}
${todaySection(input, m)}
${blockerBanner(input, m, wall !== '')}
${scorePanel(input, m)}
${funnel(input.metrics, m)}
${trendSection(input.trend, m)}
${engineTable(input.metrics, m)}
${auditSection(input.audit, m)}
${sourcesSection(input.metrics, m)}
${ticketSection(input.tickets, m)}
${replaySection(input, m)}
<footer>${m.footer}</footer>
<script>
// Print: open every collapsed block so the PDF carries the full evidence.
(function(){var st=[];addEventListener('beforeprint',function(){st=[];document.querySelectorAll('details').forEach(function(d){st.push(d.open);d.open=true;});});
addEventListener('afterprint',function(){document.querySelectorAll('details').forEach(function(d,i){d.open=st[i];});});})();
</script>
</main></body></html>`;
}
