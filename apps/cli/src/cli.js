#!/usr/bin/env node
/**
 * fastergeo — GEO platform CLI (minimal loop: check / sample / metrics)
 *
 *   fastergeo check [--providers a,b]          engine key health checks
 *   fastergeo sample --question "..." [--providers a,b] [--market cn|global]
 *   fastergeo metrics --samples f.jsonl --brand brand.json [--format geolook]
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import {
  PROVIDERS, resolveProvider, configuredProviders, ask, checkProvider,
} from '@fastergeo/providers';
import {
  computeMetrics, parseGeoLookSamples, makeLlmJudge,
  renderSampleSheet, parseSampleSheet, enrichWithQuestionBank,
} from '@fastergeo/metrics';
import { auditSite, fetchPage } from '@fastergeo/audit';
import { generateTickets, verifyTickets } from '@fastergeo/tickets';
import { buildOutline, draftPrompt, lintFabrication, bootstrapProject } from '@fastergeo/content';
import { renderHtmlReport } from '@fastergeo/report';
import { computeTrends } from '@fastergeo/trends';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve as resolvePath, basename } from 'node:path';
import { writeFileSync } from 'node:fs';

const [, , command, ...rest] = process.argv;

const { values: flags } = parseArgs({
  args: rest,
  options: {
    providers: { type: 'string' },
    question: { type: 'string' },
    market: { type: 'string' },
    samples: { type: 'string' },
    brand: { type: 'string' },
    format: { type: 'string' },
    judge: { type: 'string' },
    root: { type: 'string' },
    urls: { type: 'string' },
    tickets: { type: 'string' },
    out: { type: 'string' },
    facts: { type: 'string' },
    llm: { type: 'string' },
    file: { type: 'string' },
    questions: { type: 'string' },
    engines: { type: 'string' },
    history: { type: 'string' },
    dir: { type: 'string' },
    every: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const ICONS = {
  ok: '✓', 'no-key': '·', 'manual-driver': '◇',
  'auth-failed': '✗', 'model-unavailable': '✗', 'network-error': '✗', 'http-error': '✗',
};

async function cmdCheck() {
  const ids = flags.providers ? flags.providers.split(',') : Object.keys(PROVIDERS);
  const reports = await Promise.all(
    ids.map(id => checkProvider(resolveProvider(id))),
  );
  for (const r of reports) {
    const spec = PROVIDERS[r.providerId];
    const line = [
      ICONS[r.status] ?? '?',
      r.providerId.padEnd(12),
      `[${spec.market}]`,
      r.status.padEnd(17),
      r.latencyMs ? `${r.latencyMs}ms` : '',
    ].join(' ');
    console.log(line);
    if (r.hint) console.log(`    ↳ ${r.hint}`);
  }
  const ok = reports.filter(r => r.status === 'ok').length;
  const manual = reports.filter(r => r.status === 'manual-driver').length;
  console.log(`\n${ok} 可自动采样 · ${manual} 人工采样表 · ${reports.length - ok - manual} 待配置/异常`);
}

async function cmdSample() {
  if (!flags.question) {
    console.error('用法: fastergeo sample --question "..." [--providers a,b] [--market cn|global]');
    process.exit(1);
  }
  let targets = flags.providers
    ? flags.providers.split(',').map(id => resolveProvider(id))
    : configuredProviders();
  if (flags.market) targets = targets.filter(p => p.market === flags.market);
  if (targets.length === 0) {
    console.error('没有可用引擎：检查 --providers 或环境变量里的 API Key（fastergeo check 可诊断）。');
    process.exit(1);
  }
  const results = await Promise.allSettled(
    targets.map(p => ask(p, { question: flags.question })),
  );
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      const s = r.value;
      if (flags.json) {
        console.log(JSON.stringify(s));
      } else {
        console.log(`\n── ${s.providerId} (${s.model}, ${s.channel}, ${s.latencyMs}ms) ──`);
        console.log(s.answer.slice(0, 800));
        if (s.citations.length) console.log('citations:', s.citations.join(' '));
      }
    } else {
      console.error(`✗ ${targets[i].id}: ${r.reason?.message ?? r.reason}`);
    }
  }
}

async function cmdMetrics() {
  if (!flags.samples || !flags.brand) {
    console.error('用法: fastergeo metrics --samples f.jsonl --brand brand.json [--format geolook] [--judge glm] [--json]');
    process.exit(1);
  }
  const brand = JSON.parse(readFileSync(flags.brand, 'utf8'));
  const raw = readFileSync(flags.samples, 'utf8');
  const samples = flags.format === 'geolook'
    ? parseGeoLookSamples(raw)
    : raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  // --judge <providerId>: LLM 裁判判定点名题的认知质量（knows/confused），
  // 不配则启发式判不了的保持 unverified，绝不猜测。
  let judge;
  if (flags.judge) {
    const jp = resolveProvider(flags.judge);
    judge = makeLlmJudge(async prompt =>
      (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
  }
  const report = await computeMetrics(samples, brand, {
    judge,
    brandDescription: brand.description,
  });
  savePeriod({ metrics: report });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pct = v => (v === null ? '未测' : `${(v * 100).toFixed(0)}%`);
  console.log(`brand: ${report.brand} · samples: ${report.totalSamples}\n`);
  for (const p of report.platforms) {
    console.log(`${p.providerId.padEnd(12)} [${p.market}] 提及率 ${pct(p.mentionRate)} · Top3 ${pct(p.top3Rate)} · SoV ${pct(p.shareOfVoice)} · 官网引用 ${pct(p.ownDomainCiteRate)}`);
    const comps = Object.entries(p.competitorMentions).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`).join(', ');
    if (comps) console.log(`             竞品: ${comps}`);
    if (p.probe) {
      const rec = Object.entries(p.probe.recognition).filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}×${n}`).join(' ');
      console.log(`             点名认知(${p.probe.samples}题): ${rec}`);
      for (const e of p.probe.confusedEvidence) console.log(`             ⚠ 张冠李戴证据: ${e.slice(0, 80)}`);
    }
  }
}

async function cmdAudit() {
  if (!flags.root) {
    console.error('用法: fastergeo audit --root https://site.com [--urls /a,/b] [--json]');
    process.exit(1);
  }
  const root = flags.root;
  const urls = flags.urls
    ? flags.urls.split(',').map(u => (u.startsWith('http') ? u : new URL(u, root).href))
    : [root];
  const report = await auditSite(root, urls);
  savePeriod({ audit: report });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const s = report.site;
  console.log(`site: robots ${s.robotsTxtFound ? '✓' : '✗'} · sitemap ${s.sitemapFound ? '✓' : '✗'} · llms.txt ${s.llmsTxtFound ? '✓' : '✗'}` +
    (s.blockedAiCrawlers.length ? ` · 🔴 屏蔽AI爬虫: ${s.blockedAiCrawlers.join(',')}` : ''));
  console.log(`均分 ${report.avgScore ?? '未测'} · A${report.gradeDistribution.A} B${report.gradeDistribution.B} C${report.gradeDistribution.C} D${report.gradeDistribution.D}\n`);
  for (const b of report.blockers) console.log(`🔴 BLOCKER: ${b}`);
  for (const p of report.pages) {
    const dims = p.dimensions
      .map(d => `${d.key}:${d.score === null ? '未测' : d.score}/${d.max}`).join(' ');
    console.log(`${p.grade} ${String(p.score).padStart(5)} ${p.url} · ${p.wordCount}词`);
    console.log(`         ${dims}`);
    for (const b of p.blockers) console.log(`         🔴 ${b}`);
  }
}

/** 组装验收上下文：按传入的参数重测 audit / metrics，缺的就不测。 */
async function buildContext() {
  const ctx = {};
  if (flags.root) {
    const urls = flags.urls
      ? flags.urls.split(',').map(u => (u.startsWith('http') ? u : new URL(u, flags.root).href))
      : [flags.root];
    ctx.audit = await auditSite(flags.root, urls);
  }
  if (flags.samples && flags.brand) {
    const brand = JSON.parse(readFileSync(flags.brand, 'utf8'));
    const raw = readFileSync(flags.samples, 'utf8');
    const samples = flags.format === 'geolook'
      ? parseGeoLookSamples(raw)
      : raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
    let judge;
    if (flags.judge) {
      const jp = resolveProvider(flags.judge);
      judge = makeLlmJudge(async prompt =>
        (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
    }
    ctx.metrics = await computeMetrics(samples, brand, { judge, brandDescription: brand.description });
  }
  return ctx;
}

function printTickets(tickets) {
  for (const t of tickets) {
    const acc = t.acceptance.type === 'auto' ? `[自动] ${t.acceptance.check}` : '[人工]';
    console.log(`${t.priority} ${t.id} [${t.status}] ${t.title}`);
    console.log(`   依据: ${t.rationale.slice(0, 90)}`);
    console.log(`   验收: ${acc} — ${t.acceptance.desc}`);
  }
}

async function cmdPlan() {
  if (!flags.root && !flags.samples) {
    console.error('用法: fastergeo plan --root <site> [--urls /a,/b] [--samples f --brand b --format geolook --judge glm] [--out tickets.json]');
    process.exit(1);
  }
  const ctx = await buildContext();
  const tickets = generateTickets(ctx.audit, ctx.metrics);
  if (flags.out) {
    writeFileSync(flags.out, JSON.stringify(tickets, null, 2));
    console.log(`已写入 ${flags.out}（${tickets.length} 条工单）\n`);
  }
  if (flags.json) console.log(JSON.stringify(tickets, null, 2));
  else printTickets(tickets);
}

async function cmdVerify() {
  if (!flags.tickets) {
    console.error('用法: fastergeo verify --tickets tickets.json [--root <site> --urls ...] [--samples f --brand b] ');
    process.exit(1);
  }
  const tickets = JSON.parse(readFileSync(flags.tickets, 'utf8'));
  const ctx = await buildContext();
  const summary = verifyTickets(tickets, ctx);
  writeFileSync(flags.tickets, JSON.stringify(tickets, null, 2));
  console.log(`验收: 通过 ${summary.counts.pass} · 未达标 ${summary.counts.fail} · 未测 ${summary.counts.unmeasurable} · 待人工 ${summary.counts.manual}\n`);
  for (const v of summary.verdicts) {
    const icon = { pass: '✓', fail: '✗', unmeasurable: '·', manual: '◇' }[v.outcome];
    console.log(`${icon} ${v.ticketId} ${v.detail.slice(0, 100)}`);
  }
  for (const tr of summary.transitions) {
    console.log(`↻ ${tr.ticketId}: ${tr.from} → ${tr.to}`);
  }
}

function printFabIssues(issues) {
  if (issues.length === 0) {
    console.log('✓ 编造风险检查通过（0 项）');
    return;
  }
  console.log(`🔴 编造风险 ${issues.length} 项 — 逐项解决前不得发布：`);
  for (const i of issues) {
    console.log(`  [${i.kind}] L${i.line} 「${i.quote}」`);
    console.log(`     ${i.suggestion}`);
  }
}

async function cmdOutline() {
  if (!flags.question || !flags.facts) {
    console.error('用法: fastergeo outline --question "..." --facts facts.json [--json]');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const outline = buildOutline(flags.question, store);
  if (flags.json) console.log(JSON.stringify(outline, null, 2));
  else {
    console.log(`题: ${outline.question} [${outline.market}] 目标 ${outline.targetWordCount} 词等效`);
    console.log(`标题候选:\n  - ${outline.titleCandidates.join('\n  - ')}\n`);
    for (const s of outline.sections) {
      console.log(`## ${s.heading}  (必含: ${s.requiredBlocks.join('/')})`);
      if (s.factIds.length) console.log(`   事实: ${s.factIds.join(', ')}`);
      if (s.notes) console.log(`   ${s.notes}`);
    }
  }
}

async function cmdDraft() {
  if (!flags.question || !flags.facts || !flags.llm) {
    console.error('用法: fastergeo draft --question "..." --facts facts.json --llm glm [--out draft.md]');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const outline = buildOutline(flags.question, store);
  const provider = resolveProvider(flags.llm);
  console.log(`生成初稿（${provider.id} / ${provider.resolvedModel}）…`);
  const result = await ask(provider, { question: draftPrompt(outline, store), maxTokens: 4000, timeoutMs: 300_000 });
  const draft = result.answer;
  if (flags.out) writeFileSync(flags.out, draft);
  console.log(`初稿 ${draft.length} 字符${flags.out ? ` → ${flags.out}` : ''} · 耗时 ${result.latencyMs}ms\n`);
  // 强制门禁：初稿必须过编造检查才算产出
  printFabIssues(lintFabrication(draft, store));
  if (!flags.out) console.log(`\n${draft.slice(0, 1200)}\n…`);
}

async function cmdFabcheck() {
  if (!flags.file || !flags.facts) {
    console.error('用法: fastergeo fabcheck --file draft.md --facts facts.json');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const issues = lintFabrication(readFileSync(flags.file, 'utf8'), store);
  printFabIssues(issues);
  process.exit(issues.length > 0 ? 1 : 0);
}

async function cmdReport() {
  if (!flags.root && !flags.samples) {
    console.error('用法: fastergeo report --root <site> [--urls ...] [--samples f --brand b --format geolook --judge glm] [--tickets t.json] --out report.html');
    process.exit(1);
  }
  const ctx = await buildContext();
  savePeriod(ctx);
  let tickets;
  if (flags.tickets) tickets = JSON.parse(readFileSync(flags.tickets, 'utf8'));
  else tickets = generateTickets(ctx.audit, ctx.metrics);
  const brandName = flags.brand
    ? JSON.parse(readFileSync(flags.brand, 'utf8')).name
    : (flags.root ? new URL(flags.root).hostname : 'Brand');
  const html = renderHtmlReport({ brandName, audit: ctx.audit, metrics: ctx.metrics, tickets });
  const out = flags.out ?? 'fastergeo-report.html';
  writeFileSync(out, html);
  console.log(`报告已生成 → ${out}（${Math.round(html.length / 1024)}KB，自包含单文件）`);
}

async function cmdBootstrap() {
  if (!flags.root || !flags.llm) {
    console.error('用法: fastergeo bootstrap --root https://site.com --llm glm [--urls /about,/faq] [--out 目录]');
    process.exit(1);
  }
  const extra = flags.urls ? flags.urls.split(',') : ['/about', '/faq', '/pricing'];
  const urls = [flags.root, ...extra.map(u => (u.startsWith('http') ? u : new URL(u, flags.root).href))];
  console.log(`抓取 ${urls.length} 页…`);
  const pages = (await Promise.all(urls.map(u => fetchPage(u))))
    .filter(p => p && p.status === 200 && p.wordCount > 20)
    .map(p => ({ url: p.url, title: p.title, text: p.text }));
  console.log(`有效 ${pages.length} 页，LLM 推导中（${flags.llm}）…`);
  const provider = resolveProvider(flags.llm);
  const result = await bootstrapProject(flags.root, pages, async prompt =>
    (await ask(provider, { question: prompt, maxTokens: 4000, timeoutMs: 300_000 })).answer);

  const dir = flags.out ?? '.';
  writeFileSync(`${dir}/brand.json`, JSON.stringify({ ...result.brand }, null, 2));
  writeFileSync(`${dir}/facts.json`, JSON.stringify(result.facts, null, 2));
  writeFileSync(`${dir}/questions.json`, JSON.stringify(result.questions, null, 2));
  console.log(`\n已写入 ${dir}/brand.json · facts.json · questions.json`);
  console.log(`品牌: ${result.brand.name} · ${result.brand.description}`);
  console.log(`事实: ${result.facts.facts.filter(f => f.status === 'confirmed').length} 条已确认（A级，带来源）`);
  if (result.unresolved.length) {
    console.log(`⚠ 官网未提供、需人工补齐: ${result.unresolved.join('、')}`);
  }
  console.log(`\n竞品候选（全部需人工确认；仅 high 置信进入追踪清单）:`);
  for (const c of result.competitorCandidates) {
    console.log(`  [${c.confidence}] ${c.name} — ${c.why.slice(0, 40)}`);
  }
  console.log(`\n问题库 ${result.questions.length} 题（cn ${result.questions.filter(q => q.market === 'cn').length} / global ${result.questions.filter(q => q.market === 'global').length} / 探测 ${result.questions.filter(q => q.brandInQuestion).length}）`);
  console.log('\n下一步：人工核对 brand.json 竞品与 facts.json 待确认项，然后 fastergeo sample / audit / plan。');
}

const commands = {
  check: cmdCheck, sample: cmdSample, metrics: cmdMetrics, audit: cmdAudit,
  plan: cmdPlan, verify: cmdVerify,
  outline: cmdOutline, draft: cmdDraft, fabcheck: cmdFabcheck,
  report: cmdReport, bootstrap: cmdBootstrap,
  sheet: cmdSheet, import: cmdImport, trends: cmdTrends,
  cycle: cmdCycle, schedule: cmdSchedule,
};

/** 并发池：limit 个一组跑完再补位。 */
async function pool(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx).catch(err => ({ error: String(err?.message ?? err) }));
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * cycle：对一个项目目录跑完整一期
 * 目录约定: brand.json(含 domains/auditUrls) · questions.json · [tickets.json] · history/
 */
async function cmdCycle() {
  const dir = flags.dir ?? '.';
  const date = new Date().toISOString().slice(0, 10);
  const brand = JSON.parse(readFileSync(`${dir}/brand.json`, 'utf8'));
  const questions = JSON.parse(readFileSync(`${dir}/questions.json`, 'utf8'));
  const root = flags.root ?? `https://${brand.domains[0]}`;
  const urls = (flags.urls ? flags.urls.split(',') : (brand.auditUrls ?? ['/']))
    .map(u => (u.startsWith('http') ? u : new URL(u, root).href));

  // 1. 采样：已配 Key 的 API 引擎 × 市场匹配的问题
  let providers = configuredProviders();
  if (flags.providers) providers = providers.filter(p => flags.providers.split(',').includes(p.id));
  const jobs = [];
  for (const p of providers) {
    for (const q of questions.filter(q => q.market === p.market || q.market === 'both')) {
      jobs.push({ p, q });
    }
  }
  console.log(`[1/5] 采样 ${providers.map(p => p.id).join(',') || '(无 Key，跳过)'} × ${jobs.length} 题…`);
  const sampled = await pool(jobs, 4, async ({ p, q }) => {
    const r = await ask(p, { question: q.text, questionId: q.id });
    return {
      providerId: p.id, market: p.market, questionId: q.id, question: q.text,
      brandInQuestion: Boolean(q.brandInQuestion), answer: r.answer,
      citations: r.citations, channel: r.channel, model: r.model,
    };
  });
  const samples = sampled.filter(s => !s.error);
  const failed = sampled.filter(s => s.error);
  if (failed.length) console.log(`  ${failed.length} 条采样失败（已跳过）`);
  writeFileSync(`${dir}/samples-${date}.jsonl`, samples.map(s => JSON.stringify(s)).join('\n') + '\n');

  // 2. 指标（可选 judge）
  console.log('[2/5] 指标…');
  let judge;
  if (flags.judge) {
    const jp = resolveProvider(flags.judge);
    judge = makeLlmJudge(async prompt =>
      (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
  }
  const metricsReport = samples.length
    ? await computeMetrics(samples, brand, { judge, brandDescription: brand.description })
    : undefined;

  // 3. 体检
  console.log(`[3/5] 体检 ${urls.length} 页…`);
  const auditReport = await auditSite(root, urls);

  // 4. 存期 + 验收
  mkdirSync(`${dir}/history`, { recursive: true });
  if (metricsReport) writeFileSync(`${dir}/history/${date}-metrics.json`, JSON.stringify(metricsReport, null, 2));
  writeFileSync(`${dir}/history/${date}-audit.json`, JSON.stringify(auditReport, null, 2));
  let tickets;
  try { tickets = JSON.parse(readFileSync(`${dir}/tickets.json`, 'utf8')); } catch { /* 首期 */ }
  if (tickets) {
    const summary = verifyTickets(tickets, { audit: auditReport, metrics: metricsReport });
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    console.log(`[4/5] 验收: 通过 ${summary.counts.pass} · 未达标 ${summary.counts.fail} · 未测 ${summary.counts.unmeasurable}`);
    for (const tr of summary.transitions) console.log(`  ↻ ${tr.ticketId}: ${tr.from} → ${tr.to}`);
  } else {
    tickets = generateTickets(auditReport, metricsReport);
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    console.log(`[4/5] 首期：生成 ${tickets.length} 条工单 → tickets.json`);
  }

  // 5. 报告 + 趋势
  const html = renderHtmlReport({ brandName: brand.name, audit: auditReport, metrics: metricsReport, tickets });
  writeFileSync(`${dir}/report-${date}.html`, html);
  const periods = loadPeriods(`${dir}/history`);
  console.log(`[5/5] 报告 → ${dir}/report-${date}.html · 历史 ${periods.length} 期`);
  if (periods.length >= 2) {
    const t = computeTrends(periods);
    for (const a of t.alerts) console.log(`  ${a.level === 'P0' ? '🔴' : '⚠'} ${a.message}`);
  }
  console.log('本期完成。');
}

/** schedule：生成周期复跑的定时任务配置（不自动安装）。 */
async function cmdSchedule() {
  const dir = flags.dir ?? '.';
  const every = flags.every ?? '7d';
  const days = parseInt(every, 10) || 7;
  const abs = resolvePath(dir);
  const node = process.execPath;
  const cli = new URL(import.meta.url).pathname;
  const label = `co.fastergeo.cycle.${basename(abs)}`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>
    <string>${node}</string><string>${cli}</string>
    <string>cycle</string><string>--dir</string><string>${abs}</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${abs}/cycle.log</string>
  <key>StandardErrorPath</key><string>${abs}/cycle.log</string>
</dict></plist>`;
  writeFileSync(`${dir}/${label}.plist`, plist);
  console.log(`已生成定时配置（每天 09:00 检查，建议采样节奏 ${days} 天由 cycle 自身控制）:

macOS (launchd):
  cp ${dir}/${label}.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/${label}.plist

Linux (crontab -e 添加一行, 每 ${days} 天):
  0 9 */${days} * * ${node} ${cli} cycle --dir ${abs} >> ${abs}/cycle.log 2>&1

注意 macOS 权限: launchd 直接跑 node 可避免 TCC 弹窗问题。`);
}

/** 把本次测量存为一期（--history 目录，YYYY-MM-DD 命名，覆盖同日）。 */
function savePeriod(ctx) {
  if (!flags.history) return;
  mkdirSync(flags.history, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  if (ctx.metrics) writeFileSync(`${flags.history}/${date}-metrics.json`, JSON.stringify(ctx.metrics, null, 2));
  if (ctx.audit) writeFileSync(`${flags.history}/${date}-audit.json`, JSON.stringify(ctx.audit, null, 2));
  console.log(`本期已存入 ${flags.history}/（${date}）`);
}

function loadPeriods(dir) {
  const byDate = new Map();
  for (const f of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})-(metrics|audit)\.json$/.exec(f);
    if (!m) continue;
    const rec = byDate.get(m[1]) ?? { date: m[1] };
    rec[m[2]] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    byDate.set(m[1], rec);
  }
  return [...byDate.values()];
}

async function cmdTrends() {
  if (!flags.history) {
    console.error('用法: fastergeo trends --history <目录>（先用 report/metrics/audit 带 --history 存期）');
    process.exit(1);
  }
  const periods = loadPeriods(flags.history);
  if (periods.length === 0) {
    console.error('历史目录为空——先跑一期带 --history 的测量。');
    process.exit(1);
  }
  const r = computeTrends(periods);
  console.log(`期数: ${r.periods.length}（${r.periods.join(' → ')}）\n`);
  for (const a of r.alerts) {
    console.log(`${a.level === 'P0' ? '🔴 P0' : '⚠ 观察'} ${a.message}`);
  }
  if (r.alerts.length) console.log();
  const fmt = v => (v === null ? '未测' : `${(v * 100).toFixed(0)}%`);
  for (const d of r.deltas) {
    const arrow = d.direction === 'up' ? '↑' : d.direction === 'down' ? '↓' : '→';
    const verdict = d.verdict.kind === 'trend'
      ? `📈 趋势(${d.verdict.direction === 'up' ? '连续上升' : '连续下降'})`
      : d.verdict.kind === 'observation' ? '观察（单期波动，不定性）'
      : '数据不足';
    const isScore = d.key === 'site.avgScore';
    const show = v => (isScore ? (v === null ? '未测' : v) : fmt(v));
    console.log(`${d.key.padEnd(28)} ${show(d.prev)} ${arrow} ${show(d.curr)}  ${verdict}`);
  }
}

async function cmdSheet() {
  if (!flags.questions) {
    console.error('用法: fastergeo sheet --questions questions.json [--engines nano,baidu-ai] [--brand brand.json] [--out sheet.md]');
    process.exit(1);
  }
  const questions = JSON.parse(readFileSync(flags.questions, 'utf8'));
  const engineIds = flags.engines
    ? flags.engines.split(',')
    : Object.keys(PROVIDERS).filter(id => PROVIDERS[id].driver === 'manual');
  const engines = engineIds.map(id => ({
    id, name: PROVIDERS[id]?.name ?? id, market: PROVIDERS[id]?.market ?? 'cn',
  }));
  const brandName = flags.brand ? JSON.parse(readFileSync(flags.brand, 'utf8')).name : 'Brand';
  const sheet = renderSampleSheet(questions, engines, brandName);
  const out = flags.out ?? 'sample-sheet.md';
  writeFileSync(out, sheet);
  const perEngine = engines.map(e =>
    `${e.id}(${questions.filter(q => q.market === e.market || q.market === 'both').length}题)`).join(' ');
  console.log(`采样表已导出 → ${out}\n引擎: ${perEngine}\n人工/浏览器采样后用 fastergeo import 回灌。`);
}

async function cmdImport() {
  if (!flags.file) {
    console.error('用法: fastergeo import --file sheet.md [--questions questions.json] [--out samples.jsonl]');
    process.exit(1);
  }
  let imported = parseSampleSheet(readFileSync(flags.file, 'utf8'));
  if (flags.questions) {
    imported = enrichWithQuestionBank(imported, JSON.parse(readFileSync(flags.questions, 'utf8')));
  } else {
    console.log('⚠ 未提供 --questions，探测题标记无法恢复——建议带上问题库文件。');
  }
  const out = flags.out ?? 'samples-manual.jsonl';
  writeFileSync(out, imported.samples.map(s => JSON.stringify(s)).join('\n') + '\n');
  console.log(`回灌 ${imported.samples.length} 条样本 → ${out}（channel=manual）`);
  if (imported.skipped.length) {
    console.log(`跳过 ${imported.skipped.length} 条：`);
    for (const s of imported.skipped) console.log(`  · ${s.engine}/${s.questionId}: ${s.reason}`);
  }
  console.log('\n下一步: fastergeo metrics --samples ' + out + ' --brand brand.json');
}
const run = commands[command];
if (!run) {
  console.log(`fastergeo — 开源 GEO 平台（中国 + 海外 AI 引擎）

  起步     bootstrap  从官网一键推导品牌/事实/问题库
  诊断     check      引擎 Key 健康检查
           audit      六维体检（AI 爬虫视角，无需 Key）
  采样     sample     API 采样 · sheet/import 人工采样表（零 Key）
  指标     metrics    漏斗指标 + LLM 认知裁判（--judge）
           trends     期对比与趋势判定（--history）
  闭环     plan       诊断 → 带验收标准的工单
           verify     重抓自动验收，回归自动打回
  内容     outline/draft/fabcheck  事实约束生成 + 编造门禁
  交付     report     单文件 HTML 诊断报告

  各命令直接运行可查看用法。数据全在本机。`);
  process.exit(command ? 1 : 0);
}
run().catch(err => {
  console.error('fastergeo failed:', err.message ?? err);
  process.exit(1);
});
