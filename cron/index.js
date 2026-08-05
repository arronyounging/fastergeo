/**
 * The alarm clock.
 *
 * The daily check itself lives in the Pages project, next to the storage and
 * the audit code it needs. What it does not have is a way to wake up: Pages
 * Functions only run on a request, and Cron Triggers are a Workers feature.
 * Exporting a `scheduled` handler from a Pages function looks like it works and
 * is never called — which is the shape of promise this product keeps making and
 * failing, so it gets a real clock instead of a comment claiming one.
 *
 * Deliberately the thinnest thing that can hold: it knocks on the door and
 * reports what it heard. Every decision about who to check and whether anything
 * is worth saying stays in _loop.js, where it is tested.
 */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(knock(env));
  },

  /**
   * Also reachable by hand, with the same token the sweep itself requires, so a
   * run can be forced without waiting a day and without a second secret.
   */
  async fetch(request, env) {
    const token = new URL(request.url).searchParams.get('token');
    if (!env.SWEEP_TOKEN || token !== env.SWEEP_TOKEN) {
      return new Response('forbidden', { status: 403 });
    }
    return new Response(JSON.stringify(await knock(env), null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};

async function knock(env) {
  const url = `${env.SWEEP_URL}?token=${encodeURIComponent(env.SWEEP_TOKEN ?? '')}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'fastergeo-cron' } });
    const body = await r.text();
    // Logged either way. A sweep that returns "nothing happened" is the expected
    // outcome and must not look the same as a sweep that never ran.
    console.log(`sweep ${r.status}: ${body.slice(0, 300)}`);
    return { ok: r.ok, status: r.status, body: body.slice(0, 300) };
  } catch (e) {
    console.log(`sweep unreachable: ${e.message}`);
    return { ok: false, error: e.message };
  }
}
