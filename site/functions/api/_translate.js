/**
 * Translate a playbook section on first read, then never again.
 *
 * The suite is 466 sections of English. Translating all of it at build time
 * would spend money on content nobody opens and freeze the result at whatever
 * the model said that day; translating on every request would be slow and
 * expensive for the same paragraph over and over. So: translate on first read,
 * cache under a content hash, serve from cache forever after.
 *
 * Keyed by hash rather than by section name, so an upstream rewording produces
 * a new key and the stale translation is simply never asked for again — no
 * invalidation logic to get wrong.
 */
import { askLlm } from './_llm.js';
import { kv } from './_store.js';

async function hash(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @returns the Chinese text, or the original when translation is unavailable.
 *   Falling back to English is right: a reader who gets the English paragraph
 *   can still act on it, and blocking on a failed translation would take away
 *   working content to punish a missing key.
 */
export async function zhSection(env, heading, body) {
  const src = `## ${heading}\n\n${body}`;
  if (!env.OPENROUTER_API_KEY) return { h: heading, b: body, lang: 'en' };

  const store = kv(env);
  const key = `t:zh:${await hash(src)}`;
  if (store) {
    const hit = await store.get(key);
    if (hit) return { ...JSON.parse(hit), cached: true };
  }

  try {
    const out = await askLlm(env, `Translate this marketing playbook section into simplified Chinese for a non-specialist business owner.

Rules:
- Keep every Markdown structure exactly: headings, tables, lists, code blocks, bold.
- Do NOT translate: product names, tool names, code, URLs, HTML/schema keywords,
  file names like robots.txt or llms.txt, and metric names like CTR or LCP.
- Keep technical terms a Chinese practitioner already uses in English (SEO, GEO,
  schema, sitemap, prompt) in English.
- Plain, direct Chinese. No marketing tone, no "赋能/助力" filler.
- Output the translated Markdown only. No preamble.

${src}`, { maxTokens: 3000 });

    const m = /^##\s+(.+?)\n([\s\S]*)$/.exec(out.trim());
    const rec = m
      ? { h: m[1].trim(), b: m[2].trim(), lang: 'zh' }
      : { h: heading, b: out.trim(), lang: 'zh' };
    // Never expires: the source is pinned by hash, so a cached translation can
    // only ever be the right one for that exact text.
    if (store) await store.put(key, JSON.stringify(rec));
    return rec;
  } catch {
    return { h: heading, b: body, lang: 'en', note: 'translation unavailable' };
  }
}
