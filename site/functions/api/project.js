/**
 * POST /api/project  {url, lang}  → { id }        start a project
 * GET  /api/project?id=…          → project state
 *
 * A project, not a scan. The scan card on the landing page answers "can AI read
 * this page" in three seconds; this is the thing that reads your site, works out
 * what you sell and who you compete with, asks an engine about you, and hands
 * back a fix list. It takes a couple of minutes, which is why it is built one
 * stage at a time by /api/step rather than in a single request.
 */
import { kv } from './_store.js';
import { STAGES } from './_pipeline.js';
import { sortFeed, feedCounts } from '@fastergeo/tickets';

const BAD_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|.*\.(local|internal)$)/i;
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function loadProject(env, id) {
  const store = kv(env);
  if (!store || !/^[A-Za-z0-9_-]{6,32}$/.test(id ?? '')) return null;
  const raw = await store.get(`p:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProject(env, p) {
  // Kept a month unless someone asks us to watch it, at which point the expiry
  // is dropped. Storing every URL anyone ever typed forever is neither
  // necessary nor polite.
  await kv(env).put(`p:${p.id}`, JSON.stringify(p),
    p.email ? undefined : { expirationTtl: 60 * 60 * 24 * 30 });
}

export async function onRequestPost({ request, env }) {
  if (!kv(env)) {
    // Named plainly: a generic failure here reads as "your URL was rejected"
    // and sends people retyping a perfectly good address.
    return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 503, headers: JSON_H });
  }
  let body;
  try { body = await request.json(); } catch { body = null; }
  const lang = body?.lang === 'zh' ? 'zh' : 'en';
  let parsed;
  try {
    const t = body?.url;
    parsed = new URL(/^https?:\/\//i.test(t ?? '') ? t : `https://${t}`);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers: JSON_H });
  }
  if (!/^https?:$/.test(parsed.protocol) || BAD_HOSTS.test(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'unsupported host' }), { status: 400, headers: JSON_H });
  }
  const p = {
    id: newId(), url: parsed.href, lang,
    createdAt: new Date().toISOString(),
    stage: STAGES[0], log: [], pages: [], tickets: [],
  };
  await saveProject(env, p);
  return new Response(JSON.stringify({ id: p.id }), { headers: JSON_H });
}

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  const p = await loadProject(env, id);
  if (!p) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_H });
  // Page text is only an input to the dossier prompt; shipping it to the
  // browser would multiply the payload for something nothing renders.
  const { pages, feed, ...lite } = p;
  // Order and counts are computed here, not in the browser. Two implementations
  // of "which of these is unread" drift, and the one the user sees would be the
  // one nothing tests.
  const now = new Date().toISOString();
  return new Response(JSON.stringify({
    ...lite, pageCount: pages.length,
    ...(feed?.length ? {
      feedOpen: sortFeed(feed, now),
      feedDone: feed.filter(i => i.state === 'done')
        .sort((a, b) => String(b.resolvedAt ?? '').localeCompare(String(a.resolvedAt ?? ''))),
      feedCounts: feedCounts(feed, now),
    } : {}),
  }), { headers: JSON_H });
}
