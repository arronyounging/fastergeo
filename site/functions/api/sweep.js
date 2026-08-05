/**
 * The scheduled sweep. Runs the daily check over every watched project.
 *
 * Woken by the cron Worker in ../../cron, and callable by hand with SWEEP_TOKEN so a
 * run can be forced without waiting a day. Deliberately thin: the loop's own
 * discipline (check often, act rarely, idempotent state) lives in _loop.js, and
 * this only decides who to look at and how much work one invocation may do.
 */
import { kv } from './_store.js';
import { loadProject, saveProject } from './project.js';
import { runDailyCheck } from './_loop.js';

// A Worker has a wall-clock budget, and a sweep that dies halfway is worse than
// one that does less: the projects at the end of the list would never be
// checked. Bounded per run, and the cursor carries on next time.
const MAX_PER_RUN = 20;

export async function sweep(env) {
  const store = kv(env);
  if (!store) return { error: 'storage not configured' };
  const seen = new Set();
  let checked = 0, acted = 0, quiet = 0, failed = 0;

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
      const p = await loadProject(env, id);
      if (!p || p.stage !== 'done') continue;
      checked++;
      try {
        const r = await runDailyCheck(p, env);
        await saveProject(env, p);
        r.acted ? acted++ : quiet++;
      } catch { failed++; }
    }
  } while (cursor);

  // Reported honestly: a sweep where nothing happened is the expected outcome,
  // not a failure, and the counts should make that legible at a glance.
  return { checked, acted, quiet, failed };
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
