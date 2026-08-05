/**
 * The two documents bootstrap does not derive.
 *
 * Okara ships five strategy documents, the marketing skills suite has 48 skills
 * all reading one product-marketing.md, and we had four. The missing two are
 * not filler — they are the ones every downstream writer needs: how the brand
 * sounds, and what it should be publishing.
 *
 * They are built differently on purpose, because they are different kinds of
 * claim:
 *
 *   voice     — EXTRACTED, never written. We quote sentences the brand already
 *               published and let a human name the pattern. Inventing how
 *               someone's brand sounds from four pages is precisely the
 *               black-box behaviour this product exists to argue against, and
 *               we refused to do it in the CLI for the same reason.
 *
 *   strategy  — DERIVED, and only from things already established: the question
 *               bank we mined, the audit we ran, the competitors we found. It
 *               proposes what to publish, and every proposal names the question
 *               it answers so a reader can check the reasoning rather than
 *               trust it.
 */
import { askLlm, parseJsonish } from './_llm.js';

/* ── voice ──────────────────────────────────────────────────────────────── */

/**
 * Sentences that show how this brand writes.
 *
 * Picked mid-length: the shortest fragments are navigation and the longest are
 * usually lists, and neither reveals a voice. Deduped by opening words so five
 * variations of the same boilerplate do not crowd out the real writing.
 */
function voiceEvidence(pages, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const p of pages ?? []) {
    for (const raw of String(p.text ?? '').split(/(?<=[.!?。！？])\s+/)) {
      const s = raw.trim().replace(/\s+/g, ' ');
      if (s.length < 30 || s.length > 180) continue;
      const key = s.slice(0, 14);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: s, from: p.url });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function buildVoice(pages, lang) {
  const zh = lang === 'zh';
  return {
    kind: 'voice',
    generated: false,
    intro: zh
      ? '这份是脚手架，不是生成好的语气指南。我们不会拿几页文案编出你的品牌怎么说话 —— 那正是我们批评别人的做法。下面是你自己已经写过的句子，语气由你来定。'
      : 'A scaffold, not a generated voice guide. We will not invent how your brand sounds from a few pages of copy — that is the behaviour this product exists to argue against. Below are sentences you already published; the naming is yours.',
    slots: zh
      ? ['三个词形容语气', '我们常用的词', '我们绝不用的词', '开场怎么写', '坏消息怎么说', '一句最像我们的示范句']
      : ['Tone in three words', 'Words we use', 'Words we never use', 'How we open',
        'How we deliver bad news', 'One sentence that sounds most like us'],
    evidence: voiceEvidence(pages),
    evidenceLabel: zh ? '你网站上的原句' : 'Sentences from your own site',
  };
}

/* ── content strategy ───────────────────────────────────────────────────── */

/**
 * What to publish, argued from what we already measured.
 *
 * Constrained hard: every proposal must name the question from the bank that it
 * answers. A content plan that cannot say which buyer question each piece is
 * for is a list of topics, and a list of topics is what every AI writes when
 * asked for a content strategy.
 */
export async function buildContentStrategy(env, { brand, questions, audit, competitors, lang }) {
  const zh = lang === 'zh';
  const qs = (questions ?? []).filter(q => !q.brandInQuestion).slice(0, 14);
  if (!qs.length || !env.OPENROUTER_API_KEY) return null;

  const gaps = new Set();
  for (const p of audit?.pages ?? []) {
    for (const d of p.dimensions ?? []) for (const i of d.issues ?? []) gaps.add(i);
  }

  const prompt = `You are planning what a company should publish so AI engines cite it.

COMPANY: ${brand?.name} — ${brand?.description ?? ''}
COMPETITORS BUYERS ALSO CONSIDER: ${(competitors ?? []).map(c => c.name).join(', ') || 'unknown'}
WHAT THEIR PAGES ARE MISSING: ${[...gaps].join(', ') || 'nothing recorded'}

BUYING QUESTIONS PEOPLE ASK AI IN THIS CATEGORY:
${qs.map((q, i) => `${i + 1}. [${q.market}] ${q.text}`).join('\n')}

Propose 5 pieces to publish, ordered by how much each would move AI citation.

Hard rules:
- Every piece MUST answer one of the numbered questions above. Give its number.
- Do not invent facts, statistics, customers or claims about this company.
- "why" must say what makes the piece citable — the extractable block it carries
  (a definition, a comparison table, a statistics block, a set of steps, a FAQ).
- No topic that merely restates what the company already says about itself.

Reply with JSON only:
{"pieces":[{"title":"...","answers":<question number>,"format":"guide|comparison|faq|definition|steps","why":"...","block":"definition|comparison|statistics|steps|faq"}]}
${zh ? 'Write title and why in simplified Chinese.' : ''}`;

  try {
    const j = parseJsonish(await askLlm(env, prompt, { maxTokens: 2000 }));
    const pieces = (j?.pieces ?? [])
      .map(p => {
        const q = qs[Number(p.answers) - 1];
        // A piece that does not map to a real question is dropped, not
        // renumbered. The mapping is the argument; without it this is a topic
        // list wearing a strategy's clothes.
        return q ? { ...p, question: q.text, market: q.market } : null;
      })
      .filter(Boolean);
    return pieces.length ? { kind: 'strategy', pieces, basedOn: qs.length } : null;
  } catch {
    return null;
  }
}
