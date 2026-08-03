/**
 * /api/llmstxt?url=… — llms.txt Generator.
 * Drafts a spec-shaped llms.txt from the page's real content — nothing
 * invented; the operator edits before publishing.
 */
import { fetchPage } from '@fastergeo/audit';

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
    const p = await fetchPage(parsed.href, 15000);
    if (!p || p.status >= 400) {
      return new Response(JSON.stringify({ error: 'fetch failed — is the site reachable?' }), { status: 502, headers });
    }
    const origin = new URL(p.url).origin;
    const name = (p.title.split(/[|·—-]/)[0] || parsed.hostname).trim();
    const lines = [`# ${name}`, ''];
    if (p.metaDescription) lines.push(`> ${p.metaDescription.trim()}`, '');
    const facts = [...p.h2, ...p.h3].filter(h => h && h.length > 3).slice(0, 8);
    if (facts.length) {
      lines.push('## Key topics', '');
      for (const f of facts) lines.push(`- ${f}`);
      lines.push('');
    }
    const links = (p.internalLinks ?? [])
      .filter(u => u !== p.url && u.startsWith(origin))
      .slice(0, 12);
    if (links.length) {
      lines.push('## Pages', '');
      for (const u of links) {
        const path = new URL(u).pathname;
        const label = path === '/' ? 'Home'
          : path.split('/').filter(Boolean).map(seg => seg.replace(/[-_]/g, ' ')).join(' / ');
        lines.push(`- [${label || 'Home'}](${u})`);
      }
      lines.push('');
    }
    lines.push('<!-- Drafted by fastergeo.co/tools/llms-txt-generator — review and edit before publishing to /llms.txt -->');
    return new Response(JSON.stringify({ llmstxt: lines.join('\n'), title: p.title }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers });
  }
}
