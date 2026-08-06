/**
 * Run the whole methodology against one company, a batch at a time.
 *
 * Sixty-nine playbooks at roughly ten seconds each is eleven minutes serial and
 * far past what a Worker will hold a request open for. So this is a re-entrant
 * stage: each call takes the next batch, runs it concurrently, appends the
 * results and hands the stage name back to itself until the queue is empty. The
 * client loop that already drives the pipeline drives this too, which means the
 * terminal fills in as it goes instead of showing a spinner for two minutes.
 *
 * Order matters and is not alphabetical. Strategy runs first, because every
 * other methodology applied before we know what the company is applies itself
 * to a guess; then the tier the funnel says is broken, because work downstream
 * of a break cannot be banked yet.
 */
import PLAYBOOKS from './_playbooks.js';
import { askLlm } from './_llm.js';
import {
  runPrompt, parseRun, order, tierOf, capPriority, summarise, TIERS,
} from '@fastergeo/engine';

/** Concurrency per request. Eight keeps a batch near twelve seconds of wall
 *  clock while leaving headroom for the slowest reply in the group. */
const BATCH = 8;

/** Skills we never run. `product-marketing` produces the context document the
 *  dossier already is, and running it would hand the user a second, competing
 *  source of truth about their own company. */
const SKIP = new Set(['product-marketing', 'memory-management']);

function ground(p) {
  const issues = [];
  for (const pg of p.audit?.pages ?? []) {
    for (const b of pg.blockers ?? []) issues.push(b);
    for (const d of pg.dimensions ?? []) for (const i of d.issues ?? []) issues.push(i);
  }
  const d = p.dossier ?? {};
  return {
    url: p.url,
    lang: p.lang,
    brand: d.brand,
    facts: d.facts?.facts,
    competitors: d.competitorCandidates,
    questions: d.questions,
    audit: {
      avgScore: p.audit?.avgScore,
      pages: (p.audit?.pages ?? []).length,
      issues: [...new Set(issues)],
      site: p.audit?.site,
    },
    probe: p.probe,
    breakAt: p.diagnosis?.breakAt ?? null,
  };
}

/** Extract the JSON object from a reply that may be wrapped in prose or fences. */
function parseJson(txt) {
  const s = String(txt ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function runOne(env, skill, g) {
  const pb = PLAYBOOKS.skills[skill];
  if (!pb) return parseRun(skill, tierOf(skill), { status: 'blocked', verdict: 'playbook not bundled' });
  const t0 = Date.now();
  try {
    const txt = await askLlm(env, runPrompt(skill, pb, g), { maxTokens: 1600, json: true });
    const run = parseRun(skill, tierOf(skill), parseJson(txt));
    return { ...run, ms: Date.now() - t0 };
  } catch (e) {
    // A failed methodology is a visible row, not a hole. Sixty-eight good rows
    // and one that says why it failed is a better artefact than sixty-eight
    // rows and a silence.
    return { ...parseRun(skill, tierOf(skill), null), error: String(e?.message ?? e), ms: Date.now() - t0 };
  }
}

/** Build the queue once, in run order, and stash it on the project. */
export function startEngine(p) {
  const all = Object.keys(PLAYBOOKS.skills).filter(s => !SKIP.has(s));
  p.engine = {
    queue: order(all, p.diagnosis?.breakAt),
    runs: [],
    startedAt: new Date().toISOString(),
  };
  return p.engine.queue.length;
}

/**
 * @returns {{done: boolean, ran: string[]}} done=true when the queue is empty.
 */
export async function runEngineBatch(p, env) {
  const e = p.engine;
  if (!e || !e.queue.length) return { done: true, ran: [] };
  const batch = e.queue.splice(0, BATCH);
  const g = ground(p);
  const results = await Promise.all(batch.map(s => runOne(env, s, g)));
  e.runs.push(...results);
  if (!e.queue.length) {
    // The seven-station rule applied to the engine's own output: a methodology
    // downstream of the break may not claim today. Done once, at the end, so a
    // later batch cannot un-cap an earlier one.
    e.runs = capPriority(e.runs, p.diagnosis?.breakAt);
    e.summary = summarise(e.runs);
    e.finishedAt = new Date().toISOString();
  }
  return { done: !e.queue.length, ran: batch, results };
}

export { TIERS };
