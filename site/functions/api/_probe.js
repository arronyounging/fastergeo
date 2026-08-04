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
 *     the audit ships alone.
 *
 * Served from its own endpoint rather than inline in /api/scan: two calls to a
 * reasoning model take ~20s against the audit's ~3s, and the half that already
 * works must never wait on the half that might not answer.
 */

const DEFAULT_API = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = '~deepseek/deepseek-v4-flash-latest';

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
  const label = hostname.replace(/^www\./, '').split('.')[0];
  const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
  // A title that opens with the bare domain ("CUSTYLE.AI | …") would have us
  // asking about "CUSTYLE.AI", which reads like a URL rather than a company.
  // Multi-word names ("Fish Audio") contain a space and are left alone.
  const bareDomain = s => /^[^\s]+\.[a-z]{2,}$/i.test(s);
  if (matched) return bareDomain(matched) ? titleCase(label) : matched;
  if (segs.length) {
    const shortest = segs.sort((a, b) => a.length - b.length)[0];
    return bareDomain(shortest) ? titleCase(label) : shortest;
  }
  return titleCase(label);
}

/**
 * @throws when the model produced no text. The configured model is a reasoning
 *   model: it spends most of its budget in a `reasoning` field, and a cap set
 *   too low returns `content: null` with finish_reason "length". Silently
 *   treating that as "no answer" would look identical to an engine that had
 *   nothing to say about the brand — the opposite conclusion.
 */
async function ask(env, messages, maxTokens, signal) {
  const res = await fetch(env.PROBE_API_URL || DEFAULT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://fastergeo.co',
      'X-Title': 'FasterGEO',
    },
    body: JSON.stringify({
      model: env.PROBE_MODEL || DEFAULT_MODEL,
      messages, max_tokens: maxTokens, temperature: 0,
      // Reasoning off, deliberately, and it is a trade-off worth naming.
      //
      // Measured on a brand the model does not know: with reasoning on, a 1500
      // cap produced no content at all (the budget went entirely to thinking),
      // 3000 worked, and 5000 failed again with 7000 reasoning tokens — more
      // room made it think longer rather than finish. Unreliable in exactly the
      // case that matters most, because the brands that blow the budget are the
      // ones AI does not know, which is who this tool is for.
      //
      // The traces were also where it talked itself into fabricated identities:
      // with reasoning it confidently named two different wrong companies; with
      // it off it said plainly that no well-known company matches the name.
      // Faster, cheaper, and more honest — but a step further from "what a real
      // user receives", and less likely to surface the mistaken-identity case.
      // PROBE_REASONING=on flips it back without a deploy.
      ...(env.PROBE_REASONING === 'on' ? {} : { reasoning: { enabled: false } }),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error?.message ?? 'openrouter error'));
  const choice = data?.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error(`no content (finish=${choice?.finish_reason ?? '?'})`);
  return text;
}

/**
 * Quote must be locatable in the answer — but compared on the text as a reader
 * sees it, not as the model emitted it.
 *
 * Measured live: an answer reading "**Custyle（潮品）** 是网易旗下的潮流电商平台"
 * is a textbook mistaken identity, and the verdict degraded to unverified purely
 * because the judge quoted it without the asterisks. Markdown punctuation is not
 * part of the claim, and letting it break the check silently weakens the one
 * finding this whole thing exists to surface.
 */
function quoteFound(answer, quote) {
  if (!quote || quote.length < 8) return false;
  const flat = s => String(s).replace(/[*_`#~]/g, '').replace(/\s+/g, '').toLowerCase();
  const a = flat(answer);
  const q = flat(quote);
  return q.length >= 6 && a.includes(q.slice(0, 60));
}

export async function probe({ hostname, features, lang, env }) {
  if (!env?.OPENROUTER_API_KEY) return null;
  const zh = lang === 'zh';
  const brand = deriveBrand(hostname, features?.title);
  if (!brand) return null;

  const ctrl = new AbortController();
  // Two sequential calls to a reasoning model. Generous, because the failure
  // this guards against (a hung upstream) is rarer than the failure a tight
  // budget causes (a slow but working answer thrown away at the finish line).
  const timer = setTimeout(() => ctrl.abort(), 60000);
  const t0 = Date.now();
  const at = {};
  try {
    // Asked exactly as a buyer would, with no framing that could steer the
    // answer. This sample has to be the one a real user would have received.
    const question = zh ? `${brand} 是一家什么公司？` : `What kind of company is ${brand}?`;
    // Generous cap: the reasoning field eats most of it before any prose.
    const answer = await ask(env, [{ role: 'user', content: question }], 1200, ctrl.signal);
    at.probeMs = Date.now() - t0;

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

Classify the answer. Be strict — these three mean different things and get fixed
in different ways:

- "knows": it describes the same company the website describes.
- "confused": it ASSERTS a specific different identity — names another parent
  company, industry, or product line as if that were this company. A guess
  derived from the name alone is NOT confusion.
- "unknown": it says it does not know, cannot find the company, or only
  speculates from what the name sounds like.

If the answer opens by saying no well-known company matches, it is "unknown"
even when it goes on to guess.

Reply with JSON only: {"verdict":"knows|confused|unknown","quote":"<the exact sentence asserting the wrong identity — required for confused, empty otherwise>"}`;
    let verdict = 'unverified';
    let evidence = '';
    try {
      const raw = await ask(env, [{ role: 'user', content: judgePrompt }], 800, ctrl.signal);
      at.judgeMs = Date.now() - t0 - at.probeMs;
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
    } catch (e) { at.judgeError = String(e?.message ?? e); }

    return { brand, question, answer, engine: 'deepseek', market: 'cn', verdict, evidence, timing: at };
  } catch (err) {
    // Returned rather than swallowed. "No answer" and "the call never got out"
    // look identical to a user and mean opposite things to whoever is on call;
    // a null with no reason is the hardest kind of failure to operate.
    // Which stage ran out matters: a first-call timeout and a second-call
    // timeout have different fixes, and "timeout" alone says neither.
    const why = ctrl.signal.aborted ? 'timeout' : String(err?.message ?? err);
    return { error: why, timing: { ...at, totalMs: Date.now() - t0 } };
  } finally {
    clearTimeout(timer);
  }
}
