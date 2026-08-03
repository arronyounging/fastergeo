/**
 * /api/crawlers?url=… — AI Crawler Access Checker.
 * Per-crawler verdict from robots.txt + sitemap/llms.txt presence.
 */
import { checkSite, blockedAiCrawlersFromRobots, AI_CRAWLERS } from '@fastergeo/audit';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get('url');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=600',
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
    const site = await checkSite(parsed.href, 10000);
    const crawlers = AI_CRAWLERS.map(bot => ({
      bot,
      blocked: site.blockedAiCrawlers.includes(bot),
    }));
    return new Response(JSON.stringify({ ...site, crawlers }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
