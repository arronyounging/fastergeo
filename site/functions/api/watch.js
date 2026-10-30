/**
 * POST /api/watch — "keep an eye on this for me".
 *
 * This is the only place the site asks for anything, and it asks after the
 * value has already been handed over rather than in front of it. The address is
 * not a gate on the result; it is what makes the next step possible — we
 * re-crawl the page and write when a fix lands, which is the one hand-off in
 * the funnel that does not depend on the user remembering to come back.
 */
import { validEmail, kv } from './_store.js';
import { loadWatched, saveWatched } from './_watched.js';
import { mailReady, ensureWatchTokens, forgetWatcher, composeConfirm, sendMail } from './_mail.js';

const CONFIRMS_PER_DAY = 3;

export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  let body;
  try { body = await request.json(); } catch { body = null; }
  const id = body?.id;
  const email = String(body?.email ?? '').trim().toLowerCase();

  if (!validEmail(email)) {
    return new Response(JSON.stringify({ error: 'invalid email' }), { status: 400, headers });
  }
  if (!env?.SCANS) {
    // Say what is actually wrong. A generic failure here would look like the
    // address was rejected, and the user would retype a correct address.
    return new Response(JSON.stringify({ error: 'storage not configured' }), { status: 503, headers });
  }
  // Projects and one-off scans are both watchable; the caller says which.
  const w = await loadWatched(env, id);
  if (!w || (body?.kind === 'project') !== (w.kind === 'p')) {
    const what = body?.kind === 'project' ? 'project' : 'report';
    return new Response(JSON.stringify({ error: `${what} not found — it may have expired` }), { status: 404, headers });
  }
  const rec = w.rec;
  const store = kv(env);
  // A link is made to be pasted around; holding it must not let someone replace
  // a confirmed watcher, which would silently cut them off. An address nobody
  // ever confirmed has no such claim, or a typo could lock the owner out forever.
  if (rec.email && rec.email !== email) {
    if (rec.emailConfirmed) {
      return new Response(JSON.stringify({ error: 'already being watched' }), { status: 409, headers });
    }
    await store.delete(`w:${rec.email}:${rec.id}`);
    forgetWatcher(rec);
    delete rec.unsub;
  }
  rec.email = email;
  rec.watchedAt = rec.watchedAt ?? new Date().toISOString();
  ensureWatchTokens(rec);
  let confirm = rec.emailConfirmed ? 'confirmed' : 'none';
  if (!rec.emailConfirmed && mailReady(env)) {
    // One ask per record, however often the form is resubmitted; and a cap per
    // inbox, so this form cannot be used to send mail at someone.
    const capKey = `c:${email}`;
    const asked = Number(await store.get(capKey)) || 0;
    if (rec.confirmSentAt) confirm = 'sent';
    else if (asked >= CONFIRMS_PER_DAY) confirm = 'limited';
    else {
      const m = await sendMail(env, email, composeConfirm(rec, new URL(request.url).origin));
      if (m.sent) {
        rec.confirmSentAt = new Date().toISOString();
        await store.put(capKey, String(asked + 1), { expirationTtl: 86400 });
        confirm = 'sent';
      } else confirm = 'failed';
    }
  }
  await saveWatched(env, w);
  await store.put(`w:${email}:${rec.id}`, w.kind === 'p' ? 'project' : '1');
  // `mail` tells the page which sentence is true: "I will write" or "results
  // land here". Decided by the same check the sender uses.
  return new Response(JSON.stringify({ ok: true, url: rec.url, mail: mailReady(env), confirm }), { headers });
}
