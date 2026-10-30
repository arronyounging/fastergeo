/**
 * The scheduled sweep. Runs the daily check over every watched project.
 *
 * Woken by the cron Worker in ../../cron, and callable by hand with SWEEP_TOKEN so a
 * run can be forced without waiting a day. Deliberately thin: the loop's own
 * discipline (check often, act rarely, idempotent state) lives in _loop.js, and
 * this only decides who to look at and how much work one invocation may do.
 */
import { kv, loadScan, saveWatchedScan } from './_store.js';
import { mergeFeed } from '@fastergeo/tickets';
import { loadProject, saveProject } from './project.js';
import { runDailyCheck } from './_loop.js';
import { composeLetter, sendMail, newUnsubToken } from './_mail.js';

// A Worker has a wall-clock budget, and a sweep that dies halfway is worse than
// one that does less: the projects at the end of the list would never be
// checked. Bounded per run, and the cursor carries on next time.
const MAX_PER_RUN = 20;

/**
 * A watched scan, seen as the one-page project it is. The loop and the letter
 * then need no second implementation — two copies of "what counts as a fix"
 * would drift, and the one that drifted would be the one nobody tests.
 */
export function scanAsProject(rec) {
  return {
    id: rec.id, url: rec.url, lang: rec.lang, email: rec.email, unsub: rec.unsub,
    stage: 'done', path: 'r', log: rec.log ?? [], loop: rec.loop,
    // Seeded from the tickets the scan showed, so a fix that lands before the
    // first sweep is still recognised as a fix rather than as silence.
    feed: rec.feed ?? mergeFeed([], rec.tickets ?? []).items,
    audit: rec.audit ?? {
      root: rec.url, site: rec.site, entity: rec.page?.entity,
      pages: rec.page ? [rec.page] : [], avgScore: rec.page?.score ?? null, blockers: [],
    },
  };
}

/** Write the loop's results back onto the scan record the report page renders. */
export function projectIntoScan(rec, p) {
  const page = p.audit.pages?.[0];
  return {
    ...rec, audit: p.audit, page: page ?? rec.page, site: p.audit.site ?? rec.site,
    tickets: p.tickets ?? rec.tickets, feed: p.feed, loop: p.loop, log: p.log,
    unsub: p.unsub, mail: p.mail ?? rec.mail,
  };
}

export async function sweep(env) {
  const store = kv(env);
  if (!store) return { error: 'storage not configured' };
  const seen = new Set();
  let checked = 0, acted = 0, quiet = 0, failed = 0, mailed = 0, unmailed = 0;
  const origin = env.SITE_ORIGIN || 'https://fastergeo.co';

  let cursor;
  do {
    const page = await store.list({ prefix: 'w:', limit: 100, cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      if (checked >= MAX_PER_RUN) { cursor = null; break; }
      // w:<email>:<id> — one project may be watched by more than one address.
      const id = k.name.split(':').pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // Two kinds of thing can be watched: a project, and a one-page scan from
      // the landing page. The scan's own page promises a re-check, so it gets
      // one — through the same loop, via a project-shaped view of the record.
      const proj = await loadProject(env, id);
      const scan = proj ? null : await loadScan(env, id);
      const p = proj ?? (scan?.email ? scanAsProject(scan) : null);
      if (!p || p.stage !== 'done') continue;
      checked++;
      try {
        const r = await runDailyCheck(p, env);
        r.acted ? acted++ : quiet++;
        // The letter is the reason anyone left an address. Its outcome is kept
        // on the record either way: a letter that silently failed to leave is
        // the same broken promise as one that was never written.
        if (r.acted && p.email) {
          p.unsub = p.unsub ?? newUnsubToken();
          const letter = composeLetter(p, r, origin);
          if (letter) {
            const m = await sendMail(env, p.email, letter);
            p.mail = { at: new Date().toISOString(), kind: letter.kind, ...m };
            m.sent ? mailed++ : unmailed++;
          }
        }
        if (proj) await saveProject(env, p);
        else await saveWatchedScan(env, projectIntoScan(scan, p));
      } catch { failed++; }
    }
  } while (cursor);

  // Reported honestly: a sweep where nothing happened is the expected outcome,
  // not a failure, and the counts should make that legible at a glance.
  return { checked, acted, quiet, failed, mailed, unmailed };
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!env.SWEEP_TOKEN || token !== env.SWEEP_TOKEN) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(await sweep(env)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/*
 * There is deliberately no `onSchedule` export here.
 *
 * Pages Functions only run on a request; Cron Triggers are a Workers feature.
 * An exported scheduled handler would look like a working daily job, never be
 * called, and leave us telling users we check every day while nothing checks
 * anything. The clock is a separate Worker in ../../cron that calls the GET
 * handler above with SWEEP_TOKEN.
 */
