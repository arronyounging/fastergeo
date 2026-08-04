/**
 * One probe question, asked of one real engine, at our expense.
 *
 * Until this existed the free scan stopped at "can AI read your page" — the
 * same thing every site grader does. The one thing nobody else hands out is the
 * sentence an AI actually says about you, and it sat behind `npx`. The site's
 * own hero promises evidence; this is what makes that true before a terminal.
 *
 * Discipline carried over from the CLI, unchanged because the public surface is
 * the worst place to relax it:
 *   · a `confused` verdict must quote the answer verbatim, or it degrades to
 *     unverified — we would rather say "look at it yourself" than be wrong in
 *     public about someone's brand
 *   · one probe is one probe: it says nothing about mention rate or ranking,
 *     and the copy must not imply otherwise
 *   · the probe is best-effort. A missing key or a failed call returns null and
 *     the audit ships alone. Adding sampling must never break the scan that
 *     already works.
 */

const API = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');

/**
 * The brand name to ask about. The title is usually "Tagline | Brand" or
 * "Brand — Tagline", so prefer whichever segment the domain agrees with;
 * asking about the wrong name would make the whole probe meaningless.
 */
export function deriveBrand(hostname, title) {
  const host = norm(hostname.replace(/^www\./, '').split('.')[0]);
  const segs = String(title ?? '')
    .split(/[|｜–—·・]|\s-\s/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 40);
  const matched = segs.find(s => {
    const n = norm(s);
    return n && (host.includes(n) || n.includes(host));
  });
  if (matched) return matched;
  if (segs.length) return segs.sort((a, b) => a.length - b.length)[0];
  const label = hostname.replace(/^www\./, '').split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function ask(key, messages, maxTokens, signal) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0 }),
    signal,
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}

/** Quote must be locatable in the answer, ignoring whitespace differences. */
function quoteFound(answer, quote) {
  if (!quote || quote.length < 8) return false;
  const flat = s => String(s).replace(/\s+/g, '').toLowerCase();
  return flat(answer).includes(flat(quote).slice(0, 60));
}

export async function probe({ hostname, features, lang, env }) {
  const key = env?.DEEPSEEK_API_KEY;
  if (!key) return null;
  const zh = lang === 'zh';
  const brand = deriveBrand(hostname, features?.title);
  if (!brand) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    // Asked exactly as a buyer would, with no framing that could steer the
    // answer. This sample has to be the one a real user would have received.
    const question = zh ? `${brand} 是一家什么公司？` : `What kind of company is ${brand}?`;
    const answer = await ask(key, [{ role: 'user', content: question }], 400, ctrl.signal);
    if (!answer) return null;

    // What the site itself says, so the judge has something to compare against
    // rather than relying on whatever it happens to know.
    const truth = [features?.title, features?.metaDescription, String(features?.text ?? '').slice(0, 700)]
      .filter(Boolean).join('\n');
    const judgePrompt = `An AI was asked "${question}" and answered:

"""
${answer.slice(0, 1500)}
"""

Here is what the company's own website says:

"""
${truth}
"""

Classify the answer:
- "knows": it describes the same company the website describes.
- "confused": it describes a DIFFERENT company or industry.
- "unknown": it says it does not know, or gives no substantive description.

Reply with JSON only: {"verdict":"knows|confused|unknown","quote":"<exact sentence from the answer that proves a confused verdict, empty otherwise>"}`;
    let verdict = 'unverified';
    let evidence = '';
    try {
      const raw = await ask(key, [{ role: 'user', content: judgePrompt }], 300, ctrl.signal);
      const j = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, '').trim());
      if (['knows', 'confused', 'unknown'].includes(j?.verdict)) {
        verdict = j.verdict;
        if (verdict === 'confused') {
          // The claim that costs the most if wrong is the one we refuse to make
          // without proof the reader can check against the answer above.
          if (quoteFound(answer, j.quote)) evidence = String(j.quote);
          else verdict = 'unverified';
        }
      }
    } catch { /* judge unavailable → the answer still stands on its own */ }

    return { brand, question, answer, engine: 'deepseek', market: 'cn', verdict, evidence };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
