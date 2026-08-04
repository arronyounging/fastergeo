/**
 * /api/scan?url=… — the "see what AI sees" wedge.
 * Runs the FasterGEO six-dimension audit at the edge. Same engine as
 * `npx fastergeo audit` — the free scan IS the product, not a teaser.
 */
import { auditPage, checkSite, fetchPage } from '@fastergeo/audit';
import { probe } from './_probe.js';
import { saveScan } from './_store.js';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const target = params.get('url');
  const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    // A day, because the probe costs us money on every miss and the same site
    // scanned twice in an afternoon has not changed. Edge cache is the only
    // spend control here until there is a KV store to rate-limit against.
    'Cache-Control': 'public, max-age=86400',
  };
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(target ?? '') ? target : `https://${target}`);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers });
  }
  if (!/^https?:$/.test(parsed.protocol) || BAD_HOSTS.test(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'unsupported host' }), { status: 400, headers });
  }
  try {
    const [page, site, features] = await Promise.all([
      auditPage(parsed.href, { timeoutMs: 15000 }),
      checkSite(parsed.href, 10000).catch(() => null),
      fetchPage(parsed.href, 15000).catch(() => null),
    ]);
    if (!page) {
      return new Response(JSON.stringify({ error: 'fetch failed — is the site reachable?' }), { status: 502, headers });
    }
    // Best-effort: the audit is the guaranteed half of this endpoint and must
    // ship whether or not an engine answered.
    const asked = features
      ? await probe({ hostname: parsed.hostname, features, lang, env }).catch(() => null)
      : null;
    // Kept for 30 days so the result has a URL that can be revisited and
    // forwarded. Attaching an email later drops the expiry. Storage is
    // optional: without the binding the scan behaves exactly as it did before.
    const id = await saveScan(env, { url: parsed.href, lang, page, site, probe: asked }).catch(() => null);
    return new Response(JSON.stringify({ page, site, probe: asked, id }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
