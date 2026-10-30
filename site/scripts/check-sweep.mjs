/**
 * The sweep against a site that misbehaves on demand. No network.
 *
 * Every case here is a letter that would be false, or missing. The product's
 * argument is that its claims are checked by a machine, so a request that
 * happened to fail must never read as a fix landing or a fix breaking.
 *   node scripts/check-sweep.mjs
 */
import { sweep } from '../functions/api/sweep.js';
import { onRequestPost as watchPost } from '../functions/api/watch.js';
import { onRequestPost as unwatchPost } from '../functions/api/unwatch.js';
import { onRequestPost as confirmPost, onRequestGet as confirmGet } from '../functions/api/confirm.js';
import { onRequestGet as projectGet } from '../functions/api/project.js';

const fail = m => { console.error(`✗ ${m}`); process.exit(1); };
const ROOT = 'https://site.test/';
const body = n => `<html><head><title>Acme</title></head><body><h1>Acme</h1>${'<p>Acme makes things for people who need things made well. </p>'.repeat(n)}</body></html>`;

function world() {
  const m = new Map();
  const SCANS = { m,
    get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true }) };
  const site = { '/': () => new Response(body(40)), '/robots.txt': () => new Response('User-agent: *\nAllow: /'),
    '/sitemap.xml': () => new Response('x'), '/llms.txt': () => new Response('x') };
  const sent = []; let mailStatus = 200;
  globalThis.fetch = async (u, init) => {
    const url = new URL(String(u));
    if (url.hostname === 'mail.test') {
      if (mailStatus !== 200) return new Response('{}', { status: mailStatus });
      sent.push(JSON.parse(init.body)); return new Response('{"id":"m"}');
    }
    const h = site[url.pathname] ?? (() => new Response('', { status: 404 }));
    return h();
  };
  return { SCANS, site, sent, setMail: s => { mailStatus = s; },
    env: { SCANS, MAIL_API_KEY: 'k', MAIL_FROM: 'x@y.z', MAIL_API_URL: 'https://mail.test/e' } };
}
const dropped = () => { throw new Error('dropped'); };
const down = () => new Response('', { status: 503 });

/** Audit the fake site for real, so the baseline is what the code would store. */
const { auditPage, checkSite } = await import('@fastergeo/audit');
const { generateTickets, mergeFeed } = await import('@fastergeo/tickets');
async function project(w, id = 'proj000001', email = 'o@x.test') {
  const page = await auditPage(ROOT, { timeoutMs: 1000 });
  const site = await checkSite(ROOT, 1000);
  const audit = { root: ROOT, site, pages: [page], avgScore: page.score, blockers: [], gradeDistribution: {} };
  const tickets = generateTickets(audit, undefined, 'en');
  const p = { id, url: ROOT, lang: 'en', stage: 'done', email, emailConfirmed: true, unsub: 'tok', confirmToken: 'ctok', log: [], pages: [], audit, tickets, feed: mergeFeed([], tickets).items };
  await w.SCANS.put(`p:${id}`, JSON.stringify(p));
  await w.SCANS.put(`w:${email}:${id}`, 'project');
  return p;
}
const read = (w, id = 'proj000001') => JSON.parse(w.SCANS.m.get(`p:${id}`));
const edit = (w, fn, id = 'proj000001') => { const p = read(w, id); fn(p); w.SCANS.m.set(`p:${id}`, JSON.stringify(p)); };
const tomorrow = (w, id) => edit(w, p => { if (p.loop) p.loop.lastCheck -= 86400e3; }, id);

/* ── a dropped request on the re-crawl is not a regression ─────────────── */
let w = world();
await project(w);
w.site['/llms.txt'] = dropped; w.site['/robots.txt'] = down;
let r = await sweep(w.env);
if (r.checked !== 1 || w.sent.length) fail(`flaky llms/robots wrote a letter: ${w.sent[0]?.subject} ${JSON.stringify(r)}`);
if (!read(w).audit.site.llmsTxtFound) fail('an unmeasured llms.txt overwrote the last known value');
console.log('✓ llms.txt and robots.txt failing on the re-crawl: no letter, last known value kept');

/* ── nor is one on the baseline a fix, later ───────────────────────────── */
w = world();
w.site['/llms.txt'] = dropped;
await project(w);
if (read(w).tickets.some(t => t.acceptance?.check === 'site.llms_txt')) fail('a baseline that could not measure llms.txt raised a ticket for it');
w.site['/llms.txt'] = () => new Response('x');
r = await sweep(w.env);
if (w.sent.length) fail(`learning llms.txt exists was reported as a fix: ${w.sent[0].text}`);
console.log('✓ a baseline that could not measure llms.txt raises no ticket and claims no fix later');

/* ── a measured change still is news ───────────────────────────────────── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
if (!read(w).tickets.some(t => t.acceptance?.check === 'site.llms_txt')) fail('a real 404 must raise the ticket');
w.site['/llms.txt'] = () => new Response('x');
r = await sweep(w.env);
if (w.sent.length !== 1 || !/fix is confirmed/.test(w.sent[0].subject)) fail('a real fix wrote no letter');
w.site['/llms.txt'] = () => new Response('', { status: 404 });
tomorrow(w);
await sweep(w.env);
if (w.sent.length !== 2 || !/needs a look/.test(w.sent[1].subject)) fail(`a real regression wrote no letter: ${w.sent[1]?.subject}`);
console.log('✓ a real 404 → 200 is a fix letter, and 200 → 404 a regression letter');

/* ── a page that 503s or drops keeps its tickets ───────────────────────── */
w = world();
const P2 = 'https://site.test/two';
w.site['/two'] = () => new Response('<html><body><p>tiny</p></body></html>');
{
  const p = await project(w);
  const two = await auditPage(P2, { timeoutMs: 1000 });
  edit(w, x => {
    x.audit.pages.push(two);
    x.tickets = generateTickets(x.audit, undefined, 'en');
    x.feed = mergeFeed([], x.tickets).items;
  });
  void p;
}
const keys0 = read(w).feed.filter(i => i.state !== 'done').map(i => i.key).sort().join();
w.site['/two'] = down;
await sweep(w.env);
if (w.sent.length) fail(`a page returning 503 produced a letter: ${w.sent[0].text}`);
if (read(w).audit.pages.length !== 2) fail('a failed page was dropped from the audit');
tomorrow(w); w.site['/two'] = dropped;
await sweep(w.env);
if (w.sent.length) fail(`a dropped page produced a letter: ${w.sent[0].text}`);
if (read(w).feed.filter(i => i.state !== 'done').map(i => i.key).sort().join() !== keys0) fail('a failed page changed the open queue');
console.log('✓ one page failing (503 or dropped) leaves the queue alone and writes nothing');

/* ── the score-target ticket crossing 70 does not route around the noise floor ── */
// A page that scores above 70, so the ticket really does clear on this run.
const good = `<html lang="en"><head><title>What is Acme? A guide to well-made things</title>
<meta name="description" content="Acme makes well-made things. This guide explains what Acme is, how it compares, and how to start.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","sameAs":["https://a.test","https://b.test"]}</script>
<script type="application/ld+json">{"@type":"Article","datePublished":"2026-10-01","dateModified":"2026-10-20","author":{"@type":"Person","name":"Ann Lee"}}</script>
</head><body><h1>What is Acme?</h1><p>Acme is a maker of well-made things, founded in 2014, serving 12,000 customers in 40 countries.</p>
<h2>How does Acme compare?</h2><table><tr><th>Acme</th><th>Others</th></tr><tr><td>10 years</td><td>2 years</td></tr></table><p>Acme outlasts others by 40% according to <a href="https://ext.test/study">an independent study</a>.</p>
<h2>How to start with Acme</h2><ol><li>Step one: choose a thing.</li><li>Step two: order it.</li><li>Step three: use it.</li></ol>
<h2>Frequently asked questions</h2><h3>Is Acme expensive?</h3><p>Acme costs 20% less than the market average.</p><h3>Where does Acme ship?</h3><p>Acme ships to 40 countries worldwide.</p>
${'<p>Acme makes things for people who need things made well, and it publishes how each one is made so buyers can check.</p>'.repeat(30)}
</body></html>`;
w = world();
w.site['/'] = () => new Response(good);
await project(w);
const scored = read(w).audit.pages[0].score;
if (scored < 70) fail(`fixture must score above 70 for this case to mean anything: ${scored}`);
edit(w, x => {
  const t = { id: 'T-9', title: 'Raise the score', priority: 'P1', acceptance: { type: 'auto', check: 'site.avg_score_gte:70', desc: 'd' } };
  x.feed = [...x.feed, { ...t, key: t.acceptance.check, state: 'seen', firstSeen: '2026-01-01', lastSeen: '2026-01-01' }];
});
await sweep(w.env);
if (read(w).feed.find(i => i.key === 'site.avg_score_gte:70').state !== 'done') fail('the score ticket should have cleared here');
if (w.sent.some(l => /Raise the score/.test(l.text)) || read(w).log.some(l => /Raise the score/.test(l.m))) fail('score ticket flip was reported as a fix');
console.log(`✓ the score-target ticket clearing (score ${scored}) is not reported as a fix`);

/* ── "I fixed this", then the crawl agrees: that is the letter they wait for ── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
edit(w, x => { const i = x.feed.find(f => f.key === 'site.llms_txt'); i.state = 'done'; i.doneBy = 'owner'; });
w.site['/llms.txt'] = () => new Response('x');
await sweep(w.env);
if (w.sent.length !== 1) fail('a claimed fix the crawl confirmed wrote no letter');
if (read(w).feed.find(f => f.key === 'site.llms_txt').doneBy) fail('a confirmed claim should stop being a mere claim');
console.log('✓ an owner-marked fix the crawl confirms gets its letter, once');

/* ── everyone gets their turn ──────────────────────────────────────────── */
w = world();
const n = 8;
for (let i = 0; i < n; i++) await project(w, `proj00000${i}`, `o${i}@x.test`);
let runs = 0, total = 0, last;
do { last = await sweep(w.env); total += last.checked; runs++; } while (last.more && runs < 10);
if (total !== n) fail(`only ${total} of ${n} watched sites were checked in ${runs} runs`);
if (last.checked > 3) fail('a run exceeded its budget');
for (let i = 0; i < n; i++) if (!read(w, `proj00000${i}`).loop?.lastCheck) fail(`proj00000${i} was never reached`);
console.log(`✓ ${n} watched sites are all reached across ${runs} hourly runs, at most 3 each`);

/* ── a holder of the link cannot replace the watcher ───────────────────── */
w = world();
await project(w);
const wreq = email => ({ request: new Request('https://x/api/watch', { method: 'POST', body: JSON.stringify({ id: 'proj000001', email, kind: 'project' }) }), env: w.env });
if ((await watchPost(wreq('evil@x.test'))).status !== 409) fail('anyone with the link could replace the watcher');
if (read(w).email !== 'o@x.test') fail('the watcher was replaced');
if ((await watchPost(wreq('o@x.test'))).status !== 200) fail('re-submitting your own address should stay idempotent');
console.log('✓ the link cannot replace who is watching; re-submitting your own address is fine');

/* ── a key left behind by an older address goes away ───────────────────── */
w = world();
await project(w);
await w.SCANS.put('w:old@x.test:proj000001', 'project');
await sweep(w.env);
if (w.SCANS.m.has('w:old@x.test:proj000001')) fail('a stale watch key survived the sweep');
if (w.sent.some(l => l.to[0] === 'old@x.test')) fail('an old address was written to');
console.log('✓ a stale watch key is removed and never written to');

/* ── unsubscribing while the check runs ────────────────────────────────── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
w.site['/llms.txt'] = () => {
  // Fires during the sweep's crawl, as a real click would.
  edit(w, x => { delete x.email; });
  return new Response('x');
};
await sweep(w.env);
if (w.sent.length) fail('a letter went out after unsubscribing mid-check');
if (read(w).email) fail('the sweep saved the address back after an unsubscribe');
console.log('✓ unsubscribing mid-check: no letter, and the address is not restored');

/* ── a letter that fails to leave is retried, and not forever ──────────── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
w.site['/llms.txt'] = () => new Response('x');
w.setMail(502);
r = await sweep(w.env);
if (r.unmailed !== 1 || !read(w).mailPending) fail('a failed send was not kept for retry');
w.setMail(200); tomorrow(w);
r = await sweep(w.env);
if (w.sent.length !== 1 || !/llms/.test(w.sent[0].text)) fail(`the retry did not deliver the original news: ${JSON.stringify(r)}`);
if (read(w).mailPending) fail('a delivered letter stayed pending');
tomorrow(w);
await sweep(w.env);
if (w.sent.length !== 1) fail('a delivered letter was sent again');
w.setMail(502);
w.site['/llms.txt'] = () => new Response('', { status: 404 }); tomorrow(w);
await sweep(w.env);
edit(w, x => { x.mailPending.lines.forEach(l => { l.t -= 15 * 86400e3; }); });
w.setMail(200); tomorrow(w);
const before2 = w.sent.length;
await sweep(w.env);
if (w.sent.length !== before2) fail('news older than two weeks was still mailed');
console.log('✓ a failed send is retried once delivered stays delivered, and stale news is dropped');

/* ── no sender configured: nothing queues up ───────────────────────────── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
w.site['/llms.txt'] = () => new Response('x');
const noMail = { SCANS: w.SCANS };
r = await sweep(noMail);
if (read(w).mailPending) fail('a backlog built up while mail was not configured');
if (!read(w).log.some(l => /llms/.test(l.m))) fail('without mail the result must still land on the page');
console.log('✓ no sender: results land on the page and no backlog waits to flood the inbox');

/* ── unsubscribe by token still works after all of this ────────────────── */
w = world();
await project(w);
const ok = await unwatchPost({ request: new Request('https://x/api/unwatch?id=proj000001&t=tok', { method: 'POST' }), env: w.env });
if (ok.status !== 200 || read(w).email) fail('unsubscribe broke');
console.log('✓ unsubscribe intact');

/* ── nobody gets a letter until the inbox says yes ─────────────────────── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
edit(w, x => { delete x.emailConfirmed; delete x.confirmToken; });
w.site['/llms.txt'] = () => new Response('x');
await sweep(w.env);
if (w.sent.length !== 1 || !/Confirm/.test(w.sent[0].subject)) fail(`an unconfirmed address got something other than the one question: ${w.sent[0]?.subject}`);
const ctok = read(w).confirmToken;
if (!read(w).log.some(l => /llms/.test(l.m))) fail('the result should land on the page even when unconfirmed');
tomorrow(w);
await sweep(w.env);
if (w.sent.length !== 1) fail('the question was asked twice');
const cReq = (t, method = 'POST') => ({ request: new Request(`https://x/api/confirm?id=proj000001&t=${t}`, { method }), env: w.env });
if ((await confirmPost(cReq('wrong'))).status !== 404 || read(w).emailConfirmed) fail('confirmed with a wrong token');
await confirmGet(cReq(ctok, 'GET'));
if (read(w).emailConfirmed) fail('a GET (a mail scanner) confirmed the address');
if ((await confirmPost(cReq(ctok))).status !== 200 || !read(w).emailConfirmed) fail('confirming failed');
w.site['/llms.txt'] = () => new Response('', { status: 404 }); tomorrow(w);
await sweep(w.env);
if (w.sent.length !== 2 || !/needs a look/.test(w.sent[1].subject)) fail('a confirmed address should get the letter');
console.log('✓ unconfirmed: one question and no letter; token + POST confirm; then letters flow');

/* ── an address nobody confirms is deleted ─────────────────────────────── */
w = world();
await project(w);
edit(w, x => { delete x.emailConfirmed; x.confirmSentAt = new Date(Date.now() - 15 * 86400e3).toISOString(); });
await sweep(w.env);
if (read(w).email || w.SCANS.m.has('w:o@x.test:proj000001')) fail('an unconfirmed address outlived two weeks');
if (w.sent.length) fail('wrote to an address while deleting it');
console.log('✓ an address unconfirmed after 14 days is forgotten');

/* ── the form: asks once, caps per inbox, replaces only the unconfirmed ── */
w = world();
await project(w);
edit(w, x => { delete x.email; delete x.emailConfirmed; delete x.confirmToken; delete x.unsub; });
w.SCANS.m.delete('w:o@x.test:proj000001');
const form = async email => {
  const res = await watchPost({ request: new Request('https://f.test/api/watch', { method: 'POST', body: JSON.stringify({ id: 'proj000001', email, kind: 'project' }) }), env: w.env });
  return { status: res.status, ...(await res.json()) };
};
let f1 = await form('a@x.test');
if (f1.confirm !== 'sent' || w.sent.length !== 1 || !w.sent[0].text.includes('https://f.test/api/confirm')) fail(`first submit should send one question: ${JSON.stringify(f1)}`);
f1 = await form('a@x.test');
if (f1.confirm !== 'sent' || w.sent.length !== 1) fail('resubmitting sent the question again');
const tok1 = read(w).unsub;
f1 = await form('b@x.test');
if (f1.status !== 200 || read(w).email !== 'b@x.test' || w.sent.at(-1).to[0] !== 'b@x.test') fail('an unconfirmed address should be replaceable');
if (w.SCANS.m.has('w:a@x.test:proj000001')) fail('the replaced address kept its watch key');
if (read(w).unsub === tok1) fail('a new address must not inherit the old unsubscribe token');
// A second record the same inbox is aimed at, until the cap.
for (let i = 0; i < 4; i++) await project(w, `capp00000${i}`, `x${i}@x.test`);
const count0 = w.sent.length;
const aim = async id => { edit(w, x => { delete x.email; delete x.emailConfirmed; delete x.confirmSentAt; }, id);
  const res = await watchPost({ request: new Request('https://f.test/api/watch', { method: 'POST', body: JSON.stringify({ id, email: 'victim@x.test', kind: 'project' }) }), env: w.env });
  return (await res.json()).confirm; };
const outcomes = [];
for (let i = 0; i < 4; i++) outcomes.push(await aim(`capp00000${i}`));
if (outcomes.join() !== 'sent,sent,sent,limited' || w.sent.length !== count0 + 3) fail(`per-inbox cap: ${outcomes}`);
console.log('✓ the form asks once per record, three times a day per inbox, and only replaces the unconfirmed');

/* ── project GET leaks no token ────────────────────────────────────────── */
w = world();
await project(w);
const g = await (await projectGet({ request: new Request('https://x/api/project?id=proj000001'), env: w.env })).json();
if (/ctok|"tok"|o@x\.test/.test(JSON.stringify(g))) fail('project GET leaks a token or the address');
if (!g.watched || !g.watchConfirmed) fail('project GET should report watch state');
console.log('✓ project GET reports watch state without tokens or the address');

/* ── a record from before "unmeasured" existed cannot prove a change ───── */
w = world();
w.site['/llms.txt'] = () => new Response('', { status: 404 });
await project(w);
edit(w, x => { delete x.audit.site.unmeasured; });
w.site['/llms.txt'] = () => new Response('x');
await sweep(w.env);
if (w.sent.length) fail(`a legacy baseline claimed a fix: ${w.sent[0].text}`);
if (!read(w).feed.find(i => i.key === 'site.llms_txt' && i.state === 'done')) fail('the queue should still settle on the truth');
w.site['/llms.txt'] = () => new Response('', { status: 404 }); tomorrow(w);
await sweep(w.env);
if (w.sent.length !== 1) fail('after one sound run, changes should be news again');
console.log('✓ a legacy baseline settles silently; the next change is news again');
