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

// A day later: inside the same day it would be skipped, and prove nothing.
const nextDay = key => { const x = JSON.parse(SCANS.m.get(key)); x.loop.lastCheck -= 86400e3; SCANS.m.set(key, JSON.stringify(x)); };
nextDay(`p:${p.id}`);
const again = await sweep(env);
if (again.checked !== 1) fail(`second sweep did not re-check: ${JSON.stringify(again)}`);
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

/* ── a watched scan from the landing page gets the same loop ──────────── */
// Its report page has always said "I re-check this page and write to you".
// Until 2026-10-30 nothing re-checked it; this is the guard on that promise.
const { watchScan } = await import('../functions/api/_store.js');
const { onRequestGet: reportGet } = await import('../functions/r/[id].js');
const scanEmail = 'brand@example.com';
const sid = 'TESTscan01';
await SCANS.put(`r:${sid}`, JSON.stringify({
  id: sid, url: target, lang: 'zh', probe: null, tickets: [], createdAt: '2026-10-01T00:00:00Z',
  page: { url: target, score: 40, grade: 'D', wordCount: 3, blockers: ['spa-shell'], dimensions: [] },
  site: { llmsTxtFound: false },
}));
await watchScan(env, sid, scanEmail);
const before = sent.length;
const rs = await sweep(env);
if (rs.checked !== 1 || rs.failed) fail(`watched scan was not swept: ${JSON.stringify(rs)}`);
const srec = JSON.parse(SCANS.m.get(`r:${sid}`));
if (srec.page.blockers?.length || !srec.loop?.lastCheck) fail('re-crawl results did not land on the scan record');
if (srec.email !== scanEmail) fail('sweeping a scan dropped its watcher');
if (sent.length !== before + 1) fail('a fix on a watched scan wrote no letter');
const SL = sent.at(-1);
if (!SL.text.includes(`/r/${sid}`) || !/重爬确认修好了/.test(SL.subject)) fail(`scan letter should link /r/ and be in the scan's language: ${SL.subject}`);
console.log(`✓ a watched scan is re-crawled and written to: "${SL.subject}"`);

const html = async e => (await reportGet({ params: { id: sid }, env: e, request: new Request(`https://x/r/${sid}`) })).text();
const withMail = await html(env);
if (!withMail.includes('盯上之后的变化') || !withMail.includes('修好了')) fail('report page does not show what the re-crawl found');
if (withMail.includes(scanEmail)) fail('report page leaks the watcher address');
const noMail = await html({ SCANS });
if (!noMail.includes('发信还没接通') || noMail.includes('就写信告诉你')) fail('without a sender the report page must not promise a letter');
if (!withMail.includes('就写信告诉你')) fail('with a sender the report page should promise the letter');
console.log('✓ report page shows the re-crawl log, and promises a letter only when one can leave');

const su = new Request(`https://x/api/unwatch?id=${sid}&t=${srec.unsub}`, { method: 'POST' });
if ((await unwatchPost({ request: su, env })).status !== 200) fail('scan unsubscribe failed');
if (SCANS.m.has(`w:${scanEmail}:${sid}`) || JSON.parse(SCANS.m.get(`r:${sid}`)).email) fail('scan unsubscribe left the watch in place');
console.log('✓ a scan unsubscribes the same way');
