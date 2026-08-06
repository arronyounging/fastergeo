/**
 * GET /c/<id> — the console.
 *
 * This is a port, not a design. The local workbench (`fastergeo ui`) already had
 * the better one, and I spent a day iterating on a worse copy here — while
 * writing in a planning document that two information architectures would
 * eventually split into two products. They should never have been two.
 *
 * So the layout, the copy, the domain strip and the honesty patterns all come
 * from apps/cli/src/ui.html. What changes is the data source: the local surface
 * reads a project directory, this one reads a KV project — and where the local
 * one says "run this command", the hosted one says what is and is not wired on
 * the hosted side.
 *
 * The patterns worth keeping intact, because they are the product:
 *   · seven domains listed even when unwired, each labelled live / CLI / not
 *     covered — "we do not do this" said plainly beats an indefinite soon
 *   · engines that did not run read a dash, never 0, and the caption says why
 *   · no blurred placeholders: we do not pretend to hold what we never measured
 *   · done means re-crawled, not asserted
 */
import { CAPABILITIES, summarise } from '@fastergeo/capabilities';
import { TIERS } from '@fastergeo/engine';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function onRequestGet({ params, request }) {
  const lang = new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  return new Response(shell(params.id, lang), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function shell(id, lang) {
  const zh = lang === 'zh';
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>FasterGEO</title><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#F3F1EA;--card:#FFF;--well:#F8F6F0;--line:#E4E0D4;--rule:#D8D3C4;
--tx:#1C1A15;--dim:#5C574D;--faint:#98917F;--red:#B23A26;--red-soft:#F8ECE8;
--ok:#20714A;--ok-soft:#EAF1EB;--amber:#8A6100;--amber-soft:#F5EFDE}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--tx);
font:13.5px/1.6 -apple-system,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1560px;margin:0 auto;padding:16px}
.mono{font-family:ui-monospace,"IBM Plex Mono",Menlo,monospace}
.beat{display:flex;align-items:center;gap:14px;background:#1C1A15;color:#E8E4D8;
border-radius:10px 10px 0 0;padding:11px 18px;font-size:12.5px;flex-wrap:wrap}
.dot{width:7px;height:7px;border-radius:50%;background:#4ADE80;box-shadow:0 0 8px #4ADE80;flex:none}
.dot.bad{background:#B23A26;box-shadow:0 0 8px #B23A26}
.beat .sp{flex:1}
.btn{background:#F3F1EA;color:#1C1A15;border:none;border-radius:6px;padding:6px 13px;
font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}
.btn.ghost{background:transparent;color:#B9B3A3;border:1px solid #4A453B}
.btn:hover{opacity:.85}
.wallbar{background:var(--red);color:#fff;padding:12px 18px;font-size:12.5px;line-height:1.75}
.wallbar b{display:block;font:700 15px "Newsreader",Georgia,"Songti SC",serif;margin-bottom:3px}
.panes{display:grid;grid-template-columns:236px minmax(0,1fr) 320px 300px;gap:1px;background:var(--line);
border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px}
@media(max-width:1180px){.panes{grid-template-columns:1fr}}
.pane{background:var(--card);padding:16px 15px;min-width:0}
.ph{font:500 10.5px/1 ui-monospace,"IBM Plex Mono",Menlo,monospace;letter-spacing:.14em;
text-transform:uppercase;color:var(--dim);display:flex;justify-content:space-between;
align-items:center;gap:8px;padding-bottom:9px;border-bottom:1px solid var(--line);margin-bottom:13px}
.ph b{color:var(--tx);font-weight:600}
.brandname{font:700 19px "Newsreader",Georgia,"Songti SC",serif;margin-bottom:2px}
.sub{color:var(--faint);font-size:11.5px;margin-bottom:14px;word-break:break-all}
.doc{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 0;
border-bottom:1px dotted var(--rule);font-size:12.5px;cursor:pointer}
.doc:last-child{border-bottom:none}
.doc:hover{color:var(--red)}
.doc .e{color:var(--faint);font-size:11px;flex:none}
.tag{display:inline-block;font-size:9.5px;padding:1px 6px;border-radius:3px;
background:var(--ok-soft);color:var(--ok);margin-left:5px;font-weight:600;white-space:nowrap}
.tag.warn{background:var(--amber-soft);color:var(--amber)}
.tag.off{background:var(--well);color:var(--faint)}
.sect{font:500 10px ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;
color:var(--faint);margin:18px 0 7px}
.chip{display:inline-block;font-size:11.5px;background:var(--well);border:1px solid var(--line);
border-radius:20px;padding:2px 10px;margin:0 4px 5px 0}
.rules{margin-top:20px;padding:11px 12px;background:var(--well);border-radius:7px;
font-size:11px;line-height:1.75;color:var(--dim)}
.rules b{color:var(--tx)}
.tabs{display:flex;gap:3px;margin-bottom:15px;flex-wrap:wrap}
.tab{font-size:11.5px;padding:5px 11px;border-radius:6px;color:var(--dim);cursor:pointer;
border:1px solid transparent;user-select:none}
.tab:hover{background:var(--well)}
.tab.on{background:#1C1A15;color:#F3F1EA;font-weight:600}
.tab.soon{color:#BEB8A8}
.quote{background:var(--red-soft);border-left:3px solid var(--red);border-radius:0 8px 8px 0;
padding:16px 18px;margin-bottom:11px}
.quote.calm{background:var(--well);border-left-color:var(--rule)}
.quote .q{font:italic 500 16px/1.55 "Newsreader",Georgia,"Songti SC",serif}
.quote.calm .q{font-style:normal;font-size:14px}
.qmeta{margin-top:9px;font:500 10.5px ui-monospace,Menlo,monospace;color:var(--dim);letter-spacing:.04em}
.qtag{display:inline-block;padding:1px 7px;border-radius:3px;background:var(--red);color:#fff;
margin-right:7px;font-size:9px;letter-spacing:.06em}
.qtag.warn{background:var(--amber)}
.meter{margin-top:12px;padding:12px 14px;border:1px dashed var(--rule);border-radius:8px;
display:flex;align-items:center;gap:12px;background:#FCFBF7;flex-wrap:wrap}
.meter .n{font:500 21px ui-monospace,Menlo,monospace}
.meter .t{flex:1;min-width:200px;font-size:12px;color:var(--dim)}
.meter .t b{color:var(--tx)}
.funnel{display:flex;margin:20px 0 6px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.st{flex:1;padding:11px 6px;text-align:center;border-right:1px solid var(--line);font-size:11px}
.st:last-child{border-right:none}
.st .v{font:500 15px ui-monospace,Menlo,monospace;display:block;margin-bottom:3px}
.st.bad{background:var(--red-soft)} .st.bad .v{color:var(--red)}
.st.good{background:var(--ok-soft)} .st.good .v{color:var(--ok)}
.st.na{background:var(--well)} .st.na .v{color:var(--faint)}
.cap{font-size:10.5px;color:var(--faint);margin-bottom:18px;line-height:1.7}
.cap b{color:var(--dim)}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;font:500 10px ui-monospace,Menlo,monospace;letter-spacing:.1em;
text-transform:uppercase;color:var(--faint);padding:6px 8px;border-bottom:1px solid var(--rule)}
td{padding:6px 8px;border-bottom:1px solid var(--line)}
td.num{font-family:ui-monospace,Menlo,monospace;text-align:right}
tr.off td{color:#BEB8A8}
.nokey{font-size:10px;color:var(--faint);border:1px solid var(--line);border-radius:3px;padding:0 5px;white-space:nowrap}
.card{border:1px solid var(--line);border-radius:8px;padding:12px 13px;margin-bottom:9px;background:var(--well)}
.card .k{display:flex;gap:7px;align-items:center;margin-bottom:6px}
.pr{font:600 9.5px ui-monospace,Menlo,monospace;padding:1px 6px;border-radius:3px}
.pr.P0{background:var(--red);color:#fff}
.pr.P1{background:var(--amber-soft);color:var(--amber)}
.pr.P2{background:var(--well);color:var(--dim);border:1px solid var(--line)}
.card .t{font-weight:600;font-size:13px;margin-bottom:4px}
.card .w{font-size:11.5px;color:var(--dim);margin-bottom:8px}
.card .acc{font-size:11px;color:var(--dim);padding-top:7px;border-top:1px dotted var(--rule)}
.card .acc b{color:var(--ok)}
.card .acts{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
.act{background:var(--card);border:1px solid var(--line);border-radius:5px;color:var(--dim);
padding:4px 9px;font:11px ui-monospace,Menlo,monospace;cursor:pointer}
.act:hover{border-color:var(--tx);color:var(--tx)}
.act.go{background:#1C1A15;border-color:#1C1A15;color:#F3F1EA}
.act[disabled]{opacity:.5;cursor:default}
.state{display:flex;gap:8px;margin:13px 0;font-size:11.5px}
.state span{flex:1;text-align:center;padding:7px 4px;border-radius:6px;background:var(--well)}
.state .g{color:var(--ok)} .state .r{color:var(--amber)}
.soonbox{border:1px dashed var(--rule);border-radius:8px;padding:18px 20px;background:#FCFBF7}
.soonbox h3{font:600 15px "Newsreader",Georgia,"Songti SC",serif;margin:0 0 6px}
.soonbox p{margin:0 0 12px;font-size:12.5px;color:var(--dim);line-height:1.7}
.soonbox .caps{font-size:11.5px;color:var(--dim);line-height:1.8}
.soonbox .caps b{color:var(--tx)}
.askbox{background:var(--well);border:1px solid var(--line);border-radius:8px;padding:11px 12px;margin-top:14px}
.askbox input{width:100%;border:1px solid var(--line);border-radius:6px;padding:7px 9px;
font:12px ui-monospace,Menlo,monospace;background:var(--card);color:var(--tx)}
.askbox button{margin-top:7px;width:100%}
.ans{margin-top:10px;font-size:12.5px;line-height:1.75;color:var(--dim)}
.ans b{color:var(--tx)}
.ans .src{margin-top:8px;font-size:10.5px;color:var(--faint)}
.brief{font-size:12px;line-height:1.75;padding-left:16px;margin:0}
.brief li{margin-bottom:9px}
.note{font-size:10.5px;color:var(--faint)}
.empty{color:var(--faint);font-size:12.5px;padding:22px 0;text-align:center}
.beat .caret{background:none;border:0;color:#B9B3A3;cursor:pointer;font-size:12px;padding:2px 4px;
line-height:1;border-radius:4px;flex:none}
.beat .caret:hover{background:#2C2823;color:#F3F1EA}
.beat .tail{color:#8A8371;font-family:ui-monospace,Menlo,monospace;font-size:11px;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38vw;flex:none}
.term{background:#12100C;color:#C8C2B2;font:11.5px/1.85 ui-monospace,Menlo,monospace;
padding:10px 18px 6px;height:150px;overflow:auto;position:relative;transition:height .12s}
.term.hide{display:none}
.term div{white-space:pre-wrap}
.term .tg{color:#7FA88A}
.term .day{color:#6B6558;text-align:center;margin:6px 0}
/* Okara puts a grab bar under the terminal; the height is a preference, so it
   is remembered rather than reset on every visit. */
.grip{height:9px;background:#12100C;display:flex;align-items:center;justify-content:center;cursor:ns-resize}
.grip.hide{display:none}
.grip i{width:34px;height:3px;border-radius:2px;background:#3A352C;display:block}
.grip:hover i{background:#5C574D}
/* Panes collapse to a rail, the way Okara's Company and Analytics columns do. */
.ph .cx{background:none;border:0;color:var(--faint);cursor:pointer;font-size:12px;padding:0 2px;line-height:1}
.ph .cx:hover{color:var(--tx)}
.pane.rail{padding:16px 6px;overflow:hidden;cursor:pointer}
.pane.rail .railname{writing-mode:vertical-rl;font:500 10.5px ui-monospace,Menlo,monospace;
letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin:0 auto}
/* Every block of numbers gets a title and one line saying what produced it —
   the pattern that makes Okara's Analytics column readable rather than dense. */
.shead{margin:20px 0 9px}
.shead:first-child{margin-top:4px}
.shead b{display:block;font:600 13.5px "Newsreader",Georgia,"Songti SC",serif}
.shead span{display:block;font-size:11px;color:var(--faint);margin-top:1px}
.rings{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.ring{text-align:center;width:62px}
.ring svg{display:block;margin:0 auto}
.ring .rv{font:500 14px ui-monospace,Menlo,monospace;fill:var(--tx)}
.ring .rl{display:block;font-size:10px;color:var(--faint);margin-top:3px;line-height:1.35}
.sig{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:7px 8px;
border-bottom:1px solid var(--line);font-size:12px}
.sig:last-child{border-bottom:none}
.sig .w{color:var(--amber)}
.sig .sv{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--dim);text-align:right;flex:none}
dialog{border:1px solid var(--line);border-radius:10px;padding:0;max-width:860px;width:92vw;
background:var(--card);color:var(--tx)}
dialog::backdrop{background:rgba(28,26,21,.4)}
.dlg-h{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 18px;
border-bottom:1px solid var(--line);font:600 13px ui-monospace,Menlo,monospace}
.dlg-b{padding:16px 20px;max-height:70vh;overflow:auto;white-space:pre-wrap;
font:12px/1.75 ui-monospace,"IBM Plex Mono",Menlo,monospace}
a{color:var(--red)}
/* Convergence rows. The left edge carries the strength of agreement, because
   that is the ranking — a reader should be able to skim the border alone. */
.conv{border-left:3px solid var(--line);padding:10px 0 10px 13px;margin-bottom:11px}
.convh{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.convh b{font:600 14px "Newsreader",Georgia,"Songti SC",serif;flex:1;min-width:180px}
.agree{font:600 9.5px ui-monospace,Menlo,monospace;padding:1px 7px;border-radius:3px;
background:var(--ok-soft);color:var(--ok);white-space:nowrap}
.agree.solo{background:var(--well);color:var(--faint)}
.convw{font-size:11.5px;color:var(--dim);margin-top:5px}
.convw b{color:var(--ok);font-weight:600}
.convs{margin-top:6px;display:flex;gap:4px;flex-wrap:wrap}
.sk{font:10.5px ui-monospace,Menlo,monospace;background:var(--well);border:1px solid var(--line);
border-radius:3px;padding:1px 6px;color:var(--dim)}
.convv{margin-top:6px}
.convv summary{font:10.5px ui-monospace,Menlo,monospace;color:var(--faint);cursor:pointer}
.convv div{font-size:11.5px;color:var(--dim);padding:3px 0 0 10px;line-height:1.7}
.lvl{border-bottom:1px solid var(--line)}
.lvl summary{padding:9px 0;cursor:pointer;font:600 12.5px "Newsreader",Georgia,"Songti SC",serif}
.lvln{font:10.5px ui-monospace,Menlo,monospace;color:var(--faint);font-weight:400}
.run{padding:8px 0 8px 12px;border-left:2px solid var(--line);margin:0 0 8px 4px}
.run.ran{border-left-color:var(--ok)}
.run.partial{border-left-color:var(--amber)}
.run.na{border-left-color:var(--line);opacity:.6}
.run.blocked{border-left-color:var(--red)}
.runh{display:flex;gap:8px;align-items:baseline}
.rst{font:10px ui-monospace,Menlo,monospace;color:var(--faint)}
.runv{font-size:12.5px;color:var(--tx);line-height:1.7;margin-top:3px}
.runf{font-size:11.5px;color:var(--dim);line-height:1.7;margin-top:3px}
.runf span{color:var(--faint)}
:root{--ok:#20714A;--amber:#8A6100;--line:#E4E0D4}
.cpbsum{font-size:12.5px;line-height:1.8;padding:12px 14px;background:var(--well);
border-radius:8px;margin-bottom:16px;font-family:inherit}
.cpbsum span{color:var(--faint);font-size:11.5px}
.cpbdom{font:500 10px ui-monospace,Menlo,monospace;letter-spacing:.13em;text-transform:uppercase;
color:var(--faint);margin:18px 0 7px;font-family:ui-monospace,Menlo,monospace}
.cpb{border-left:3px solid var(--line);padding:8px 0 8px 12px;margin-bottom:9px;font-family:inherit}
.cpb.on{border-left-color:var(--ok)}
.cpbh{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.cpbh b{font:600 13.5px "Newsreader",Georgia,"Songti SC",serif}
.cpbm{flex:none;font-size:11px}
.cpbw{font-size:10.5px;color:var(--faint);font-family:ui-monospace,Menlo,monospace}
.cpbv{font-size:12.5px;color:var(--dim);line-height:1.7;margin-top:2px}
.cpbg{font-size:11.5px;color:var(--amber);line-height:1.7;margin-top:3px}
.cpbn{font-size:11px;color:var(--faint);line-height:1.7;margin-top:2px}
</style></head><body>
<div class="wrap">
  <div class="beat">
    <button class="caret" id="tg" title="terminal">⌄</button>
    <span class="dot" id="dot"></span>
    <span><b id="bName">…</b></span>
    <span style="color:#B9B3A3" id="bMeta"></span>
    <span class="sp"></span>
    <span class="tail" id="tail"></span>
    <span class="mono" style="color:#B9B3A3;font-size:11px" id="bKeys"></span>
    <a class="btn ghost" id="bReport" href="#">${zh ? '诊断页' : 'Diagnosis'}</a>
    <button class="btn ghost" id="bCaps">${zh ? '能力地图' : 'Capabilities'}</button>
    <a class="btn ghost" href="/my${zh ? '?lang=zh' : ''}">${zh ? '我的站点' : 'My sites'}</a>
    <button class="btn" id="bHire"></button>
  </div>
  <div id="wallbar"></div>
  <div class="term" id="term"></div>
  <div class="grip" id="grip" title="drag to resize"><i></i></div>
  <div class="panes">
    <div class="pane" id="pProfile"></div>
    <div class="pane" id="pEvidence"></div>
    <div class="pane" id="pToday"></div>
    <div class="pane" id="pAsk"></div>
  </div>
</div>
<dialog id="dlg"><div class="dlg-h"><span id="dlgT"></span><button class="btn" id="dlgX"></button></div><div class="dlg-b" id="dlgB"></div></dialog>
<script>
const ID = ${JSON.stringify(id)};
/* The capability map, injected rather than fetched: it is small, it never
   changes between requests, and a user asking "what can this thing actually
   do" should not wait on a round trip for the answer. */
const CAPS = ${JSON.stringify(CAPABILITIES.map(c => ({
  id: c.id, d: c.domain, zh: c.zh, en: c.en, v: zh ? c.valueZh : c.valueEn,
  s: c.surface, b: c.block, n: c.needs, g: c.gap ?? '',
})))};
const CAPSUM = ${JSON.stringify(summarise())};
/* The seven levels the engine's output is stacked into. A pile of sixty-seven
   reports is not a deliverable — the order is, because it answers a reader's
   questions in the order they actually have them. */
const TIERS = ${JSON.stringify(TIERS.map(t => ({ id: t.id, zh: t.zh, en: t.en })))};
const ZH = ${JSON.stringify(zh)};
const T = (a, b) => ZH ? a : b;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = v => (v === null || v === undefined) ? null : Math.round(v * 100) + '%';
/** Unmeasured renders as a dash. A zero is a measurement; a dash is its absence. */
const NA = '<span style="color:var(--faint)">—</span>';

/* All seven domains are listed even when unwired. The strip is the capability
   statement — a buyer's main fear is "this only looks at SEO" — and an unwired
   tab that says what it covers reads as a roadmap rather than a dead link.
   Three states, and the third is the honest one:
     live — wired into this panel
     cli  — the capability is a fastergeo command; the hosted panel has not
            caught up
     none — we do not do this. Said plainly, not implied by an empty tab. */
const DOMAINS = [
  { id:'engine', zh:'增长引擎', en:'Growth engine', state:'live' },
  { id:'demand', zh:'需求', en:'Demand', state:'cli',
    d: T('谁在找你、用什么词找。','Who is looking, and in whose words.'),
    cmds:['fastergeo expand --seed "…"   ' + T('百度下拉 + Google 补全挖真实搜索需求','mines real demand from Baidu/Google autocomplete'),
          'questions.json                ' + T('AI 上正在被问的题库','the question bank actually asked of AI')] },
  { id:'visible', zh:'可见', en:'Visible', state:'live' },
  { id:'content', zh:'内容', en:'Content', state:'cli',
    d: T('写什么，以及写出来的东西敢不敢发。','What to write, and whether what came out is safe to publish.'),
    cmds:['fastergeo outline / draft    ' + T('只用已确认事实生成','generated from confirmed facts only'),
          'fastergeo fabcheck           ' + T('编造门禁：无来源的数字一律拦下','fabrication gate: unsourced numbers are refused')] },
  { id:'convert', zh:'转化', en:'Convert', state:'none',
    d: T('人来了留不留得下。','Whether arrivals turn into anything.'),
    why: T('我们不做落地页和注册流的优化。这是真话，不是「还没做」—— 它需要你的分析数据和产品内部，跟我们「看 AI 怎么说你」的能力不搭。',
      'We do not optimise landing pages or signup flows. That is a decision, not a backlog item: it needs your analytics and your product internals, and it shares nothing with measuring what AI says about you.'),
    note: T('但有一件事我们能替你判断：<b>流量涨而注册不动，问题就在这一栏，不在可见性</b> —— 别拿这个去买更多流量。',
      'One thing we can tell you: <b>traffic up with signups flat is a problem here, not in visibility</b> — do not answer it by buying more traffic.') },
  { id:'author', zh:'权威', en:'Authority', state:'cli',
    d: T('AI 在你的品类里信任谁。','Who AI trusts in your category.'),
    cmds:['fastergeo sources            ' + T('AI 实际引用了哪些域名 → 你的公关靶单','domains AI actually cited → your PR target list')],
    note: T('外链分析我们不做 —— 市面上做得好的工具很多，我们只给你「AI 信任谁」这份别处拿不到的清单。',
      'We do not analyse backlinks — plenty of tools do that well. We give you the one list they cannot: who AI trusts.') },
  { id:'dist', zh:'分发', en:'Distribute', state:'cli',
    d: T('写完发到哪里去。','Where the work goes once it is written.'),
    cmds:['fastergeo publish            ' + T('WordPress / GitHub / 签名 webhook，发布前强制过门禁','WordPress / GitHub / signed webhook, gated before it ships')] },
  { id:'watch', zh:'监测', en:'Watch', state:'live' },
  { id:'social', zh:'社交', en:'Social', state:'none',
    d: T('谁在公开场合问同类问题。','Who is asking about this in public.'),
    why: T('还没做。HN 走 Algolia 公开 API 是免费的，Reddit 官方 API 有免费层 —— 成本不是障碍，只是还没排上。X 不做（官方 API 太贵），达人不做（需要真达人库）。',
      'Not built. HN via the public Algolia API is free and Reddit has a free tier — cost is not the obstacle, it simply has not been scheduled. X is out (the API is expensive) and influencers are out (needs a real creator database).') },
];

/* The 18 engines. Only the web-driver ones ever return citations, which is why
   the last gate is unmeasurable rather than zero for the rest. */
const ENGINES = [
  ['glm','智谱GLM','cn','api'],['doubao','豆包(方舟API)','cn','api'],['deepseek','DeepSeek','cn','api'],
  ['kimi','Kimi','cn','api'],['minimax','MiniMax','cn','api'],['qwen','通义千问','cn','api'],
  ['ernie','文心一言','cn','api'],['spark','讯飞星火','cn','api'],
  ['nano','纳米AI搜索','cn','web'],['baidu-ai','百度AI搜索','cn','web'],
  ['openai','OpenAI(ChatGPT)','global','api'],['anthropic','Claude','global','api'],
  ['gemini','Gemini','global','api'],['grok','Grok','global','api'],
  ['perplexity','Perplexity','global','api'],
  ['chatgpt-web','ChatGPT 网页版','global','web'],['claude-web','Claude 网页版','global','web'],
  ['ai-overview','Google AI Overviews','global','web'],
];

let P = null, tab = 'visible', railToggle = () => {}, engMore = false;

chrome();
fetch('/api/project?id=' + ID).then(r => r.json()).then(d => {
  P = d;
  // Land on the engine when there is one: it is the synthesis of everything
  // else on this page, and making a reader find it defeats the point.
  if (P.engine && P.engine.summary) tab = 'engine';
  render();
})
  .catch(e => { document.getElementById('pProfile').innerHTML = '<div class="empty">' + esc(String(e)) + '</div>'; });

function render(){
  beat(); wallbar(); terminal(); profile(); evidence(); today(); ask();
  // stopPropagation matters: collapsing sets a click handler on the pane to
  // expand it again, and without this the button's own click bubbles straight
  // into it and the column reopens in the same tick.
  document.querySelectorAll('[data-rail]').forEach(b => {
    b.onclick = e => { e.stopPropagation(); railToggle(b.dataset.rail); };
  });
  // Rails are restored after render, because render rewrites the panes.
  for (const id of ['pProfile','pEvidence','pToday','pAsk']){
    let want = false;
    try { want = localStorage.getItem('fastergeo.rail.' + id) === '1'; } catch {}
    const el = document.getElementById(id);
    if (want && !el.classList.contains('rail')) railToggle(id);
  }
}

/* Which engines this hosted run actually asked. On the hosted side there is one
   — the probe — and pretending otherwise is the failure this panel exists to
   avoid. */
function sampled(){
  const s = {};
  for (const x of (P.metrics && P.metrics.platforms) || []) s[x.providerId] = 1;
  const pr = P.probe;
  if (pr && pr.engine) for (const e of ENGINES) if (String(pr.engine).indexOf(e[0]) >= 0) s[e[0]] = 1;
  return s;
}

function beat(){
  const b = (P.dossier && P.dossier.brand) || {};
  const a = P.audit || {};
  let host = P.url; try { host = new URL(P.url).hostname; } catch {}
  document.getElementById('bName').textContent = b.name || host || T('未命名项目','Untitled project');
  const pages = (a.pages || []).length;
  document.getElementById('bMeta').textContent = a.generatedAt
    ? T('第 1 期 · ' + String(a.generatedAt).slice(0,10) + ' · ' + pages + ' 页已体检',
        'period 1 · ' + String(a.generatedAt).slice(0,10) + ' · ' + pages + ' pages audited')
    : T('还没跑过','no period yet');
  const on = Object.keys(sampled()).length;
  document.getElementById('bKeys').textContent =
    T(ENGINES.length + ' 引擎 · ' + on + ' 个问过', ENGINES.length + ' engines · ' + on + ' asked');
  document.getElementById('bReport').href = '/p/' + ID + (ZH ? '?lang=zh' : '');
  const hb = document.getElementById('bHire');
  const live = P.loop && P.loop.lastCheck;
  hb.textContent = live ? T('每天都在跑 ✓','Running daily ✓') : T('每天自动跑 →','Run it daily →');
  hb.onclick = () => show(T('每天自动跑','Run it daily'), live
    ? T('已经在跑。每天 03:00 UTC 重爬一次，上次 ' + new Date(P.loop.lastCheck).toISOString().slice(0,16).replace('T',' ') + ' UTC。\\n\\n'
        + '铁律：大多数运行应该是「查过了，没事可做」。天天有话说的循环，一周就会被你忽略。\\n\\n'
        + '你标了「我修好了」，下次重爬会核对 —— 没真修好的会自己回来。',
        'Already running. Re-crawled daily at 03:00 UTC; last run ' + new Date(P.loop.lastCheck).toISOString().slice(0,16).replace('T',' ') + ' UTC.\\n\\n'
        + 'The rule: most runs should end with "checked, nothing to do". A loop that speaks every day trains you to ignore it within a week.\\n\\n'
        + 'Anything you mark fixed is checked by the next crawl — what was not actually fixed comes back on its own.')
    : T('还没开始。留个邮箱就会每天重爬。\\n\\n第 2 期开始才有期对比 —— 单期只算观察，连续两期同向才叫趋势。',
        'Not started. Leave an email and the daily re-crawl begins.\\n\\nPeriod comparison appears from period 2 — one period is an observation; two consecutive same-direction changes are a trend.'));
  document.getElementById('dlgX').textContent = T('关闭','Close');
  document.getElementById('bCaps').onclick = () => showHtml(T('能力地图','Capability map'), capsHtml());
  const walled = Boolean(P.wall) || Boolean(P.unusable && !P.unusable.usable);
  document.getElementById('dot').className = 'dot' + (walled ? ' bad' : '');
}

/* Said above everything, because it is not one finding among many — it is the
   statement that none of the other findings are about your site. */
function wallbar(){
  const u = P.unusable, w = P.wall;
  const el = document.getElementById('wallbar');
  if (!u && !w){ el.innerHTML = ''; el.className = ''; return; }
  el.className = 'wallbar';
  el.innerHTML = u
    ? '<b>' + T('这一轮我停下了，没往下算。','I stopped this run rather than compute on it.') + '</b>'
      + esc(u.reason || '') + '<br>' + esc(u.fix || '')
    : '<b>' + T('我们没读到你的网站，读到的是一堵墙。','We did not read your site. We read a wall.') + '</b>'
      + esc(T('返回的是 ' + (w.vendor || '机器人验证') + ' 的验证页。把 AI 爬虫放行，或换一个被允许的网络，然后重跑。',
              'The response was a ' + (w.vendor || 'bot check') + ' challenge page. Allow AI crawlers through, or run from an allowed network, then start again.'));
}

/* Which part of the system spoke. Okara prefixes every line with the source and
   it is the difference between a log and a wall of text — you can find the one
   subsystem you care about without reading the rest. */
function sourceTag(m){
  if (/爬虫|crawler|渲染|render|体检|audit|就绪度|readiness/i.test(m)) return 'AUDIT';
  if (/引擎|engine|问了|asked|回答|answer|认识|knows/i.test(m)) return 'GEO';
  if (/工单|ticket|修复|fix|清单/i.test(m)) return 'FIX';
  if (/档案|dossier|事实|fact|竞品|competitor|题库|question/i.test(m)) return 'PROFILE';
  return '';
}

function terminal(){
  const log = P.log || [];
  const el = document.getElementById('term');
  if (!log.length){
    el.innerHTML = '<div style="color:#6B6558">' + T('还没有记录。','Nothing logged yet.') + '</div>';
    return;
  }
  let day = '';
  const rows = [];
  for (const l of log){
    const d = new Date(l.t).toISOString().slice(0, 10);
    if (d !== day){ day = d; rows.push('<div class="day">—— ' + d + ' (UTC) ——</div>'); }
    const tag = l.loop ? 'LOOP' : sourceTag(l.m);
    rows.push('<div>&gt; ' + (tag ? '<span class="tg">[' + tag + ']</span> ' : '') + esc(l.m) + '</div>');
  }
  el.innerHTML = rows.join('');
  el.scrollTop = el.scrollHeight;
  tail();
}

/* Folded away, the last line rides in the title bar. The system should not go
   silent just because someone wanted the screen back. */
function tail(){
  const hid = document.getElementById('term').classList.contains('hide');
  const log = (P && P.log) || [];
  document.getElementById('tail').textContent = hid && log.length ? '> ' + log[log.length - 1].m : '';
}

function chrome(){
  const term = document.getElementById('term'), grip = document.getElementById('grip');
  const set = hid => {
    term.classList.toggle('hide', hid);
    grip.classList.toggle('hide', hid);
    document.getElementById('tg').textContent = hid ? '›' : '⌄';
    try { localStorage.setItem('fastergeo.term', hid ? '0' : '1'); } catch {}
    tail();
  };
  let open = true;
  try { open = localStorage.getItem('fastergeo.term') !== '0'; } catch {}
  set(!open);
  document.getElementById('tg').onclick = () => set(!term.classList.contains('hide'));

  // Height is a preference, so it survives a reload rather than resetting.
  try { const h = Number(localStorage.getItem('fastergeo.termH')); if (h >= 60) term.style.height = h + 'px'; } catch {}
  let drag = null;
  grip.onmousedown = e => { drag = { y: e.clientY, h: term.getBoundingClientRect().height }; e.preventDefault(); };
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    const h = Math.min(460, Math.max(60, drag.h + (e.clientY - drag.y)));
    term.style.height = h + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    try { localStorage.setItem('fastergeo.termH', String(Math.round(term.getBoundingClientRect().height))); } catch {}
    drag = null;
  });

  // Columns collapse to a labelled rail, the way Okara's Company and Analytics
  // columns do — the console is wide and not every column is wanted at once.
  const NAMES = { pProfile: T('档案','Profile'), pEvidence: T('证据','Evidence'),
                  pToday: T('今天','Today'), pAsk: T('问它','Ask') };
  railToggle = id => {
    const el = document.getElementById(id);
    const railed = el.classList.toggle('rail');
    try { localStorage.setItem('fastergeo.rail.' + id, railed ? '1' : '0'); } catch {}
    if (railed) el.innerHTML = '<div class="railname">' + esc(NAMES[id]) + ' ›</div>';
    else render();
    el.onclick = railed ? () => { el.classList.remove('rail'); try { localStorage.setItem('fastergeo.rail.' + id, '0'); } catch {} render(); } : null;
  };
}

function profile(){
  const d = P.dossier || {}, b = d.brand || {};
  const facts = (d.facts && d.facts.facts) || [];
  const sourced = facts.filter(f => f.status !== 'unconfirmed' && f.grade !== 'E').length;
  const comps = d.competitorCandidates || [];
  const qs = d.questions || [];
  const voiceFilled = P.voice && P.voice.filled;
  const docs = [
    ['product', T('产品档案','Product'), b.description ? '' : '<span class="tag off">' + T('没有','none') + '</span>'],
    ['facts', T('品牌事实库','Brand facts'), sourced ? '<span class="tag">' + T(sourced + ' 条带来源', sourced + ' sourced') + '</span>' : '<span class="tag off">' + T('没有','none') + '</span>'],
    ['competitors', T('竞品分析','Competitors'), comps.length ? '<span class="tag warn">' + T(comps.length + ' 待核', comps.length + ' to review') + '</span>' : ''],
    ['questions', T('问题库','Questions'), qs.length ? '<span class="tag">' + T(qs.length + ' 题', qs.length + ' qs') + '</span>' : ''],
    ['voice', T('语气指南','Voice'), voiceFilled ? '' : '<span class="tag warn">' + T('待你填','yours to fill') + '</span>'],
  ];
  let host = P.url; try { host = new URL(P.url).hostname; } catch {}
  document.getElementById('pProfile').innerHTML =
    '<div class="ph"><b>' + T('档案','Profile') + '</b><button class="cx" data-rail="pProfile">‹</button></div>'
    + '<div class="brandname">' + esc(b.name || host) + '</div>'
    + '<div class="sub">' + esc(host) + '</div>'
    + '<div class="sect">' + T('五份档案','Five documents') + '</div>'
    + docs.map(x => '<div class="doc" data-doc="' + x[0] + '"><span>' + x[1] + x[2] + '</span><span class="e">›</span></div>').join('')
    + (comps.length ? '<div class="sect">' + T('竞品 · 待人工核对','Competitors · to review') + '</div>'
        + comps.map(c => '<span class="chip">' + esc(c.name) + '</span>').join('') : '')
    + '<div class="rules"><b>' + T('我们的纪律','Our discipline') + '</b><br>'
    + T('· 每个数字都能点开看原话<br>· 打勾是重爬证明的，退步自动打回<br>· 18 引擎，中国 + 海外<br>· <b>算不出就写「未测」，绝不写 0</b>',
        '· Every number traces to a verbatim quote<br>· Done means re-crawled; regressions flip back<br>· 18 engines, China + global<br>· <b>Unmeasured stays unmeasured, never a zero</b>')
    + '</div>';
  document.querySelectorAll('[data-doc]').forEach(el => { el.onclick = () => showDoc(el.dataset.doc); });
}

function evidence(){
  const suffix = { live:'', cli:' · ' + T('命令行','CLI'), none:' · ' + T('不做','not covered') };
  const strip = DOMAINS.map(d =>
    '<span class="tab ' + (d.id === tab ? 'on' : '') + ' ' + (d.state === 'live' ? '' : 'soon')
    + '" data-tab="' + d.id + '">' + (ZH ? d.zh : d.en) + suffix[d.state] + '</span>').join('');
  document.getElementById('pEvidence').innerHTML =
    '<div class="ph"><b>' + T('证据','Evidence') + '</b><span class="mono">' + samplesLine()
      + '</span><button class="cx" data-rail="pEvidence">‹</button></div>'
    + '<div class="tabs">' + strip + '</div>'
    + '<div>' + (tab === 'engine' ? engineTab() : tab === 'visible' ? visibleTab() : tab === 'watch' ? watchTab() : soonTab(tab)) + '</div>';
  document.querySelectorAll('[data-tab]').forEach(el => { el.onclick = () => { tab = el.dataset.tab; evidence(); }; });
  const em = document.getElementById('engMore');
  if (em) em.onclick = () => { engMore = !engMore; evidence(); };
}

function samplesLine(){
  const n = Object.keys(sampled()).length;
  if (!n) return T('还没采样','not sampled yet');
  const total = P.metrics ? P.metrics.totalSamples : (P.probe && P.probe.verdict ? 1 : 0);
  return T(n + ' 个引擎 · ' + total + ' 个样本', n + ' engine' + (n > 1 ? 's' : '') + ' · ' + total + ' samples');
}

function soonTab(id){
  const d = DOMAINS.filter(x => x.id === id)[0];
  if (d.state === 'cli'){
    return '<div class="soonbox"><h3>' + (ZH ? d.zh : d.en) + ' · ' + T('命令行里已经能用','available in the CLI') + '</h3>'
      + '<p>' + esc(d.d) + '</p>'
      + '<div class="caps"><b>' + T('现在就能跑：','Run it now:') + '</b>'
      + '<pre style="margin:8px 0 0;font:12px/1.9 ui-monospace,Menlo,monospace;white-space:pre-wrap">'
      + d.cmds.map(esc).join('\\n') + '</pre></div>'
      + (d.note ? '<div class="caps" style="margin-top:12px">' + d.note + '</div>' : '')
      + '</div><div class="cap" style="margin-top:14px">'
      + T('能力有了，这个网页面板还没接上它。','The capability exists; this hosted panel has not caught up to it yet.') + '</div>';
  }
  // "We do not do this" is a legitimate answer and gets said in plain words. An
  // empty tab implying "coming soon" forever is the dishonest version.
  return '<div class="soonbox" style="border-color:var(--line);background:var(--well)">'
    + '<h3>' + (ZH ? d.zh : d.en) + ' · ' + T('我们不做这个','we do not do this') + '</h3>'
    + '<p>' + esc(d.d) + '</p><div class="caps">' + d.why + '</div>'
    + (d.note ? '<div class="caps" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">' + d.note + '</div>' : '')
    + '</div><div class="cap" style="margin-top:14px">'
    + T('说清楚不做，比无限期挂个「即将推出」诚实。','Saying we do not do it beats an indefinite "coming soon".') + '</div>';
}

function watchTab(){
  const live = P.loop && P.loop.lastCheck;
  return '<div class="soonbox"><h3>' + T('期对比 · 还差一期','Period comparison · one more period') + '</h3>'
    + '<p>' + T('你现在有 1 期数据。<b>单期变化只算观察，连续两期同向才叫趋势</b> —— 所以第 2 期跑完，这里才会出现真正的对比。',
        'You have one period. <b>A single-period change is an observation; only two consecutive same-direction changes make a trend</b> — real comparison appears after period 2.') + '</p>'
    + '<div class="caps">' + T('这不是被锁住的功能。<b>趋势在物理上就需要时间。</b>','This is not a locked feature. <b>A trend physically requires time.</b>') + '</div>'
    + '</div><div class="cap" style="margin-top:14px">'
    + (live ? T('每天 03:00 UTC 自动重爬，上次 ' + new Date(P.loop.lastCheck).toISOString().slice(0,10) + '。',
                'Re-crawled daily at 03:00 UTC; last run ' + new Date(P.loop.lastCheck).toISOString().slice(0,10) + '.')
            : T('还没开始每天重爬。','The daily re-crawl has not started.')) + '</div>';
}

/* The engine's output, stacked. A verdict first, then the actions ordered by
   how many independent methodologies arrived at each, then the levels, then
   what the whole run says it is missing.

   Convergence is the ranking, not priority. Five methodologies reasoning from
   five different starting points landing on the same action is stronger
   evidence than one of them shouting — the single confident voice is the one
   most likely to be wrong. */
function engineTab(){
  const e = P.engine;
  if (!e) return '<div class="empty">' + T('这一轮还没跑方法论。','No methodologies were run for this project.') + '</div>';
  if (!e.summary) {
    const done = (e.runs || []).length, total = done + (e.queue || []).length;
    return '<div class="empty">' + T('正在跑 ' + done + '/' + total + ' 套方法论…',
      'Running ' + done + '/' + total + ' methodologies…') + '</div>';
  }
  const s = e.summary;
  const conv = s.converged || [];
  const shown = engMore ? conv : conv.slice(0, 12);
  const multi = conv.filter(c => c.skills.length > 1).length;

  const head = '<div class="meter" style="border-style:solid;background:var(--well)">'
    + '<span class="n">' + (s.total || 0) + '</span>'
    + '<span class="t"><b>' + T('套方法论跑完了','methodologies applied') + '</b> — '
    + T(s.ran + ' 套有实数据 · ' + s.partial + ' 套数据不全 · ' + s.na + ' 套对你不适用'
        + (s.blocked ? ' · ' + s.blocked + ' 套失败' : ''),
        s.ran + ' on real data · ' + s.partial + ' partial · ' + s.na + ' do not apply'
        + (s.blocked ? ' · ' + s.blocked + ' failed' : '')) + '<br>'
    + '<span style="color:var(--faint)">'
    + T((s.actions || []).length + ' 条动作收敛成 ' + conv.length + ' 条，其中 ' + multi + ' 条有两套以上方法论独立指向。',
        (s.actions || []).length + ' actions converged to ' + conv.length + ', of which ' + multi
        + ' were reached independently by two or more methodologies.')
    + '</span></span></div>';

  const rows = shown.map((c, i) => {
    const n = c.skills.length;
    const strong = n >= 3 ? 'ok' : n === 2 ? 'amber' : 'line';
    return '<div class="conv" style="border-left-color:var(--' + strong + ')">'
      + '<div class="convh"><span class="pr ' + esc(c.priority) + '">' + esc(c.priority) + '</span>'
      + (n > 1 ? '<span class="agree">' + T(n + ' 套方法论都指向这条', n + ' methodologies agree') + '</span>'
               : '<span class="agree solo">' + T('孤证','single source') + '</span>')
      + '<b>' + esc(c.do) + '</b></div>'
      + '<div class="convw"><b>' + T('做到这样算完：','Done when: ') + '</b>' + esc(c.doneWhen) + '</div>'
      + '<div class="convs">' + c.skills.map(x => '<span class="sk">' + esc(x) + '</span>').join('') + '</div>'
      + (c.variants && c.variants.length > 1
          ? '<details class="convv"><summary>' + T('各自的原话（' + c.variants.length + ' 种说法）',
              c.variants.length + ' phrasings') + '</summary>'
            + c.variants.map(v => '<div>· ' + esc(v) + '</div>').join('') + '</details>'
          : '')
      + '</div>';
  }).join('');

  const more = conv.length > 12
    ? '<button class="btn" id="engMore" style="margin-top:8px">'
      + (engMore ? T('只看前 12 条','show top 12') : T('展开全部 ' + conv.length + ' 条','show all ' + conv.length))
      + '</button>' : '';

  // The levels. Collapsed by default: the ranked list above is what someone
  // works from, and this is where they go to check it.
  const byTier = {};
  for (const r of e.runs || []) (byTier[tierOfRun(r)] = byTier[tierOfRun(r)] || []).push(r);
  const levels = TIERS.filter(t => byTier[t.id]).map(t => {
    const rs = byTier[t.id];
    const na = rs.filter(r => r.status === 'n/a').length;
    return '<details class="lvl"><summary>' + esc(ZH ? t.zh : t.en)
      + ' <span class="lvln">' + rs.length + T(' 套', '')
      + (na ? T(' · ' + na + ' 套不适用', ' · ' + na + ' n/a') : '') + '</span></summary>'
      + rs.map(r => '<div class="run ' + esc(r.status.replace('/', '')) + '">'
          + '<div class="runh"><span class="sk">' + esc(r.skill) + '</span>'
          + '<span class="rst">' + esc(STAT[r.status] || r.status) + '</span></div>'
          + '<div class="runv">' + esc(r.verdict || '—') + '</div>'
          + (r.findings || []).slice(0, 2).map(f =>
              '<div class="runf">· ' + esc(f.claim) + (f.evidence ? '<span> ← ' + esc(f.evidence) + '</span>' : '') + '</div>').join('')
          + '</div>').join('')
      + '</details>';
  }).join('');

  const needs = (s.needs || []).slice(0, 12);
  return head
    + '<div class="shead"><b>' + T('该做什么 · 按方法论一致程度排','What to do · ranked by agreement')
    + '</b><span>' + T('这些是方法论的判断，不是机器验收的工单 —— 右边那一栏才是重爬能核对的。',
        'These are judgements, not machine-verified tickets — the column on the right is what a re-crawl can check.')
    + '</span></div>'
    + rows + more
    + '<div class="shead"><b>' + T('逐层看','By level') + '</b><span>'
    + T('先战略，再断点那一层，其余按漏斗顺序','strategy first, then the broken tier, then the funnel order') + '</span></div>'
    + levels
    + (needs.length ? '<div class="shead"><b>' + T('要跑得更准，还缺这些','What it would take to do this properly')
        + '</b><span>' + T('这是所有方法论说自己缺什么，去重后的结果','every methodology naming what it lacks, deduped')
        + '</span></div>' + needs.map(n => '<div class="sig"><span>' + esc(n) + '</span></div>').join('') : '');
}

const STAT = ZH
  ? { ran:'有实数据', partial:'数据不全', 'n/a':'不适用', blocked:'没跑成' }
  : { ran:'ran', partial:'partial', 'n/a':'n/a', blocked:'failed' };

/* parseRun already stamped the tier onto each run as its domain field;
   re-deriving it here would be a second source of truth for the same fact. */
const tierOfRun = r => r.domain || 'strategy';

function visibleTab(){
  const m = P.metrics, a = P.audit, pr = P.probe;
  if (!m && !a) return '<div class="empty">' + T('还没有数据。','No data yet.') + '</div>';
  const quotes = [];
  for (const p of (m ? m.platforms : [])){
    const who = p.providerId + ' · ' + (p.market === 'cn' ? T('国内市场','China') : T('海外市场','Global'));
    for (const e of (p.probe && p.probe.confusedEvidence) || []) quotes.push({ kind:'confused', who:who, text:e });
    for (const e of (p.sentiment && p.sentiment.negativeEvidence) || []) quotes.push({ kind:'negative', who:who, text:e });
  }
  if (!quotes.length && pr && pr.verdict === 'confused' && pr.evidence){
    quotes.push({ kind:'confused', who: (pr.engine || '') + ' · ' + T('国内市场','China'), text: pr.evidence });
  }
  const s = sampled();
  // "Not run" means no data this period. An engine that produced samples has run
  // however it was reached, and counting it as missing would contradict the
  // table directly below.
  const notRun = ENGINES.filter(e => e[3] === 'api' && !s[e[0]]);
  const quoteHtml = quotes.length
    ? quotes.slice(0, 4).map(q => '<div class="quote"><div class="q">“' + esc(String(q.text).trim()) + '”</div>'
        + '<div class="qmeta"><span class="qtag ' + (q.kind === 'negative' ? 'warn' : '') + '">'
        + (q.kind === 'confused' ? T('认错了','mistaken identity') : T('负面','negative')) + '</span>' + esc(q.who) + '</div></div>').join('')
    : (pr && pr.verdict ? '<div class="quote calm"><div class="q">'
        + T('本期没有发现认错或负面的原话。','No mistaken-identity or negative quotes this period.') + '</div>'
        + '<div class="qmeta">' + T('全部采样原文在诊断页里','Every sampled answer is on the diagnosis page') + '</div></div>' : '');
  const meterHtml = notRun.length ? '<div class="meter"><span class="n">' + notRun.length + '</span>'
    + '<span class="t"><b>' + T(notRun.length + ' 个引擎没跑', notRun.length + ' engines not run') + '</b> — '
    + T('网页版还没接托管采样，所以<b>没有采样，也就没有原话</b>。','hosted sampling is not built here, so <b>nothing was sampled and no quote exists</b>.') + '<br>'
    + '<span style="color:var(--faint)">' + T('这里不会放模糊的占位内容：没测过的东西，我们不会假装手里有。',
        'No blurred placeholders here: we do not pretend to hold what we never measured.') + '</span></span>'
    + '<button class="btn" style="background:#1C1A15;color:#F3F1EA" id="howKey">' + T('怎么跑全部 18 个 →','How to run all 18 →') + '</button></div>' : '';
  return quoteHtml + meterHtml
    + shead(T('品牌实体漏斗','Brand entity funnel'),
        T('AI 引用你之前要过的五道闸，每一道断了修法都不同','five gates before an AI cites you — each breaks differently and is fixed differently'))
    + funnelHtml()
    + shead(T('逐引擎','Engine by engine'),
        T('哪个引擎问过、问了几条、怎么判的','which engines were asked, how many samples, and what they decided'))
    + engineTable()
    + auditHtml();
}

/* Title, one line of what produced it, then the numbers. Okara's Analytics
   column reads well because nothing is a bare table — every block says what it
   is measuring before it shows a figure. */
function shead(title, sub){
  return '<div class="shead"><b>' + esc(title) + '</b>'
    + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
}

function ring(v, label){
  const col = v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
  const r = 19, len = 2 * Math.PI * r;
  return '<div class="ring"><svg width="50" height="50" viewBox="0 0 50 50">'
    + '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="#EFEBE0" stroke-width="4"></circle>'
    + '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round"'
    + ' stroke-dasharray="' + (len * v / 100).toFixed(1) + ' ' + len.toFixed(1) + '" transform="rotate(-90 25 25)"></circle>'
    + '<text class="rv" x="25" y="29" text-anchor="middle">' + v + '</text></svg>'
    + '<span class="rl">' + esc(label) + '</span></div>';
}

/* The six dimensions, averaged over the pages we read. Each is scored out of
   its own max, so the raw numbers cannot be averaged directly — doing that
   would rank a 15/15 below a 20/40. */
function auditHtml(){
  const a = P.audit;
  if (!a || !(a.pages || []).length) return '';
  const DIM = ZH
    ? [['crawlability','爬得到'],['length','讲够了'],['structure','结构'],['blocks','抽取块'],
       ['authority','出处'],['relevance','答对题']]
    : [['crawlability','crawlable'],['length','length'],['structure','structure'],['blocks','blocks'],
       ['authority','authority'],['relevance','relevance']];
  const acc = {};
  for (const pg of a.pages) for (const d of pg.dimensions || []){
    acc[d.key] = acc[d.key] || { s:0, m:0 };
    acc[d.key].s += d.score; acc[d.key].m += (d.max || 0);
  }
  const rings = ring(Math.round(a.avgScore || 0), T('全站','site'))
    + DIM.filter(d => acc[d[0]]).map(d => ring(Math.round(acc[d[0]].s / acc[d[0]].m * 100), d[1])).join('');

  const st = a.site || {};
  const blocked = st.blockedSearchCrawlers || [];
  const sig = [
    ['llms.txt', st.llmsTxtFound, T('有','present'), T('没有','absent')],
    ['robots.txt', st.robotsFound, T('有','present'), T('没有','absent')],
    ['sitemap.xml', st.sitemapFound, T('有','present'), T('没有','absent')],
    [T('AI 搜索爬虫','AI search crawlers'), blocked.length === 0,
      T('都放行','all allowed'), T('挡了 ' + blocked.length + ' 个','blocking ' + blocked.length)],
  ];
  const org = a.entity && a.entity.organizationSchema;
  sig.push([T('Organization 声明','Organization schema'), Boolean(org), T('有','declared'), T('没有','missing')]);

  // The block map is the most directly actionable thing the audit produces: a
  // column of dashes means the whole site has none of that block, which is
  // exactly why an AI answering that kind of question does not quote you.
  const BL = ZH
    ? [['definition','定义'],['comparison','对比'],['statistics','数字'],['steps','步骤'],['faq','FAQ']]
    : [['definition','definition'],['comparison','comparison'],['statistics','statistics'],['steps','steps'],['faq','faq']];
  const have = {};
  for (const pg of a.pages) for (const k of Object.keys(pg.blocks || {})) if (pg.blocks[k]) have[k] = (have[k] || 0) + 1;
  const n = a.pages.length;
  const blocksRows = BL.map(b => '<div class="sig"><span' + (have[b[0]] ? '' : ' class="w"') + '>'
    + (have[b[0]] ? '' : '⚠ ') + esc(b[1]) + '</span><span class="sv">'
    + (have[b[0]] ? have[b[0]] + '/' + n : T('一页都没有','none of ' + n)) + '</span></div>').join('');

  return shead(T('页面体检 · 六维','Page audit · six dimensions'),
      T('用 AI 爬虫的眼睛读了 ' + n + ' 页，不需要任何 Key', 'read ' + n + ' pages as an AI crawler sees them, no keys needed'))
    + '<div class="rings">' + rings + '</div>'
    + shead(T('抽取块','Extractable blocks'),
        T('AI 直接摘走的是这五种块，整站有几页带','the five blocks an AI lifts, and how many pages carry each'))
    + blocksRows
    + shead(T('机器可读入口','Machine-readable entry points'),
        T('爬虫进不进得来，进来了认不认得出你是谁','whether crawlers get in, and whether they can tell who you are'))
    + sig.map(x => '<div class="sig"><span' + (x[1] ? '' : ' class="w"') + '>' + (x[1] ? '' : '⚠ ') + esc(x[0])
        + '</span><span class="sv">' + esc(x[1] ? x[2] : x[3]) + '</span></div>').join('');
}

function funnelHtml(){
  const m = P.metrics, pr = P.probe;
  if (!m && !(pr && pr.verdict)) return '';
  const agg = k => {
    const ps = ((m && m.platforms) || []).filter(p => p[k] !== null && p[k] !== undefined);
    if (!ps.length) return null;
    const n = ps.reduce((s, p) => s + p.samples, 0);
    return n ? ps.reduce((s, p) => s + p[k] * p.samples, 0) / n : null;
  };
  const rec = ((m && m.platforms) || []).reduce((o, p) => {
    const r = (p.probe && p.probe.recognition) || {};
    for (const k of Object.keys(r)) o[k] = (o[k] || 0) + r[k];
    return o;
  }, {});
  if (!Object.keys(rec).length && pr && pr.verdict) rec[pr.verdict] = 1;
  const judged = (rec.knows || 0) + (rec.confused || 0) + (rec.unknown || 0) > 0;
  const mention = agg('mentionRate');
  const cite = agg('ownDomainCiteRate');
  const st = (cls, v, label) => '<div class="st ' + cls + '"><span class="v">' + v + '</span>' + label + '</div>';
  return '<div class="funnel">'
    + (judged ? st(rec.knows > 0 ? 'good' : 'bad', rec.knows > 0 ? '✓' : '✕', T('① 认识你','① Knows you'))
              : st('na', '—', T('① 认识你','① Knows you')))
    + (judged ? st(rec.confused > 0 ? 'bad' : 'good', rec.confused > 0 ? '✕ ' + rec.confused : '✓', T('② 没认错','② Not confused'))
              : st('na', '—', T('② 没认错','② Not confused')))
    + st(mention ? 'good' : 'na', mention === null ? '—' : pct(mention), T('③ 想到你','③ Considered'))
    + st('na', mention ? (pct(agg('top3Rate')) || '—') : '—', T('④ 排前面','④ Top-3'))
    + st(cite ? 'good' : 'na', pct(cite) || '—', T('⑤ 引用你','⑤ Cited'))
    + '</div><div class="cap">'
    + T('③④ 显示「—」是因为网页版只做了点名探测，没做不点名采样 —— 后者才是可见度。<br>',
        'Stations ③④ read a dash because the hosted run only probes by name; unprompted sampling is what measures visibility.<br>')
    + T('④ 的「—」不是 0%：提及率为 0 时你根本没进候选集，<b>没有位次可言</b>。<br>',
        '④ reads a dash, not 0%: with no mentions you are not in the candidate set, so <b>no rank exists</b>.<br>')
    + T('⑤ 在大部分引擎上<b>结构性测不了</b>：18 个里只有 5 个联网引擎会返回引用来源。',
        '⑤ is <b>structurally unmeasurable</b> on most engines: only 5 of the 18 are web-connected and return sources.')
    + '</div>';
}

function engineTable(){
  const m = P.metrics, pr = P.probe, s = sampled();
  const by = {};
  for (const p of (m && m.platforms) || []) by[p.providerId] = p;
  const rows = ENGINES.filter(e => e[3] === 'api').map(e => {
    const mkt = e[2] === 'cn' ? T('国内','CN') : T('海外','Global');
    const p = by[e[0]];
    if (!p){
      if (s[e[0]] && pr && pr.verdict){
        const cog = pr.verdict === 'confused' ? '<span style="color:var(--red)">' + T('认错','confused') + '</span>'
          : pr.verdict === 'knows' ? T('认识','knows') : T('不认识','unknown');
        return '<tr><td>' + esc(e[1]) + '</td><td>' + mkt + '</td><td class="num">1</td>'
          + '<td class="num">' + NA + '</td><td>' + cog + '</td></tr>';
      }
      return '<tr class="off"><td>' + esc(e[1]) + '</td><td>' + mkt + '</td><td class="num">—</td>'
        + '<td class="num">—</td><td><span class="nokey">' + T('未跑','not run') + '</span></td></tr>';
    }
    const r = (p.probe && p.probe.recognition) || {};
    const conf = r.confused || 0;
    const cog = conf > 0 ? '<span style="color:var(--red)">' + T('认错 ×' + conf, 'confused ×' + conf) + '</span>'
      : (r.knows || 0) > 0 ? T('认识','knows') : p.probe ? T('不认识','unknown') : NA;
    return '<tr><td>' + esc(e[1]) + '</td><td>' + mkt + '</td><td class="num">' + p.samples + '</td>'
      + '<td class="num">' + (pct(p.mentionRate) || NA) + '</td><td>' + cog + '</td></tr>';
  }).join('');
  return '<table><thead><tr><th>' + T('引擎','Engine') + '</th><th>' + T('市场','Market') + '</th>'
    + '<th style="text-align:right">' + T('样本','Samples') + '</th>'
    + '<th style="text-align:right">' + T('提及率','Mention') + '</th>'
    + '<th>' + T('认知','Recognition') + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<div class="cap" style="margin-top:9px">'
    + T('没跑的引擎显示「—」，不是 0。<b>0 是一个测量结果，「—」是没测。</b>',
        'Engines that did not run read a dash, not 0. <b>A zero is a measurement; a dash is its absence.</b>') + '</div>';
}

function today(){
  const items = (P.feedOpen || []).slice(0, 3);
  const c = P.feedCounts || { done:0, regressed:0, open:0 };
  document.getElementById('pToday').innerHTML =
    '<div class="ph"><b>' + T('今天','Today') + '</b><span>' + T('修 ' + items.length + ' 件', 'fix ' + items.length)
      + '</span><button class="cx" data-rail="pToday">‹</button></div>'
    + (items.length ? items.map(t => '<div class="card"' + (t.state === 'regressed' ? ' style="border-color:var(--red)"' : '') + '>'
        + '<div class="k"><span class="pr ' + esc(t.priority) + '">' + esc(t.priority) + '</span>'
        + (t.state === 'regressed' ? '<span class="pr" style="background:var(--red);color:#fff">'
            + (t.neverVerified ? T('还在','still there') : T('回归','regressed')) + '</span>' : '')
        + (t.state === 'new' ? '<span class="pr" style="background:var(--ok);color:#fff">' + T('新','new') + '</span>' : '')
        + '<span class="mono" style="font-size:10.5px;color:var(--faint)">' + esc(t.id || '') + '</span></div>'
        + '<div class="t">' + esc(t.title) + '</div>'
        + '<div class="w">' + esc(String(t.rationale || '').slice(0, 150)) + '</div>'
        + '<div class="acc"><b>' + T('修到这样算好：','Done when:') + '</b> ' + esc((t.acceptance && t.acceptance.desc) || '—') + '</div>'
        + '<div class="acts"><button class="act go" data-k="' + esc(t.key) + '" data-a="done">' + T('我修好了','I fixed this') + '</button>'
        + '<button class="act" data-k="' + esc(t.key) + '" data-a="snooze">' + T('先放放','not now') + '</button></div>'
        + '</div>').join('')
      : '<div class="empty">' + T('没有待办。','Nothing queued.') + '</div>')
    + '<div class="state"><span class="g">' + T('已验收 ' + (c.done || 0), 'verified ' + (c.done || 0)) + '</span>'
    + '<span class="r">' + T('回归 ' + (c.regressed || 0), 'regressed ' + (c.regressed || 0)) + '</span>'
    + '<span>' + T('全部 ' + (c.open || 0), 'all ' + (c.open || 0)) + '</span></div>'
    + '<div class="cap">' + T('每天 03:00 UTC 自动重爬核对。<b>你说好了不算，重爬说了算。</b>',
        'The daily re-crawl checks at 03:00 UTC. <b>Done means re-crawled, not asserted.</b>') + '</div>';
  document.querySelectorAll('.act[data-k]').forEach(b => { b.onclick = () => act(b.dataset.k, b.dataset.a, b); });
}

async function act(key, action, btn){
  btn.disabled = true;
  try {
    const r = await fetch('/api/feed', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: ID, key: key, action: action, days: 7 }) });
    if (!r.ok) throw new Error('failed');
    P = await (await fetch('/api/project?id=' + ID)).json();
    render();
  } catch { btn.disabled = false; btn.textContent = T('没存上，再点一次','did not save — try again'); }
}

function ask(){
  const a = P.audit, pr = P.probe;
  const items = [];
  if (pr && pr.verdict === 'confused'){
    items.push(T('有回答<b>把你认成了别的公司</b>。这是最贵的一种失败 —— AI 不是不推荐你，是不知道你是谁。',
      'An answer <b>mistakes you for another company</b>. The most expensive failure: AI is not declining to recommend you, it does not know who you are.'));
  }
  if (pr && pr.verdict === 'unknown'){
    items.push(T('引擎<b>不知道你是谁</b>。先把定义块和实体声明补上，再谈排名。',
      'The engine <b>does not know who you are</b>. Fix the definition block and the entity declaration before worrying about rank.'));
  }
  const shells = ((a && a.pages) || []).filter(p => (p.blockers || []).some(b => /shell|render|wall/i.test(b))).length;
  if (shells > 0){
    items.push(T('<b>' + shells + ' 个页面对 AI 是空白</b> —— 爬虫读不到。修好它之前，别的优化都白做。',
      '<b>' + shells + ' page(s) are blank to an AI crawler.</b> Nothing else moves until this is fixed.'));
  }
  if (a && a.entity && !a.entity.organizationSchema){
    items.push(T('你的<b>实体声明是空的</b>（没有 Organization JSON-LD）。如果上面出现了认错，这两件很可能是同一件事。',
      'Your <b>entity declaration is empty</b> (no Organization JSON-LD). If there is confusion above, these are probably the same problem.'));
  }
  if (!items.length) items.push(T('本期没有发现致命问题。','No blockers this period.'));
  document.getElementById('pAsk').innerHTML =
    '<div class="ph"><b>' + T('问它','Ask') + '</b><span class="mono">' + T('已接通','wired')
      + '</span><button class="cx" data-rail="pAsk">‹</button></div>'
    + '<div class="sect">' + T('今日简报','Today\\u2019s brief') + '</div>'
    + '<ul class="brief">' + items.map(i => '<li>' + i + '</li>').join('')
    + '<li class="note">' + T('第 1 期没有期对比。<b>单期只算观察，连续两期同向才叫趋势</b> —— 下一期才会出现这一栏。',
        'Period 1 has no comparison. <b>One period is an observation; two consecutive same-direction changes are a trend</b> — it appears next period.') + '</li></ul>'
    + '<div class="sect">' + T('这里能拿到什么','What you get here') + '</div>'
    + '<div style="background:var(--well);border-radius:7px;padding:11px 12px;font-size:11.5px;line-height:1.75;color:var(--dim)">'
    + T('· 每天重爬一次，你标的「修好了」由它核对<br>· 每个判定都带原话<br>· 算不出就写「未测」<br><br>'
        + '<b>网页版还做不到</b>：18 引擎托管采样、替你写稿、替你发帖。这三件在命令行里跑得通。',
        '· Re-crawled daily; anything you mark fixed is checked by it<br>· Every verdict carries a quote<br>· Unmeasured stays unmeasured<br><br>'
        + '<b>Not on the hosted side yet</b>: 18-engine sampling, drafting for you, publishing for you. All three work in the CLI.')
    + '</div>'
    + '<div class="askbox"><input id="q" placeholder="' + T('问这个项目的任何事','Ask anything about this project') + '">'
    + '<button class="btn" id="qs">' + T('问它','Ask') + '</button><div class="ans" id="qa"></div></div>';
  const go = () => doAsk(document.getElementById('q').value);
  document.getElementById('qs').onclick = go;
  document.getElementById('q').onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function doAsk(q){
  q = String(q || '').trim(); if (!q) return;
  const el = document.getElementById('qa');
  el.innerHTML = T('想…','thinking…');
  try {
    const r = await fetch('/api/ask', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: ID, q: q, lang: ZH ? 'zh' : 'en' }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'failed');
    el.innerHTML = esc(j.answer).replace(/\\n/g, '<br>')
      + '<div class="src">' + esc(j.grounding || '') + '</div>';
  } catch { el.innerHTML = T('这次没答上来。','Could not answer this time.'); }
}

function showDoc(k){
  const d = P.dossier || {}, b = d.brand || {};
  const M = {
    product: [T('产品档案','Product'),
      (b.name || '') + '\\n\\n' + (b.description || T('（空）','(empty)'))
      + (b.industry ? '\\n\\n' + T('行业','Industry') + ': ' + b.industry : '')
      + ((b.aliases || []).length ? '\\n\\n' + T('别名','Aliases') + ': ' + b.aliases.join(', ') : '')],
    facts: [T('品牌事实库','Brand facts'),
      ((d.facts && d.facts.facts) || []).map(f => '[' + f.grade + '] ' + f.claim
        + (f.by === 'owner' ? '  (' + T('你改的','yours') + ')' : '')).join('\\n') || T('（空）','(empty)')],
    competitors: [T('竞品分析','Competitors'),
      (d.competitorCandidates || []).map(c => '· ' + c.name + (c.why ? ' — ' + c.why : '')).join('\\n') || T('（空）','(empty)')],
    questions: [T('问题库','Questions'),
      (d.questions || []).map(q => '[' + q.market + '] ' + q.text).join('\\n') || T('（空）','(empty)')],
    voice: [T('语气指南','Voice'),
      (P.voice && P.voice.filled)
        || (((P.docs && P.docs.voice && P.docs.voice.evidence) || []).map(e => '“' + e.text + '”').join('\\n\\n'))
        || T('（空）','(empty)')],
  };
  const pair = M[k] || ['', ''];
  show(pair[0], pair[1]);
}

/* What this product can do, where each capability lands, and what is missing —
   the same map the panel is built from, so it cannot flatter itself. */
function capsHtml(){
  const DOM = ZH
    ? {core:'基础',visible:'可见',demand:'需求',content:'内容',authority:'权威',
       watch:'监测',distribute:'分发',convert:'转化',social:'社交'}
    : {core:'core',visible:'visible',demand:'demand',content:'content',authority:'authority',
       watch:'watch',distribute:'distribute',convert:'convert',social:'social'};
  const MARK = { web:'✅', cli:'⌨️', none:'⛔' };
  const WHERE = ZH ? { web:'这个面板上', cli:'只在命令行', none:'我们不做' }
                   : { web:'on this panel', cli:'CLI only', none:'we do not do this' };
  const order = ['core','visible','demand','content','authority','watch','distribute','convert','social'];
  const byDom = {};
  for (const c of CAPS) (byDom[c.d] = byDom[c.d] || []).push(c);
  const head = T(
    CAPSUM.total + ' 个能力 · 这个面板上能用 ' + CAPSUM.web + ' 个 · 只在命令行 ' + CAPSUM.cli
      + ' 个 · 决定不做 ' + CAPSUM.none + ' 个',
    CAPSUM.total + ' capabilities · ' + CAPSUM.web + ' on this panel · ' + CAPSUM.cli
      + ' CLI only · ' + CAPSUM.none + ' deliberately not built');
  return '<div class="cpbsum">' + esc(head) + '<br><span>'
    + T(CAPSUM.unsurfaced.length + ' 个真实存在但这个面板还没接上 —— 下面标了差什么。',
        CAPSUM.unsurfaced.length + ' are real but this panel has not caught up — each says what stands in the way.')
    + '</span></div>'
    + order.filter(d => byDom[d]).map(d =>
        '<div class="cpbdom">' + esc(DOM[d]) + '</div>'
        + byDom[d].map(c => '<div class="cpb' + (c.s === 'web' ? ' on' : '') + '">'
            + '<div class="cpbh"><span class="cpbm">' + MARK[c.s] + '</span>'
            + '<b>' + esc(ZH ? c.zh : c.en) + '</b>'
            + '<span class="cpbw">' + esc(WHERE[c.s]) + '</span></div>'
            + '<div class="cpbv">' + esc(c.v) + '</div>'
            + (c.g ? '<div class="cpbg">' + T('差什么：','Gap: ') + esc(c.g) + '</div>' : '')
            + (c.n && c.n.length ? '<div class="cpbn">' + T('需要：','Needs: ') + esc(c.n.join(ZH ? '、' : ', ')) + '</div>' : '')
            + '</div>').join('')).join('');
}

function show(title, body){
  document.getElementById('dlgT').textContent = title;
  document.getElementById('dlgB').textContent = body || '';
  document.getElementById('dlgB').style.whiteSpace = 'pre-wrap';
  document.getElementById('dlg').showModal();
}
function showHtml(title, html){
  document.getElementById('dlgT').textContent = title;
  document.getElementById('dlgB').innerHTML = html;
  document.getElementById('dlgB').style.whiteSpace = 'normal';
  document.getElementById('dlg').showModal();
}
document.getElementById('dlgX').onclick = () => document.getElementById('dlg').close();
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'howKey'){
    show(T('跑全部 18 个引擎','Run all 18 engines'), T(
      '网页版目前只问一个引擎。要跑全部 18 个，在你自己机器上：\\n\\n'
      + '  npx fastergeo start ' + (P.url || '你的网址') + '\\n\\n'
      + '每个引擎读一个环境变量，Key 只在你本机，永不上传：\\n\\n'
      + '  export DEEPSEEK_API_KEY=…   # DeepSeek\\n'
      + '  export ARK_API_KEY=…        # 豆包\\n'
      + '  export ZHIPUAI_API_KEY=…    # 智谱 GLM\\n'
      + '  export OPENAI_API_KEY=…     # ChatGPT\\n\\n'
      + '一个 Key 都不想配？跑 fastergeo sheet：\\n把问题贴进 AI 网页版，把回答贴回来，指标照样算。\\n\\n'
      + '而且只有联网引擎会返回引用来源 —— 18 个里的那 5 个，是唯一能测「⑤ 引用你」的。\\n\\n'
      + '托管采样（我们替你跑 18 个）还没做。',
      'The hosted run asks one engine. To run all 18, on your own machine:\\n\\n'
      + '  npx fastergeo start ' + (P.url || 'yoursite.com') + '\\n\\n'
      + 'Each engine reads one environment variable. Keys stay on your machine:\\n\\n'
      + '  export DEEPSEEK_API_KEY=…\\n  export ARK_API_KEY=…\\n  export ZHIPUAI_API_KEY=…\\n  export OPENAI_API_KEY=…\\n\\n'
      + 'No keys at all? Run fastergeo sheet: paste the questions into any AI web app by hand, paste the answers back, and the metrics still compute.\\n\\n'
      + 'Only the web-connected engines return sources — those 5 of the 18 are the only way to measure gate ⑤.\\n\\n'
      + 'Hosted sampling (us running all 18 for you) is not built.'));
  }
});
</script></body></html>`;
}
