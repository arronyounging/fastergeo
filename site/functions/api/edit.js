/**
 * POST /api/edit {id, doc, value} — correct what the machine got wrong.
 *
 * The dossier is derived from four pages of someone's marketing site by a
 * model, and it will be wrong about something. Read-only documents make that
 * permanent: the reader sees a mistake, cannot fix it, and stops trusting the
 * parts that are right.
 *
 * Editable documents are the whole trust mechanism — the same reason Okara and
 * the marketing skills suite both put a human-editable context document at the
 * base of everything. The point is not the edit box; it is that the machine's
 * understanding is inspectable and correctable, which turns a black box into an
 * asset the user owns.
 *
 * Edits are recorded as edits. A corrected fact is not silently promoted to
 * something we derived — it carries who said so, because "the site says this"
 * and "the owner says this" are different claims and downstream generation
 * treats them differently.
 */
import { loadProject, saveProject } from './project.js';
import { kv } from './_store.js';

const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };
const bad = (msg, code = 400) => new Response(JSON.stringify({ error: msg }), { status: code, headers: JSON_H });

/** Bounded so a stored project cannot be grown without limit through this. */
const LIMITS = { facts: 120, questions: 200, competitors: 40, text: 4000 };

const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!kv(env)) return bad('storage not configured', 503);
  let body;
  try { body = await request.json(); } catch { return bad('invalid body'); }

  const p = await loadProject(env, body?.id);
  if (!p) return bad('project not found', 404);
  const doc = body?.doc;
  const v = body?.value;
  const now = new Date().toISOString();

  p.dossier = p.dossier ?? {};
  const d = p.dossier;

  switch (doc) {
    case 'product': {
      d.brand = d.brand ?? {};
      if (v?.name !== undefined) d.brand.name = str(v.name, 80);
      if (v?.description !== undefined) d.brand.description = str(v.description, 300);
      if (v?.industry !== undefined) d.brand.industry = str(v.industry, 80);
      if (Array.isArray(v?.aliases)) {
        // Aliases decide whether a mention is counted at all — a missing one
        // silently under-reports visibility, so this is the highest-leverage
        // correction a user can make.
        d.brand.aliases = v.aliases.map(x => str(x, 60)).filter(Boolean).slice(0, 20);
      }
      break;
    }
    case 'facts': {
      if (!Array.isArray(v)) return bad('facts must be a list');
      d.facts = d.facts ?? { brand: d.brand?.name ?? '', definition: '', facts: [] };
      d.facts.facts = v.slice(0, LIMITS.facts).map((f, i) => {
        const prev = (d.facts.facts ?? []).find(x => x.id === f.id);
        const claim = str(f.claim, 300);
        const edited = !prev || prev.claim !== claim;
        return {
          id: f.id || `F-E${String(i + 1).padStart(3, '0')}`,
          claim,
          grade: /^[A-E]$/.test(f.grade) ? f.grade : 'A',
          ...(f.source ? { source: str(f.source, 300) } : {}),
          status: f.status === 'unconfirmed' ? 'unconfirmed' : 'confirmed',
          // Provenance survives the edit. A fact the owner asserted is not the
          // same kind of claim as one we found on their site, and the
          // fabrication gate downstream needs to be able to tell them apart.
          ...(edited ? { source: str(f.source, 300) || 'owner', by: 'owner', at: now } : {}),
        };
      });
      if (v.definition !== undefined) d.facts.definition = str(v.definition, 300);
      break;
    }
    case 'competitors': {
      if (!Array.isArray(v)) return bad('competitors must be a list');
      d.competitorCandidates = v.slice(0, LIMITS.competitors).map(c => ({
        name: str(c.name, 60),
        confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'high',
        why: str(c.why, 200) || (c.by === 'owner' ? 'added by owner' : ''),
        needsReview: false,
        by: 'owner', at: now,
      })).filter(c => c.name);
      break;
    }
    case 'questions': {
      if (!Array.isArray(v)) return bad('questions must be a list');
      // Changing the bank starts a new measurement series: periods before and
      // after are not comparable. Recorded so the trend view can say so rather
      // than drawing a line across the break.
      d.questions = v.slice(0, LIMITS.questions).map((q, i) => ({
        id: q.id || `Q-E${i + 1}`,
        group: str(q.group, 20) || '推荐',
        market: q.market === 'global' ? 'global' : 'cn',
        text: str(q.text, 200),
        brandInQuestion: Boolean(q.brandInQuestion),
      })).filter(q => q.text);
      p.questionsEditedAt = now;
      break;
    }
    case 'voice': {
      p.voice = p.voice ?? {};
      p.voice.filled = str(v, LIMITS.text);
      p.voice.by = 'owner';
      p.voice.at = now;
      break;
    }
    default:
      return bad('unknown document');
  }

  p.edits = [...(p.edits ?? []), { doc, at: now }].slice(-50);
  await saveProject(env, p);
  return new Response(JSON.stringify({ ok: true, doc, at: now }), { headers: JSON_H });
}
