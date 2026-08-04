/**
 * Persistence for scan results.
 *
 * A scan that vanishes on refresh cannot be sent to anyone, returned to, or
 * followed up on — which kills the only step in the funnel that does not
 * require the user to come back on their own: we re-crawl, and we write to
 * them when their fix lands. That step needs a record.
 *
 * Deliberately not a database and not an account system. The report URL *is*
 * the console: no login, no app, and a link that survives being pasted into a
 * chat window.
 *
 * Retention has two tiers, because storing every URL anyone ever typed forever
 * is neither necessary nor polite:
 *   · a casual scan expires in 30 days
 *   · attaching an email means "watch this for me", and that record persists
 */

const CASUAL_TTL = 60 * 60 * 24 * 30;

/** URL-safe, short, and not guessable by counting. */
function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function kv(env) {
  return env?.SCANS ?? null;
}

export async function saveScan(env, record) {
  const store = kv(env);
  if (!store) return null;
  const id = newId();
  await store.put(`r:${id}`, JSON.stringify({ ...record, id, createdAt: new Date().toISOString() }),
    { expirationTtl: CASUAL_TTL });
  return id;
}

export async function loadScan(env, id) {
  const store = kv(env);
  if (!store || !/^[A-Za-z0-9_-]{6,32}$/.test(id ?? '')) return null;
  const raw = await store.get(`r:${id}`);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Attach an email and drop the expiry. Idempotent: re-submitting the same
 * address is a no-op rather than an error, because the honest reason someone
 * submits twice is that they were not sure it worked.
 */
export async function watchScan(env, id, email) {
  const store = kv(env);
  const rec = await loadScan(env, id);
  if (!store || !rec) return null;
  rec.email = email;
  rec.watchedAt = rec.watchedAt ?? new Date().toISOString();
  await store.put(`r:${id}`, JSON.stringify(rec));            // no TTL — kept
  await store.put(`w:${email}:${id}`, '1');                    // for the recrawl sweep
  return rec;
}

/** Conservative: rejects things that are clearly not addresses, nothing more. */
export function validEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}
