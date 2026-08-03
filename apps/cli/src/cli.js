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
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Node's fetch ignores HTTP(S)_PROXY. Behind a proxy (common for CN users
// reaching global sites/engines) every audit/verify fetch would silently
// fail. Route ALL fetches through the env proxy; NO_PROXY is honored.
if (process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy) {
  // EnvHttpProxyAgent emits an "experimental" warning on every run; keep
  // stderr for real warnings only.
  process.removeAllListeners('warning');
  process.on('warning', w => {
    if (w.code !== 'UNDICI-EHPA') console.error(w.stack ?? `${w.name}: ${w.message}`);
  });
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
import {
  PROVIDERS, resolveProvider, configuredProviders, ask, checkProvider,
} from '@fastergeo/providers';
import {
  computeMetrics, parseGeoLookSamples, makeLlmJudge, makeSentimentJudge,
  renderSampleSheet, parseSampleSheet, enrichWithQuestionBank,
} from '@fastergeo/metrics';
import { auditSite, fetchPage } from '@fastergeo/audit';
import { generateTickets, verifyTickets } from '@fastergeo/tickets';
import { buildOutline, draftPrompt, lintFabrication, bootstrapProject, mineSuggestions } from '@fastergeo/content';
import { renderHtmlReport } from '@fastergeo/report';
import { computeTrends } from '@fastergeo/trends';
import { analyzeBotlog } from '@fastergeo/botlog';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
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
    repeat: { type: 'string' },
    seed: { type: 'string' },
    expand: { type: 'boolean', default: false },
    port: { type: 'string' },
    lang: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

// Language: --lang > FASTERGEO_LANG > en (global product, English default)
const argvLang = process.argv.includes('--lang')
  ? process.argv[process.argv.indexOf('--lang') + 1] : undefined;
const LANG = (flags.lang ?? argvLang ?? process.env.FASTERGEO_LANG) === 'zh' ? 'zh' : 'en';

const ICONS = {
  ok: '✓', 'no-key': '·', 'manual-driver': '◇',
  'auth-failed': '✗', 'model-unavailable': '✗', 'network-error': '✗', 'http-error': '✗',
};

async function cmdCheck() {
  const ids = flags.providers ? flags.providers.split(',') : Object.keys(PROVIDERS);
  const reports = await Promise.all(
    ids.map(id => checkProvider(resolveProvider(id), LANG)),
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
  console.log(`\n${ok} auto-samplable · ${manual} manual-sheet · ${reports.length - ok - manual} unconfigured/error`);
}

async function cmdSample() {
  if (!flags.question) {
    console.error('usage: fastergeo sample --question "..." [--providers a,b] [--market cn|global]');
    process.exit(1);
  }
  let targets = flags.providers
    ? flags.providers.split(',').map(id => resolveProvider(id))
    : configuredProviders();
  if (flags.market) targets = targets.filter(p => p.market === flags.market);
  if (targets.length === 0) {
    console.error('No usable engine: check --providers or your API keys (fastergeo check diagnoses each).');
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
    console.error('usage: fastergeo metrics --samples f.jsonl --brand brand.json [--format geolook] [--judge glm] [--json]');
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
  let sentimentJudge;
  if (flags.judge) {
    const jp = resolveProvider(flags.judge);
    const askJudge = async prompt => (await ask(jp, { question: prompt, maxTokens: 500 })).answer;
    judge = makeLlmJudge(askJudge);
    sentimentJudge = makeSentimentJudge(askJudge);
  }
  const report = await computeMetrics(samples, brand, {
    judge,
    sentimentJudge,
    brandDescription: brand.description,
  });
  savePeriod({ metrics: report, samples });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pct = v => (v === null ? 'unmeasured' : `${(v * 100).toFixed(0)}%`);
  console.log(`brand: ${report.brand} · samples: ${report.totalSamples}\n`);
  for (const p of report.platforms) {
    console.log(`${p.providerId.padEnd(12)} [${p.market}] mention ${pct(p.mentionRate)} · top3 ${pct(p.top3Rate)} · SoV ${pct(p.shareOfVoice)} · own-cite ${pct(p.ownDomainCiteRate)}`);
    const comps = Object.entries(p.competitorMentions).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`).join(', ');
    if (comps) console.log(`             competitors: ${comps}`);
    if (p.sentiment) {
      const v = p.sentiment.verdicts;
      const parts = [v.positive && `+${v.positive}`, v.neutral && `=${v.neutral}`,
        v.negative && `−${v.negative}`, v.unverified && `?${v.unverified}`].filter(Boolean).join(' ');
      console.log(`             sentiment (${p.sentiment.mentionedSamples} mentions): ${parts}`);
      for (const e of p.sentiment.negativeEvidence) console.log(`             ⚠ negative evidence: ${e.slice(0, 80)}`);
    }
    if (p.probe) {
      const rec = Object.entries(p.probe.recognition).filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}×${n}`).join(' ');
      console.log(`             recognition (${p.probe.samples} probes): ${rec}`);
      for (const e of p.probe.confusedEvidence) console.log(`             ⚠ confusion evidence: ${e.slice(0, 80)}`);
    }
  }
}

async function cmdAudit() {
  if (!flags.root) {
    console.error('usage: fastergeo audit --root https://site.com [--urls /a,/b] [--json]');
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
    (s.blockedAiCrawlers.length ? ` · 🔴 AI crawlers blocked: ${s.blockedAiCrawlers.join(',')}` : ''));
  console.log(`avg ${report.avgScore ?? 'unmeasured'} · A${report.gradeDistribution.A} B${report.gradeDistribution.B} C${report.gradeDistribution.C} D${report.gradeDistribution.D}\n`);
  for (const u of report.failedUrls ?? []) console.log(`✗ unreachable (excluded from avg, not scored): ${u}`);
  for (const b of report.blockers) console.log(`🔴 BLOCKER: ${b}`);
  for (const p of report.pages) {
    const dims = p.dimensions
      .map(d => `${d.key}:${d.score === null ? 'unmeasured' : d.score}/${d.max}`).join(' ');
    console.log(`${p.grade} ${String(p.score).padStart(5)} ${p.url} · ${p.wordCount}w`);
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
  let sentimentJudge;
    if (flags.judge) {
      const jp = resolveProvider(flags.judge);
      judge = makeLlmJudge(async prompt =>
        (await ask(jp, { question: prompt, maxTokens: 500 })).answer);
    }
    ctx.metrics = await computeMetrics(samples, brand, { judge, sentimentJudge, brandDescription: brand.description });
    ctx.samples = samples;
    ctx.brandAliases = brand.aliases;
  }
  return ctx;
}

function printTickets(tickets) {
  for (const t of tickets) {
    const acc = t.acceptance.type === 'auto' ? `[auto] ${t.acceptance.check}` : '[manual]';
    console.log(`${t.priority} ${t.id} [${t.status}] ${t.title}`);
    console.log(`   why: ${t.rationale.slice(0, 90)}`);
    console.log(`   acceptance: ${acc} — ${t.acceptance.desc}`);
  }
}

async function cmdPlan() {
  if (!flags.root && !flags.samples) {
    console.error('usage: fastergeo plan --root <site> [--urls /a,/b] [--samples f --brand b --format geolook --judge glm] [--out tickets.json]');
    process.exit(1);
  }
  const ctx = await buildContext();
  const tickets = generateTickets(ctx.audit, ctx.metrics, LANG);
  if (flags.out) {
    writeFileSync(flags.out, JSON.stringify(tickets, null, 2));
    console.log(`wrote ${flags.out} (${tickets.length} tickets)\n`);
  }
  if (flags.json) console.log(JSON.stringify(tickets, null, 2));
  else printTickets(tickets);
}

async function cmdVerify() {
  if (!flags.tickets) {
    console.error('usage: fastergeo verify --tickets tickets.json [--root <site> --urls ...] [--samples f --brand b]');
    process.exit(1);
  }
  const tickets = JSON.parse(readFileSync(flags.tickets, 'utf8'));
  const ctx = await buildContext();
  const summary = verifyTickets(tickets, ctx, LANG);
  writeFileSync(flags.tickets, JSON.stringify(tickets, null, 2));
  console.log(`verify: pass ${summary.counts.pass} · fail ${summary.counts.fail} · unmeasured ${summary.counts.unmeasurable} · manual ${summary.counts.manual}\n`);
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
    console.log('✓ fabrication check passed (0 issues)');
    return;
  }
  console.log(`🔴 fabrication risk: ${issues.length} issue(s) — not publishable until each is resolved:`);
  for (const i of issues) {
    console.log(`  [${i.kind}] L${i.line} 「${i.quote}」`);
    console.log(`     ${i.suggestion}`);
  }
}

async function cmdOutline() {
  if (!flags.question || !flags.facts) {
    console.error('usage: fastergeo outline --question "..." --facts facts.json [--json]');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const outline = buildOutline(flags.question, store);
  if (flags.json) console.log(JSON.stringify(outline, null, 2));
  else {
    console.log(`question: ${outline.question} [${outline.market}] target ${outline.targetWordCount} word-eq`);
    console.log(`title candidates:\n  - ${outline.titleCandidates.join('\n  - ')}\n`);
    for (const s of outline.sections) {
      console.log(`## ${s.heading}  (required: ${s.requiredBlocks.join('/')})`);
      if (s.factIds.length) console.log(`   facts: ${s.factIds.join(', ')}`);
      if (s.notes) console.log(`   ${s.notes}`);
    }
  }
}

async function cmdDraft() {
  if (!flags.question || !flags.facts || !flags.llm) {
    console.error('usage: fastergeo draft --question "..." --facts facts.json --llm glm [--out draft.md]');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const outline = buildOutline(flags.question, store);
  const provider = resolveProvider(flags.llm);
  console.log(`drafting (${provider.id} / ${provider.resolvedModel})…`);
  const result = await ask(provider, { question: draftPrompt(outline, store), maxTokens: 4000, timeoutMs: 300_000 });
  const draft = result.answer;
  if (flags.out) writeFileSync(flags.out, draft);
  console.log(`draft ${draft.length} chars${flags.out ? ` → ${flags.out}` : ''} · ${result.latencyMs}ms\n`);
  // 强制门禁：初稿必须过编造检查才算产出
  printFabIssues(lintFabrication(draft, store));
  if (!flags.out) console.log(`\n${draft.slice(0, 1200)}\n…`);
}

async function cmdFabcheck() {
  if (!flags.file || !flags.facts) {
    console.error('usage: fastergeo fabcheck --file draft.md --facts facts.json');
    process.exit(1);
  }
  const store = JSON.parse(readFileSync(flags.facts, 'utf8'));
  const issues = lintFabrication(readFileSync(flags.file, 'utf8'), store);
  printFabIssues(issues);
  process.exit(issues.length > 0 ? 1 : 0);
}

async function cmdReport() {
  if (!flags.root && !flags.samples) {
    console.error('usage: fastergeo report --root <site> [--urls ...] [--samples f --brand b --format geolook --judge glm] [--tickets t.json] --out report.html');
    process.exit(1);
  }
  const ctx = await buildContext();
  savePeriod(ctx);
  let tickets;
  if (flags.tickets) tickets = JSON.parse(readFileSync(flags.tickets, 'utf8'));
  else tickets = generateTickets(ctx.audit, ctx.metrics, LANG);
  const brandName = flags.brand
    ? JSON.parse(readFileSync(flags.brand, 'utf8')).name
    : (flags.root ? new URL(flags.root).hostname : 'Brand');
  const html = renderHtmlReport({
    brandName, audit: ctx.audit, metrics: ctx.metrics, tickets,
    samples: ctx.samples, brandAliases: ctx.brandAliases, lang: LANG,
  });
  const out = flags.out ?? 'fastergeo-report.html';
  writeFileSync(out, html);
  console.log(`report → ${out} (${Math.round(html.length / 1024)}KB, self-contained)`);
}

async function cmdBootstrap() {
  if (!flags.root || !flags.llm) {
    console.error('usage: fastergeo bootstrap --root https://site.com --llm glm [--urls /about,/faq] [--out dir]');
    process.exit(1);
  }
  const extra = flags.urls ? flags.urls.split(',') : ['/about', '/faq', '/pricing'];
  const urls = [flags.root, ...extra.map(u => (u.startsWith('http') ? u : new URL(u, flags.root).href))];
  console.log(`fetching ${urls.length} pages…`);
  const pages = (await Promise.all(urls.map(u => fetchPage(u))))
    .filter(p => p && p.status === 200 && p.wordCount > 20)
    .map(p => ({ url: p.url, title: p.title, text: p.text }));
  console.log(`${pages.length} usable pages · deriving with ${flags.llm}…`);
  const provider = resolveProvider(flags.llm);
  const result = await bootstrapProject(flags.root, pages, async prompt =>
    (await ask(provider, { question: prompt, maxTokens: 4000, timeoutMs: 300_000 })).answer);

  const dir = flags.out ?? '.';
  writeFileSync(`${dir}/brand.json`, JSON.stringify({ ...result.brand }, null, 2));
  writeFileSync(`${dir}/facts.json`, JSON.stringify(result.facts, null, 2));
  writeFileSync(`${dir}/questions.json`, JSON.stringify(result.questions, null, 2));
  console.log(`\nwrote ${dir}/brand.json · facts.json · questions.json`);
  console.log(`brand: ${result.brand.name} · ${result.brand.description}`);
  console.log(`facts: ${result.facts.facts.filter(f => f.status === 'confirmed').length} confirmed (grade A, sourced)`);
  if (result.unresolved.length) {
    console.log(`⚠ not found on the site — resolve manually: ${result.unresolved.join(', ')}`);
  }
  console.log(`\ncompetitor candidates (all need human review; only high-confidence enter tracking):`);
  for (const c of result.competitorCandidates) {
    console.log(`  [${c.confidence}] ${c.name} — ${c.why.slice(0, 40)}`);
  }
  console.log(`\nquestion bank: ${result.questions.length} (cn ${result.questions.filter(q => q.market === 'cn').length} / global ${result.questions.filter(q => q.market === 'global').length} / probes ${result.questions.filter(q => q.brandInQuestion).length})`);
  console.log('\nnext: review competitors in brand.json and unconfirmed facts, then fastergeo sample / audit / plan.');
}

const commands = {
  check: cmdCheck, sample: cmdSample, metrics: cmdMetrics, audit: cmdAudit,
  plan: cmdPlan, verify: cmdVerify,
  outline: cmdOutline, draft: cmdDraft, fabcheck: cmdFabcheck,
  report: cmdReport, bootstrap: cmdBootstrap,
  sheet: cmdSheet, import: cmdImport, trends: cmdTrends,
  cycle: cmdCycle, schedule: cmdSchedule, ui: cmdUi, botlog: cmdBotlog,
  expand: cmdExpand,
};

async function cmdExpand() {
  if (!flags.seed) {
    console.error('usage: fastergeo expand --seed "定制T恤" [--engines baidu,google] [--expand] [--out candidates.json]');
    process.exit(1);
  }
  const engines = flags.engines ? flags.engines.split(',') : ['baidu', 'google'];
  const r = await mineSuggestions(flags.seed, { engines, expand: flags.expand });
  const T = LANG === 'zh' ? {
    found: (n, s) => `「${s}」拓出 ${n} 条真实搜索需求：`,
    fail: f => `⚠ ${f.engine} 请求失败（${f.query}）：${f.reason}`,
    note: '以上是题库候选，不会自动加入 questions.json——题库变更开启新序列，是人的决定。',
    saved: (out, n) => `候选已写入 ${out}（${n} 条，含既有去重）`,
  } : {
    found: (n, s) => `"${s}" expanded into ${n} real search-demand phrases:`,
    fail: f => `⚠ ${f.engine} request failed (${f.query}): ${f.reason}`,
    note: 'These are question-bank CANDIDATES — never auto-added to questions.json; changing the bank starts a new series and is a human decision.',
    saved: (out, n) => `candidates written to ${out} (${n} entries, deduped with existing)`,
  };
  console.log(T.found(r.candidates.length, r.seed));
  for (const c of r.candidates) console.log(`  [${c.market}] ${c.text}`);
  for (const f of r.failures) console.log(T.fail(f));
  if (flags.out) {
    let existing = [];
    try { existing = JSON.parse(readFileSync(flags.out, 'utf8')); } catch { /* 新文件 */ }
    const seen = new Set(existing.map(c => `${c.source}:${c.text}`));
    const merged = [...existing, ...r.candidates.filter(c => !seen.has(`${c.source}:${c.text}`))];
    writeFileSync(flags.out, JSON.stringify(merged, null, 2));
    console.log(T.saved(flags.out, merged.length));
  }
  console.log(`\n${T.note}`);
}

async function cmdBotlog() {
  if (!flags.file) {
    console.error('usage: fastergeo botlog --file access.log [--format combined|cloudflare] [--json]');
    process.exit(1);
  }
  const report = analyzeBotlog(readFileSync(flags.file, 'utf8'), { format: flags.format ?? 'auto' });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const T = LANG === 'zh' ? {
    lines: (t, p, sk) => `日志 ${t} 行 · 解析 ${p} · 无法解析 ${sk}（已计数，不隐藏）`,
    window: (f, to) => `时间窗：${f ?? '未知'} → ${to ?? '未知'}`,
    noBots: '未发现 AI 爬虫访问（UA 判定——若日志来自 CDN 之后，爬虫可能已被挡在上游）',
    purpose: { 'training': '训练采集', 'search-index': '搜索索引', 'user-request': '用户实时代取' },
    botsTitle: 'AI 爬虫（按 UA 自称统计）',
    blocked: n => `⚠ ${n} 次 4xx——该爬虫可能正被屏蔽`,
    refTitle: 'AI 引荐的真人访问（按 referer）',
    noRefs: '未发现来自 AI 答案的引荐访问',
  } : {
    lines: (t, p, sk) => `log ${t} lines · parsed ${p} · unparseable ${sk} (counted, not hidden)`,
    window: (f, to) => `window: ${f ?? 'unknown'} → ${to ?? 'unknown'}`,
    noBots: 'no AI crawler hits found (UA-based — behind a CDN, crawlers may be stopped upstream of this log)',
    purpose: { 'training': 'training', 'search-index': 'search-index', 'user-request': 'user-request' },
    botsTitle: 'AI crawlers (as claimed by UA)',
    blocked: n => `⚠ ${n} 4xx responses — this crawler may be being blocked`,
    refTitle: 'Human visits referred from AI answers (by referer)',
    noRefs: 'no visits referred from AI answers found',
  };
  console.log(T.lines(report.totalLines, report.parsedLines, report.skippedLines));
  console.log(T.window(report.window.from?.slice(0, 16), report.window.to?.slice(0, 16)));
  console.log(`\n${T.botsTitle}`);
  if (report.bots.length === 0) console.log(`  ${T.noBots}`);
  for (const b of report.bots) {
    console.log(`  ${b.id.padEnd(20)} ${String(b.hits).padStart(5)} hits · ${b.uniquePaths} paths · ${T.purpose[b.purpose]} · ${b.operator}`);
    if (b.statuses['4xx'] > 0) console.log(`    ${T.blocked(b.statuses['4xx'])}`);
    for (const tp of b.topPaths.slice(0, 3)) console.log(`    ${String(tp.hits).padStart(5)}  ${tp.path}`);
  }
  console.log(`\n${T.refTitle}`);
  if (report.aiReferrals.length === 0) console.log(`  ${T.noRefs}`);
  for (const r of report.aiReferrals) {
    console.log(`  ${r.label.padEnd(16)} [${r.market}] ${String(r.hits).padStart(5)} visits`);
    for (const tp of r.topPaths.slice(0, 3)) console.log(`    ${String(tp.hits).padStart(5)}  ${tp.path}`);
  }
}

async function cmdUi() {
  const dir = flags.dir ?? '.';
  const port = Number(flags.port ?? 8765);
  const { startUi } = await import('./server.js');
  startUi(resolvePath(dir), port);
  const { exec } = await import('node:child_process');
  exec(`open http://127.0.0.1:${port} 2>/dev/null || xdg-open http://127.0.0.1:${port} 2>/dev/null`);
}

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
  // --repeat N: answers are stochastic; decision-grade runs repeat each
  // question so rates come from a distribution, not one draw.
  const repeat = Math.max(1, parseInt(flags.repeat ?? '1', 10) || 1);
  const jobs = [];
  for (const p of providers) {
    for (const q of questions.filter(q => q.market === p.market || q.market === 'both')) {
      for (let round = 0; round < repeat; round++) jobs.push({ p, q });
    }
  }
  console.log(`[1/5] sampling ${providers.map(p => p.id).join(',') || '(no keys, skipped)'} × ${jobs.length} questions…`);
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
  if (failed.length) console.log(`  ${failed.length} samples failed (skipped)`);
  // Never clobber an earlier same-day run with an empty file: a rerun where
  // every sample failed (keys/network down) must not destroy the day's data.
  if (samples.length) {
    writeFileSync(`${dir}/samples-${date}.jsonl`, samples.map(s => JSON.stringify(s)).join('\n') + '\n');
  } else if (existsSync(`${dir}/samples-${date}.jsonl`)) {
    console.log(`  0 samples this run — keeping existing samples-${date}.jsonl untouched`);
  }

  // 2. 指标（可选 judge）
  console.log('[2/5] metrics…');
  let judge;
  let sentimentJudge;
  if (flags.judge) {
    const jp = resolveProvider(flags.judge);
    const askJudge = async prompt => (await ask(jp, { question: prompt, maxTokens: 500 })).answer;
    judge = makeLlmJudge(askJudge);
    sentimentJudge = makeSentimentJudge(askJudge);
  }
  const metricsReport = samples.length
    ? await computeMetrics(samples, brand, { judge, sentimentJudge, brandDescription: brand.description })
    : undefined;

  // 3. 体检
  console.log(`[3/5] auditing ${urls.length} pages…`);
  const auditReport = await auditSite(root, urls);

  // 4. 存期 + 验收
  mkdirSync(`${dir}/history`, { recursive: true });
  if (metricsReport) writeFileSync(`${dir}/history/${date}-metrics.json`, JSON.stringify(metricsReport, null, 2));
  if (samples.length) writeFileSync(`${dir}/history/${date}-samples.json`, JSON.stringify(samples, null, 2));
  writeFileSync(`${dir}/history/${date}-audit.json`, JSON.stringify(auditReport, null, 2));
  let tickets;
  try { tickets = JSON.parse(readFileSync(`${dir}/tickets.json`, 'utf8')); } catch { /* 首期 */ }
  if (tickets) {
    const summary = verifyTickets(tickets, { audit: auditReport, metrics: metricsReport }, LANG);
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    console.log(`[4/5] verify: pass ${summary.counts.pass} · fail ${summary.counts.fail} · unmeasured ${summary.counts.unmeasurable}`);
    for (const tr of summary.transitions) console.log(`  ↻ ${tr.ticketId}: ${tr.from} → ${tr.to}`);
  } else {
    tickets = generateTickets(auditReport, metricsReport, LANG);
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    console.log(`[4/5] first period: generated ${tickets.length} tickets → tickets.json`);
  }

  // 5. 报告 + 趋势
  const html = renderHtmlReport({
    brandName: brand.name, audit: auditReport, metrics: metricsReport, tickets,
    samples, brandAliases: brand.aliases, lang: LANG,
  });
  writeFileSync(`${dir}/report-${date}.html`, html);
  const periods = loadPeriods(`${dir}/history`);
  console.log(`[5/5] report → ${dir}/report-${date}.html · ${periods.length} period(s) in history`);
  if (periods.length >= 2) {
    const t = computeTrends(periods, LANG);
    for (const a of t.alerts) console.log(`  ${a.level === 'P0' ? '🔴' : '⚠'} ${a.message}`);
  }
  console.log('period complete.');
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
  console.log(`schedule config generated (daily 09:00 check; sampling cadence of ${days}d is governed by cycle itself):

macOS (launchd):
  cp ${dir}/${label}.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/${label}.plist

Linux (add one line via crontab -e, every ${days} days):
  0 9 */${days} * * ${node} ${cli} cycle --dir ${abs} >> ${abs}/cycle.log 2>&1

macOS note: launching node directly via launchd avoids TCC permission prompts.`);
}

/** 把本次测量存为一期（--history 目录，YYYY-MM-DD 命名，覆盖同日）。 */
function savePeriod(ctx) {
  if (!flags.history) return;
  mkdirSync(flags.history, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  if (ctx.metrics) writeFileSync(`${flags.history}/${date}-metrics.json`, JSON.stringify(ctx.metrics, null, 2));
  if (ctx.samples?.length) writeFileSync(`${flags.history}/${date}-samples.json`, JSON.stringify(ctx.samples, null, 2));
  if (ctx.audit) writeFileSync(`${flags.history}/${date}-audit.json`, JSON.stringify(ctx.audit, null, 2));
  console.log(`period saved → ${flags.history}/ (${date})`);
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
    console.error('usage: fastergeo trends --history <dir> (save periods first via report/metrics/audit with --history)');
    process.exit(1);
  }
  const periods = loadPeriods(flags.history);
  if (periods.length === 0) {
    console.error('history dir is empty — run a measurement with --history first.');
    process.exit(1);
  }
  const r = computeTrends(periods, LANG);
  console.log(`periods: ${r.periods.length} (${r.periods.join(' → ')})\n`);
  for (const a of r.alerts) {
    console.log(`${a.level === 'P0' ? '🔴 P0' : '⚠ observation'} ${a.message}`);
  }
  if (r.alerts.length) console.log();
  const fmt = v => (v === null ? 'unmeasured' : `${(v * 100).toFixed(0)}%`);
  for (const d of r.deltas) {
    const arrow = d.direction === 'up' ? '↑' : d.direction === 'down' ? '↓' : '→';
    const verdict = d.verdict.kind === 'trend'
      ? `📈 trend (${d.verdict.direction === 'up' ? 'rising' : 'falling'} twice)`
      : d.verdict.kind === 'observation' ? 'observation (single period, no conclusion)'
      : 'insufficient data';
    const isScore = d.key === 'site.avgScore';
    const show = v => (isScore ? (v === null ? 'unmeasured' : v) : fmt(v));
    console.log(`${d.key.padEnd(28)} ${show(d.prev)} ${arrow} ${show(d.curr)}  ${verdict}`);
  }
}

async function cmdSheet() {
  if (!flags.questions) {
    console.error('usage: fastergeo sheet --questions questions.json [--engines nano,baidu-ai] [--brand brand.json] [--out sheet.md]');
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
    `${e.id}(${questions.filter(q => q.market === e.market || q.market === 'both').length}q)`).join(' ');
  console.log(`sampling sheet → ${out}\nengines: ${perEngine}\nfill it manually / via browser, then: fastergeo import`);
}

async function cmdImport() {
  if (!flags.file) {
    console.error('usage: fastergeo import --file sheet.md [--questions questions.json] [--out samples.jsonl]');
    process.exit(1);
  }
  let imported = parseSampleSheet(readFileSync(flags.file, 'utf8'));
  if (flags.questions) {
    imported = enrichWithQuestionBank(imported, JSON.parse(readFileSync(flags.questions, 'utf8')));
  } else {
    // Without the question bank, probe flags cannot be restored — probe
    // answers would silently enter the visibility pool and inflate every
    // metric. Refusing is the only honest behavior.
    console.error('✗ --questions is required: without the question bank, probe questions cannot be separated from visibility questions, which fabricates mention rates. Pass the questions.json used to create this sheet.');
    process.exit(1);
  }
  const out = flags.out ?? 'samples-manual.jsonl';
  writeFileSync(out, imported.samples.map(s => JSON.stringify(s)).join('\n') + '\n');
  console.log(`imported ${imported.samples.length} samples → ${out} (channel=manual)`);
  if (imported.skipped.length) {
    console.log(`skipped ${imported.skipped.length}:`);
    for (const s of imported.skipped) console.log(`  · ${s.engine}/${s.questionId}: ${s.reason}`);
  }
  console.log('\nnext: fastergeo metrics --samples ' + out + ' --brand brand.json');
}
const run = commands[command];
if (!run) {
  console.log(LANG === 'zh' ? `fastergeo — 开源 GEO 平台（中国 + 海外 AI 引擎）

  起步     bootstrap  从官网一键推导品牌/事实/问题库
  诊断     check      引擎 Key 健康检查
           audit      六维体检（AI 爬虫视角，无需 Key）
  采样     sample     API 采样 · sheet/import 人工采样表（零 Key）
  指标     metrics    漏斗指标 + LLM 认知裁判（--judge）
           trends     期对比与趋势判定（--history）
  闭环     plan       诊断 → 带验收标准的工单
           verify     重抓自动验收，回归自动打回
  内容     outline/draft/fabcheck  事实约束生成 + 编造门禁
  运营     cycle      一条命令跑完整一期 · schedule 定时配置
  界面     ui         本地看板 · report 单文件诊断报告

  全局: --lang zh 切换中文输出。数据全在本机。` : `fastergeo — open-source GEO platform (China + global AI engines)

  start    bootstrap  derive brand facts / competitors / questions from a URL
  diagnose check      engine key health checks
           audit      six-dimension audit (AI-crawler view, no keys needed)
  sample   sample     API sampling · sheet/import manual sheets (zero keys)
  measure  metrics    funnel metrics + LLM recognition judge (--judge)
           trends     period deltas with the two-period discipline (--history)
  loop     plan       diagnosis → tickets with machine-verifiable acceptance
           verify     re-crawl auto-verification; regressions flip back
  content  outline/draft/fabcheck  facts-constrained generation + fabrication gate
  operate  cycle      one command runs a full period · schedule cron config
  view     ui         local dashboard · report one-file diagnosis report

  global: --lang zh for Chinese output. All data stays on your machine.`);
  process.exit(command ? 1 : 0);
}
run().catch(err => {
  console.error('fastergeo failed:', err.message ?? err);
  process.exit(1);
});
