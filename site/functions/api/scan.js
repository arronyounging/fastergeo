/**
 * /api/scan?url=… — the "see what AI sees" wedge.
 * Runs the FasterGEO six-dimension audit at the edge. Same engine as
 * `npx fastergeo audit` — the free scan IS the product, not a teaser.
 */
import { auditPage, checkSite } from '@fastergeo/audit';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get('url');
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
    return new Response(JSON.stringify({ page, site }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
