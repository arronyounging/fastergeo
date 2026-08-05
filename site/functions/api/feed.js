/**
 * POST /api/feed {id, key, action, days?} — the only state a user creates here.
 *
 * Everything else in this product is derived: the audit, the dossier, the
 * tickets. This is the one place a person says something back — I have seen
 * this, not now, I already did this. That makes it worth more care than its
 * size suggests, and it is why the queue is merged rather than regenerated.
 *
 * `done` set by hand is kept distinct from `done` earned by a re-crawl. A user
 * marking something finished is a claim; the next audit either confirms it by
 * not finding the problem, or contradicts it and the item comes back as a
 * regression. Recording who said so is what lets us tell those apart later
 * instead of quietly treating an assertion as a verified fix.
 */
import { loadProject, saveProject } from './project.js';
import { kv } from './_store.js';
import { feedCounts, sortFeed } from '@fastergeo/tickets';

const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };
const bad = (msg, code = 400) => new Response(JSON.stringify({ error: msg }), { status: code, headers: JSON_H });

const ACTIONS = new Set(['seen', 'snooze', 'done', 'reopen', 'seen-all']);
/** A snooze longer than this is really a "never", and should be said as one. */
const MAX_SNOOZE_DAYS = 90;

export async function onRequestPost({ request, env }) {
  if (!kv(env)) return bad('storage not configured', 503);
  let body;
  try { body = await request.json(); } catch { return bad('invalid body'); }

  const p = await loadProject(env, body?.id);
  if (!p) return bad('project not found', 404);
  const action = String(body?.action ?? '');
  if (!ACTIONS.has(action)) return bad('unknown action');

  const feed = p.feed ?? [];
  if (!feed.length) return bad('no queue yet', 409);
  const now = new Date().toISOString();

  if (action === 'seen-all') {
    // Reading the list counts as reading the list. Requiring a click per item
    // to clear a badge is a chore that teaches people to ignore the badge.
    for (const i of feed) if (i.state === 'new' || i.state === 'regressed') i.state = 'seen';
  } else {
    const item = feed.find(i => i.key === body?.key);
    if (!item) return bad('item not found', 404);
    switch (action) {
      case 'seen':
        if (item.state === 'new' || item.state === 'regressed') item.state = 'seen';
        break;
      case 'snooze': {
        const days = Math.min(Math.max(Number(body?.days) || 7, 1), MAX_SNOOZE_DAYS);
        item.state = 'snoozed';
        item.snoozeUntil = new Date(Date.now() + days * 86400e3).toISOString();
        break;
      }
      case 'done':
        item.state = 'done';
        item.resolvedAt = now;
        // Not the same as a re-crawl confirming it. The next audit decides.
        item.doneBy = 'owner';
        break;
      case 'reopen':
        item.state = 'seen';
        delete item.resolvedAt;
        delete item.snoozeUntil;
        delete item.doneBy;
        break;
    }
  }

  p.feed = feed;
  p.feedCounts = feedCounts(feed);
  await saveProject(env, p);
  return new Response(JSON.stringify({
    ok: true, counts: p.feedCounts, open: sortFeed(feed).map(i => i.key),
  }), { headers: JSON_H });
}
