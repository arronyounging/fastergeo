/**
 * /api/scan?url=… — the "see what AI sees" wedge.
 * Runs the FasterGEO six-dimension audit at the edge. Same engine as
 * `npx fastergeo audit` — the free scan IS the product, not a teaser.
 */
import { auditPage, checkSite } from '@fastergeo/audit';
import { generateTickets } from '@fastergeo/tickets';
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
    // The web had a score and a quote and no fix list, while the CLI's whole
    // value is "here are three things to fix, each with what done looks like".
    // Ticket generation needs no keys — it reads the audit — so there was never
    // a reason for it to be absent from the free surface. Fix instructions are
    // one of the four things that stay free, always.
    const audit = { root: parsed.href, generatedAt: new Date().toISOString(),
      site: site ?? { robotsTxtFound: false, blockedAiCrawlers: [], sitemapFound: false, llmsTxtFound: false },
      entity: page.entity, pages: [page], avgScore: page.score,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, [page.grade]: 1 }, blockers: [] };
    let tickets = [];
    try { tickets = generateTickets(audit, undefined, lang); } catch { /* score still ships */ }

    // Kept for 30 days so the result has a URL that can be revisited and
    // forwarded. Attaching an email later drops the expiry. Storage is
    // optional: without the binding the scan behaves exactly as it did before.
    const id = await saveScan(env, { url: parsed.href, lang, page, site, tickets, probe: null }).catch(() => null);
    return new Response(JSON.stringify({ page, site, tickets, id }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
