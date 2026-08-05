/**
 * POST /api/ask {id, q, lang} — the one place a person can just ask.
 *
 * A chat box on a marketing console is the easiest thing to build badly: point
 * a model at a question and let it answer from whatever it happens to know.
 * That produces a confident paragraph about a company it has never read, which
 * is precisely the failure this whole product exists to measure in other
 * people's tools.
 *
 * So it is grounded, hard. The model sees only what we actually derived and
 * measured for THIS project, and it is told to say it does not have something
 * rather than reach for general knowledge. The reply carries a line naming what
 * it was allowed to look at, so a reader can tell an answer from a guess.
 */
import { loadProject } from './project.js';
import { kv } from './_store.js';
import { askLlm } from './_llm.js';

const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };
const bad = (msg, code = 400) => new Response(JSON.stringify({ error: msg }), { status: code, headers: JSON_H });

/** Bounded so one project cannot push a prompt past the model's budget. */
const CAPS = { facts: 24, questions: 12, competitors: 12, issues: 14, pieces: 6 };

function ground(p) {
  const d = p.dossier ?? {};
  const b = d.brand ?? {};
  const lines = [];
  const add = (h, xs) => { if (xs && xs.length) lines.push(h + '\n' + xs.join('\n')); };

  lines.push(`BRAND: ${b.name ?? '(unknown)'} — ${b.description ?? '(no description derived)'}`);
  if (b.industry) lines.push(`INDUSTRY (derived): ${b.industry}`);
  if (b.aliases?.length) lines.push(`ALIASES: ${b.aliases.join(', ')}`);

  add('BRAND FACTS (graded A–E; E is weakest):',
    (d.facts?.facts ?? []).slice(0, CAPS.facts).map(f => `- [${f.grade}${f.by === 'owner' ? ', stated by the owner' : ''}] ${f.claim}`));
  add('COMPETITOR CANDIDATES (guessed from their own site, unconfirmed):',
    (d.competitorCandidates ?? []).slice(0, CAPS.competitors).map(c => `- ${c.name}${c.why ? ' — ' + c.why : ''}`));
  add('BUYER QUESTIONS WE MINED:',
    (d.questions ?? []).filter(q => !q.brandInQuestion).slice(0, CAPS.questions).map(q => `- [${q.market}] ${q.text}`));

  const a = p.audit;
  if (a) {
    lines.push(`AUDIT: average AI-readiness ${a.avgScore ?? 'n/a'}/100 across ${(a.pages ?? []).length} pages.`);
    if (a.site) {
      lines.push(`SITE: llms.txt ${a.site.llmsTxtFound ? 'present' : 'absent'}; `
        + `blocked AI/search crawlers: ${(a.site.blockedSearchCrawlers ?? []).join(', ') || 'none'}.`);
    }
    const issues = [];
    for (const pg of a.pages ?? []) {
      for (const bl of pg.blockers ?? []) issues.push(`- BLOCKING · ${pg.url}: ${bl}`);
      for (const dim of pg.dimensions ?? []) for (const i of dim.issues ?? []) issues.push(`- ${pg.url}: ${i}`);
    }
    add('MEASURED PROBLEMS:', issues.slice(0, CAPS.issues));
  }

  const pr = p.probe;
  if (pr?.verdict) {
    add(`WHAT AN AI ENGINE ACTUALLY SAID (${pr.engine ?? 'one engine'} — the only engine sampled):`,
      [`- Q: ${pr.question}\n  verdict: ${pr.verdict}${pr.evidence ? `\n  quote: "${pr.evidence}"` : ''}`
       + (pr.answer ? `\n  full answer: ${String(pr.answer).slice(0, 900)}` : '')]);
  }

  if (p.diagnosis) {
    lines.push(`FUNNEL DIAGNOSIS: breaks at station "${p.diagnosis.breakAt ?? 'none'}". `
      + (p.diagnosis.stations ?? []).map(s => `${s.id}=${s.state}`).join(', '));
  }

  const open = (p.feed ?? []).filter(i => i.state !== 'done');
  add('OPEN FIX QUEUE:', open.slice(0, CAPS.issues).map(t => `- [${t.priority}] ${t.title}`));
  add('PROPOSED CONTENT:', (p.docs?.strategy?.pieces ?? []).slice(0, CAPS.pieces).map(x => `- ${x.title} (answers: ${x.question})`));

  return lines.join('\n\n');
}

export async function onRequestPost({ request, env }) {
  if (!kv(env)) return bad('storage not configured', 503);
  if (!env.OPENROUTER_API_KEY) return bad('no model configured', 503);
  let body;
  try { body = await request.json(); } catch { return bad('invalid body'); }

  const p = await loadProject(env, body?.id);
  if (!p) return bad('project not found', 404);
  const q = String(body?.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!q) return bad('empty question');
  const zh = body?.lang === 'zh';

  const prompt = `You are the growth lead for ONE company, answering its owner. Everything you are
allowed to know about them is below. It was derived from their own site and from
measurements we ran — nothing else.

${ground(p)}

THE OWNER ASKS: ${q}

Rules, in order of importance:
1. Answer ONLY from the material above. If it does not contain what is needed,
   say plainly which piece is missing and what would produce it. Do not fall
   back on general knowledge about this company or its market.
2. Never invent a number, a customer, a competitor, or a claim about them.
3. If the material contradicts the question's premise, say so first.
4. Distinguish what was MEASURED from what was DERIVED or GUESSED. The
   competitor list and the industry are guesses; the audit and the engine answer
   are measurements.
5. Be concrete and short — under 150 words. No preamble, no restating the
   question, no offer to help further.
${zh ? '6. 用简体中文回答。' : ''}`;

  try {
    const answer = (await askLlm(env, prompt, { maxTokens: 700 }))?.trim();
    if (!answer) return bad('no answer', 502);
    const asked = p.probe?.verdict ? 1 : 0;
    // Named rather than implied. "Where did this come from" is the question a
    // reader should never have to ask a machine that just made a claim.
    const grounding = zh
      ? `依据：这个项目自己的档案与实测 · ${(p.audit?.pages ?? []).length} 页体检 · ${asked} 条引擎原话 · 未使用任何外部知识`
      : `Grounded in: this project's own dossier and measurements · ${(p.audit?.pages ?? []).length} pages audited · ${asked} engine answers · no outside knowledge used`;
    return new Response(JSON.stringify({ answer, grounding }), { headers: JSON_H });
  } catch (e) {
    return bad(String(e?.message ?? e), 502);
  }
}
