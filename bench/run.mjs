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

if (suite === 'recognition') await runRecognition();
else if (suite === 'matching') await runMatching();
else if (suite === 'pages') await runPages();
else { console.error(`unknown suite: ${suite}`); process.exit(1); }
