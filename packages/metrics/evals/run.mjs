#!/usr/bin/env node
/**
 * Grade the recognition judge against the answer key.
 *
 *   OPENROUTER_API_KEY=… node packages/metrics/evals/run.mjs
 *   … --model deepseek/deepseek-chat      compare judges
 *   … --case R-003                        one case, for a fix loop
 *
 * Doc 11 Pass 0 called this the prerequisite for everything: without a scale
 * you cannot claim accuracy, and you cannot tell whether a prompt change helped
 * or quietly broke something that used to work.
 *
 * Prints per-case results and a confusion matrix. Exits non-zero on any miss so
 * this can gate a release rather than being a thing someone remembers to run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const MODEL = flag('--model') ?? '~deepseek/deepseek-v4-flash-latest';
const ONLY = flag('--case');
const KEY = process.env.OPENROUTER_API_KEY;

if (!KEY) {
  console.error('OPENROUTER_API_KEY is required.');
  process.exit(2);
}

const suite = JSON.parse(readFileSync(join(HERE, 'recognition.json'), 'utf8'));
const cases = suite.cases.filter(c => !ONLY || c.id === ONLY);

/** Kept verbatim in sync with the judge the product ships. */
function judgePrompt(brand, truth, answer) {
  return `An AI was asked "What kind of company is ${brand}?" and answered:

"""
${answer}
"""

Here is what the company's own website says:

"""
${truth}
"""

Classify the answer. Be strict, and note that these three get fixed in completely different ways — a wrong verdict sends someone to fix the wrong thing:

- "knows": it is describing THIS company. Individual details may be wrong — a
  founding year, a headquarters, a funding number — and it is still "knows".
  Getting a fact wrong about the right company is not mistaken identity.
- "confused": the answer is about a DIFFERENT company. It names another parent
  company, another industry, or another product line as the core of what this
  company does. The identity itself is wrong, not a detail of it.
- "unknown": it cannot find the company, says no well-known company matches, or
  only restates the category with no specifics ("appears to be a data analytics
  company; companies in this space typically…"). Vague agreement is not
  knowledge — if you learned nothing about THIS company, it is unknown.

One more test, for answers that hedge and then guess. If the answer offers the
reader a CHOICE ("it might be A, or it might be B — where did you see it?"), or
invites them to supply more context, it has not identified anyone: that is
"unknown", however confidently each option is phrased. It is "confused" only
when the answer settles on ONE identity and leaves the reader believing it.

Ask yourself: would a reader come away believing this is a different company?
Only then is it confused. If they would come away knowing the right company
with one wrong fact, it is knows. If they would come away knowing nothing
specific, it is unknown.

Reply with JSON only: {"verdict":"knows|confused|unknown","quote":"<the exact sentence that asserts the wrong identity — required for confused, empty otherwise>"}`;
}

const flat = s => String(s ?? '').replace(/[*_`#~]/g, '').replace(/\s+/g, '').toLowerCase();

async function ask(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0, max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      reasoning: { enabled: false },
    }),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const j = await res.json();
  const txt = j?.choices?.[0]?.message?.content?.trim();
  if (!txt) throw new Error(`no content (finish=${j?.choices?.[0]?.finish_reason})`);
  const s = txt.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}

const VERDICTS = ['knows', 'confused', 'unknown'];
const matrix = {};
let pass = 0;
const failures = [];

console.log(`\n  judge: ${MODEL}\n  cases: ${cases.length}\n`);

for (const c of cases) {
  let got = 'ERROR', quote = '', note = '';
  try {
    const r = await ask(judgePrompt(c.brand, c.truth, c.answer));
    got = VERDICTS.includes(r?.verdict) ? r.verdict : 'unverified';
    quote = String(r?.quote ?? '');
    // The product degrades an unquotable confusion to unverified. The eval
    // grades what ships, not what the model said in isolation.
    if (got === 'confused') {
      const q = flat(quote);
      if (!(q.length >= 6 && flat(c.answer).includes(q.slice(0, 60)))) {
        got = 'unverified';
        note = 'quote not locatable → degraded';
      }
    }
  } catch (e) {
    note = String(e.message);
  }

  let ok = got === c.expect;
  if (ok && c.expectQuoteContains && !flat(quote).includes(flat(c.expectQuoteContains))) {
    ok = false;
    note = `quote missing "${c.expectQuoteContains}"`;
  }
  if (ok) pass++; else failures.push({ ...c, got, quote, note });

  matrix[c.expect] = matrix[c.expect] ?? {};
  matrix[c.expect][got] = (matrix[c.expect][got] ?? 0) + 1;

  console.log(`  ${ok ? '✓' : '✗'} ${c.id}  expected ${c.expect.padEnd(9)} got ${got.padEnd(10)} ${note}`);
}

console.log(`\n  ${pass}/${cases.length} correct (${Math.round(pass / cases.length * 100)}%)\n`);
console.log('  confusion matrix — rows expected, columns judged');
const cols = [...new Set(Object.values(matrix).flatMap(r => Object.keys(r)))].sort();
console.log('    ' + ''.padEnd(11) + cols.map(c => c.slice(0, 9).padStart(11)).join(''));
for (const exp of VERDICTS) {
  if (!matrix[exp]) continue;
  console.log('    ' + exp.padEnd(11) + cols.map(c => String(matrix[exp][c] ?? 0).padStart(11)).join(''));
}

if (failures.length) {
  console.log('\n  misses:');
  for (const f of failures) {
    console.log(`\n  ${f.id} — expected ${f.expect}, got ${f.got}${f.note ? ` (${f.note})` : ''}`);
    if (f.note0) console.log(`    ${f.note0}`);
    console.log(`    answer: ${f.answer.replace(/\s+/g, ' ').slice(0, 140)}`);
    if (f.quote) console.log(`    quote:  ${f.quote.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  console.log('');
}
process.exit(failures.length ? 1 : 0);
