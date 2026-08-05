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
import { notify, pendingNotifyError, channelEnvKeys } from './notify.js';

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
  renderSampleSheet, parseSampleSheet, enrichWithQuestionBank, suggestAliases,
} from '@fastergeo/metrics';
import { auditSite, fetchPage } from '@fastergeo/audit';
import { generateTickets, verifyTickets, rankTickets } from '@fastergeo/tickets';
import {
  buildOutline, draftPrompt, lintFabrication, bootstrapProject, mineSuggestions,
  renderDossier, parseFactsMd,
} from '@fastergeo/content';
import { renderHtmlReport, renderTodayDigest, dailyContract } from '@fastergeo/report';
import { computeTrends } from '@fastergeo/trends';
import { analyzeBotlog } from '@fastergeo/botlog';
import { publishTo } from '@fastergeo/publish';
import { parseOfficialCsv, detectSource, reconcile } from '@fastergeo/officialdata';
import {
  extractJsonLdProducts, parseShopifyProducts, analyzeShopping, buildShoppingQuestions,
} from '@fastergeo/commerce';
import { readdirSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { resolve as resolvePath, basename, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';

const [, , command, ...rest] = process.argv;

const { values: flags, positionals } = parseArgs({
  args: rest,
  options: {
    'no-open': { type: 'boolean', default: false },
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
    at: { type: 'string' },
    notify: { type: 'string' },
    repeat: { type: 'string' },
    seed: { type: 'string' },
    expand: { type: 'boolean', default: false },
    targets: { type: 'string' },
    source: { type: 'string' },
    audit: { type: 'string' },
    shopify: { type: 'boolean', default: false },
    products: { type: 'string' },
    'questions-out': { type: 'string' },
    target: { type: 'string' },
    title: { type: 'string' },
    force: { type: 'boolean', default: false },
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

const t = (en, zh) => (LANG === 'zh' ? zh : en);

// Narration mode. `start` is the one command a non-technical brand owner runs,
// so it speaks first person, present tense, one short line per action, and
// reports counts the moment they are known. Every other command keeps the terse
// machine output an operator or a script expects.
let NARRATE = false;
// The second argument is optional: a caller that already resolved the language
// passes one string. Without the fallback that call silently prints "undefined"
// in whichever language was not supplied.
const say = (en, zh) => console.log(NARRATE ? `> ${t(en, zh ?? en)}` : t(en, zh ?? en));
const step = (en, zh) => console.log(NARRATE ? `  ${t(en, zh ?? en)}` : t(en, zh ?? en));
// Soft failure: a missing key or an unreachable page never stops the run. It is
// stated, compensated for, and the run continues.
const soft = (en, zh) => console.log(NARRATE ? `  · ${t(en, zh ?? en)}` : t(en, zh ?? en));

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
    const askJudge = async prompt => (await ask(jp, { question: prompt, maxTokens: 500, temperature: 0, timeoutMs: 300_000 })).answer;
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
  const srcs = (report.citationSources ?? []).filter(cs => !cs.own).slice(0, 8);
  if (srcs.length) {
    console.log('\ncited third-party sources (your earned-media target list — fastergeo sources for full):');
    for (const cs of srcs) console.log(`  [${cs.market}] ${String(cs.citations).padStart(4)} × ${cs.domain}`);
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
  const searchBlocked = s.blockedSearchCrawlers ?? s.blockedAiCrawlers;
  const trainingBlocked = s.blockedTrainingCrawlers ?? [];
  console.log(`site: robots ${s.robotsTxtFound ? '✓' : '✗'} · sitemap ${s.sitemapFound ? '✓' : '✗'} · llms.txt ${s.llmsTxtFound ? '✓' : '✗'}` +
    (searchBlocked.length ? ` · 🔴 AI SEARCH crawlers blocked: ${searchBlocked.join(',')} (removes you from those AI answers)` : '') +
    (trainingBlocked.length ? ` · training opt-out: ${trainingBlocked.join(',')} (policy choice, not an error)` : ''));
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
      const askJudge = async prompt => (await ask(jp, { question: prompt, maxTokens: 500, temperature: 0, timeoutMs: 300_000 })).answer;
      judge = makeLlmJudge(askJudge);
      sentimentJudge = makeSentimentJudge(askJudge);
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
    if (t.pages) console.log(`   pages: ${t.pages.join(' ')}`);
    if (t.fixHint) {
      const label = LANG === 'zh' ? '怎么修' : 'how to fix';
      console.log(`   ${label}:`);
      for (const line of t.fixHint.split('\n')) console.log(`     ${line}`);
    }
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
  // The voice guide sits next to the fact store, is written by hand, and is
  // the only style input we do not derive. Used when filled in; silently
  // skipped when it is still the scaffold.
  const voicePath = `${dirname(resolvePath(flags.facts))}/dossier/voice.md`;
  let voice;
  if (existsSync(voicePath)) {
    const raw = readFileSync(voicePath, 'utf8');
    if (!/_待填_|_to fill in_/.test(raw)) voice = raw;
    else soft(`voice.md is still blank — drafting without a voice guide.`,
      `voice.md 还没填 —— 这次不带语气指南写。`);
  }
  const provider = resolveProvider(flags.llm);
  console.log(`drafting (${provider.id} / ${provider.resolvedModel})…`);
  if (voice) console.log('using your voice.md');
  const result = await ask(provider, { question: draftPrompt(outline, store, voice), maxTokens: 4000, timeoutMs: 300_000 });
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
  let trend;
  if (flags.history) {
    const periods = loadPeriods(flags.history);
    if (periods.length >= 2) trend = computeTrends(periods, LANG);
  }
  const html = renderHtmlReport({
    brandName, audit: ctx.audit, metrics: ctx.metrics, tickets,
    samples: ctx.samples, brandAliases: ctx.brandAliases, trend, lang: LANG,
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
  say(`Reading your site — ${urls.length} pages.`, `我在读你的网站，共 ${urls.length} 页。`);
  const fetched = await Promise.all(urls.map(u => fetchPage(u)));
  const pages = fetched
    .filter(p => p && p.status === 200 && p.wordCount > 20)
    .map(p => ({ url: p.url, title: p.title, text: p.text }));
  const thin = fetched.length - pages.length;
  if (thin > 0) {
    soft(`${thin} page(s) unreachable or too thin — working with the rest.`,
      `${thin} 页打不开或内容太少，跳过，用剩下的。`);
  }
  say(`Working out what you do.`, `我在弄明白你是做什么的。`);
  const provider = resolveProvider(flags.llm);
  const result = await bootstrapProject(flags.root, pages, async prompt =>
    (await ask(provider, { question: prompt, maxTokens: 4000, timeoutMs: 300_000 })).answer);

  const dir = flags.out ?? '.';
  writeFileSync(`${dir}/brand.json`, JSON.stringify({ ...result.brand }, null, 2));
  writeFileSync(`${dir}/facts.json`, JSON.stringify(result.facts, null, 2));
  writeFileSync(`${dir}/questions.json`, JSON.stringify(result.questions, null, 2));

  // The same data as five documents. The JSON is what the tools read; these are
  // what a human reads and corrects. Without them the whole bootstrap is
  // invisible work that lands as a directory of config files.
  // Never overwrite a document a human may have corrected — these files invite
  // editing in their own headers, so clobbering them on a re-run would be the
  // one unforgivable bug here. Delete a file to have it regenerated.
  const dossier = renderDossier({ result, root: flags.root, pages, lang: LANG });
  mkdirSync(`${dir}/dossier`, { recursive: true });
  const kept = [];
  for (const [file, md] of Object.entries(dossier)) {
    const path = `${dir}/dossier/${file}`;
    if (existsSync(path)) { kept.push(file); continue; }
    writeFileSync(path, md);
  }
  if (kept.length) {
    soft(`Kept your edits in ${kept.join(', ')} — delete a file to regenerate it.`,
      `保留了你改过的 ${kept.join('、')} —— 想重新生成就把文件删掉。`);
  }
  const confirmed = result.facts.facts.filter(f => f.status === 'confirmed').length;
  const unconfirmed = result.facts.facts.length - confirmed;
  step(`Got it. ${result.brand.name} — ${result.brand.description}`,
    `明白了。${result.brand.name} —— ${result.brand.description}`);
  step(`${confirmed} brand facts, each with a source URL.`
    + (unconfirmed ? ` ${unconfirmed} left unconfirmed rather than guessed.` : ''),
  `建好 ${confirmed} 条品牌事实，每条都有来源链接。`
    + (unconfirmed ? ` 另有 ${unconfirmed} 条推导不出，标了待确认，没有瞎猜。` : ''));
  if (result.unresolved.length) {
    soft(`Not on your site, add by hand: ${result.unresolved.join(', ')}`,
      `网站上没写，需要你手动补：${result.unresolved.join('、')}`);
  }
  say(`Looking for who you compete with.`, `我在找你的竞争对手。`);
  const names = result.competitorCandidates.map(c => c.name);
  step(`Found ${names.length}: ${names.join(', ')}`, `找到 ${names.length} 个：${names.join('、')}`);
  step(`Wrong? Edit them in your Profile — only high-confidence ones get tracked.`,
    `不对的话在「档案」里改 —— 只有高置信度的会进入跟踪。`);
  step(`Question bank: ${result.questions.length} questions `
    + `(cn ${result.questions.filter(q => q.market === 'cn').length} · global ${result.questions.filter(q => q.market === 'global').length} · probes ${result.questions.filter(q => q.brandInQuestion).length})`,
  `问题库 ${result.questions.length} 题`
    + `（国内 ${result.questions.filter(q => q.market === 'cn').length} · 海外 ${result.questions.filter(q => q.market === 'global').length} · 探测 ${result.questions.filter(q => q.brandInQuestion).length}）`);
  const aliasCands = suggestAliases(result.brand);
  if (aliasCands.length) {
    soft(`Alias candidates to review — a missing alias silently under-counts you: ${aliasCands.map(a => a.alias).join(', ')}`,
      `建议过一遍这些别名 —— 漏了别名会让你的可见度被低估：${aliasCands.map(a => a.alias).join('、')}`);
  }
  step(`Your dossier is in ${basename(dir)}/dossier/ — five documents, yours to correct.`,
    `你的档案在 ${basename(dir)}/dossier/ —— 五份文档，错的地方你直接改。`);
  if (!NARRATE) {
    console.log(`\nwrote ${dir}/brand.json · facts.json · questions.json · dossier/*.md`);
    console.log('next: review competitors in brand.json and unconfirmed facts, then fastergeo sample / audit / plan.');
  }
}

/**
 * start — the one command a brand owner runs.
 *
 * Everything `start` does was already possible with bootstrap → cycle → ui.
 * Nobody ran three commands and then went looking for which JSON file held the
 * answer, so the finding never landed. This orchestrates the same steps, speaks
 * while it works, and ends on the dashboard with a pointer at what to read
 * first. No new measurement, no new claims — a door on a house that had none.
 */
async function cmdStart() {
  const target = positionals[0] ?? flags.root;
  if (!target) {
    console.error('usage: fastergeo start https://yoursite.com [--dir <folder>] [--llm glm] [--no-open]');
    process.exit(1);
  }
  const root = /^https?:\/\//.test(target) ? target : `https://${target}`;
  let host;
  try { host = new URL(root).hostname; } catch {
    console.error(`fastergeo start: "${target}" is not a URL I can read.`);
    process.exit(1);
  }
  NARRATE = true;
  const dir = resolvePath(flags.dir ?? host);
  mkdirSync(dir, { recursive: true });

  say(`Hi. I'm your head of growth — this takes about five minutes.`,
    `你好，我是你的增长负责人 —— 大概花五分钟。`);
  say(`I show my work: every claim gets a source, every fix gets re-checked.`,
    `我跟别人不一样的地方：说的每句话都给出处，修的每件事都自己复查。`);
  say(`Starting with three questions: does AI know you, confuse you, recommend you?`,
    `先回答三件事：AI 认不认识你、有没有认错、推不推荐你。`);

  const configured = configuredProviders();
  const llmId = flags.llm ?? configured[0]?.id;
  if (configured.length) {
    step(`${configured.length} AI engines are ready: ${configured.map(p => p.id).join(', ')}`,
      `${configured.length} 个 AI 引擎可用：${configured.map(p => p.id).join('、')}`);
  }

  // No engine key at all. The site audit needs none, so it still runs — that
  // is the honest half of the answer, and it is the half most brands fail.
  if (!llmId) {
    soft(`No engine keys yet, so I can't ask the AIs anything today.`,
      `还没配任何引擎 Key，所以今天问不了 AI。`);
    soft(`I can still show you what AI crawlers see on your site.`,
      `但我照样能给你看：AI 爬虫在你的网站上看到了什么。`);
    say(`Looking at your site the way an AI crawler does.`, `我在用 AI 爬虫的眼睛看你的网站。`);
    const auditReport = await auditSite(root, [root]);
    narrateAudit(auditReport);
    const tickets = generateTickets(auditReport, undefined, LANG);
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(`${dir}/report-${date}.html`, renderHtmlReport({
      brandName: host, audit: auditReport, tickets, lang: LANG,
    }));
    say(`Turning that into a fix list.`, `我在把这些变成一张修复清单。`);
    step(`${tickets.length} things to fix — each says what "done" has to look like.`,
      `${tickets.length} 条待修 —— 每条都写明了「修到什么程度算好」。`);
    const head = pickHeadline({ audit: auditReport, tickets });
    if (head) step(head.en, head.zh);
    say(`To hear what AI actually says about you, give me one key:`,
      `想听 AI 到底怎么说你，给我一个 Key 就行：`);
    step(`GLM_API_KEY=… fastergeo start ${host}`, `GLM_API_KEY=… fastergeo start ${host}`);
    step(`No key at all? fastergeo sheet — paste answers in by hand.`,
      `一个 Key 都不想配？跑 fastergeo sheet，手动把回答贴进来。`);
    await openWorkbench(dir);
    return;
  }

  // Reuse an existing profile rather than overwriting a human's edits.
  if (existsSync(`${dir}/brand.json`)) {
    step(`Found your profile from last time — reusing it.`, `找到你上次的档案 —— 直接用。`);
  } else {
    flags.root = root;
    flags.llm = llmId;
    flags.out = dir;
    await cmdBootstrap();
  }

  flags.dir = dir;
  flags.root = root;
  flags.judge ??= llmId;
  const result = await cmdCycle();

  say(`Done. Opening your workbench.`, `跑完了。正在打开你的工作台。`);
  const headline = pickHeadline(result);
  if (headline) step(headline.en, headline.zh);
  // The contract, stated once the work has been done rather than promised up
  // front — it reads as a description of what just happened, not a pitch.
  console.log('\n' + contractBlock() + '\n');
  step(`Want that? fastergeo hire --dir ${basename(dir)}`,
    `想要？跑 fastergeo hire --dir ${basename(dir)}`);
  await openWorkbench(dir);
}

/**
 * What the crawler's-eye view found, said in the user's words.
 *
 * An empty shell and a blocked retrieval crawler are the two failure modes that
 * make every other optimization pointless, and both are invisible to a human
 * looking at the same page in a browser. So they get named, with the number
 * that makes them undeniable.
 */
function narrateAudit(audit) {
  const thinnest = [...(audit.pages ?? [])].sort((a, b) => a.wordCount - b.wordCount)[0];
  const shells = (audit.pages ?? []).filter(p => p.blockers?.some(b => /shell|render/i.test(b)));
  if (shells.length) {
    step(`${shells.length} page(s) are blank to an AI crawler — the content is drawn by JavaScript.`,
      `有 ${shells.length} 页在 AI 爬虫眼里是空白 —— 内容是 JavaScript 画出来的。`);
  }
  if (thinnest && (audit.pages?.length ?? 0) > 1) {
    step(`Thinnest page an AI sees: ${thinnest.wordCount} words (${thinnest.url}).`,
      `AI 看到内容最少的一页：${thinnest.wordCount} 个词（${thinnest.url}）。`);
  } else if (thinnest) {
    step(`Your homepage gives an AI ${thinnest.wordCount} readable words.`,
      `你的首页能让 AI 读到 ${thinnest.wordCount} 个词。`);
  }
  // Only search/user-request crawlers matter here. Blocking training-only bots
  // is a policy choice, not a defect, and reporting it as one would be a lie.
  const blocked = audit.site?.blockedSearchCrawlers ?? [];
  if (blocked.length) {
    step(`robots.txt blocks ${blocked.length} AI search crawler(s): ${blocked.join(', ')} — that removes you from AI answers.`,
      `robots.txt 挡掉了 ${blocked.length} 个 AI 搜索爬虫（${blocked.join('、')}）—— 这会把你从 AI 答案里删掉。`);
  }
  if (!audit.site?.llmsTxtFound) {
    soft(`No llms.txt. Google ignores it; some AI crawlers read it.`,
      `没有 llms.txt。Google 不读它，部分 AI 爬虫读。`);
  }
  if (audit.avgScore != null) {
    step(`Site AI-readiness: ${audit.avgScore.toFixed(1)} / 100.`,
      `网站 AI 就绪度：${audit.avgScore.toFixed(1)} / 100。`);
  }
}

/** The one line worth reading first, picked by severity, not by section order. */
function pickHeadline({ metrics, audit, tickets }) {
  const confused = (metrics?.platforms ?? [])
    .reduce((n, p) => n + (p.probe?.recognition.confused ?? 0), 0);
  if (confused > 0) {
    return {
      en: `Start with the Evidence column — ${confused} answer(s) think you're a different company.`,
      zh: `先看「证据」栏 —— 有 ${confused} 个回答把你当成了别的公司。`,
    };
  }
  const p0 = (tickets ?? []).filter(x => x.priority === 'P0');
  if (p0.length) {
    return {
      en: `Start with the ${p0.length} P0 item(s) — nothing else moves until those are fixed.`,
      zh: `先看那 ${p0.length} 条 P0 —— 不修好它们，别的都白做。`,
    };
  }
  const failed = audit?.failedUrls?.length ?? 0;
  if (failed) {
    return {
      en: `${failed} page(s) I couldn't fetch — worth checking those first.`,
      zh: `有 ${failed} 页我抓不到 —— 建议先看这个。`,
    };
  }
  return null;
}

async function openWorkbench(dir) {
  if (flags['no-open']) {
    step(`Workbench: fastergeo ui --dir ${basename(dir)}`, `工作台：fastergeo ui --dir ${basename(dir)}`);
    return;
  }
  const port = Number(flags.port ?? 8765);
  const { startUi } = await import('./server.js');
  startUi(resolvePath(dir), port);
  const { exec } = await import('node:child_process');
  exec(`open http://127.0.0.1:${port} 2>/dev/null || xdg-open http://127.0.0.1:${port} 2>/dev/null`);
}

const commands = {
  start: cmdStart,
  check: cmdCheck, sample: cmdSample, metrics: cmdMetrics, audit: cmdAudit,
  plan: cmdPlan, verify: cmdVerify,
  outline: cmdOutline, draft: cmdDraft, fabcheck: cmdFabcheck,
  report: cmdReport, bootstrap: cmdBootstrap,
  sheet: cmdSheet, import: cmdImport, trends: cmdTrends,
  // `schedule` kept as an alias: renaming a shipped command out from under
  // existing users buys nothing.
  cycle: cmdCycle, hire: cmdHire, fire: cmdFire, schedule: cmdHire,
  ui: cmdUi, botlog: cmdBotlog,
  expand: cmdExpand, publish: cmdPublish, official: cmdOfficial,
  products: cmdProducts, shopping: cmdShopping, sources: cmdSources,
};

async function cmdSources() {
  if (!flags.samples || !flags.brand) {
    console.error('usage: fastergeo sources --samples s.jsonl --brand brand.json [--format geolook] [--json]');
    process.exit(1);
  }
  const brand = JSON.parse(readFileSync(flags.brand, 'utf8'));
  const raw = readFileSync(flags.samples, 'utf8');
  const samples = flags.format === 'geolook'
    ? parseGeoLookSamples(raw)
    : raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const { analyzeCitationSources } = await import('@fastergeo/metrics');
  const sources = analyzeCitationSources(samples, brand);
  if (flags.json) { console.log(JSON.stringify(sources, null, 2)); return; }
  const T = LANG === 'zh' ? {
    title: 'AI 在你的品类信任谁（来自你自己的采样引用）',
    note: '约 84% 的 AI 引用来自第三方（Muck Rack）——下面的第三方域名就是你的公关目标清单。',
    none: '样本中没有任何引用 URL（该引擎组合可能不带引用，或需开启 web search）。',
    own: '自有',
  } : {
    title: 'Who AI trusts in your category (from your own samples\' citations)',
    note: '~84% of AI citations are earned media (Muck Rack) — the third-party domains below are your PR target list.',
    none: 'No citation URLs in these samples (this engine mix may not cite, or needs web search enabled).',
    own: 'own',
  };
  console.log(T.title);
  if (sources.length === 0) { console.log(T.none); return; }
  let lastMarket = '';
  for (const src of sources) {
    if (src.market !== lastMarket) { console.log(`\n[${src.market}]`); lastMarket = src.market; }
    console.log(`  ${String(src.citations).padStart(4)} × ${src.domain}${src.own ? ` (${T.own})` : ''} · ${src.samples} samples · ${src.engines.join(',')}`);
  }
  console.log(`\n${T.note}`);
}

async function cmdProducts() {
  if (!flags.root) {
    console.error('usage: fastergeo products --root https://shop.com [--urls /p/a,/p/b | --shopify] [--out products.json] [--questions-out shopping-questions.json]');
    process.exit(1);
  }
  const T = LANG === 'zh' ? {
    got: (n, src) => `采集到 ${n} 个商品（${src}）`,
    warn: w => `⚠ ${w.url ? w.url + ' — ' : ''}${w.message}`,
    fetchFail: u => `✗ 抓取失败：${u}`,
    saved: (f, n) => `目录已写入 ${f}（${n} 个商品）——价格/别名可人工修订后再用`,
    qSaved: (f, n) => `购买意图题候选已写入 ${f}（${n} 条）——候选不自动入题库`,
  } : {
    got: (n, src) => `extracted ${n} product(s) (${src})`,
    warn: w => `⚠ ${w.url ? w.url + ' — ' : ''}${w.message}`,
    fetchFail: u => `✗ fetch failed: ${u}`,
    saved: (f, n) => `catalog written to ${f} (${n} products) — review prices/aliases by hand before use`,
    qSaved: (f, n) => `buying-intent question candidates written to ${f} (${n}) — candidates are never auto-added to the bank`,
  };
  let products = [];
  let warnings = [];
  let source;
  if (flags.shopify) {
    source = 'shopify';
    const url = `${flags.root.replace(/\/$/, '')}/products.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.error(T.fetchFail(`${url} (HTTP ${res.status})`)); process.exit(1); }
    const r = parseShopifyProducts(await res.text(), flags.root);
    products = r.products; warnings = r.warnings;
  } else {
    source = 'jsonld';
    const urls = (flags.urls ? flags.urls.split(',') : ['/'])
      .map(u => (u.startsWith('http') ? u : new URL(u, flags.root).href));
    for (const u of urls) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'FasterGEO-Commerce/0.1 (+https://fastergeo.co)' } });
        if (!res.ok) { warnings.push({ url: u, message: `HTTP ${res.status}` }); continue; }
        const r = extractJsonLdProducts(await res.text(), u);
        products.push(...r.products); warnings.push(...r.warnings);
      } catch (err) {
        warnings.push({ url: u, message: String(err?.message ?? err) });
      }
    }
  }
  console.log(T.got(products.length, source));
  for (const w of warnings) console.log(T.warn(w));
  const catalog = { source, fetchedAt: new Date().toISOString(), products, warnings };
  const out = flags.out ?? 'products.json';
  writeFileSync(out, JSON.stringify(catalog, null, 2));
  console.log(T.saved(out, products.length));
  if (flags['questions-out']) {
    const qs = buildShoppingQuestions(products);
    writeFileSync(flags['questions-out'], JSON.stringify(qs, null, 2));
    console.log(T.qSaved(flags['questions-out'], qs.length));
  }
}

async function cmdShopping() {
  if (!flags.samples || !flags.products || !flags.brand) {
    console.error('usage: fastergeo shopping --samples s.jsonl --products products.json --brand brand.json [--format geolook] [--json]');
    process.exit(1);
  }
  const brand = JSON.parse(readFileSync(flags.brand, 'utf8'));
  const catalog = JSON.parse(readFileSync(flags.products, 'utf8'));
  const products = Array.isArray(catalog) ? catalog : catalog.products;
  const raw = readFileSync(flags.samples, 'utf8');
  const samples = flags.format === 'geolook'
    ? parseGeoLookSamples(raw)
    : raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const report = analyzeShopping(samples, products, brand.name);
  if (flags.json) { console.log(JSON.stringify(report, null, 2)); return; }
  const T = LANG === 'zh' ? {
    head: r => `品牌 ${r.brand} · 样本 ${r.totalSamples} · 商品 ${products.length}`,
    plat: p => `${p.providerId.padEnd(12)} [${p.market}] 任一商品提及率 ${p.anyProductMentionRate === null ? '未测' : (p.anyProductMentionRate * 100).toFixed(0) + '%'}（${p.samples} 样本）`,
    prod: st => `  ${st.name.padEnd(24)} 提及 ${st.mentions} · 价格对 ${st.priceChecks.correct} / 错 ${st.priceChecks.wrong} / 未报价 ${st.priceChecks.none}`,
    wrong: e => `    🔴 错价证据：「${e}」`,
    none: '（无商品在任何回答中被提及）',
  } : {
    head: r => `brand ${r.brand} · samples ${r.totalSamples} · products ${products.length}`,
    plat: p => `${p.providerId.padEnd(12)} [${p.market}] any-product mention ${p.anyProductMentionRate === null ? 'unmeasured' : (p.anyProductMentionRate * 100).toFixed(0) + '%'} (${p.samples} samples)`,
    prod: st => `  ${st.name.padEnd(24)} mentions ${st.mentions} · price ok ${st.priceChecks.correct} / wrong ${st.priceChecks.wrong} / unquoted ${st.priceChecks.none}`,
    wrong: e => `    🔴 wrong-price evidence: "${e}"`,
    none: '(no product was mentioned in any answer)',
  };
  console.log(T.head(report) + '\n');
  let any = false;
  for (const p of report.platforms) {
    console.log(T.plat(p));
    for (const st of p.products) {
      if (st.mentions === 0) continue;
      any = true;
      console.log(T.prod(st));
      for (const e of st.wrongPriceEvidence) console.log(T.wrong(e));
    }
  }
  if (!any) console.log(T.none);
}

async function cmdOfficial() {
  if (!flags.file) {
    console.error('usage: fastergeo official --file gsc-export.csv [--source gsc|bing] [--audit DATE-audit.json | --dir project] [--json]');
    console.error('exports: GSC → Performance → Search generative AI → Pages → Export CSV; Bing → Webmaster Tools → AI Performance → Export');
    process.exit(1);
  }
  const text = readFileSync(flags.file, 'utf8');
  const source = flags.source ?? detectSource(text);
  if (!source) {
    console.error('✗ cannot detect source from headers — pass --source gsc|bing');
    process.exit(1);
  }
  const parsed = parseOfficialCsv(text, source);
  let audit;
  if (flags.audit) audit = JSON.parse(readFileSync(flags.audit, 'utf8'));
  else if (flags.dir) {
    const hist = `${flags.dir}/history`;
    try {
      const files = readdirSync(hist).filter(f => /-audit\.json$/.test(f)).sort();
      if (files.length) audit = JSON.parse(readFileSync(`${hist}/${files[files.length - 1]}`, 'utf8'));
    } catch { /* 无 history */ }
  }
  const rec = reconcile(parsed.rows, audit);
  if (flags.json) {
    console.log(JSON.stringify({ parsed: { skippedRows: parsed.skippedRows, unmappedHeaders: parsed.unmappedHeaders }, reconciliation: rec }, null, 2));
    return;
  }
  const T = LANG === 'zh' ? {
    head: (src, n, total, m) => `${src === 'gsc' ? 'Google Search Console 生成式 AI 报告' : 'Bing AI Performance'}：${n} 个页面 · ${m === 'impressions' ? '曝光' : '引用'}共 ${total}`,
    caveat: src => src === 'gsc' ? '（注意：GSC 报的是 AI 版面曝光，不是引用——两者是不同物理量，本工具不合并）' : '',
    skipped: (sk, un) => `解析：跳过 ${sk} 行不可用数据${un.length ? `；未映射列：${un.join('、')}` : ''}`,
    top: '官方数据 Top 页面：',
    winners: '⚠ 低分被引页（官方在用、我们体检 C/D——体检漏了什么，或页面赢在站外权威，都值得查）：',
    blind: '⚠ 盲区页（官方在用、但不在体检清单——加进 audit URL）：',
    silent: '高分无声页（体检 A/B、官方报告未见——建站好但 AI 还没用起来）：',
    noAudit: '（未提供 audit——传 --audit 或 --dir 可做对账，当前只展示官方数据）',
    absent: '官方报告缺席 ≠ AI 没在用（报告有滞后、只覆盖该平台版面、小数字会被抹掉）',
  } : {
    head: (src, n, total, m) => `${src === 'gsc' ? 'Google Search Console Gen-AI report' : 'Bing AI Performance'}: ${n} pages · ${total} total ${m}`,
    caveat: src => src === 'gsc' ? '(note: GSC reports impressions in AI surfaces, not citations — different quantities, never merged here)' : '',
    skipped: (sk, un) => `parse: skipped ${sk} unusable row(s)${un.length ? `; unmapped columns: ${un.join(', ')}` : ''}`,
    top: 'Top pages by official data:',
    winners: '⚠ Low-score winners (officially used, audited C/D — the audit missed something, or the page wins on off-page authority; both worth checking):',
    blind: '⚠ Blind spots (officially used, never audited — add to your audit URLs):',
    silent: 'Silent good pages (audited A/B, absent from the official report — well-built but not yet surfaced):',
    noAudit: '(no audit given — pass --audit or --dir to reconcile; showing official data only)',
    absent: 'Absence from an official report ≠ unused by AI (reports lag, cover one platform, and threshold small numbers)',
  };
  console.log(T.head(source, rec.totalPages, rec.totalMetric, rec.metricName));
  const cav = T.caveat(source);
  if (cav) console.log(cav);
  if (parsed.skippedRows || parsed.unmappedHeaders.length) console.log(T.skipped(parsed.skippedRows, parsed.unmappedHeaders));
  console.log(`\n${T.top}`);
  for (const pg of rec.topPages) {
    const a = pg.audit ? ` · audit ${pg.audit.grade} ${pg.audit.score}` : '';
    console.log(`  ${String(pg.metric).padStart(7)}  ${pg.page}${a}`);
  }
  if (!audit) { console.log(`\n${T.noAudit}`); return; }
  if (rec.lowScoreWinners.length) {
    console.log(`\n${T.winners}`);
    for (const pg of rec.lowScoreWinners) console.log(`  ${String(pg.metric).padStart(7)}  ${pg.page} · ${pg.audit.grade} ${pg.audit.score}${pg.audit.blockers ? ` · ${pg.audit.blockers} blocker(s)` : ''}`);
  }
  if (rec.blindSpots.length) {
    console.log(`\n${T.blind}`);
    for (const pg of rec.blindSpots) console.log(`  ${String(pg.metric).padStart(7)}  ${pg.page}`);
  }
  if (rec.silentGoodPages.length) {
    console.log(`\n${T.silent}`);
    for (const pg of rec.silentGoodPages) console.log(`  ${pg.grade} ${String(pg.score).padStart(5)}  ${pg.page}`);
    console.log(`  ${T.absent}`);
  }
}

async function cmdPublish() {
  if (!flags.file || !flags.targets) {
    console.error('usage: fastergeo publish --file draft.md --targets targets.json [--target name] [--facts facts.json] [--title "..."] [--force]');
    console.error('targets.json: [{"type":"wordpress","name":"blog","baseUrl":"https://...","username":"u","passwordEnv":"WP_APP_PASSWORD"}, {"type":"github",...}, {"type":"webhook",...}]');
    process.exit(1);
  }
  const T = LANG === 'zh' ? {
    noFacts: '⚠ 未提供 --facts：编造门禁被跳过。发布带事实断言的内容必须过门禁。',
    noTarget: names => `--target 未指定，可选：${names}`,
    gateFail: n => `✗ 编造门禁拦截（${n} 处问题）——逐条修复，或明知故犯用 --force（会留痕）：`,
    forced: '⚠ 门禁失败但被 --force 强制发布——此操作已记录在结果中。',
    ok: (r, wp) => `✓ 已发布到 ${r.target}${r.url ? ` → ${r.url}` : ''}${wp ? '（默认存草稿，最后一步由人按）' : ''}`,
    fail: r => `✗ ${r.target} 发布失败：${r.error}`,
  } : {
    noFacts: '⚠ no --facts given: the fabrication gate is SKIPPED. Content with factual claims must pass the gate.',
    noTarget: names => `--target not given; available: ${names}`,
    gateFail: n => `✗ fabrication gate blocked publishing (${n} issue(s)) — fix them, or knowingly override with --force (recorded):`,
    forced: '⚠ gate failed but publishing was FORCED — this is recorded in the result.',
    ok: (r, wp) => `✓ published to ${r.target}${r.url ? ` → ${r.url}` : ''}${wp ? ' (draft by default — a human presses the final button)' : ''}`,
    fail: r => `✗ ${r.target} failed: ${r.error}`,
  };
  let markdown = readFileSync(flags.file, 'utf8');
  let title = flags.title;
  if (!title) {
    const m = /^#\s+(.+)$/m.exec(markdown);
    if (m) { title = m[1].trim(); markdown = markdown.replace(m[0], '').trimStart(); }
    else title = basename(flags.file).replace(/\.[^.]+$/, '');
  }
  const targets = JSON.parse(readFileSync(flags.targets, 'utf8'));
  const chosen = flags.target ? targets.filter(t => t.name === flags.target) : targets;
  if (chosen.length === 0) {
    console.error(T.noTarget(targets.map(t => t.name).join(', ')));
    process.exit(1);
  }
  let facts;
  if (flags.facts) facts = JSON.parse(readFileSync(flags.facts, 'utf8'));
  else console.log(T.noFacts);
  let anyFail = false;
  for (const target of chosen) {
    const r = await publishTo(target, { title, markdown }, { facts, force: flags.force });
    if (r.ok) {
      if (r.gateForced) console.log(T.forced);
      console.log(T.ok(r, target.type === 'wordpress' && (target.status ?? 'draft') === 'draft'));
    } else {
      anyFail = true;
      console.log(T.fail(r));
      if (r.gateIssues) {
        console.log(T.gateFail(r.gateIssues.length));
        for (const i of r.gateIssues) console.log(`   L${i.line} [${i.kind}] ${i.quote} — ${i.suggestion}`);
      }
    }
  }
  if (anyFail) process.exit(1);
}

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
 * The finding, said out loud the moment it is known.
 *
 * A run that only prints stage names buries its own point. Mistaken identity is
 * the single most valuable thing this tool finds, so it is quoted verbatim here
 * rather than left for the report. Discipline holds: without a judge the
 * recognition stations stay "not measured", never zero; a 0% mention rate is
 * only claimed when there were unprompted samples to measure it on.
 */
function narrateFindings(m, judged) {
  const confusedQuotes = m.platforms.flatMap(p => p.probe?.confusedEvidence ?? []);
  const confusedCount = m.platforms.reduce((n, p) => n + (p.probe?.recognition.confused ?? 0), 0);
  if (confusedCount > 0) {
    step(`${confusedCount} engine answer(s) mistake you for a different company:`,
      `有 ${confusedCount} 个回答把你认成了别的公司：`);
    for (const q of confusedQuotes.slice(0, 2)) {
      console.log(`    “${q.replace(/\s+/g, ' ').slice(0, 160)}”`);
    }
  } else if (!judged) {
    soft(`Recognition not measured — add --judge to have a model classify it.`,
      `认知没测 —— 加 --judge 才能判定 AI 是否认识/认错你。`);
  }
  for (const market of ['cn', 'global']) {
    const ps = m.platforms.filter(p => p.market === market && p.samples > 0);
    if (!ps.length) continue;
    const total = ps.reduce((n, p) => n + p.samples, 0);
    const hits = ps.reduce((n, p) => n + (p.mentionRate ?? 0) * p.samples, 0);
    const rate = Math.round((hits / total) * 100);
    const label = market === 'cn' ? t('China', '国内') : t('global', '海外');
    step(`${label}: mentioned in ${rate}% of ${total} buying-intent answers.`,
      `${label}：${total} 个购买意图问题里，${rate}% 的回答提到了你。`);
  }
}

/**
 * cycle：对一个项目目录跑完整一期
 * 目录约定: brand.json(含 domains/auditUrls) · questions.json · [tickets.json] · history/
 */
/**
 * Pull human edits from dossier/facts.md back into facts.json.
 *
 * facts.md's own header tells the reader it is the source of truth and that a
 * re-run picks up their edits. Until this ran, that was simply untrue: the
 * parser existed, was tested, was exported, and was called by nothing. A
 * document that invites correction and then discards it is worse than one that
 * never invited it.
 *
 * Only newer-than-JSON edits are taken, so a regenerated dossier never
 * overwrites the machine's own output with a stale copy of itself.
 */
function syncFactsFromDossier(dir) {
  const md = `${dir}/dossier/facts.md`;
  const json = `${dir}/facts.json`;
  if (!existsSync(md) || !existsSync(json)) return;
  try {
    if (statSync(md).mtimeMs <= statSync(json).mtimeMs) return;
    const store = JSON.parse(readFileSync(json, 'utf8'));
    const parsed = parseFactsMd(readFileSync(md, 'utf8'));
    if (!parsed.facts.length) return;
    store.facts = parsed.facts;
    if (parsed.definition) store.definition = parsed.definition;
    writeFileSync(json, JSON.stringify(store, null, 2));
    step(`Picked up your edits to facts.md — ${parsed.facts.length} facts.`,
      `读到了你对 facts.md 的修改 —— ${parsed.facts.length} 条事实。`);
    if (parsed.skipped.length) {
      soft(`${parsed.skipped.length} row(s) I could not read were left alone, not dropped.`,
        `有 ${parsed.skipped.length} 行我读不懂，原样留着没丢。`);
    }
  } catch (err) {
    soft(`Could not read facts.md (${err.message}) — using facts.json unchanged.`,
      `读不了 facts.md（${err.message}）—— 沿用原来的 facts.json。`);
  }
}

async function cmdCycle() {
  const dir = flags.dir ?? '.';
  const date = new Date().toISOString().slice(0, 10);
  syncFactsFromDossier(dir);

  // A push that failed last night happened while nobody was watching. Say it
  // now, before anything else: the user has been believing they would hear
  // about regressions, and for at least one run they would not have.
  const stale = pendingNotifyError(dir);
  if (stale) {
    soft(`Last run could not reach ${stale.channel} (${stale.error}) — you were not notified on ${stale.at.slice(0, 10)}.`,
      `上次没能推送到 ${stale.channel}（${stale.error}）—— ${stale.at.slice(0, 10)} 那次你没有收到通知。`);
  }
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
  if (providers.length) {
    say(`Asking ${providers.length} AI engines ${jobs.length} questions about you.`,
      `我在替你问 ${providers.length} 个 AI 引擎，共 ${jobs.length} 个问题。`);
  } else {
    soft(`No engine keys configured — skipping sampling, the site audit still runs.`,
      `没配任何引擎 Key —— 跳过采样，网站体检照跑。`);
  }
  if (!NARRATE) console.log(`[1/5] sampling ${providers.map(p => p.id).join(',') || '(no keys, skipped)'} × ${jobs.length} questions…`);
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
  if (failed.length) {
    soft(`${failed.length} answers didn't come back — going on with ${samples.length}.`,
      `${failed.length} 个回答没拿到 —— 用剩下的 ${samples.length} 个接着算。`);
  }
  // Never clobber an earlier same-day run with an empty file: a rerun where
  // every sample failed (keys/network down) must not destroy the day's data.
  if (samples.length) {
    writeFileSync(`${dir}/samples-${date}.jsonl`, samples.map(s => JSON.stringify(s)).join('\n') + '\n');
  } else if (existsSync(`${dir}/samples-${date}.jsonl`)) {
    console.log(`  0 samples this run — keeping existing samples-${date}.jsonl untouched`);
  }

  // 2. 指标（可选 judge）
  say(`Working out what those answers mean.`, `我在算这些回答说明了什么。`);
  let judge;
  let sentimentJudge;
  // The judge decides the flagship question — does this engine know you, or has
  // it confused you with someone else. Leaving it off by default made `start`,
  // the one command we tell everyone to run, return 'unverified' for 10 of 12
  // probes on a real run. If an engine is configured we already have everything
  // needed, so the default is on and the fallback is stated rather than silent.
  const judgeId = flags.judge || configuredProviders()[0]?.id;
  if (judgeId) {
    const jp = resolveProvider(judgeId);
    const askJudge = async prompt => (await ask(jp, { question: prompt, maxTokens: 500, temperature: 0, timeoutMs: 300_000 })).answer;
    judge = makeLlmJudge(askJudge);
    sentimentJudge = makeSentimentJudge(askJudge);
    if (!flags.judge) {
      say(`Using ${jp.name} to judge whether each engine knows you (--judge picks a different one).`,
        `用 ${jp.name} 来判定每个引擎到底认不认识你（想换用 --judge 指定）。`);
    }
  } else {
    say(`No engine configured, so "does AI know you" cannot be decided this run — it will read 'unverified', not zero.`,
      `没有配置任何引擎，所以这一轮判不了「AI 到底认不认识你」—— 它会显示「未判定」，不是 0。`);
  }
  const metricsReport = samples.length
    ? await computeMetrics(samples, brand, { judge, sentimentJudge, brandDescription: brand.description })
    : undefined;
  if (metricsReport) narrateFindings(metricsReport, Boolean(judge));

  // 3. 体检
  say(`Now looking at your site the way an AI crawler does.`,
    `我在用 AI 爬虫的眼睛看你的网站。`);
  if (!NARRATE) console.log(`[3/5] auditing ${urls.length} pages…`);
  const auditReport = await auditSite(root, urls);
  if (NARRATE) narrateAudit(auditReport);

  // 4. 存期 + 验收
  mkdirSync(`${dir}/history`, { recursive: true });
  if (metricsReport) writeFileSync(`${dir}/history/${date}-metrics.json`, JSON.stringify(metricsReport, null, 2));
  if (samples.length) writeFileSync(`${dir}/history/${date}-samples.json`, JSON.stringify(samples, null, 2));
  writeFileSync(`${dir}/history/${date}-audit.json`, JSON.stringify(auditReport, null, 2));
  let tickets;
  let verified;
  try { tickets = JSON.parse(readFileSync(`${dir}/tickets.json`, 'utf8')); } catch { /* 首期 */ }
  if (tickets) {
    const summary = verifyTickets(tickets, { audit: auditReport, metrics: metricsReport }, LANG);
    verified = {
      pass: summary.counts.pass,
      fail: summary.counts.fail,
      regressed: summary.transitions.filter(x => x.to === 'regressed').length,
    };
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    say(`Re-checking what you fixed since last time.`, `我在复查你上次修的东西。`);
    step(`${summary.counts.pass} verified done · ${summary.counts.fail} still open · ${summary.counts.unmeasurable} not measurable`,
      `${summary.counts.pass} 条验收通过 · ${summary.counts.fail} 条还没好 · ${summary.counts.unmeasurable} 条测不了`);
    for (const tr of summary.transitions) {
      step(`${tr.ticketId}: ${tr.from} → ${tr.to}`, `${tr.ticketId}：${tr.from} → ${tr.to}`);
    }
  } else {
    tickets = generateTickets(auditReport, metricsReport, LANG);
    writeFileSync(`${dir}/tickets.json`, JSON.stringify(tickets, null, 2));
    const p0 = tickets.filter(x => x.priority === 'P0').length;
    say(`Turning all of that into a fix list.`, `我在把这些变成一张修复清单。`);
    step(`${tickets.length} items, ${p0} of them P0 — each says what "done" has to look like.`,
      `${tickets.length} 条，其中 ${p0} 条 P0 —— 每条都写明了「修到什么程度算好」。`);
  }

  // 5. 报告 + 趋势（期对比进报告本体）
  const periods = loadPeriods(`${dir}/history`);
  const trend = periods.length >= 2 ? computeTrends(periods, LANG) : undefined;
  const html = renderHtmlReport({
    brandName: brand.name, audit: auditReport, metrics: metricsReport, tickets,
    samples, brandAliases: brand.aliases, trend, lang: LANG,
  });
  writeFileSync(`${dir}/report-${date}.html`, html);

  // A scheduled run that leaves only a 400KB HTML file has not delivered
  // anything — somebody still has to remember to go and open it. today.md is
  // the thing that can be read in thirty seconds, and the payload a push
  // notification will carry.
  const ranked = rankTickets(tickets);
  const digest = renderTodayDigest({
    brandName: brand.name, date, metrics: metricsReport, audit: auditReport,
    today: ranked.today, verified, periodCount: periods.length, lang: LANG,
  });
  writeFileSync(`${dir}/today.md`, digest);
  step(`Today's three: ${dir}/today.md`, `今天该做的三件：${dir}/today.md`);

  const channel = flags.notify ?? process.env.FASTERGEO_NOTIFY;
  if (channel && channel !== 'none') {
    const r = await notify(dir, channel, digest, { brand: brand.name, date, root });
    if (r.sent) step(`Sent to ${channel}.`, `已推送到 ${channel}。`);
    else {
      soft(`Could not send to ${channel}: ${r.error}`, `推送到 ${channel} 失败：${r.error}`);
      soft(`The digest is still on disk, and I'll tell you again next run until it works.`,
        `摘要还在磁盘上，下次运行我会再说一遍，直到它发出去为止。`);
    }
  }

  if (NARRATE) {
    step(`Report saved: ${dir}/report-${date}.html`, `报告已生成：${dir}/report-${date}.html`);
  } else {
    console.log(`[5/5] report → ${dir}/report-${date}.html · ${periods.length} period(s) in history`);
  }
  for (const a of trend?.alerts ?? []) {
    step(`${a.level === 'P0' ? '🔴' : '⚠'} ${a.message}`, `${a.level === 'P0' ? '🔴' : '⚠'} ${a.message}`);
  }
  if (!NARRATE) console.log('period complete.');
  return { metrics: metricsReport, audit: auditReport, tickets, dir, date };
}

/** schedule：生成周期复跑的定时任务配置（不自动安装）。 */
const xml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function jobLabel(abs) { return `co.fastergeo.cycle.${basename(abs)}`; }
function plistPath(label) { return `${process.env.HOME}/Library/LaunchAgents/${label}.plist`; }

/**
 * Environment a launchd job needs and does not inherit.
 *
 * A LaunchAgent starts with a near-empty environment: no shell profile, no
 * proxy, no API keys. Both failures are silent — the job runs, samples nothing,
 * and writes a period of zeroes that look like a real measurement. So the
 * values are captured at hire time and written into the job.
 *
 * The plist therefore holds secrets and is written 0600. Stated out loud on
 * install rather than buried, because a key in a file the user didn't know
 * about is a security problem regardless of its permissions.
 */
function jobEnv(channel) {
  const env = {};
  for (const k of channelEnvKeys(channel)) {
    if (process.env[k]) env[k] = process.env[k];
  }
  if (channel && channel !== 'none') env.FASTERGEO_NOTIFY = channel;
  for (const k of ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  for (const spec of Object.values(PROVIDERS)) {
    if (spec.keyEnv && process.env[spec.keyEnv]) env[spec.keyEnv] = process.env[spec.keyEnv];
  }
  if (LANG === 'zh') env.FASTERGEO_LANG = 'zh';
  return env;
}

/** Indented for terminal output. The text itself lives in one place only. */
function contractBlock() {
  return dailyContract(LANG, flags.at ?? '09:00').split('\n').map(l => '  ' + l).join('\n');
}

async function cmdHire() {
  const dir = flags.dir ?? '.';
  const abs = resolvePath(dir);
  const [hh, mm] = (flags.at ?? '09:00').split(':').map(n => parseInt(n, 10));
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 23 || mm > 59) {
    console.error('fastergeo hire: --at takes HH:MM, e.g. --at 09:00');
    process.exit(1);
  }
  if (!existsSync(`${abs}/brand.json`)) {
    console.error(t(`No project at ${abs} — run: fastergeo start <your site>`,
      `${abs} 下没有项目 —— 先跑：fastergeo start <你的网址>`));
    process.exit(1);
  }
  NARRATE = true;
  const node = process.execPath;
  const cli = new URL(import.meta.url).pathname;
  const label = jobLabel(abs);
  const channel = flags.notify ?? 'none';
  const env = jobEnv(channel);
  // A job hired to notify, with no credentials to notify with, would run every
  // morning and reach nobody. Better to refuse now than to be silent daily.
  const missing = channelEnvKeys(channel)
    .filter(k => !/SECRET$/.test(k))
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(t(`--notify ${channel} needs ${missing.join(' and ')} in your environment. Set them, then run hire again.`,
      `--notify ${channel} 需要环境变量 ${missing.join(' 和 ')}。设好再跑一次 hire。`));
    process.exit(1);
  }

  // Logs go to Library, never inside the project. A LaunchAgent whose log path
  // sits under ~/Desktop can hit a state where launchd cannot reopen the file
  // and aborts the spawn with exit 78, writing nothing — a crash loop that is
  // invisible precisely because the log is frozen. Learned the expensive way.
  const logDir = `${process.env.HOME}/Library/Application Support/fastergeo/logs`;
  mkdirSync(logDir, { recursive: true });
  const log = `${logDir}/${label}.log`;

  if (process.platform !== 'darwin') {
    const exports = Object.entries(env).map(([k, v]) => `${k}='${v}'`).join(' ');
    console.log(t(`Not macOS — add this line with \`crontab -e\`:\n\n  0 ${mm} ${hh} * * * ${exports} ${node} ${cli} cycle --dir ${abs} >> ${log} 2>&1\n`,
      `不是 macOS —— 用 \`crontab -e\` 加这一行：\n\n  ${mm} ${hh} * * * ${exports} ${node} ${cli} cycle --dir ${abs} >> ${log} 2>&1\n`));
    return;
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(node)}</string><string>${xml(cli)}</string>
    <string>cycle</string><string>--dir</string><string>${xml(abs)}</string>
  </array>
  <key>EnvironmentVariables</key><dict>
${Object.entries(env).map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`).join('\n')}
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hh}</integer><key>Minute</key><integer>${mm}</integer></dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>`;

  const path = plistPath(label);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, plist, { mode: 0o600 });

  const { execFileSync } = await import('node:child_process');
  const uid = process.getuid();
  const run = (args, quiet = true) => {
    try { execFileSync('launchctl', args, { stdio: quiet ? 'ignore' : 'inherit' }); return true; }
    catch { return false; }
  };
  run(['bootout', `gui/${uid}/${label}`]);
  const ok = run(['bootstrap', `gui/${uid}`, path]) || run(['load', '-w', path]);

  say(t(`Hired. I'll run every day at ${flags.at ?? '09:00'}.`,
    `雇好了。我每天 ${flags.at ?? '09:00'} 跑一次。`));
  console.log('\n' + contractBlock() + '\n');
  const keyed = Object.keys(env).filter(k => /API_KEY|TOKEN|SECRET/i.test(k)).length;
  step(t(`Job: ${label}`, `任务名：${label}`));
  step(t(`Log:  ${log}`, `日志：${log}`));
  step(t(`Carried ${keyed} engine key(s) and ${Object.keys(env).length - keyed} other variable(s) into the job — a scheduled job inherits no shell environment.`,
    `把 ${keyed} 个引擎 Key 和 ${Object.keys(env).length - keyed} 个其它变量写进了任务 —— 定时任务不继承你的 shell 环境。`));
  if (channel !== 'none') {
    step(t(`Each morning's digest goes to ${channel}. If a send fails I'll say so on the next run rather than going quiet.`,
      `每天早上的摘要推送到 ${channel}。推送失败的话，我会在下一次运行时说出来，不会闷着。`));
  } else {
    soft(t(`No notification channel — the digest lands in ${basename(abs)}/today.md and waits for you. Add --notify telegram to have it come to you.`,
      `没配推送 —— 摘要写在 ${basename(abs)}/today.md 里等你。加 --notify telegram 可以让它主动找你。`));
  }
  if (keyed) {
    soft(t(`Those keys now sit in ${path} (permissions 0600). Run \`fastergeo fire\` to remove it.`,
      `这些 Key 现在在 ${path} 里（权限 0600）。跑 \`fastergeo fire\` 可以删掉。`));
  }
  if (!ok) {
    soft(t(`Could not load the job automatically. Load it by hand:\n    launchctl bootstrap gui/${uid} ${path}`,
      `没能自动加载。手动加载：\n    launchctl bootstrap gui/${uid} ${path}`));
  }
  say(t(`Nothing else to do — check the workbench tomorrow: fastergeo ui --dir ${basename(abs)}`,
    `不用做别的了 —— 明天打开工作台看：fastergeo ui --dir ${basename(abs)}`));
}

async function cmdFire() {
  const abs = resolvePath(flags.dir ?? '.');
  const label = jobLabel(abs);
  const path = plistPath(label);
  NARRATE = true;
  if (process.platform === 'darwin') {
    const { execFileSync } = await import('node:child_process');
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' }); } catch { /* not loaded */ }
  }
  if (existsSync(path)) {
    rmSync(path);
    say(t(`Done — I've stopped, and the keys that were in the job are gone with it.`,
      `好了 —— 我停了，任务里那些 Key 也跟着删掉了。`));
  } else {
    say(t(`Nothing to remove — no job was installed for ${basename(abs)}.`,
      `没什么可删的 —— ${basename(abs)} 没装过定时任务。`));
  }
  step(t(`Your data stays where it is. Run \`fastergeo hire\` any time to start again.`,
    `你的数据原样不动。想再开随时跑 \`fastergeo hire\`。`));
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

  ▸ 第一次用，只需要这一条：
      fastergeo start yoursite.com

  起步     start      一条命令：建档案 → 问 AI → 体检 → 清单 → 打开工作台
           bootstrap  从官网一键推导品牌/事实/问题库
  诊断     check      引擎 Key 健康检查
           audit      六维体检（AI 爬虫视角，无需 Key）
  采样     sample     API 采样 · sheet/import 人工采样表（零 Key）
  指标     metrics    漏斗指标 + LLM 认知裁判（--judge）
           trends     期对比与趋势判定（--history）
  闭环     plan       诊断 → 带验收标准的工单
           verify     重抓自动验收，回归自动打回
  内容     outline/draft/fabcheck  事实约束生成 + 编造门禁
  运营     cycle      一条命令跑完整一期
           hire       雇它每天自动跑（装定时任务）· fire 卸载
                      --notify telegram|webhook 让摘要主动找你
  界面     ui         本地看板 · report 单文件诊断报告

  全局: --lang zh 切换中文输出。数据全在本机。` : `fastergeo — open-source GEO platform (China + global AI engines)

  ▸ First time? This is the only command you need:
      fastergeo start yoursite.com

  start    start      one command: profile → ask the AIs → audit → fix list → workbench
           bootstrap  derive brand facts / competitors / questions from a URL
  diagnose check      engine key health checks
           audit      six-dimension audit (AI-crawler view, no keys needed)
  sample   sample     API sampling · sheet/import manual sheets (zero keys)
  measure  metrics    funnel metrics + LLM recognition judge (--judge)
           trends     period deltas with the two-period discipline (--history)
  loop     plan       diagnosis → tickets with machine-verifiable acceptance
           verify     re-crawl auto-verification; regressions flip back
  content  outline/draft/fabcheck  facts-constrained generation + fabrication gate
  operate  cycle      one command runs a full period
           hire       have it run every day (installs a scheduled job) · fire removes it
                      --notify telegram|webhook to have the digest come to you
  view     ui         local dashboard · report one-file diagnosis report

  global: --lang zh for Chinese output. All data stays on your machine.`);
  process.exit(command ? 1 : 0);
}
run().catch(err => {
  console.error('fastergeo failed:', err.message ?? err);
  process.exit(1);
});
