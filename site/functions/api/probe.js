/**
 * GET /api/probe?url=…&id=… — the slow half, on its own.
 *
 * Two calls to a reasoning model run about twenty seconds; the audit runs in
 * three. Inlining this into /api/scan made the whole scan wait on the part most
 * likely to be slow or unavailable. Split, the card appears immediately and the
 * quote drops in when it arrives — and a probe that never answers costs the
 * user nothing.
 *
 * When an id is supplied the answer is written back onto the stored scan, so a
 * report URL shared later carries the quote rather than just the score.
 */
import { fetchPage } from '@fastergeo/audit';
import { probe } from './_probe.js';
import { loadScan, kv } from './_store.js';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
  const id = params.get('id');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    // A day: the probe costs money on every miss and a site scanned twice in an
    // afternoon has not changed its mind about what it is.
    'Cache-Control': 'public, max-age=86400',
  };
  let parsed;
  try {
    const t = params.get('url');
    parsed = new URL(/^https?:\/\//i.test(t ?? '') ? t : `https://${t}`);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers });
  }
  if (!/^https?:$/.test(parsed.protocol) || BAD_HOSTS.test(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'unsupported host' }), { status: 400, headers });
  }
  if (!env?.OPENROUTER_API_KEY) {
    // Stated plainly rather than returned as an empty result: an operator
    // reading this should not have to guess whether the engine had no opinion
    // or the key was never set.
    return new Response(JSON.stringify({ probe: null, reason: 'not configured' }), { headers });
  }
  try {
    const features = await fetchPage(parsed.href, 15000).catch(() => null);
    if (!features) {
      return new Response(JSON.stringify({ probe: null, reason: 'fetch failed' }), { headers });
    }
    const asked = await probe({ hostname: parsed.hostname, features, lang, env });
    if (asked?.error) {
      return new Response(JSON.stringify({ probe: null, reason: asked.error, timing: asked.timing }), { headers });
    }
    if (asked && id && kv(env)) {
      // Best-effort: a failed write must not lose the answer we already have.
      try {
        const rec = await loadScan(env, id);
        if (rec) {
          rec.probe = asked;
          await kv(env).put(`r:${id}`, JSON.stringify(rec),
            rec.email ? undefined : { expirationTtl: 60 * 60 * 24 * 30 });
        }
      } catch { /* the response below still carries it */ }
    }
    return new Response(JSON.stringify({ probe: asked }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ probe: null, reason: String(err?.message ?? err) }), { headers });
  }
}
