/**
 * POST /api/watch — "keep an eye on this for me".
 *
 * This is the only place the site asks for anything, and it asks after the
 * value has already been handed over rather than in front of it. The address is
 * not a gate on the result; it is what makes the next step possible — we
 * re-crawl the page and write when a fix lands, which is the one hand-off in
 * the funnel that does not depend on the user remembering to come back.
 */
import { watchScan, validEmail } from './_store.js';

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
  const rec = await watchScan(env, id, email);
  if (!rec) {
    return new Response(JSON.stringify({ error: 'report not found — it may have expired' }), { status: 404, headers });
  }
  return new Response(JSON.stringify({ ok: true, url: rec.url }), { headers });
}
