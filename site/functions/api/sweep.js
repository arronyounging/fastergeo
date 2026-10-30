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
import { reprobe } from './_reprobe.js';
import { composeLetter, composeConfirm, sendMail, newUnsubToken, mailReady, ensureWatchTokens, forgetWatcher } from './_mail.js';

// A Worker has a wall-clock and a subrequest budget (50 on the free plan; one
// site costs about 9 before retries, more on its weekly re-ask), and a sweep
// that dies halfway is worse than one that does less. So each run takes a few,
// and the clock in ../../cron knocks hourly: already-checked sites are skipped,
// which is what walks the list without any cursor to lose.
const MAX_PER_RUN = 3;
const CHECKED_RECENTLY = 20 * 3600e3;
/** A letter that failed to leave is retried, but stale news is not news. */
const PENDING_MAX_AGE = 14 * 86400e3;
const UNCONFIRMED_MAX_AGE = 14 * 86400e3;

/**
 * A watched scan, seen as the one-page project it is. The loop and the letter
 * then need no second implementation — two copies of "what counts as a fix"
 * would drift, and the one that drifted would be the one nobody tests.
 */
export function scanAsProject(rec) {
  return {
    id: rec.id, url: rec.url, lang: rec.lang, email: rec.email, unsub: rec.unsub,
    probe: rec.probe, probeCheckedAt: rec.probeCheckedAt, probeHistory: rec.probeHistory,
    mailPending: rec.mailPending, emailConfirmed: rec.emailConfirmed,
    confirmToken: rec.confirmToken, confirmSentAt: rec.confirmSentAt,
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
    unsub: p.unsub, mail: p.mail ?? rec.mail, mailPending: p.mailPending,
    // Absent on the view means they unsubscribed during the check.
    email: p.email, emailConfirmed: p.emailConfirmed,
    confirmToken: p.confirmToken, confirmSentAt: p.confirmSentAt,
    probe: p.probe ?? rec.probe, probeCheckedAt: p.probeCheckedAt, probeHistory: p.probeHistory,
  };
}

export async function sweep(env) {
  const store = kv(env);
  if (!store) return { error: 'storage not configured' };
  const seen = new Map();
  let checked = 0, acted = 0, quiet = 0, failed = 0, mailed = 0, unmailed = 0, waiting = false;
  const origin = env.SITE_ORIGIN || 'https://fastergeo.co';

  let cursor;
  do {
    const page = await store.list({ prefix: 'w:', limit: 100, cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      if (checked >= MAX_PER_RUN) { cursor = null; waiting = true; break; }
      // w:<email>:<id>
      const cut = k.name.lastIndexOf(':');
      const id = k.name.slice(cut + 1);
      const watcher = k.name.slice(2, cut);
      if (!id) continue;
      if (seen.has(id)) {
        // Same record under a second key: only one address can be the live one.
        if (seen.get(id) !== watcher) await store.delete(k.name);
        continue;
      }
      // Two kinds of thing can be watched: a project, and a one-page scan from
      // the landing page. The scan's own page promises a re-check, so it gets
      // one — through the same loop, via a project-shaped view of the record.
      const load = () => loadProject(env, id);
      const proj = await load();
      const scan = proj ? null : await loadScan(env, id);
      const rec = proj ?? scan;
      if (rec?.email === watcher) seen.set(id, watcher);
      // A key left behind by an older address must not keep the record alive
      // or the sweep visiting it.
      if (rec && rec.email !== watcher) { await store.delete(k.name); continue; }
      const p = proj ?? (scan ? scanAsProject(scan) : null);
      if (!p || p.stage !== 'done') continue;
      if (p.loop?.lastCheck && Date.now() - p.loop.lastCheck < CHECKED_RECENTLY) continue;
      checked++;
      try {
        const r = await runDailyCheck(p, env);
        // Weekly, and off unless the owner turns it on: what the AI now says.
        const ai = await reprobe(p, env).catch(() => ({ asked: false }));
        if (ai.line) {
          const l = { t: Date.now(), m: p.lang === 'zh' ? ai.line.zh : ai.line.en, loop: true };
          p.log = [...(p.log ?? []), l];
          r.acted = true;
          r.reasons = [...(r.reasons ?? []), ai.kind === 'fixed' ? 'ai learned' : ai.kind === 'broke' ? 'ai confused' : 'ai changed'];
          r.lines = [...(r.lines ?? []), l];
        }
        r.acted ? acted++ : quiet++;
        // The check above can take a minute. If they unsubscribed meanwhile, this
        // run must neither write to them nor save their address back.
        const latest = proj ? await load() : await loadScan(env, id);
        if (!latest?.email) forgetWatcher(p);
        else if (latest.emailConfirmed) p.emailConfirmed = true;
        // The letter is the reason anyone left an address. Its outcome is kept
        // on the record either way: a letter that silently failed to leave is
        // the same broken promise as one that was never written.
        // Letters only to an address its owner confirmed. An older record, from
        // before confirmation existed, gets the one question instead; nobody
        // answering for two weeks means the address goes.
        if (p.email && !p.emailConfirmed && mailReady(env)) {
          ensureWatchTokens(p);
          if (!p.confirmSentAt) {
            const m = await sendMail(env, p.email, composeConfirm(p, origin));
            if (m.sent) p.confirmSentAt = new Date().toISOString();
          } else if (Date.now() - Date.parse(p.confirmSentAt) > UNCONFIRMED_MAX_AGE) {
            await store.delete(k.name);
            forgetWatcher(p);
          }
        }
        const pending = (p.mailPending?.lines ?? []).filter(l => Date.now() - l.t < PENDING_MAX_AGE);
        const toSay = {
          reasons: [...(pending.length ? p.mailPending.reasons : []), ...(r.reasons ?? [])],
          lines: [...pending, ...(r.lines ?? [])],
        };
        if (p.email && p.emailConfirmed && toSay.lines.length) {
          p.unsub = p.unsub ?? newUnsubToken();
          const letter = composeLetter(p, toSay, origin);
          if (letter) {
            const m = await sendMail(env, p.email, letter);
            p.mail = { at: new Date().toISOString(), kind: letter.kind, ...m };
            m.sent ? mailed++ : unmailed++;
            // Only a transport failure is retried. With no sender configured
            // there is nothing to retry, and a backlog would land all at once
            // on the day mail is switched on.
            if (!m.sent && mailReady(env)) p.mailPending = toSay; else delete p.mailPending;
          }
        }
        if (proj) await saveProject(env, p);
        else await saveWatchedScan(env, projectIntoScan(scan, p));
      } catch { failed++; }
    }
  } while (cursor);

  // Reported honestly: a sweep where nothing happened is the expected outcome,
  // not a failure, and the counts should make that legible at a glance.
  return { checked, acted, quiet, failed, mailed, unmailed, more: waiting };
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
