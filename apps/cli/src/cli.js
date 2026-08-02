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
import { computeMetrics, parseGeoLookSamples, makeLlmJudge } from '@fastergeo/metrics';
import { auditSite } from '@fastergeo/audit';
import { generateTickets, verifyTickets } from '@fastergeo/tickets';
import { buildOutline, draftPrompt, lintFabrication } from '@fastergeo/content';
import { renderHtmlReport } from '@fastergeo/report';
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

const commands = {
  check: cmdCheck, sample: cmdSample, metrics: cmdMetrics, audit: cmdAudit,
  plan: cmdPlan, verify: cmdVerify,
  outline: cmdOutline, draft: cmdDraft, fabcheck: cmdFabcheck,
  report: cmdReport,
};
const run = commands[command];
if (!run) {
  console.log('fastergeo <check|sample|metrics> — 用法见各命令 --help 或源码头部注释');
  process.exit(command ? 1 : 0);
}
run().catch(err => {
  console.error('fastergeo failed:', err.message ?? err);
  process.exit(1);
});
