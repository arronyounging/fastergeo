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

if (suite === 'recognition') await runRecognition();
else if (suite === 'matching') await runMatching();
else { console.error(`unknown suite: ${suite}`); process.exit(1); }
