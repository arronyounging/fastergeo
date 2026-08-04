#!/usr/bin/env node
/**
 * FasterGEO bench — effect measurement against golden corpora.
 *
 * Unit tests prove the code runs as designed; this proves the design
 * reaches correct conclusions. Every polish PR must attach before/after
 * numbers from here (bench/HISTORY.md).
 *
 *   node bench/run.mjs recognition [--judge glm] [--repeat N] [--limit N]
 *
 * Keyless: heuristic layer only. With --judge: full pipeline via that
 * engine (${KEY} env conventions, same as the CLI).
 */

import { readFileSync } from 'node:fs';
import { classifyRecognition, makeLlmJudge } from '../packages/metrics/dist/index.js';
import { resolveProvider, ask } from '../packages/providers/dist/index.js';

const args = process.argv.slice(2);
const suite = args[0] ?? 'recognition';
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const judgeId = flag('judge');
const repeat = Number(flag('repeat') ?? 1);
const limit = Number(flag('limit') ?? Infinity);

const norm = (s) => s.replace(/\s+/g, '');

function loadGolden() {
  return readFileSync(new URL('./answers/golden.jsonl', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, limit);
}

function prf(cases, results, cls) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < cases.length; i++) {
    const gold = cases[i].label, got = results[i];
    if (got === cls && gold === cls) tp++;
    else if (got === cls && gold !== cls) fp++;
    else if (got !== cls && gold === cls) fn++;
  }
  const p = tp + fp ? tp / (tp + fp) : null;
  const r = tp + fn ? tp / (tp + fn) : null;
  return { tp, fp, fn, p, r };
}

async function runRecognition() {
  const cases = loadGolden();
  let judge;
  if (judgeId) {
    const jp = resolveProvider(judgeId);
    judge = makeLlmJudge(async (prompt) =>
      (await ask(jp, { question: prompt, maxTokens: 500, temperature: 0 })).answer);
    console.log(`judge: ${judgeId} (${jp.resolvedModel ?? jp.model}) · repeat ${repeat} · cases ${cases.length}\n`);
  } else {
    console.log(`heuristic-only (no judge) · cases ${cases.length}\n`);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const runs = [];
  for (let rep = 0; rep < repeat; rep++) {
    const results = [];
    for (const c of cases) {
      let r = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          r = await classifyRecognition(c.answer, c.brand, {
            brandDescription: c.brandDescription, judge,
          });
          break;
        } catch {
          await sleep(1500 * (attempt + 1));
        }
      }
      // A transient network failure must not abort the whole bench, and must
      // not be scored as a verdict either — recorded as 'error', counts as a
      // miss against every class.
      results.push(r ?? { verdict: 'error', method: 'judge' });
      process.stdout.write(r ? '.' : 'x');
    }
    process.stdout.write('\n');
    runs.push(results);
  }

  const verdicts = runs[0].map((r) => r.verdict);

  // headline numbers
  const total = cases.length;
  const agree = verdicts.filter((v, i) => v === cases[i].label).length;
  console.log(`\noverall agreement: ${agree}/${total} = ${(agree / total * 100).toFixed(1)}%`);

  for (const cls of ['confused', 'knows', 'unknown', 'unverified']) {
    const { tp, fp, fn, p, r } = prf(cases, verdicts, cls);
    console.log(`  ${cls.padEnd(10)} P=${p === null ? ' n/a' : (p * 100).toFixed(0).padStart(3) + '%'} R=${r === null ? ' n/a' : (r * 100).toFixed(0).padStart(3) + '%'}  (tp ${tp} fp ${fp} fn ${fn})`);
  }

  // confusion matrix rows=gold cols=got
  const classes = ['knows', 'unknown', 'confused', 'unverified'];
  console.log('\nconfusion matrix (rows=gold, cols=predicted)');
  console.log('            ' + classes.map((c) => c.slice(0, 6).padStart(7)).join(''));
  for (const g of classes) {
    const row = classes.map((got) =>
      cases.filter((c, i) => c.label === g && verdicts[i] === got).length);
    console.log(`  ${g.padEnd(10)}` + row.map((n) => String(n).padStart(7)).join(''));
  }

  // misclassified list
  const misses = cases.map((c, i) => ({ c, got: verdicts[i] })).filter((x) => x.got !== x.c.label);
  if (misses.length) {
    console.log('\nmisses:');
    for (const { c, got } of misses) {
      console.log(`  ${c.id.padEnd(22)} gold=${c.label.padEnd(10)} got=${got.padEnd(10)} ${c.note ?? ''}`);
    }
  }

  // evidence fidelity: confused predictions whose evidence appears verbatim (whitespace-normalized)
  const confusedPreds = runs[0].map((r, i) => ({ r, c: cases[i] })).filter((x) => x.r.verdict === 'confused');
  if (confusedPreds.length) {
    const located = confusedPreds.filter((x) => x.r.evidence && norm(x.c.answer).includes(norm(x.r.evidence))).length;
    console.log(`\nevidence verbatim-located: ${located}/${confusedPreds.length}`);
  }

  // consistency across repeats
  if (repeat > 1) {
    let stable = 0;
    for (let i = 0; i < cases.length; i++) {
      const set = new Set(runs.map((run) => run[i].verdict));
      if (set.size === 1) stable++;
    }
    console.log(`consistency: ${stable}/${total} cases unanimous across ${repeat} runs = ${(stable / total * 100).toFixed(1)}%`);
  }

  // method split
  const byMethod = { heuristic: 0, judge: 0 };
  for (const r of runs[0]) byMethod[r.method]++;
  console.log(`resolved by: heuristic ${byMethod.heuristic} · judge ${byMethod.judge}`);
}

async function runMatching() {
  const { mentions, matchRanges } = await import('../packages/metrics/dist/index.js');
  const cases = readFileSync(new URL('./matching/golden.jsonl', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, limit);
  console.log(`matching golden · ${cases.length} cases\n`);

  let tp = 0, fp = 0, fn = 0, tn = 0;
  const misses = [];
  for (const c of cases) {
    const got = mentions(c.text, c.names);
    const ranges = matchRanges(c.text, c.names);
    let ok = got === c.expectMatch;
    let why = '';
    if (ok && c.expectCount !== undefined && ranges.length !== c.expectCount) {
      ok = false; why = `count ${ranges.length}≠${c.expectCount}`;
    }
    if (ok && c.expectedMatched) {
      const hit = ranges.some((r) => c.text.slice(r.start, r.end) === c.expectedMatched);
      if (!hit) { ok = false; why = `range slice ≠ "${c.expectedMatched}"`; }
    }
    if (c.expectMatch && got) tp++;
    else if (!c.expectMatch && got) fp++;
    else if (c.expectMatch && !got) fn++;
    else tn++;
    if (!ok) misses.push({ c, got, why });
  }
  const p = tp + fp ? tp / (tp + fp) : null;
  const r = tp + fn ? tp / (tp + fn) : null;
  console.log(`mention precision: ${(p * 100).toFixed(1)}%  recall: ${(r * 100).toFixed(1)}%  (tp ${tp} fp ${fp} fn ${fn} tn ${tn})`);
  console.log(`case-level pass (incl. count/range assertions): ${cases.length - misses.length}/${cases.length}`);
  if (misses.length) {
    console.log('\nmisses:');
    for (const { c, got, why } of misses) {
      console.log(`  ${c.id}  expect=${c.expectMatch} got=${got} ${why}  · ${c.note}`);
      console.log(`      "${c.text}" names=${JSON.stringify(c.names)}`);
    }
  }
}

async function runPages() {
  const { gunzipSync } = await import('node:zlib');
  const { extractFeatures, detectBlocks, scorePage } = await import('../packages/audit/dist/index.js');
  const labels = JSON.parse(readFileSync(new URL('./pages/labels.json', import.meta.url), 'utf8')).slice(0, limit);
  const fuzzN = Number(flag('fuzz') ?? 0);
  console.log(`pages golden · ${labels.length} snapshots${fuzzN ? ` · fuzz ${fuzzN}` : ''}\n`);

  const audit = (id, status, html) => {
    const f = extractFeatures(`https://bench.local/${id}`, status, html);
    const blocks = detectBlocks(f);
    const earlyBlocks = detectBlocks({ ...f, text: f.text.slice(0, Math.ceil(f.text.length * 0.3)) });
    return scorePage(f, blocks, undefined, { earlyBlocks });
  };

  let pass = 0;
  const misses = [];
  const htmls = new Map();
  for (const L of labels) {
    const html = gunzipSync(readFileSync(new URL(`./pages/snapshots/${L.file}`, import.meta.url))).toString('utf8');
    htmls.set(L.id, { html, status: L.status });
    let page;
    try {
      page = audit(L.id, L.status, html);
    } catch (err) {
      misses.push({ id: L.id, why: `CRASH: ${err.message}` });
      continue;
    }
    const issues = new Set(page.dimensions.flatMap((d) => d.issues));
    const problems = [];
    const hasBlocker = page.blockers.length > 0;
    if (L.blocker !== hasBlocker) problems.push(`blocker expect=${L.blocker} got=${hasBlocker} [${page.blockers[0] ?? ''}]`);
    if (L.blocker && L.blockerCode && !page.blockers.some((b) => b.startsWith(L.blockerCode))) {
      problems.push(`blocker code ≠ ${L.blockerCode} [${page.blockers.join(' | ')}]`);
    }
    for (const m of L.mustIssues) if (!issues.has(m)) problems.push(`missing issue ${m}`);
    for (const m of L.mustNotIssues) if (issues.has(m)) problems.push(`false issue ${m}`);
    const order = { A: 4, B: 3, C: 2, D: 1 };
    if (L.gradeAtLeast && order[page.grade] < order[L.gradeAtLeast]) {
      problems.push(`grade ${page.grade} < ${L.gradeAtLeast} (score ${page.score})`);
    }
    if (problems.length) misses.push({ id: L.id, why: problems.join(' · '), note: L.note });
    else pass++;
  }
  console.log(`labels pass: ${pass}/${labels.length}`);
  const blockerCases = labels.filter((l) => l.blocker !== undefined);
  const blockerRight = blockerCases.length - misses.filter((m) => m.why.startsWith('blocker')).length;
  console.log(`blocker accuracy: ${blockerRight}/${blockerCases.length}`);
  if (misses.length) {
    console.log('\nmisses:');
    for (const m of misses) console.log(`  ${m.id.padEnd(22)} ${m.why}${m.note ? `\n${' '.repeat(24)}(${m.note})` : ''}`);
  }

  if (fuzzN > 0) {
    // deterministic LCG so fuzz failures are reproducible
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const ids = [...htmls.keys()];
    const JUNK = ['<div', '</p>', '<<<<', '&#xD800;', ' ', '<script>', '"', '<style>', '<!--', ']]>', '<a href="', '￾', '𝕏'.repeat(50)];
    let crashes = 0;
    for (let i = 0; i < fuzzN; i++) {
      const { html, status } = htmls.get(ids[Math.floor(rnd() * ids.length)]);
      let mut = html;
      const op = Math.floor(rnd() * 4);
      if (op === 0) mut = html.slice(0, Math.floor(rnd() * html.length));            // truncate
      else if (op === 1) {                                                           // splice junk
        const at = Math.floor(rnd() * html.length);
        mut = html.slice(0, at) + JUNK[Math.floor(rnd() * JUNK.length)] + html.slice(at);
      } else if (op === 2) mut = html.replace(/</g, (c) => (rnd() < 0.02 ? '<<' : c)); // tag noise
      else mut = '<div>'.repeat(5000) + html.slice(0, 2000) + '<p>' + 'x'.repeat(100000); // nesting+huge
      try {
        audit('fuzz', status, mut);
      } catch (err) {
        crashes++;
        if (crashes <= 3) console.log(`fuzz crash #${crashes} (iter ${i}, op ${op}): ${err.message}`);
      }
    }
    console.log(`\nfuzz: ${fuzzN - crashes}/${fuzzN} survived${crashes ? ` — ${crashes} CRASHES` : ''}`);
  }
}

async function runEngines() {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const providersArg = flag('providers');
  if (!providersArg) { console.error('usage: run.mjs engines --providers glm,deepseek [--reps 10]'); process.exit(1); }
  const reps = Number(flag('reps') ?? 10);
  const date = flag('date') ?? 'run';
  const questions = JSON.parse(readFileSync(new URL('./engines/questions.json', import.meta.url), 'utf8'));

  for (const id of providersArg.split(',')) {
    const p = resolveProvider(id);
    const qs = questions.filter((q) => q.market === p.market);
    console.log(`\n── ${id} (${p.resolvedModel ?? p.model} · ${p.gatewayRouted ? 'gateway' : 'api'}) · ${qs.length} questions × ${reps} reps ──`);
    const rows = [];
    for (const q of qs) {
      for (let r = 0; r < reps; r++) {
        const t0 = Date.now();
        try {
          const res = await ask(p, { question: q.text, questionId: q.id });
          rows.push({ q: q.id, intent: q.intent, ok: true, ms: Date.now() - t0,
            chars: res.answer.length, cites: res.citations.length, model: res.model, channel: res.channel });
          process.stdout.write('.');
        } catch (err) {
          rows.push({ q: q.id, intent: q.intent, ok: false, ms: Date.now() - t0,
            kind: err?.kind ?? 'unknown', status: err?.status, msg: String(err?.message ?? err).slice(0, 120) });
          process.stdout.write('x');
        }
      }
    }
    console.log('');
    const oks = rows.filter((r) => r.ok);
    const lat = oks.map((r) => r.ms).sort((a, b) => a - b);
    const pct = (arr, p2) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p2))] : null;
    const cited = oks.filter((r) => r.cites > 0);
    const models = [...new Set(oks.map((r) => r.model))];
    const fails = rows.filter((r) => !r.ok);
    console.log(`success ${oks.length}/${rows.length} = ${(oks.length / rows.length * 100).toFixed(1)}%`);
    console.log(`latency p50 ${pct(lat, .5)}ms · p95 ${pct(lat, .95)}ms · answer chars mean ${Math.round(oks.reduce((a, r) => a + r.chars, 0) / (oks.length || 1))}`);
    console.log(`citation rate ${(cited.length / (oks.length || 1) * 100).toFixed(0)}% (${cited.length}/${oks.length}) · mean cites ${(oks.reduce((a, r) => a + r.cites, 0) / (oks.length || 1)).toFixed(1)}`);
    const byIntent = {};
    for (const r of oks) { (byIntent[r.intent] ??= { n: 0, c: 0 }); byIntent[r.intent].n++; if (r.cites > 0) byIntent[r.intent].c++; }
    console.log('citation by intent: ' + Object.entries(byIntent).map(([k, v]) => `${k} ${v.c}/${v.n}`).join(' · '));
    console.log(`models seen: ${models.join(', ')}`);
    if (fails.length) console.log(`failures: ${fails.map((f) => `${f.kind}${f.status ? ':' + f.status : ''}`).join(', ')}`);
    mkdirSync(new URL('./engines/runs/', import.meta.url), { recursive: true });
    writeFileSync(new URL(`./engines/runs/${date}-${id}.json`, import.meta.url), JSON.stringify(rows, null, 1));
  }
}

async function runPool(jobs, width) {
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) { const job = jobs[i++]; await job(); }
  };
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
}

async function runTickets() {
  const { generateTickets } = await import('../packages/tickets/dist/index.js');
  // Fixture engineered to trigger EVERY ticket source: all issue codes,
  // site-level checks, confusion+entity, low mention + citation sources.
  const audit = {
    root: 'https://acme-widgets.com', generatedAt: '',
    site: { robotsTxtFound: true, blockedAiCrawlers: ['OAI-SearchBot'], blockedSearchCrawlers: ['OAI-SearchBot'], blockedTrainingCrawlers: [], sitemapFound: false, llmsTxtFound: false },
    entity: { organizationSchema: false, sameAsCount: 0 },
    failedUrls: [], avgScore: 42, gradeDistribution: { A: 0, B: 1, C: 2, D: 3 },
    blockers: [],
    pages: [
      { url: 'https://acme-widgets.com/pricing', score: 20, grade: 'D', wordCount: 30, blocks: {}, blockers: ['spa-shell: x'],
        dimensions: [
          { key: 'crawlability', score: 4, max: 15, issues: ['spa-shell'] },
          { key: 'structure', score: 5, max: 20, issues: ['no-h1', 'answer-below-fold', 'context-dependent-paragraphs'] },
          { key: 'blocks', score: 0, max: 25, issues: ['block-gap:definition', 'block-gap:statistics', 'block-gap:comparison', 'block-gap:steps', 'block-gap:faq'] },
          { key: 'authority', score: 2, max: 15, issues: ['no-jsonld', 'no-date', 'stale-content'] },
          { key: 'length', score: 3, max: 15, issues: ['content-short'] },
        ] },
      { url: 'https://acme-widgets.com/blog/guide', score: 55, grade: 'C', wordCount: 80, blocks: {}, blockers: [],
        dimensions: [{ key: 'crawlability', score: 8, max: 15, issues: ['thin-text'] }] },
    ],
  };
  const metrics = {
    generatedAt: '', brand: 'ExBrand', totalSamples: 20,
    platforms: [{ providerId: 'doubao', market: 'cn', samples: 10, mentionRate: 0.1, top1Rate: 0, top3Rate: 0,
      avgRank: null, earlyMentionRate: null, shareOfVoice: 0.1, ownDomainCiteRate: 0, citationShare: null,
      competitorMentions: {}, sentiment: null,
      probe: { samples: 2, recognition: { knows: 0, unknown: 0, confused: 1, unverified: 1 }, confusedEvidence: ['把品牌说成汽车配件厂'] } }],
    citationSources: [
      { market: 'cn', domain: 'zhihu.com', citations: 8, samples: 5, engines: ['doubao'], own: false },
      { market: 'cn', domain: 'csdn.net', citations: 3, samples: 2, engines: ['doubao'], own: false },
    ],
  };
  const lang = flag('lang') === 'zh' ? 'zh' : 'en';
  const tickets = generateTickets(audit, metrics, lang);
  if (flag('nohints')) {
    // Ablation: same fixture, same judge, same rubric — hints stripped.
    for (const t of tickets) { delete t.fixHint; delete t.pages; }
    console.log('(ablation: fixHint/pages stripped)');
  }
  console.log(`tickets generated: ${tickets.length} (lang=${lang})\n`);

  if (!judgeId) {
    for (const t of tickets) console.log(`${t.priority} ${t.id} ${t.title}\n   hint: ${t.fixHint ? t.fixHint.slice(0, 90) + '…' : '(none)'}`);
    console.log('\n(no --judge: listing only; executability scoring needs a judge)');
    return;
  }
  const jp = resolveProvider(judgeId);
  const allTitles = tickets.map((t) => `${t.id} ${t.title}`).join('\n');
  const scores = [];
  const jobs = [];
  for (const t of tickets) {
    const text = [`标题: ${t.title}`, `理由: ${t.rationale}`,
      t.pages ? `受影响页面: ${t.pages.join(', ')}` : '',
      `验收: ${t.acceptance.desc}`,
      t.fixHint ? `修复指引: ${t.fixHint}` : '（无修复指引）'].filter(Boolean).join('\n');
    const prompt = [
      '角色设定：你是某公司网站的负责工程师，不懂 GEO/SEO，但你当然熟悉自己网站的代码库、',
      '技术栈和品牌信息（这些不算"缺失信息"）。你收到一份工单清单，正在逐条执行。',
      '', '完整工单清单（可交叉引用）：', allTitles, '',
      '当前要评估的工单全文：', text, '',
      '问题：仅凭这条工单提供的信息（加上你对自己网站的了解），你能否不追问出单人、',
      '直接动手做完并自信通过验收？',
      '评分：2=能直接执行（知道改哪、写什么、怎么算完成）；1=需要追问出单人关键细节；0=看不懂要做什么。',
      '"追问"的定义：向出单人索要工单本应提供而没提供的信息。以下都【不算】追问，不扣分：',
      '- 工单要求你自己撰写定义句/FAQ/统计数字/对比表并给了格式示例——写文案、挑数据本来就是执行工作；',
      '- 工单按技术栈给了分支做法（Next.js/Nuxt/WordPress…）——你知道自己网站用什么栈，照自己的分支做；',
      '- 需要打开自己的代码库/报告文件/题集查细节——那些文件都在你手上；',
      '- 日期类信息用当天日期或页面真实日期。',
      '只有这些才算追问/看不懂：不知道该改哪些页面或文件；不知道做成什么样才算通过验收；',
      '修复指引与验收标准对不上；关键名词完全无法理解。',
      '只输出 JSON：{"score":0|1|2,"missing":"若非2分，最缺的一条信息"}',
    ].join('\n');
    jobs.push(async () => {
      try {
        const raw = (await ask(jp, { question: prompt, maxTokens: 600, temperature: 0 })).answer;
        const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        scores.push({ t, score: j.score, missing: j.missing });
        process.stdout.write('.');
      } catch { scores.push({ t, score: -1, missing: 'judge error' }); process.stdout.write('x'); }
    });
  }
  await runPool(jobs, 4);
  console.log('\n');
  const ok = scores.filter((s) => s.score === 2).length;
  const valid = scores.filter((s) => s.score >= 0).length;
  console.log(`executable-without-questions (score 2): ${ok}/${valid} = ${(ok / valid * 100).toFixed(0)}%`);
  console.log(`score distribution: 2×${ok} · 1×${scores.filter((s) => s.score === 1).length} · 0×${scores.filter((s) => s.score === 0).length}`);
  for (const s of scores.filter((x) => x.score < 2)) {
    console.log(`  [${s.score}] ${s.t.id} ${s.t.title.slice(0, 50)} — missing: ${s.missing}`);
  }
}

if (suite === 'recognition') await runRecognition();
else if (suite === 'tickets') await runTickets();
else if (suite === 'engines') await runEngines();
else if (suite === 'matching') await runMatching();
else if (suite === 'pages') await runPages();
else { console.error(`unknown suite: ${suite}`); process.exit(1); }
