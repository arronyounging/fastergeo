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
