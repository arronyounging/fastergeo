/**
 * The acceptance letter, end to end, against a real crawl.
 *
 * A stored project claims a blocker and no llms.txt on a site that has neither
 * problem today. The sweep re-crawls it for real, the loop should see a fix
 * land, and exactly one letter should be handed to the mail transport — which
 * is intercepted here, so nothing is sent. Then the parts a unit test cannot
 * see: the project GET must not leak the address, and unsubscribing must need
 * the token and a POST.
 *
 *   node scripts/check-mail.mjs [url]     (needs network; honours HTTPS_PROXY)
 */
import { sweep } from '../functions/api/sweep.js';
import { onRequestGet as projectGet } from '../functions/api/project.js';
import { onRequestGet as unwatchGet, onRequestPost as unwatchPost } from '../functions/api/unwatch.js';
import { composeLetter, letterKind } from '../functions/api/_mail.js';

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    // undici is a CLI dependency, not the site's; borrow it from there.
    const { createRequire } = await import('node:module');
    const { EnvHttpProxyAgent, setGlobalDispatcher } = createRequire(new URL('../../apps/cli/package.json', import.meta.url))('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch { /* undici not resolvable from here: run without the proxy */ }
}

const target = process.argv[2] || 'https://fastergeo.co/';
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1); };

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.get(k) ?? null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}

/* ── pure rules first: what is and is not worth a letter ───────────────── */
if (letterKind({ reasons: ['score moved'] }) !== null) fail('score wobble alone must not send a letter');
if (letterKind({ reasons: ['unreachable'] }) !== null) fail('one unreachable morning must not send a letter');
if (letterKind({ reasons: ['score moved', 'ticket cleared'] }) !== 'fixed') fail('a cleared ticket is the letter');
if (letterKind({ reasons: ['regressed'] }) !== 'broke') fail('a regression is worth a letter');
const sample = composeLetter({ id: 'abcdef12', url: 'https://x.com/', lang: 'zh', unsub: 'tok' },
  { reasons: ['ticket cleared'], lines: [{ m: '修好了：<b>x</b>' }] }, 'https://fastergeo.co');
if (!sample.html.includes('&lt;b&gt;')) fail('letter must escape what the loop logged');
if (!sample.text.includes('/api/unwatch?id=abcdef12&t=tok')) fail('letter must carry its unsubscribe link');
console.log('✓ only real changes earn a letter, and the letter escapes and can be stopped');

/* ── the sweep, for real ───────────────────────────────────────────────── */
const SCANS = fakeKV();
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://mail.test/')) {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
  }
  return realFetch(url, init);
};
const env = { SCANS, MAIL_API_KEY: 'k', MAIL_FROM: 'FasterGEO <letters@fastergeo.co>', MAIL_API_URL: 'https://mail.test/emails' };
const email = 'owner@example.com';
const p = {
  id: 'TESTproj01', url: target, lang: 'en', stage: 'done', email, log: [], pages: [], tickets: [],
  audit: { avgScore: null, site: { llmsTxtFound: false }, pages: [{ url: target, score: 40, blockers: ['spa-shell'] }] },
};
await SCANS.put(`p:${p.id}`, JSON.stringify(p));
await SCANS.put(`w:${email}:${p.id}`, 'project');

const r = await sweep(env);
if (r.checked !== 1 || r.failed) fail(`sweep did not check the project cleanly: ${JSON.stringify(r)}`);
const after = JSON.parse(SCANS.m.get(`p:${p.id}`));
if (after.loop?.reported?.['blocker:unreachable']) fail(`could not reach ${target} — network or proxy?`);
if (after.audit.pages[0].blockers?.length) fail(`${target} really has a blocker today; pick a clean site`);
if (r.mailed !== 1 || sent.length !== 1) fail(`expected exactly one letter, got ${sent.length} (${JSON.stringify(r)})`);
const L = sent[0];
if (L.to[0] !== email || !/fix is confirmed/.test(L.subject)) fail(`wrong letter: ${L.subject}`);
if (!L.text.includes('Fixed:')) fail('the letter must say what was fixed in the loop\'s own words');
if (!after.mail?.sent || !after.unsub) fail('the outcome and an unsubscribe token must be stored on the project');
console.log(`✓ sweep re-crawled ${target}, saw the fix land, wrote one letter: "${L.subject}"`);

const again = await sweep(env);
if (sent.length !== 1) fail(`a second sweep with nothing new wrote again (${JSON.stringify(again)})`);
console.log('✓ a second sweep with nothing new stays quiet');

/* ── the address does not leave the server ─────────────────────────────── */
const g = await (await projectGet({ request: new Request(`https://x/api/project?id=${p.id}`), env })).json();
if (JSON.stringify(g).includes(email) || g.unsub) fail('project GET leaks the address or the unsubscribe token');
if (!g.watched || !g.mailReady) fail('project GET should say it is watched and that mail is ready');
console.log('✓ project GET says "watched" without leaking who is watching');

/* ── unsubscribe needs the token, and a POST ──────────────────────────── */
const u = t => new Request(`https://x/api/unwatch?id=${p.id}&t=${t}`, { method: 'POST' });
if ((await unwatchPost({ request: u('wrong'), env })).status !== 404) fail('unsubscribe accepted a wrong token');
await unwatchGet({ request: new Request(`https://x/api/unwatch?id=${p.id}&t=${after.unsub}`), env });
if (!SCANS.m.has(`w:${email}:${p.id}`)) fail('a GET (a mail scanner prefetching) must not unsubscribe');
if ((await unwatchPost({ request: u(after.unsub), env })).status !== 200) fail('unsubscribe with the right token failed');
if (SCANS.m.has(`w:${email}:${p.id}`) || JSON.parse(SCANS.m.get(`p:${p.id}`)).email) fail('unsubscribe left the watch in place');
console.log('✓ unsubscribe needs the token and a POST; a prefetching GET changes nothing');

const r3 = await sweep(env);
if (r3.checked !== 0 || sent.length !== 1) fail('an unsubscribed project was swept or written to');
console.log('✓ after unsubscribing, the sweep leaves it alone');
