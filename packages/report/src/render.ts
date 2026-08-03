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
    aiNotBlocked: 'AI crawlers not blocked', avg: 'avg',
    thScore: 'score', thPage: 'page', thWords: 'word-eq', thDims: 'dimensions',
    ticketsTitle: (n: number, a: number) => `Action Tickets (${n} · ${a} machine-verifiable)`,
    thTicket: 'ticket', thAcceptance: 'acceptance', thStatus: 'status',
    accAuto: '⚙ auto', accManual: '👤 manual',
    replayTitle: (n: number) => `Answer Replay (${n} samples, verbatim)`,
    replayTip: 'Every sampled answer, unedited, with brand mentions and confusion evidence highlighted. Every number above can be checked against this record — that is the point. Samples that named the brand are tagged "probe" and are excluded from visibility metrics.',
    rpProbe: 'probe', rpMention: 'mentions brand', rpNoMention: 'no mention',
    rpEvidence: 'confusion evidence', rpCitations: 'citations', rpSamples: (n: number) => `${n} samples`,
    rpEvUnlocated: 'Judge-quoted confusion evidence (could not be located verbatim in a stored answer — quote may be paraphrased):',
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
    aiNotBlocked: 'AI 爬虫未被屏蔽', avg: '均分',
    thScore: '分', thPage: '页面', thWords: '词等效', thDims: '维度',
    ticketsTitle: (n: number, a: number) => `行动工单（${n} 条 · ${a} 条机器自动验收）`,
    thTicket: '工单', thAcceptance: '验收', thStatus: '状态',
    accAuto: '⚙ 自动', accManual: '👤 人工',
    replayTitle: (n: number) => `答案回放（${n} 条采样原文，逐字留档）`,
    replayTip: '全部采样回答原文未经删改，品牌命中与混淆证据高亮。上面每个数字都可以对照这里的原文质证——这正是目的。点名品牌的样本标记为「探测」，不计入可见度指标。',
    rpProbe: '探测·点名', rpMention: '提及品牌', rpNoMention: '未提及',
    rpEvidence: '混淆证据', rpCitations: '引用', rpSamples: (n: number) => `${n} 条`,
    rpEvUnlocated: '裁判引用的混淆证据（未能在留档答案中逐字定位——引语可能被裁判改写）：',
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

function blockerBanner(input: ReportInput, m: M): string {
  const items: string[] = [];
  for (const b of input.audit?.blockers ?? []) items.push(esc(b));
  for (const p of input.audit?.pages ?? []) {
    for (const b of p.blockers) items.push(`${esc(b)}<div class="ev-url">${esc(p.url)}</div>`);
  }
  for (const p of input.metrics?.platforms ?? []) {
    for (const e of p.probe?.confusedEvidence ?? []) {
      items.push(esc(m.confusionItem(p.providerId, p.market, e.slice(0, 120))));
    }
    for (const e of p.sentiment?.negativeEvidence ?? []) {
      items.push(esc(m.negativeItem(p.providerId, p.market, e.slice(0, 120))));
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
    return `<tr><td>${esc(p.providerId)}</td><td>${p.market}</td><td class="num">${p.samples}</td>
      <td>${mentionCell}</td><td>${pct(p.shareOfVoice)}</td><td>${pct(p.ownDomainCiteRate)}</td>
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
  return `<section><h2>${m.auditTitle} <span class="m" title="${esc(m.auditTip)}">${m.methodology}</span></h2>
    <p>${chk(s.robotsTxtFound, 'robots.txt')} ${chk(!s.blockedAiCrawlers.length, m.aiNotBlocked)} ${chk(s.sitemapFound, 'sitemap')} ${chk(s.llmsTxtFound, 'llms.txt')}
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

function ticketSection(tickets: Ticket[] | undefined, m: M): string {
  if (!tickets || tickets.length === 0) return '';
  const row = (t: Ticket): string =>
    `<tr class="pr-${t.priority}"><td><b>${t.priority}</b></td><td>${t.id}</td><td>${esc(t.title)}
      <div class="rationale">${esc(t.rationale.slice(0, 110))}</div></td>
      <td>${t.acceptance.type === 'auto' ? m.accAuto : m.accManual}</td><td>${t.status}</td></tr>`;
  const auto = tickets.filter(t => t.acceptance.type === 'auto').length;
  return `<section><h2>${m.ticketsTitle(tickets.length, auto)}</h2>
    <table><thead><tr><th></th><th>ID</th><th>${m.thTicket}</th><th>${m.thAcceptance}</th><th>${m.thStatus}</th></tr></thead>
    <tbody>${tickets.map(row).join('')}</tbody></table></section>`;
}

const CSS = `
/* FasterGEO design language: precision instrument — deep ink, single accent, tabular numbers, 8px grid */
:root{--bg:#0B0E14;--card:#121826;--well:#0D1420;--line:rgba(148,163,184,.10);
--tx:#E8EDF5;--dim:#8A96A8;--faint:#5B6675;--acc:#8B7CF6;--acc-soft:rgba(139,124,246,.12);
--red:#F4536E;--red-soft:rgba(244,83,110,.10);--ok:#2FD08C;--ok-soft:rgba(47,208,140,.12);
--amber:#F0B24A;--amber-soft:rgba(240,178,74,.12)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);padding:40px 32px;-webkit-font-smoothing:antialiased;
font:14px/1.7 -apple-system,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:980px;margin:0 auto}
h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 18px}
h3{font-size:13px;color:var(--dim);margin:20px 0 10px;font-weight:600}
.meta{color:var(--dim);font-size:13px;margin-bottom:28px}
.headline{font-size:17px;line-height:1.6;font-weight:500;background:linear-gradient(135deg,var(--acc-soft),transparent 60%),var(--card);
border:1px solid var(--line);padding:20px 24px;border-radius:14px;margin-bottom:24px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 28px;margin-bottom:20px}
.blockers{border-color:rgba(244,83,110,.35);background:linear-gradient(135deg,var(--red-soft),transparent 55%),var(--card)}
.blockers h2{color:var(--red)}
.blockers ul{margin:0;padding-left:18px}.blockers li{margin:8px 0;font-size:13.5px}
.ev-url{color:var(--faint);font-size:12px;font-family:ui-monospace,Menlo,monospace}
/* Entity funnel — the hero */
.funnel{display:flex;gap:0;align-items:stretch}
.stage{flex:1;min-width:100px;position:relative;background:var(--well);border-radius:12px;
padding:18px 12px 14px;text-align:center;margin-right:26px}
.stage:last-child{margin-right:0}
.stage:not(:last-child)::after{content:"→";position:absolute;right:-21px;top:50%;
transform:translateY(-50%);color:var(--faint);font-size:15px}
.stage.ok{border-top:2px solid var(--ok)}
.stage.bad{border-top:2px solid var(--red);background:linear-gradient(180deg,var(--red-soft),var(--well) 70%)}
.stage.na{border-top:2px solid var(--line);opacity:.75}
.stage.na .stage-v{color:var(--faint);font-size:18px}
.stage-v{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.stage.bad .stage-v{color:var(--red)}
.stage-l{font-size:13px;font-weight:600;margin-top:4px}
.stage-n{font-size:11px;color:var(--faint);margin-top:4px;line-height:1.4}
/* Tables */
table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--faint);font-weight:500;font-size:11.5px;letter-spacing:.04em;
padding:8px;border-bottom:1px solid var(--line)}
td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.na{color:var(--faint)}
.ci{color:var(--faint);font-size:10px;vertical-align:super;cursor:help}
.ok{color:var(--ok)}.bad-t{color:var(--red)}
/* Grade badges + dimension bars */
.grade{display:inline-flex;width:26px;height:26px;border-radius:8px;align-items:center;
justify-content:center;font-weight:800;font-size:13px}
.g-A .grade,.g-B .grade{background:var(--ok-soft);color:var(--ok)}
.g-C .grade{background:var(--amber-soft);color:var(--amber)}
.g-D .grade{background:var(--red-soft);color:var(--red)}
.url{word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--dim)}
.dims{white-space:nowrap}
.dim{display:inline-block;width:34px;height:5px;background:var(--well);border-radius:3px;
margin-right:4px;position:relative;overflow:hidden;vertical-align:middle}
.dim i{position:absolute;left:0;top:0;bottom:0;background:var(--acc);border-radius:3px}
.dim.low i{background:var(--red)}.dim.na{opacity:.25}
/* Tickets */
.pr-P0 td:first-child b{color:var(--red)}
.pr-P1 td:first-child b{color:var(--amber)}
.pr-P2 td:first-child b{color:var(--faint)}
.rationale{color:var(--dim);font-size:12px;margin-top:3px}
.comps{color:var(--dim);font-size:12px}
.m{font-size:11px;color:var(--faint);cursor:help;font-weight:400;letter-spacing:0;text-transform:none}
/* Answer replay */
details.rp{border:1px solid var(--line);border-radius:10px;margin:8px 0;background:var(--well)}
details.rp summary{cursor:pointer;padding:10px 14px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:none}
details.rp summary::-webkit-details-marker{display:none}
details.rp summary::before{content:"▸";color:var(--faint);font-size:11px}
details.rp[open] summary::before{content:"▾"}
.rp-q{flex:1;min-width:200px}
.rp-a{padding:2px 16px 12px 28px;font-size:13px;color:var(--dim);white-space:pre-wrap;line-height:1.85;border-top:1px solid var(--line);margin-top:2px;padding-top:12px}
mark.hl-brand{background:var(--acc-soft);color:var(--acc);border-radius:3px;padding:0 2px}
mark.hl-ev{background:var(--red-soft);color:var(--red);border-radius:3px;padding:0 2px;font-weight:600}
.chip{font-size:11px;padding:2px 8px;border-radius:99px;white-space:nowrap}
.c-probe{background:var(--acc-soft);color:var(--acc)}
.c-ok{background:var(--ok-soft);color:var(--ok)}
.c-dim{background:var(--well);color:var(--faint);border:1px solid var(--line)}
.c-bad{background:var(--red-soft);color:var(--red);font-weight:600}
.rp-cite{padding:0 16px 10px 28px;font-size:12px;color:var(--faint);font-family:ui-monospace,Menlo,monospace;word-break:break-all}
.rp-meta{padding:0 16px 12px 28px;font-size:11px;color:var(--faint)}
.rp-ev-note{border:1px solid rgba(244,83,110,.35);background:var(--red-soft);border-radius:10px;padding:10px 14px;margin:8px 0;font-size:12.5px;color:var(--red)}
.rp-ev-q{color:var(--tx);font-size:12.5px;margin-top:4px}
footer{color:var(--faint);font-size:12px;text-align:center;padding:16px 0 4px}`;

export function renderHtmlReport(input: ReportInput): string {
  const lang: ReportLang = input.lang === 'zh' ? 'zh' : 'en';
  const m: M = MSG[lang];
  const at = input.generatedAt ?? new Date().toISOString();
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${esc(input.brandName)} · ${m.reportTitle} · FasterGEO</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body><main>
<h1>${esc(input.brandName)} · ${m.reportTitle}</h1>
<div class="meta">FasterGEO · ${esc(at.slice(0, 10))}${input.audit ? ` · ${esc(input.audit.root)}` : ''} · ${m.metaHint}</div>
<div class="headline">${esc(headline(input, m))}</div>
${blockerBanner(input, m)}
${funnel(input.metrics, m)}
${engineTable(input.metrics, m)}
${auditSection(input.audit, m)}
${ticketSection(input.tickets, m)}
${replaySection(input, m)}
<footer>${m.footer}</footer>
</main></body></html>`;
}
