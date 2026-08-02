/**
 * Self-contained HTML diagnosis report.
 *
 * Layout doctrine:
 * 1. Blockers first — ticket problems and brand-confusion evidence go in a
 *    red banner at the top, not buried in averages (an audit that hides its
 *    most dangerous finding in a score is lying by composition).
 * 2. The Brand Entity Funnel is the primary view: knows → not-confused →
 *    mentioned → ranked → cited. Most brands break at the head, not the tail.
 * 3. Every metric links to a methodology note; unmeasured renders as 未测.
 */

import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport, PlatformMetrics } from '@fastergeo/metrics';
import type { Ticket } from '@fastergeo/tickets';

export interface ReportInput {
  brandName: string;
  audit?: SiteAudit;
  metrics?: MetricsReport;
  tickets?: Ticket[];
  generatedAt?: string;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? '<span class="na">未测</span>' : `${(v * 100).toFixed(0)}%`;

function headline(input: ReportInput): string {
  const parts: string[] = [];
  const conf = confusionCount(input.metrics);
  if (conf > 0) parts.push(`${conf} 个引擎把品牌张冠李戴到其他行业`);
  const shells = input.audit?.pages.filter(p => p.blockers.some(b => b.startsWith('spa-shell'))).length ?? 0;
  if (shells > 0) parts.push(`${shells} 个页面对 AI 爬虫是空壳`);
  if (input.metrics) {
    const rates = input.metrics.platforms.filter(p => p.mentionRate !== null).map(p => p.mentionRate as number);
    if (rates.length > 0) {
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      parts.push(`无提示提及率 ${(avg * 100).toFixed(0)}%`);
    }
  }
  if (parts.length === 0 && input.audit?.avgScore != null) {
    parts.push(`站点体检均分 ${input.audit.avgScore}/100`);
  }
  return parts.length > 0 ? parts.join('；') + '。' : '数据不足，先完成采样与体检。';
}

function confusionCount(metrics?: MetricsReport): number {
  return metrics?.platforms.filter(p => (p.probe?.recognition.confused ?? 0) > 0).length ?? 0;
}

function blockerBanner(input: ReportInput): string {
  const items: string[] = [];
  for (const b of input.audit?.blockers ?? []) items.push(esc(b));
  for (const p of input.audit?.pages ?? []) {
    for (const b of p.blockers) items.push(`${esc(b)}<div class="ev-url">${esc(p.url)}</div>`);
  }
  for (const p of input.metrics?.platforms ?? []) {
    for (const e of p.probe?.confusedEvidence ?? []) {
      items.push(`张冠李戴（${esc(p.providerId)} · ${p.market}）：AI 原文「${esc(e.slice(0, 120))}…」`);
    }
  }
  if (items.length === 0) return '';
  return `<section class="blockers"><h2>🔴 修复前一切优化无效（${items.length} 项）</h2>
    <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></section>`;
}

/** The signature view: where does the brand break in the entity funnel. */
function funnel(metrics?: MetricsReport): string {
  if (!metrics) return '';
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
    const stage = (label: string, value: string, bad: boolean, note: string) =>
      `<div class="stage ${bad ? 'bad' : ''}"><div class="stage-v">${value}</div><div class="stage-l">${label}</div><div class="stage-n">${note}</div></div>`;
    return `<h3>${market === 'cn' ? '国内市场' : '海外市场'}</h3><div class="funnel">
      ${stage('真认识', probeTotal ? `${knows}/${probeTotal - unverified || '?'}` : '未测', knows === 0 && probeTotal > 0, '点名探测 · LLM judge 判定')}
      ${stage('不认错', probeTotal ? `${confused === 0 ? '✓' : `${confused} 起混淆`}` : '未测', confused > 0, confused > 0 ? 'P0 实体消歧' : '')}
      ${stage('进候选集', pct(mention), mention === 0, '无提示提及率')}
      ${stage('前三位次', pct(t3), false, 'Top3 率')}
      ${stage('引用官网', pct(c), c === 0, '官网引用率')}
    </div>`;
  });
  return `<section><h2>品牌实体漏斗 <span class="m" title="漏斗从左到右：AI 是否真的认识品牌（探测题+LLM裁判判定，非名字回声）→ 是否张冠李戴 → 无提示问题中是否被提及 → 提及时的位次 → 是否引用官网。多数品牌断在头部。">ⓘ 口径</span></h2>${rows.join('')}</section>`;
}

function engineTable(metrics?: MetricsReport): string {
  if (!metrics) return '';
  const row = (p: PlatformMetrics): string => {
    const comps = Object.entries(p.competitorMentions).sort((a, b) => b[1] - a[1])
      .slice(0, 4).map(([k, n]) => `${esc(k)}×${n}`).join(' ');
    const rec = p.probe
      ? Object.entries(p.probe.recognition).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(' ')
      : '—';
    return `<tr><td>${esc(p.providerId)}</td><td>${p.market}</td><td>${p.samples}</td>
      <td>${pct(p.mentionRate)}</td><td>${pct(p.shareOfVoice)}</td><td>${pct(p.ownDomainCiteRate)}</td>
      <td>${rec}</td><td class="comps">${comps || '—'}</td></tr>`;
  };
  return `<section><h2>引擎表现 <span class="m" title="提及率=无提示问题中品牌被提及的比例（点名探测题严格隔离，不计入）。SoV=品牌提及/(品牌+竞品提及)。国内与海外分开计算，永不平均。算不出的显示未测，不编数。">ⓘ 口径</span></h2>
    <table><thead><tr><th>引擎</th><th>市场</th><th>样本</th><th>提及率</th><th>SoV</th><th>官网引用</th><th>点名认知</th><th>竞品出现</th></tr></thead>
    <tbody>${metrics.platforms.map(row).join('')}</tbody></table></section>`;
}

function auditSection(audit?: SiteAudit): string {
  if (!audit) return '';
  const s = audit.site;
  const chk = (ok: boolean, label: string) => `<span class="${ok ? 'ok' : 'bad-t'}">${ok ? '✓' : '✗'} ${label}</span>`;
  const pageRow = (p: SiteAudit['pages'][0]): string => {
    const dims = p.dimensions.map(d =>
      `<span class="dim" title="${d.key}: ${d.score === null ? '未测' : `${d.score}/${d.max}`}${d.issues.length ? ' · ' + d.issues.join(',') : ''}">` +
      `${d.score === null ? '·' : Math.round(((d.score ?? 0) / d.max) * 9)}</span>`).join('');
    return `<tr class="g-${p.grade}"><td class="grade">${p.grade}</td><td>${p.score}</td>
      <td class="url">${esc(p.url)}</td><td>${p.wordCount}</td><td class="dims">${dims}</td></tr>`;
  };
  return `<section><h2>六维体检 <span class="m" title="可抓取性15/长度15/结构20/可抽取块25/权威信号15/对题性10。阈值锚定公开实证数据（高影响力页均1943词、含数字+61.6%引用概率等）。抓取不执行 JS——测的就是 AI 爬虫看到的东西。">ⓘ 口径</span></h2>
    <p>${chk(s.robotsTxtFound, 'robots.txt')} ${chk(!s.blockedAiCrawlers.length, 'AI 爬虫未被屏蔽')} ${chk(s.sitemapFound, 'sitemap')} ${chk(s.llmsTxtFound, 'llms.txt')}
    　均分 <b>${audit.avgScore ?? '未测'}</b> · A${audit.gradeDistribution.A} B${audit.gradeDistribution.B} C${audit.gradeDistribution.C} D${audit.gradeDistribution.D}</p>
    <table><thead><tr><th></th><th>分</th><th>页面</th><th>词等效</th><th>维度</th></tr></thead>
    <tbody>${audit.pages.map(pageRow).join('')}</tbody></table></section>`;
}

function ticketSection(tickets?: Ticket[]): string {
  if (!tickets || tickets.length === 0) return '';
  const row = (t: Ticket): string =>
    `<tr class="pr-${t.priority}"><td><b>${t.priority}</b></td><td>${t.id}</td><td>${esc(t.title)}
      <div class="rationale">${esc(t.rationale.slice(0, 110))}</div></td>
      <td>${t.acceptance.type === 'auto' ? '⚙ 自动' : '👤 人工'}</td><td>${t.status}</td></tr>`;
  const auto = tickets.filter(t => t.acceptance.type === 'auto').length;
  return `<section><h2>行动工单（${tickets.length} 条 · ${auto} 条机器自动验收）</h2>
    <table><thead><tr><th></th><th>ID</th><th>工单</th><th>验收</th><th>状态</th></tr></thead>
    <tbody>${tickets.map(row).join('')}</tbody></table></section>`;
}

const CSS = `
:root{--bg:#0e1116;--card:#161b24;--tx:#dbe2ec;--dim:#8b97a8;--red:#ff5566;--ok:#39d98a;--acc:#8f7ff0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.65 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;padding:32px}
main{max-width:960px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px;color:var(--acc)}h3{font-size:14px;color:var(--dim);margin:16px 0 8px}
.meta{color:var(--dim);font-size:13px;margin-bottom:20px}.headline{font-size:17px;background:var(--card);border-left:3px solid var(--acc);padding:14px 18px;border-radius:6px;margin-bottom:24px}
section{background:var(--card);border-radius:10px;padding:20px 22px;margin-bottom:20px}
.blockers{border:1px solid var(--red)}.blockers h2{color:var(--red)}.blockers li{margin:6px 0}
.ev-url{color:var(--dim);font-size:12px}
.funnel{display:flex;gap:8px;flex-wrap:wrap}.stage{flex:1;min-width:120px;background:#0e1320;border-radius:8px;padding:12px;text-align:center;border-top:2px solid var(--ok)}
.stage.bad{border-top-color:var(--red)}.stage-v{font-size:20px;font-weight:700}.stage-l{font-size:13px;margin-top:2px}.stage-n{font-size:11px;color:var(--dim);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--dim);font-weight:500;padding:6px 8px;border-bottom:1px solid #2a3140}
td{padding:7px 8px;border-bottom:1px solid #1e2430;vertical-align:top}.na{color:var(--dim)}
.ok{color:var(--ok)}.bad-t{color:var(--red)}.grade{font-weight:700}.g-D .grade{color:var(--red)}.g-B .grade,.g-A .grade{color:var(--ok)}
.url{word-break:break-all}.dims .dim{display:inline-block;width:14px;text-align:center;background:#0e1320;margin-right:2px;border-radius:3px;font-size:11px}
.pr-P0 td:first-child b{color:var(--red)}.rationale{color:var(--dim);font-size:12px}.comps{color:var(--dim)}
.m{font-size:11px;color:var(--dim);cursor:help;font-weight:400}
footer{color:var(--dim);font-size:12px;text-align:center;padding:12px}`;

export function renderHtmlReport(input: ReportInput): string {
  const at = input.generatedAt ?? new Date().toISOString();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(input.brandName)} · GEO 诊断报告 · FasterGEO</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body><main>
<h1>${esc(input.brandName)} · GEO 诊断报告</h1>
<div class="meta">FasterGEO · ${esc(at.slice(0, 10))}${input.audit ? ` · ${esc(input.audit.root)}` : ''} · 悬停 ⓘ 查看每个数字的计算口径</div>
<div class="headline">${esc(headline(input))}</div>
${blockerBanner(input)}
${funnel(input.metrics)}
${engineTable(input.metrics)}
${auditSection(input.audit)}
${ticketSection(input.tickets)}
<footer>FasterGEO · 开源可复现：算不出的显示未测，不编数 · 单期波动只作观察相关，连续两期同向才算趋势</footer>
</main></body></html>`;
}
