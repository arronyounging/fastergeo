/**
 * The weekly re-ask: when is "AI changed its mind" allowed to be said?
 * Stubbed engine, so every branch is exercised without spending a call.
 *   node scripts/check-reprobe.mjs
 */
import { reprobe } from '../functions/api/_reprobe.js';
import { letterKind, composeLetter } from '../functions/api/_mail.js';

const fail = m => { console.error(`✗ ${m}`); process.exit(1); };
const ON = { SWEEP_PROBE: '1', OPENROUTER_API_KEY: 'k' };
const base = v => ({ url: 'https://custyle.ai/', lang: 'zh', probe: { brand: 'Custyle', verdict: v, question: 'Custyle 是一家什么公司？' } });
const engine = (...vs) => {
  const seen = [];
  const ask = async o => { seen.push(o); const v = vs.shift(); return v instanceof Error ? { error: v.message } : {
    brand: o.brand, question: 'Custyle 是一家什么公司？', answer: `答案 ${v}`, verdict: v, evidence: v === 'confused' ? 'Custyle 是一家汽车配件品牌' : '' }; };
  return { ask, seen, fetch: async () => ({ title: 't' }) };
};

let p = base('confused'); let e = engine('knows', 'knows', 'knows');
let r = await reprobe(p, {}, e);
if (r.asked || e.seen.length) fail('off by default: no SWEEP_PROBE, no call');

r = await reprobe(p, ON, e);
if (r.kind !== 'fixed' || p.probe.verdict !== 'knows' || e.seen.length !== 3) fail(`confused→knows three times should be news: ${JSON.stringify(r)}`);
if (e.seen.some(o => o.brand !== 'Custyle')) fail('re-ask must reuse the stored brand, not re-derive it');
if (!r.line.zh.includes('AI 改口了')) fail('line wording');
console.log('✓ confused → knows, held three asks in a row, is reported with the stored question');

e = engine('confused', 'confused', 'confused'); r = await reprobe(p, ON, { ...e, now: Date.now() + 3 * 86400e3 });
if (r.asked || e.seen.length) fail('asked again inside the week');
r = await reprobe(p, ON, { ...e, now: Date.now() + 8 * 86400e3 });
if (r.kind !== 'broke' || !r.line.zh.includes('汽车配件')) fail('knows→confused should carry the quoted evidence');
console.log('✓ at most once a week; knows → confused carries the verbatim evidence');

p = base('knows'); e = engine('confused', 'confused', 'knows');
r = await reprobe(p, ON, e);
if (r.line || p.probe.verdict !== 'knows' || r.reason !== 'did not hold on repeat asks') fail('a flip that does not repeat must be nothing');
p = base('knows'); e = engine('unverified');
r = await reprobe(p, ON, e);
if (r.line || e.seen.length !== 1) fail('unverified is not a position');
p = base('knows'); e = engine(new Error('openrouter 402'));
r = await reprobe(p, ON, e);
if (r.line || r.reason !== 'outage' || p.probe.verdict !== 'knows') fail('an outage says nothing about the brand');
p = base('unverified'); e = engine('knows', 'knows', 'knows');
r = await reprobe(p, ON, e);
if (r.asked) fail('no firm baseline, nothing to compare against');
console.log('✓ a flip that fails on the third ask, unverified answers, outages and soft baselines all stay silent');

p = base('confused'); e = engine('unknown', 'unknown', 'unknown'); r = await reprobe(p, ON, e);
if (r.kind !== null || !r.line) fail('confused→unknown: a line, but not a letter');
p = base('knows'); e = engine('unknown', 'unknown', 'unknown'); r = await reprobe(p, ON, e);
if (r.kind !== 'broke') fail('knows→unknown is worth a letter');
console.log('✓ forgetting a wrong answer is a line; forgetting a right one is a letter');

if (letterKind({ reasons: ['ai learned'] }) !== 'fixed' || letterKind({ reasons: ['ai changed'] }) !== null) fail('letter rules for ai reasons');
const L = composeLetter({ id: 'abcdef12', url: 'https://custyle.ai/', lang: 'zh', unsub: 't' },
  { reasons: ['ai learned'], lines: [{ m: 'x' }] }, 'https://fastergeo.co');
if (!/AI 对你的说法变了/.test(L.subject) || /重爬/.test(L.text.split('\n')[0])) fail('an AI-only letter must not claim a re-crawl saw it');
console.log('✓ an AI-only letter says the AI was re-asked, not that a crawler saw it');
