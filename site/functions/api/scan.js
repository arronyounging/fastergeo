/**
 * /api/scan?url=… — the "see what AI sees" wedge.
 * Runs the FasterGEO six-dimension audit at the edge. Same engine as
 * `npx fastergeo audit` — the free scan IS the product, not a teaser.
 */
import { auditPage, checkSite } from '@fastergeo/audit';
import { saveScan } from './_store.js';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const target = params.get('url');
  const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
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
    const [page, site] = await Promise.all([
      auditPage(parsed.href, { timeoutMs: 15000 }),
      checkSite(parsed.href, 10000).catch(() => null),
    ]);
    if (!page) {
      return new Response(JSON.stringify({ error: 'fetch failed — is the site reachable?' }), { status: 502, headers });
    }
    // Kept for 30 days so the result has a URL that can be revisited and
    // forwarded. Attaching an email later drops the expiry. Storage is
    // optional: without the binding the scan behaves exactly as it did before.
    const id = await saveScan(env, { url: parsed.href, lang, page, site, probe: null }).catch(() => null);
    return new Response(JSON.stringify({ page, site, id }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
