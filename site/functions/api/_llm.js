/**
 * The one place an engine gets called from the edge.
 *
 * Extracted so the probe, the dossier and anything after them cannot drift into
 * three slightly different callers with three different failure behaviours —
 * which is how "the model returned nothing" ends up meaning something different
 * depending on which feature you are looking at.
 */

const DEFAULT_API = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = '~deepseek/deepseek-v4-flash-latest';

/**
 * @throws when the model produced no text. The configured model is a reasoning
 *   model: with reasoning enabled it can spend an entire budget thinking and
 *   return `content: null`. Measured on a brand it did not know, a larger cap
 *   made it think longer rather than finish, so reasoning is off by default and
 *   PROBE_REASONING=on turns it back on without a deploy.
 */
export async function askLlm(env, prompt, { maxTokens = 1200, signal, json = false } = {}) {
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
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...(env.PROBE_REASONING === 'on' ? {} : { reasoning: { enabled: false } }),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error?.message ?? 'llm error'));
  const choice = data?.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error(`llm returned no content (finish=${choice?.finish_reason ?? '?'})`);
  return text;
}

/** Models fence JSON in code blocks often enough that this belongs here. */
export function parseJsonish(raw) {
  const s = String(raw).replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('model did not return JSON');
}
