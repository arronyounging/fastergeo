#!/usr/bin/env node
/**
 * Render the panel template as the Worker would, then parse the script it
 * produced.
 *
 * Checking the source file is not enough and cost several deploys to learn: the
 * whole panel is one template literal, and the gap between what the source says
 * and what the template emits is where every one of tonight's failures lived —
 * a backtick that closed the template early, escapes that survived in source and
 * vanished in output. The only honest check renders it first.
 */
import { onRequestGet } from '../functions/p/[id].js';

const res = await onRequestGet({
  params: { id: 'TESTID123' },
  request: new Request('https://x/p/TESTID123?lang=zh'),
});
const html = await res.text();
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!m) { console.error('✗ no <script> in rendered panel'); process.exit(1); }
try {
  new Function(m[1]);
  console.log(`✓ rendered panel parses · ${Math.round(html.length / 1024)} KB`);
  // Parsing is not enough. A regex built from a string inside a template goes
  // through three layers of escaping, and one that survives parsing can still
  // throw the moment it is constructed — which is how a broken **bold** rule
  // shipped and surfaced only as a silent "could not load" in the panel.
  const esc = m[1].match(/const esc = [\s\S]*?\n/)[0];
  const mdSrc = m[1].slice(m[1].indexOf('function md(src){'), m[1].indexOf('function showDoc'));
  const md = new Function(esc + mdSrc + '\nreturn md;')();
  const out = md('## H\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n\n**bold** text');
  for (const need of ['<h4>', '<table>', '<li>', '<b>bold</b>']) {
    if (!out.includes(need)) throw new Error(`md() lost ${need}`);
  }
  console.log('✓ md() renders headings, tables, lists and bold');

  // The queue renderer, run against the shape the API actually returns. A panel
  // that parses can still render an empty pane, and "the fix list is blank" is
  // exactly the failure a user would report as the whole product being broken.
  // Everything in this file is declared at the top level: one-line consts end at
  // the newline, functions end at the first unindented closing brace.
  const take = h => {
    const i = m[1].indexOf(h);
    if (i < 0) throw new Error(`panel lost ${h.trim()}`);
    const rest = m[1].slice(i);
    if (!h.startsWith('function')) return rest.slice(0, rest.indexOf('\n'));
    const end = rest.indexOf('\n}');
    if (end < 0) throw new Error(`could not find the end of ${h.trim()}`);
    return rest.slice(0, end + 2);
  };
  const src = ['const T = ', 'const esc = ', 'const h2 = ', 'const waiting = ',
    'function chip(', 'function verifyLine(', 'function today('].map(take).join('\n');

  const el = { innerHTML: '', querySelectorAll: () => [] };
  const feed = [
    { key: 'k1', state: 'regressed', priority: 'P0', title: 'llms.txt 不见了',
      rationale: 'r', acceptance: { desc: 'd' }, playbook: { skill: 's', covers: 'c' } },
    { key: 'k2', state: 'new', priority: 'P1', title: '首页读不到', acceptance: { desc: 'd' } },
  ];
  const doneItems = [{ key: 'k3', state: 'done', title: '已修', resolvedAt: '2026-08-01T00:00:00Z', doneBy: 'owner' }];
  const mk = proj => new Function('document', 'P', 'ZH', 'ID',
    src + '\nreturn (a,b,c) => { today(a,b,c); return document.getElementById("pToday").innerHTML; };')(
    { getElementById: () => el }, proj, true, 'TESTID123');
  const run = mk({ stage: 'done', url: 'https://x.com' });
  const pane = run(feed, { unread: 2 }, doneItems);
  for (const need of ['又坏了', '未读', '我修好了', '放回去', 'llms.txt']) {
    if (!pane.includes(need)) throw new Error(`today() lost "${need}"`);
  }
  // The empty state must still say something. A blank pane reads as a crash.
  const empty = run([], { unread: 0 }, []);
  if (!empty.includes('没有待办')) throw new Error('today() renders nothing when the queue is empty');
  // Both halves of the verification claim. The strong one must not appear until
  // a loop run has actually happened — that sentence going out early is exactly
  // the promise-before-plumbing failure that keeps recurring here.
  if (!pane.includes('还没接上')) throw new Error('unwatched project must not claim a daily re-crawl');
  const watched = mk({ stage: 'done', url: 'https://x.com', loop: { lastCheck: 1785000000000 } })(feed, { unread: 0 }, []);
  if (!watched.includes('每天重爬核对')) throw new Error('a project the loop has run on should say so');
  console.log('✓ today() renders the queue, its states, its actions and its empty case');
  console.log('✓ the daily-re-crawl claim only appears once the loop has actually run');
} catch (e) {
  console.error(`✗ rendered panel is broken: ${e.message}`);
  const lines = m[1].split('\n');
  for (let n = 1; n <= lines.length; n++) {
    const chunk = lines.slice(0, n).join('\n');
    try { new Function(chunk); } catch (err) {
      if (!/Unexpected end|Unexpected token '\)'|Unexpected token '\}'/.test(err.message)) {
        console.error(`  first bad line ${n}: ${lines[n - 1].slice(0, 120)}`);
        break;
      }
    }
  }
  process.exit(1);
}
