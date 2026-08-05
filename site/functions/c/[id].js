/**
 * GET /c/<id> — the console.
 *
 * The panel at /p answers "what is wrong with this site" — a report, read once.
 * This is the other thing a customer is buying: a place that looks like a team
 * is working, because one is.
 *
 * A terminal across the top, then four columns:
 *
 *   terminal   full width, collapsible. What the system did, in its own words.
 *   company    what we know about you — the documents every job reads first
 *   analytics  what we measured, graded, failures first
 *   agents     a roster, and inside each job ITS OWN work items, actionable
 *   cmo        one place to ask
 *
 * The structural bet is the third column. A feed of findings and a roster of
 * agents are the same list seen twice; keeping them apart makes a person read
 * the roster, learn nothing, and go hunt for the work elsewhere. So each job
 * owns the items routed to its playbook, and every item can be acted on where
 * it is read.
 *
 * Nothing here implies an output that does not exist. A job with no data says
 * what it needs, in the card, instead of reporting a number it invented — and
 * the one panel we cannot measure yet says so in words rather than blurring a
 * fake figure behind a paywall.
 */
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
<title>FasterGEO Console</title><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#12100C;--chrome:#1A1712;--line:#2C2823;--dim:#7E7768;--txt:#D9D3C4;--hi:#F3EEE1;
--paper:#F6F3EC;--panel:#FCFAF5;--ink:#1C1A15;--ink2:#4C4739;--faint:#8A8371;--rule:#DAD3C2;
--red:#C0492F;--green:#4E8455;--amber:#B08417;
--serif:"Newsreader","Songti SC",Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.65 var(--serif);overflow:hidden}
.top{display:flex;align-items:center;gap:12px;padding:0 14px;height:44px;background:var(--chrome);
border-bottom:1px solid var(--line);font:12px var(--mono);flex:none}
.top b{font-family:var(--serif);font-size:16px;color:var(--hi);font-weight:500}
.top .sep{color:var(--dim)}.top .sp{flex:1}
.top a{color:var(--dim);text-decoration:none}.top a:hover{color:var(--hi)}
.caret{background:none;border:0;color:var(--dim);cursor:pointer;font:13px var(--mono);padding:2px 5px}
.caret:hover{color:var(--hi)}
.tail{color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44vw}
.lamp{display:inline-flex;align-items:center;gap:6px;color:var(--dim)}
.lamp i{width:7px;height:7px;border-radius:50%;background:var(--green);display:block}
.lamp.warn i{background:var(--amber)}.lamp.bad i{background:var(--red);box-shadow:0 0 7px var(--red)}
/* The terminal. Full width and on top because the thing it answers — is
   anything actually happening — is the first question, not a sidebar detail. */
.term{background:#0C0A07;border-bottom:1px solid var(--line);padding:9px 16px;flex:none;
font:12px/1.75 var(--mono);height:170px;overflow-y:auto}
.term.hide{display:none}
.term div{white-space:pre-wrap;color:var(--txt)}
.term .tg{color:#7FA88A}
.term .day{color:var(--dim);text-align:center;margin:7px 0}
.grid{display:grid;grid-template-columns:240px 250px minmax(0,1fr) 330px;gap:1px;background:var(--line);
height:calc(100vh - 44px - 170px);overflow:hidden}
.grid.tall{height:calc(100vh - 44px)}
@media(max-width:1340px){.grid{grid-template-columns:220px 230px minmax(0,1fr)}#cCmo{display:none}}
@media(max-width:1000px){.grid,.grid.tall{grid-template-columns:1fr;height:auto;overflow:auto}
body{overflow:auto}.term{height:auto;max-height:150px}}
.col{background:var(--paper);color:var(--ink);overflow-y:auto;padding:13px 14px;min-width:0}
.col.dark{background:var(--chrome);color:var(--txt)}
h2{font:500 10.5px var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--faint);
margin:0 0 11px;padding-bottom:7px;border-bottom:1px solid var(--rule);display:flex;
justify-content:space-between;align-items:center;gap:8px}
.col.dark h2{color:var(--dim);border-bottom-color:var(--line)}
h3{font:500 17px var(--serif);margin:0 0 4px}
.mini{font:11px var(--mono);color:var(--faint)}
.col.dark .mini{color:var(--dim)}
/* Nudges: only the profile fields that would change an output, each naming
   what it unlocks, so it reads as a trade rather than a chore. */
.nudge{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--rule);border-radius:16px;
padding:3px 10px;margin:0 5px 6px 0;font:11px var(--mono);color:var(--ink2);cursor:pointer;background:var(--panel)}
.nudge:hover{border-color:var(--ink);color:var(--ink)}
.doc{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 0;
border-bottom:1px dotted var(--rule);font-size:13.5px;cursor:pointer}
.doc:hover{color:var(--red)}.doc:last-child{border-bottom:none}
.doc .r{display:flex;align-items:center;gap:6px;flex:none}
.tag{font:600 9px var(--mono);padding:1px 5px;background:#E7EEE2;color:var(--green);white-space:nowrap}
.tag.warn{background:#F5EFDE;color:var(--amber)}
.tag.no{background:#EFEBE0;color:var(--faint)}
.tag.new{background:var(--green);color:#fff}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px}
.cmp a{display:flex;align-items:center;gap:6px;font:11.5px var(--mono);color:var(--ink2);
text-decoration:none;padding:3px 0;overflow:hidden}
.cmp a:hover{color:var(--red)}
.cmp img{width:14px;height:14px;flex:none;border-radius:2px}
.cmp span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sect{font:500 9.5px var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--faint);margin:15px 0 6px}
.tabs{display:flex;border-bottom:1px solid var(--rule);margin-bottom:11px;overflow-x:auto}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:5px 10px;
font:11.5px var(--mono);color:var(--faint);cursor:pointer;white-space:nowrap}
.tabs button.on{color:var(--ink);border-bottom-color:var(--red)}
/* Rings read faster than bars for a set of scores compared at a glance. */
.rings{display:flex;gap:10px;flex-wrap:wrap;margin:9px 0 8px}
.ring{text-align:center;width:64px}
.ring svg{display:block;margin:0 auto}
.ring .n{font:500 15px var(--mono);fill:var(--ink)}
.ring .l{font:10px var(--mono);color:var(--faint);display:block;margin-top:2px;line-height:1.3}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
.card{border:1px solid var(--rule);background:var(--panel);padding:9px 11px}
.card .k{font:11px var(--mono);color:var(--faint);display:flex;align-items:center;gap:5px}
.card .k i{width:6px;height:6px;border-radius:50%;background:var(--green);display:block}
.card.bad .k i{background:var(--red)}
.card .v{font:500 19px var(--mono);margin-top:3px;display:block}
.card.bad .v{color:var(--red)}
.card .s{font:10.5px var(--mono);color:var(--faint)}
.sig{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dotted var(--rule);
font:11.5px var(--mono)}
.sig:last-child{border-bottom:none}
.sig .w{color:var(--amber)}
.iss{display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px dotted var(--rule);font-size:13px}
.iss:last-child{border-bottom:none}
.sev{font:600 9px var(--mono);padding:1px 5px;flex:none}
.sev.crit{background:var(--red);color:#fff}
.sev.warn{background:#F5EFDE;color:var(--amber)}
.quote{margin:6px 0;padding-left:11px;border-left:3px solid var(--rule);font-size:13.5px;color:var(--ink2)}
.note{margin-top:12px;padding:9px 11px;background:#F5EFDE;font:11.5px/1.7 var(--mono);color:var(--amber)}
/* Agents */
.ag{background:var(--panel);border:1px solid var(--rule);margin-bottom:7px}
.ag.on{border-left:3px solid var(--green)}
.ag.idle{border-left:3px solid var(--rule)}
.ag summary{padding:10px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;list-style:none}
.ag summary::-webkit-details-marker{display:none}
.ag .ico{width:24px;height:24px;flex:none;border-radius:5px;display:grid;place-items:center;
font:600 9px var(--mono);color:#fff;background:var(--faint);letter-spacing:.02em}
.ag .who{font:600 10.5px var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--ink);flex:none}
.ag .out{flex:1;font:11.5px var(--mono);color:var(--green);text-align:right}
.ag .out.none{color:var(--faint)}
.ag .body{padding:0 12px 11px}
.ag .need{margin:2px 0 9px;padding:8px 10px;background:#F5EFDE;font:11.5px/1.7 var(--mono);color:var(--amber)}
.wi{border-top:1px solid var(--rule);padding:9px 0}
.wi .h{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.wi .t{font:500 14px var(--serif);flex:1;min-width:120px}
.wi .acc{font:11.5px/1.7 var(--mono);color:var(--ink2);margin:5px 0 0}
.wi .acc b{color:var(--green);font-weight:500}
.wi .hint{margin:6px 0 0;padding:8px 10px;background:var(--paper);border:1px solid var(--rule);
font:11px/1.75 var(--mono);white-space:pre-wrap;color:var(--ink2);overflow-x:auto}
.wi .acts{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;align-items:center}
.pr{font:600 9px var(--mono);padding:1px 5px;flex:none}
.pr-P0{background:var(--red);color:#fff}
.pr-P1{background:#F5EFDE;color:var(--amber)}
.pr-P2{background:#EFEBE0;color:var(--ink2)}
.stn{font:600 9px var(--mono);padding:1px 5px;background:#EFEBE0;color:var(--faint)}
.rg{font:600 9px var(--mono);padding:1px 5px;background:var(--red);color:#fff}
.act{background:none;border:1px solid var(--rule);color:var(--ink2);padding:4px 9px;
font:11px var(--mono);cursor:pointer}
.act:hover{border-color:var(--ink);color:var(--ink)}
.act.go{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.act.go:hover{background:var(--red);border-color:var(--red)}
.act[disabled]{opacity:.5;cursor:default}
.pbtn{background:none;border:1px solid var(--green);color:var(--green);padding:4px 10px;
font:11px var(--mono);cursor:pointer;margin-top:9px}
.pbtn:hover{background:var(--green);color:#fff}
.pbody{margin-top:9px;font:13px/1.7 var(--serif)}
.pbody:empty{display:none}
.grp{margin:13px 0 5px}
.grp summary{font:500 10.5px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint);
cursor:pointer;padding:6px 0;border-top:1px solid var(--rule)}
/* The job list. Narrow on purpose: it is a switcher, not a place to read. */
.job{display:flex;gap:9px;align-items:center;padding:9px 8px;cursor:pointer;border-left:3px solid transparent}
.job:hover{background:var(--panel)}
.job.sel{background:var(--panel);border-left-color:var(--red)}
.job .ico{width:24px;height:24px;flex:none;border-radius:5px;display:grid;place-items:center;
font:600 9px var(--mono);color:#fff;background:var(--faint)}
.job .nm{flex:1;min-width:0}
.job .nm b{display:block;font:500 13.5px var(--serif);font-weight:500}
.job .nm span{display:block;font:10.5px var(--mono);color:var(--faint);overflow:hidden;
text-overflow:ellipsis;white-space:nowrap}
.job.has .nm span{color:var(--green)}
.job .ct{font:600 9px var(--mono);padding:1px 5px;background:var(--red);color:#fff;flex:none}
/* The matrix. Rows are engines, columns are the five gates a brand has to pass
   before an AI will cite it. Its empty cells are the point: an unmeasured gate
   says so, and never renders as a zero. */
.mx{width:100%;border-collapse:collapse;font:11px var(--mono);margin:8px 0}
.mx th{font-weight:500;color:var(--faint);padding:5px 4px;text-align:center;font-size:10px;
border-bottom:1px solid var(--rule)}
.mx th:first-child{text-align:left;padding-left:2px}
.mx td{padding:0;border-bottom:1px solid var(--paper)}
.mx td.e{font-size:11px;color:var(--ink2);padding:4px 6px 4px 2px;white-space:nowrap}
.mx .cell{display:block;height:20px;line-height:20px;text-align:center;font-size:10px;
border:1px solid var(--paper)}
.mx .pass{background:#DCE8DC;color:var(--green)}
.mx .fail{background:#F2DAD4;color:var(--red)}
.mx .un{background:#EFEBE0;color:#BBB4A2}
.mx tr.mk td{padding-top:9px;font:600 9.5px var(--mono);letter-spacing:.1em;color:var(--faint)}
/* Page × signal grids. Same idea at page scale: a missing block is a gap you
   can go fill, which a single site-wide average never tells you. */
.hm{width:100%;border-collapse:collapse;font:10.5px var(--mono);margin:6px 0}
.hm th{font-weight:500;color:var(--faint);padding:4px 3px;text-align:center;font-size:9.5px;
border-bottom:1px solid var(--rule)}
.hm th:first-child{text-align:left}
.hm td{padding:2px 3px;border-bottom:1px solid var(--paper)}
.hm td.u{font-size:10.5px;color:var(--ink2);max-width:210px;overflow:hidden;
text-overflow:ellipsis;white-space:nowrap}
.hm .c{display:block;height:18px;line-height:18px;text-align:center;border:1px solid var(--paper)}
.hm .hi{background:#DCE8DC;color:var(--green)}
.hm .mid{background:#F5EFDE;color:var(--amber)}
.hm .lo{background:#F2DAD4;color:var(--red)}
.hm .no{background:#EFEBE0;color:#BBB4A2}
.legend{font:10.5px var(--mono);color:var(--faint);margin-top:5px}
.stagehead{display:flex;align-items:baseline;gap:10px;margin-bottom:3px}
.stagehead h3{margin:0}
.stagehead .sub{font:11px var(--mono);color:var(--faint)}
/* Chat */
.ask{display:flex;gap:6px;margin-bottom:10px}
.ask input{flex:1;background:#0E0C09;border:1px solid var(--line);color:var(--hi);
padding:8px 10px;font:12px var(--mono)}
.ask button{background:var(--hi);border:0;color:var(--bg);padding:8px 12px;font:11.5px var(--mono);cursor:pointer}
.msg{background:#0E0C09;border:1px solid var(--line);padding:12px 13px;margin-bottom:9px;
font:13.5px/1.75 var(--serif);color:var(--txt)}
.msg ul{margin:7px 0;padding-left:18px}
.msg p{margin:0 0 7px}
.msg .src{margin-top:9px;font:10.5px var(--mono);color:var(--dim)}
.empty{color:var(--faint);font:12px var(--mono);padding:10px 0}
/* Document slide-over. Documents are what every job reads first, so they get a
   real reading surface instead of a cramped modal. */
.over{position:fixed;inset:0;background:rgba(12,10,7,.55);display:none;z-index:9}
.over.on{display:block}
.sheet{position:fixed;top:0;right:0;bottom:0;width:min(760px,94vw);background:var(--panel);
color:var(--ink);z-index:10;transform:translateX(101%);transition:transform .18s;display:flex;flex-direction:column}
.sheet.on{transform:none}
.sheet .sh{display:flex;align-items:center;gap:9px;padding:13px 18px;border-bottom:1px solid var(--rule);
font:12px var(--mono);flex:none}
.sheet .sh b{font:500 16px var(--serif)}
.sheet .sh .sp{flex:1}
.sheet .sc{padding:20px 24px 44px;overflow-y:auto;font:15px/1.8 var(--serif)}
.sheet .sc h4{font:500 17px var(--serif);margin:18px 0 5px;padding-bottom:5px;border-bottom:1px solid var(--rule)}
.sheet .sc table{border-collapse:collapse;width:100%;margin:9px 0;font-size:13.5px}
.sheet .sc td{border:1px solid var(--rule);padding:6px 9px;vertical-align:top}
.sheet .sc pre{background:var(--paper);border:1px solid var(--rule);padding:10px 12px;
font:11.5px/1.7 var(--mono);overflow-x:auto;white-space:pre-wrap}
.sheet .sc code{font:12px var(--mono);background:var(--paper);padding:1px 4px}
.sheet .sc ul{padding-left:20px}
.sheet .sc blockquote{margin:8px 0;padding-left:12px;border-left:3px solid var(--rule);color:var(--ink2)}
</style></head><body>
<div class="top">
  <button class="caret" id="tg" title="terminal">▾</button>
  <b id="brand">…</b><span class="sep">|</span><span>FasterGEO Console</span>
  <span class="mini" id="host"></span>
  <span class="tail" id="tail"></span>
  <span class="sp"></span>
  <span class="lamp" id="lamp"><i></i><span id="lampT">…</span></span>
  <a href="/p/${esc(id)}${zh ? '?lang=zh' : ''}">${zh ? '诊断页' : 'Diagnosis'}</a>
  <a href="/my${zh ? '?lang=zh' : ''}">${zh ? '我的站点' : 'My sites'}</a>
</div>
<div class="term" id="term"></div>
<div class="grid" id="grid">
  <div class="col" id="cCtx"></div>
  <div class="col" id="cJobs"></div>
  <div class="col" id="cStage"></div>
  <div class="col dark" id="cCmo"></div>
</div>
<div class="over" id="over"></div>
<div class="sheet" id="sheet">
  <div class="sh"><b id="sht"></b><span class="sp"></span>
    <button class="act" id="shc">${zh ? '复制' : 'Copy'}</button>
    <button class="act" id="shd">${zh ? '下载' : 'Download'}</button>
    <button class="act" id="shx">×</button></div>
  <div class="sc" id="shb"></div>
</div>
<script>
const ID = ${JSON.stringify(id)};
const ZH = ${JSON.stringify(zh)};
const T = (a, b) => ZH ? a : b;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let P = null;
let SHEET = { title: '', text: '' };

/* ── the roster ───────────────────────────────────────────────────────────
   Every entry names a real playbook in the bundle and owns the work items
   routed to that playbook. read() returns null when the job has no data — that
   is "staffed and idle", never a fabricated number. */
const ROSTER = [
  { id:'seo-audit', zh:'SEO 巡检官', en:'SEO inspector', ic:'SEO', c:'#4A6A8A',
    read: p => { const n = issues(p).length; return n ? T(n+' 个页面问题', n+' page issues') : null; } },
  { id:'ai-seo', zh:'GEO 可见度官', en:'GEO visibility', ic:'GEO', c:'#4E8455',
    read: p => { const v = p.probe; if (!v || !v.verdict) return null;
      const m = {knows:T('AI 认识你','AI knows you'),confused:T('AI 认错了你','AI has you confused'),
                 unknown:T('AI 不知道你','AI does not know you')};
      return m[v.verdict] || v.verdict; },
    need: T('只问了 1 个引擎（DeepSeek）。中外 18 个引擎的托管采样还没做 —— 那是这一栏真正值钱的地方。',
            'One engine asked (DeepSeek). Hosted sampling across 18 engines is not built — that is where this job gets valuable.') },
  { id:'technical-seo-checker', zh:'技术体检官', en:'Technical', ic:'TEC', c:'#8A6A4A',
    read: p => { const b = ((p.audit && p.audit.pages) || []).filter(x => (x.blockers||[]).length).length;
      return b ? T(b+' 个页面爬虫读不到', b+' pages crawlers cannot read') : null; } },
  { id:'schema', zh:'结构化数据官', en:'Schema', ic:'SCH', c:'#6A5A8A',
    read: p => { const s = p.audit && p.audit.site; if (!s) return null;
      return s.llmsTxtFound ? null : T('llms.txt 缺失','llms.txt missing'); } },
  { id:'competitor-analysis', zh:'竞品雷达', en:'Competitor radar', ic:'CMP', c:'#8A4A5A',
    read: p => { const c = (p.dossier && p.dossier.competitorCandidates) || [];
      return c.length ? T(c.length+' 个候选待你核', c.length+' candidates to confirm') : null; },
    need: T('这些是从你网站文字里猜的。真正的竞争集要靠采样 AI 的回答 —— 缺 18 引擎采样。',
            'Guessed from your own copy. The real competitive set comes from sampling AI answers — needs 18-engine sampling.') },
  { id:'product-marketing', zh:'定位官', en:'Positioning', ic:'POS', c:'#4A7A7A',
    read: p => { const f = p.dossier && p.dossier.facts && p.dossier.facts.facts;
      return f && f.length ? T(f.length+' 条品牌事实', f.length+' brand facts') : null; } },
  { id:'content-strategy', zh:'内容策略官', en:'Content strategy', ic:'CON', c:'#7A6A3A',
    read: p => { const s = p.docs && p.docs.strategy;
      return s && s.pieces && s.pieces.length ? T(s.pieces.length+' 篇选题', s.pieces.length+' topics') : null; },
    need: T('选题有了，稿子没有 —— 生成能力在命令行里，网页还没接。',
            'Topics yes, drafts no. Generation lives in the CLI and is not wired to the web yet.') },
  { id:'marketing-loops', zh:'循环调度官', en:'Loop scheduler', ic:'LOO', c:'#5A7A4A',
    read: p => { const l = p.loop && p.loop.lastCheck; if (!l) return null;
      const c = p.feedCounts || {};
      return T('每天重爬 · '+(c.unread||0)+' 条新情况','daily re-crawl · '+(c.unread||0)+' new'); },
    need: T('铁律：大多数运行应该是「查过了，没事可做」。天天有话说的循环是坏循环。',
            'The rule: most runs should be "checked, nothing to do". A loop that speaks every day is broken.') },
];

const BENCH = {
  find: { zh:'找得到（搜索与 AI 可见度）', en:'Discoverable',
    ids:['on-page-seo-auditor','keyword-research','serp-analysis','internal-linking-optimizer','site-architecture',
         'rank-tracker','programmatic-seo','content-gap-analysis','meta-tags-optimizer','entity-optimizer',
         'geo-content-optimizer','schema-markup-generator','domain-authority-auditor','backlink-analyzer',
         'directory-submissions','aso','free-tools'] },
  make: { zh:'看得懂（内容与素材）', en:'Comprehensible',
    ids:['seo-content-writer','copywriting','copy-editing','content-quality-auditor','content-refresher',
         'video','image','ad-creative','emails','lead-magnets'] },
  trust:{ zh:'信得过（权威与背书）', en:'Credible',
    ids:['public-relations','co-marketing','influencer-marketing','community-marketing','referrals','social'] },
  buy:  { zh:'买得下（转化与定价）', en:'Convertible',
    ids:['cro','ab-testing','onboarding','signup','paywalls','popups','offers','pricing','churn-prevention'] },
  reach:{ zh:'传得开（渠道与外呼）', en:'Distribution',
    ids:['ads','cold-email','sms','prospecting','sales-enablement','launch'] },
  run:  { zh:'跑得动（度量与治理）', en:'Measure and govern',
    ids:['analytics','attribution','performance-reporter','alert-manager','revops','memory-management'] },
  know: { zh:'说得清（战略与研究）', en:'Strategy',
    ids:['marketing-council','marketing-plan','marketing-ideas','marketing-psychology','customer-research',
         'competitor-profiling','competitors','monid','workctl'] },
};

const STN = ZH
  ? {positioned:'说得清',demanded:'有人要',discoverable:'找得到',comprehensible:'看得懂',
     credible:'信得过',convertible:'买得下',compounding:'传得开'}
  : {positioned:'positioned',demanded:'demand',discoverable:'discoverable',comprehensible:'comprehensible',
     credible:'credible',convertible:'convertible',compounding:'compounding'};

function issues(p){
  const out = [];
  for (const pg of (p.audit && p.audit.pages) || []) {
    for (const b of pg.blockers || []) out.push({ sev:'crit', t:b, u:pg.url });
    for (const d of pg.dimensions || []) for (const i of d.issues || []) out.push({ sev:'warn', t:i, u:pg.url });
  }
  return out;
}
/* Work items belong to the job whose playbook they route to. Anything with no
   route lands on the first job rather than disappearing. */
function itemsFor(p, skill, isFirst){
  return (p.feedOpen || []).filter(t => {
    const s = t.playbook && t.playbook.skill;
    return s ? s === skill : Boolean(isFirst);
  });
}
function hostOf(n){
  const raw = String(n || '').trim();
  const stripped = raw.replace(/^https?:[/][/]/, '').replace(/[/].*$/, '');
  if (stripped.indexOf('.') > 0) return stripped;
  return stripped.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

async function boot(){
  bindChrome();
  try { P = await (await fetch('/api/project?id='+ID)).json(); }
  catch { document.getElementById('cCtx').innerHTML = '<div class="empty">'+T('读不到这个项目。','Could not load this project.')+'</div>'; return; }
  if (P.error){ document.getElementById('cCtx').innerHTML = '<div class="empty">'+T('这个项目不存在或已过期。','This project does not exist or has expired.')+'</div>'; return; }
  render();
}

function bindChrome(){
  document.getElementById('tg').onclick = () => {
    const t = document.getElementById('term');
    const hid = t.classList.toggle('hide');
    document.getElementById('grid').classList.toggle('tall', hid);
    document.getElementById('tg').textContent = hid ? '▸' : '▾';
    tail();
  };
  const close = () => { document.getElementById('sheet').classList.remove('on');
    document.getElementById('over').classList.remove('on'); };
  document.getElementById('shx').onclick = close;
  document.getElementById('over').onclick = close;
  document.getElementById('shc').onclick = async e => {
    try { await navigator.clipboard.writeText(SHEET.text); e.target.textContent = T('已复制','Copied'); }
    catch { e.target.textContent = T('复制不了','Cannot copy'); }
    setTimeout(() => { e.target.textContent = T('复制','Copy'); }, 1600);
  };
  document.getElementById('shd').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([SHEET.text], {type:'text/markdown'}));
    a.download = (SHEET.title || 'document') + '.md';
    a.click(); URL.revokeObjectURL(a.href);
  };
}

function render(){
  const d = P.dossier || {};
  const brand = (d.brand && d.brand.name) || P.url;
  document.getElementById('brand').textContent = brand;
  let h = P.url; try { h = new URL(P.url).hostname; } catch {}
  document.getElementById('host').textContent = h;
  terminal(); lamp(); context(d, brand); jobs(); stage(); cmo(); tail();
}

/* The terminal, in the system's own voice, split by day — "when did this
   happen" is most of what a log is for. */
function terminal(){
  const log = P.log || [];
  const el = document.getElementById('term');
  if (!log.length){ el.innerHTML = '<div class="mini">'+T('还没有记录。','Nothing logged yet.')+'</div>'; return; }
  let day = '';
  const rows = [];
  for (const l of log){
    const d = new Date(l.t).toISOString().slice(0,10);
    if (d !== day){ day = d; rows.push('<div class="day">—— '+d+' (UTC) ——</div>'); }
    rows.push('<div>&gt; '+(l.loop ? '<span class="tg">[LOOP]</span> ' : '')+esc(l.m)+'</div>');
  }
  el.innerHTML = rows.join('');
  el.scrollTop = el.scrollHeight;
}

/* Folded away, its last line rides in the title bar — the system should not go
   silent just because someone wanted the screen back. */
function tail(){
  const hid = document.getElementById('term').classList.contains('hide');
  const log = (P && P.log) || [];
  document.getElementById('tail').textContent =
    hid && log.length ? '> ' + log[log.length - 1].m : '';
}

function lamp(){
  const crit = issues(P).filter(i => i.sev === 'crit').length;
  const c = P.feedCounts || {};
  const el = document.getElementById('lamp');
  el.className = 'lamp' + (crit ? ' bad' : c.unread ? ' warn' : '');
  document.getElementById('lampT').textContent = crit
    ? T(crit+' 个阻断', crit+' blocking')
    : c.unread ? T(c.unread+' 条未读', c.unread+' unread') : T('正常','healthy');
}

/* ── column 1 · company ─────────────────────────────────────────────────── */
function context(d, brand){
  const b = d.brand || {};
  const docs = [
    ['product', T('产品档案','Product information'), b.description ? 'ok' : 'no'],
    ['facts', T('品牌事实库','Brand facts'), ((d.facts && d.facts.facts) || []).length ? 'ok' : 'no'],
    ['competitors', T('竞品分析','Competitor analysis'), (d.competitorCandidates||[]).length ? 'warn' : 'no'],
    ['questions', T('买家问题库','Buyer questions'), (d.questions||[]).length ? 'ok' : 'no'],
    ['voice', T('品牌语气','Brand voice guide'), (P.voice && P.voice.filled) ? 'ok' : 'warn'],
    ['strategy', T('内容策略','Content strategy'), (P.docs && P.docs.strategy) ? 'ok' : 'no'],
  ];
  const lbl = { ok:T('已就位','ready'), warn:T('待你填','needs you'), no:T('没有','none') };
  const nudges = [];
  if (!(b.aliases||[]).length) nudges.push(['product', T('补品牌别名','Add brand aliases'), T('别名决定一条提及算不算数','aliases decide whether a mention counts')]);
  if (!(P.voice && P.voice.filled)) nudges.push(['voice', T('定语气','Set the voice'), T('定了才能替你写稿','needed before anything is drafted for you')]);
  if (!(d.competitorCandidates||[]).length) nudges.push(['competitors', T('补竞品','Add competitors'), T('对比页要靠它','comparison work depends on it')]);

  document.getElementById('cCtx').innerHTML =
    '<h2>'+T('公司','Company')+'</h2>'
    + '<h3>'+esc(brand)+'</h3>'
    + (b.industry ? '<p class="mini">'+esc(b.industry)+'</p>' : '')
    + (nudges.length ? '<div style="margin:8px 0 4px">'
        + nudges.map(x => '<span class="nudge" data-doc="'+esc(x[0])+'" title="'+esc(x[2])+'">'+esc(x[1])+'</span>').join('')
        + '</div>' : '')
    + (b.description ? '<p style="font-size:13.5px;color:var(--ink2)">'+esc(b.description)+'</p>' : '')
    + '<div class="sect">'+T('文档 · 每个岗位动手前都先读这些','Documents · every job reads these first')+'</div>'
    + docs.map(x => '<div class="doc" data-doc="'+esc(x[0])+'"><span>'+esc(x[1])+'</span>'
        + '<span class="r"><span class="tag '+(x[2]==='ok'?'':x[2])+'">'+lbl[x[2]]+'</span><span class="mini">›</span></span></div>').join('')
    + '<div class="sect">'+T('竞品','Competitors')+'</div>'
    + ((d.competitorCandidates||[]).length
        ? '<div class="cmp">' + (d.competitorCandidates||[]).slice(0,12).map(c => {
            const h = hostOf(c.name);
            return '<a href="https://'+esc(h)+'" target="_blank" rel="noopener">'
              + '<img src="https://www.google.com/s2/favicons?domain='+esc(h)+'&sz=32" alt="" loading="lazy">'
              + '<span>'+esc(c.name)+'</span></a>'; }).join('') + '</div>'
          + '<p class="mini" style="margin-top:7px">'+T('从你网站文字里猜的，等你核。','Guessed from your own copy. Yours to confirm.')+'</p>'
        : '<div class="empty">'+T('还没找到。','None found yet.')+'</div>');
  document.querySelectorAll('[data-doc]').forEach(e => e.onclick = () => showDoc(e.dataset.doc));
}

/* ── column 2 · analytics ───────────────────────────────────────────────── */
/* ── the stage ─────────────────────────────────────────────────────────────
   One job = one capability = one evidence view = one queue. Okara keeps its
   analytics and its agents in different columns, which leaves the reader
   splicing the two together in their head. Here, picking a job swaps the stage
   to that job's evidence with its work sitting underneath it. */
let SEL = 'ai-seo';

function ring(v, label){
  const col = v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)';
  const r = 20, len = 2 * Math.PI * r;
  return '<div class="ring"><svg width="52" height="52" viewBox="0 0 52 52">'
    + '<circle cx="26" cy="26" r="'+r+'" fill="none" stroke="#EFEBE0" stroke-width="4"></circle>'
    + '<circle cx="26" cy="26" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="4" stroke-linecap="round"'
    + ' stroke-dasharray="'+(len*v/100).toFixed(1)+' '+len.toFixed(1)+'" transform="rotate(-90 26 26)"></circle>'
    + '<text class="n" x="26" y="30" text-anchor="middle">'+v+'</text></svg>'
    + '<span class="l">'+esc(label)+'</span></div>';
}

/* The 18 engines we can drive, in the order that makes the China half legible
   as a block — that half is the part no comparable product measures at all. */
const ENGINES = [
  ['glm','智谱GLM','cn'],['doubao','豆包','cn'],['deepseek','DeepSeek','cn'],['kimi','Kimi','cn'],
  ['minimax','MiniMax','cn'],['qwen','通义千问','cn'],['ernie','文心一言','cn'],['spark','讯飞星火','cn'],
  ['nano','纳米AI搜索','cn'],['baidu-ai','百度AI搜索','cn'],
  ['openai','ChatGPT','global'],['anthropic','Claude','global'],['gemini','Gemini','global'],
  ['grok','Grok','global'],['perplexity','Perplexity','global'],['chatgpt-web','ChatGPT 网页','global'],
  ['claude-web','Claude 网页','global'],['ai-overview','Google AI Overviews','global'],
];
/* The five gates a brand passes before an AI will cite it. Each is a separate
   failure with a separate fix, which is why they are five columns and not one
   visibility score. */
const GATES = ZH
  ? [['knows','知道'],['unconfused','不混淆'],['mentions','提及'],['ranks','排名'],['cites','引用']]
  : [['knows','knows'],['unconfused','not confused'],['mentions','mentions'],['ranks','ranks'],['cites','cites']];

/* What we have actually measured for a given engine and gate. Returns null for
   "not measured", which the matrix renders as a stated gap. It is never a zero:
   a zero is a measurement, and we did not take one. */
function gateState(engineId, gate){
  const pr = P.probe;
  const m = (P.metrics && P.metrics.platforms) || [];
  const row = m.filter(x => x.providerId === engineId)[0];
  if (row){
    if (gate === 'mentions') return row.mentionRate == null ? null : row.mentionRate > 0;
    if (gate === 'ranks') return row.top3Rate == null ? null : row.top3Rate > 0;
    if (gate === 'cites') return row.ownDomainCiteRate == null ? null : row.ownDomainCiteRate > 0;
    const rec = row.probe && row.probe.recognition;
    if (rec){
      if (gate === 'knows') return (rec.knows || 0) > 0;
      if (gate === 'unconfused') return (rec.confused || 0) === 0;
    }
    return null;
  }
  // The single web probe fills exactly two cells on one row. Saying so beats
  // spreading one engine's answer across a grid it did not cover.
  if (pr && pr.verdict && pr.engine && String(pr.engine).indexOf(engineId) >= 0){
    if (gate === 'knows') return pr.verdict === 'knows';
    if (gate === 'unconfused') return pr.verdict !== 'confused';
  }
  return null;
}

function matrix(){
  let filled = 0;
  const row = e => {
    const cells = GATES.map(g => {
      const v = gateState(e[0], g[0]);
      if (v === null) return '<td><span class="cell un" title="'+T('未测','not measured')+'">—</span></td>';
      filled++;
      return '<td><span class="cell '+(v?'pass':'fail')+'">'+(v?'✓':'✗')+'</span></td>';
    }).join('');
    return '<tr><td class="e">'+esc(e[1])+'</td>'+cells+'</tr>';
  };
  const cn = ENGINES.filter(e => e[2] === 'cn').map(row).join('');
  const gl = ENGINES.filter(e => e[2] === 'global').map(row).join('');
  const total = ENGINES.length * GATES.length;
  return '<table class="mx"><thead><tr><th>'+T('引擎','Engine')+'</th>'
    + GATES.map(g => '<th>'+esc(g[1])+'</th>').join('') + '</tr></thead><tbody>'
    + '<tr class="mk"><td colspan="6">'+T('中国 · 10 个','China · 10')+'</td></tr>' + cn
    + '<tr class="mk"><td colspan="6">'+T('海外 · 8 个','Global · 8')+'</td></tr>' + gl
    + '</tbody></table>'
    + '<div class="legend">'+T(filled+' / '+total+' 个格子有实测数据。「—」是没测，不是 0 —— 把没测过的画成零，等于替你的品牌认了一个从没发生的失败。',
        filled+' / '+total+' cells measured. A dash means not measured, not zero — rendering an unmeasured gate as a zero would blame your brand for a failure nobody observed.')+'</div>';
}

/* ── per-job evidence views ────────────────────────────────────────────── */
const VIEWS = {
  'ai-seo': () => {
    const pr = P.probe;
    return '<div class="stagehead"><h3>'+T('品牌实体漏斗 × 引擎','Brand entity funnel × engines')+'</h3>'
      + '<span class="sub">'+T('AI 引用你之前要过的五道闸','five gates before an AI will cite you')+'</span></div>'
      + matrix()
      + (pr && pr.verdict ? '<div class="sect">'+T('引擎原话','What the engine said')+'</div>'
          + '<p class="mini">'+esc(pr.question||'')+' · '+esc(pr.engine||'')+'</p>'
          + '<div class="quote">'+esc(String(pr.answer||'').slice(0,1100))+'</div>' : '')
      + '<div class="note">'+T('要填满这张表需要托管多引擎采样，还没做。我们不把没测过的格子模糊起来卖你 —— 空格子本身就是报价单。',
          'Filling this table needs hosted multi-engine sampling, which is not built. We do not blur cells we never measured — the empty ones are the quote.')+'</div>';
  },
  'seo-audit': () => {
    const a = P.audit || {};
    const DIM = ZH
      ? [['crawlability','爬得到'],['length','讲够了'],['structure','结构'],['blocks','抽取块'],
         ['authority','出处'],['relevance','答对题']]
      : [['crawlability','crawl'],['length','length'],['structure','structure'],['blocks','blocks'],
         ['authority','authority'],['relevance','relevance']];
    const pages = a.pages || [];
    const cls = v => v >= 80 ? 'hi' : v >= 50 ? 'mid' : v > 0 ? 'lo' : 'no';
    const grid = '<table class="hm"><thead><tr><th>'+T('页面','Page')+'</th>'
      + DIM.map(d => '<th>'+esc(d[1])+'</th>').join('')+'<th>'+T('总分','Score')+'</th></tr></thead><tbody>'
      + pages.map(pg => {
          const by = {};
          for (const d of pg.dimensions || []) by[d.key] = d.max ? Math.round(d.score/d.max*100) : 0;
          return '<tr><td class="u" title="'+esc(pg.url)+'">'+esc(String(pg.url).replace(/^https?:[/][/][^/]+/,'') || '/')+'</td>'
            + DIM.map(d => { const v = by[d[0]] ?? 0;
                return '<td><span class="c '+cls(v)+'">'+v+'</span></td>'; }).join('')
            + '<td><span class="c '+cls(pg.score||0)+'">'+(pg.score||0)+'</span></td></tr>';
        }).join('') + '</tbody></table>';
    return '<div class="stagehead"><h3>'+T('页面 × 六维','Pages × six dimensions')+'</h3>'
      + '<span class="sub">'+T('上次体检 '+String(a.generatedAt||'').slice(0,10), 'last audited '+String(a.generatedAt||'').slice(0,10))+'</span></div>'
      + '<div class="rings">'+ring(Math.round(a.avgScore||0), T('全站 AI 就绪度','site AI readiness'))+'</div>'
      + grid
      + '<div class="legend">'+T('一个全站平均分不会告诉你去改哪一页。这张表会。',
          'A site-wide average never tells you which page to open. This does.')+'</div>';
  },
  'schema': () => {
    // Free data we had all along and were not drawing: which extractable block
    // each page is missing. This is the most directly actionable grid we own.
    const BL = ZH
      ? [['definition','定义'],['comparison','对比'],['statistics','数字'],['steps','步骤'],['faq','FAQ']]
      : [['definition','definition'],['comparison','comparison'],['statistics','statistics'],
         ['steps','steps'],['faq','faq']];
    const pages = (P.audit && P.audit.pages) || [];
    const s = (P.audit && P.audit.site) || {};
    const grid = '<table class="hm"><thead><tr><th>'+T('页面','Page')+'</th>'
      + BL.map(b => '<th>'+esc(b[1])+'</th>').join('')+'</tr></thead><tbody>'
      + pages.map(pg => {
          const b = pg.blocks || {};
          return '<tr><td class="u" title="'+esc(pg.url)+'">'+esc(String(pg.url).replace(/^https?:[/][/][^/]+/,'') || '/')+'</td>'
            + BL.map(x => '<td><span class="c '+(b[x[0]]?'hi':'no')+'">'+(b[x[0]]?'✓':'—')+'</span></td>').join('')
            + '</tr>';
        }).join('') + '</tbody></table>';
    const sig = [
      ['llms.txt', s.llmsTxtFound, T('有','present'), T('没有','absent')],
      ['robots.txt', s.robotsFound, T('有','present'), T('没有','absent')],
      ['sitemap.xml', s.sitemapFound, T('有','present'), T('没有','absent')],
    ];
    return '<div class="stagehead"><h3>'+T('抽取块地图','Extractable block map')+'</h3>'
      + '<span class="sub">'+T('AI 直接摘走的是这五种块','these five blocks are what an AI lifts')+'</span></div>'
      + grid
      + '<div class="legend">'+T('一整列都是「—」，说明全站没有这种块 —— 那正是 AI 回答这类问题时不会引用你的原因。',
          'A whole column of dashes means the site has none of that block — which is why an AI answering that kind of question does not quote you.')+'</div>'
      + '<div class="sect">'+T('机器可读入口','Machine-readable entry points')+'</div>'
      + sig.map(x => '<div class="sig"><span>'+esc(x[0])+'</span><span class="'+(x[1]?'':'w')+'">'
          +(x[1]?'':'⚠ ')+esc(x[1]?x[2]:x[3])+'</span></div>').join('');
  },
  'technical-seo-checker': () => {
    const s = (P.audit && P.audit.site) || {};
    const blocked = s.blockedSearchCrawlers || [];
    const pages = ((P.audit && P.audit.pages) || []).filter(p => (p.blockers||[]).length);
    // Two different questions that look like one: are they allowed in, and did
    // they actually come. We can answer the first today; the second needs logs.
    return '<div class="stagehead"><h3>'+T('爬虫准入 vs 真到访','Crawler access vs actual visits')+'</h3></div>'
      + '<table class="hm"><thead><tr><th>'+T('爬虫','Crawler')+'</th><th>'+T('允许进','allowed')+'</th>'
      + '<th>'+T('真来过','visited')+'</th></tr></thead><tbody>'
      + ['GPTBot','ClaudeBot','PerplexityBot','Google-Extended','Bytespider','Baiduspider'].map(c => {
          const ok = blocked.indexOf(c) < 0;
          return '<tr><td class="u">'+esc(c)+'</td>'
            + '<td><span class="c '+(ok?'hi':'lo')+'">'+(ok?'✓':'✗')+'</span></td>'
            + '<td><span class="c no" title="'+T('需要服务器日志','needs server logs')+'">—</span></td></tr>';
        }).join('') + '</tbody></table>'
      + '<div class="legend">'+T('右边那一列要靠你的服务器日志 —— 命令行里的 botlog 能算，网页版还没接。允许进不等于真来过，这两件事经常不一样。',
          'The right column needs your server logs — botlog computes it in the CLI, not wired to the web yet. Allowed in is not the same as actually came, and they often differ.')+'</div>'
      + (pages.length ? '<div class="sect">'+T('爬虫读不到的页面','Pages crawlers cannot read')+'</div>'
          + pages.map(p => '<div class="iss"><span class="sev crit">'+T('阻断','BLOCK')+'</span><span>'
              + esc(p.url)+'<br><span class="mini">'+esc((p.blockers||[]).join(' · '))+'</span></span></div>').join('') : '');
  },
  'competitor-analysis': () => {
    const c = (P.dossier && P.dossier.competitorCandidates) || [];
    return '<div class="stagehead"><h3>'+T('竞争集','Competitive set')+'</h3></div>'
      + (c.length ? c.map(x => '<div class="sig"><span>'+esc(x.name)+(x.why?' <span class="mini">'+esc(x.why)+'</span>':'')
          + '</span><span class="mini">'+esc(x.by === 'owner' ? T('你加的','yours') : T('猜的','guessed'))+'</span></div>').join('')
        : '<div class="empty">'+T('还没找到。','None found yet.')+'</div>')
      + '<div class="note">'+T('这些是从你自己网站的文字里猜的。真正的竞争集是「买家问 AI 时，AI 报了谁的名字」—— 那要靠采样，还没做。声量份额同理。',
          'Guessed from your own copy. The real competitive set is who an AI names when a buyer asks — that needs sampling, which is not built. Share of voice likewise.')+'</div>';
  },
  'product-marketing': () => {
    const f = ((P.dossier && P.dossier.facts && P.dossier.facts.facts) || []);
    // The fabrication gate, shown as a gate: only confirmed non-E facts may
    // enter anything we generate. Seeing the split is what makes the rule real.
    const usable = f.filter(x => x.status !== 'unconfirmed' && x.grade !== 'E');
    const held = f.filter(x => !(x.status !== 'unconfirmed' && x.grade !== 'E'));
    const list = xs => xs.map(x => '<div class="sig"><span><span class="pr pr-'
      + (x.grade === 'A' ? 'P0' : x.grade === 'E' ? 'P2' : 'P1')+'">'+esc(x.grade)+'</span> '
      + esc(x.claim)+'</span><span class="mini">'+esc(x.by === 'owner' ? T('你改的','yours') : T('站上取的','from site'))+'</span></div>').join('');
    return '<div class="stagehead"><h3>'+T('事实库与编造门禁','Fact base and fabrication gate')+'</h3>'
      + '<span class="sub">'+T(usable.length+' 条可用于生成 · '+held.length+' 条被拦',
          usable.length+' usable · '+held.length+' held')+'</span></div>'
      + '<div class="sect">'+T('可以进生成内容','Cleared for generated content')+'</div>'
      + (usable.length ? list(usable) : '<div class="empty">'+T('一条都没有。','None.')+'</div>')
      + '<div class="sect">'+T('被门禁拦下','Held by the gate')+'</div>'
      + (held.length ? list(held) : '<div class="empty">'+T('没有被拦的。','Nothing held.')+'</div>')
      + '<div class="legend">'+T('只有 confirmed 且非 E 级的事实允许进入我们替你生成的任何内容。这条规则是硬的 —— 编不出来的东西，就不编。',
          'Only confirmed, non-E facts may enter anything generated for you. The rule is hard: what cannot be sourced does not get written.')+'</div>';
  },
  'content-strategy': () => {
    const pieces = ((P.docs && P.docs.strategy && P.docs.strategy.pieces) || []);
    return '<div class="stagehead"><h3>'+T('该写什么','What to publish')+'</h3>'
      + '<span class="sub">'+T('每篇都对着一个买家真会问的问题','each against a question buyers actually ask')+'</span></div>'
      + (pieces.length ? pieces.map(p => '<div class="wi"><div class="h"><span class="t">'+esc(p.title)+'</span>'
          + '<span class="stn">'+esc(p.format||'')+'</span></div>'
          + '<p class="acc"><b>'+T('对着这个问题：','Answers: ')+'</b>'+esc(p.question||'')+'</p>'
          + (p.why ? '<p class="acc">'+esc(p.why)+'</p>' : '')+'</div>').join('')
        : '<div class="empty">'+T('还没有选题。','No topics yet.')+'</div>')
      + '<div class="note">'+T('选题有了，稿子没有。生成加编造门禁在命令行里跑得通，网页还没接。',
          'Topics yes, drafts no. Generation with the fabrication gate works in the CLI and is not wired to the web.')+'</div>';
  },
  'marketing-loops': () => {
    const l = P.loop || {};
    const c = P.feedCounts || {};
    const done = (P.feedDone || []);
    return '<div class="stagehead"><h3>'+T('循环','The loop')+'</h3></div>'
      + '<div class="cards">'
      + '<div class="card"><span class="k"><i></i>'+T('上次检查','last check')+'</span><span class="v">'
        + (l.lastCheck ? new Date(l.lastCheck).toISOString().slice(5,10) : '—')+'</span>'
        + '<span class="s">'+T('每天 03:00 UTC','daily 03:00 UTC')+'</span></div>'
      + '<div class="card"><span class="k"><i></i>'+T('连续没事可做','quiet runs')+'</span><span class="v">'
        + (l.quietRuns || 0)+'</span><span class="s">'+T('这是好事','this is the good case')+'</span></div>'
      + '</div>'
      + '<div class="legend">'+T('铁律：大多数运行应该是「查过了，没事可做」。天天有话说的循环会在一周内把人训练成无视它。',
          'The rule: most runs should end with "checked, nothing to do". A loop that speaks daily trains people to ignore it within a week.')+'</div>'
      + (done.length ? '<div class="sect">'+T('已经修好的 '+done.length+' 件','fixed: '+done.length)+'</div>'
          + done.map(x => '<div class="sig"><span>'+esc(x.title)+'</span><span class="mini">'
            + esc(x.doneBy === 'owner' ? T('你标的','you marked it') : T('重爬确认','confirmed by crawl'))
            + (x.resolvedAt ? ' · '+String(x.resolvedAt).slice(0,10) : '')+'</span></div>').join('') : '');
  },
};

function jobs(){
  const c = P.feedCounts || {};
  const rows = ROSTER.map(a => {
    const out = a.read(P);
    const n = itemsFor(P, a.id, a.id === 'seo-audit').length;
    return '<div class="job'+(SEL===a.id?' sel':'')+(out?' has':'')+'" data-job="'+esc(a.id)+'">'
      + '<span class="ico" style="background:'+esc(a.c)+'">'+esc(a.ic)+'</span>'
      + '<span class="nm"><b>'+esc(ZH?a.zh:a.en)+'</b><span>'+esc(out || T('待命','standing by'))+'</span></span>'
      + (n ? '<span class="ct">'+n+'</span>' : '')+'</div>';
  }).join('');
  const bench = Object.keys(BENCH).map(k => {
    const g = BENCH[k];
    return '<details class="grp"><summary>'+esc(ZH?g.zh:g.en)+' · '+g.ids.length+'</summary>'
      + g.ids.map(id => '<div class="job" data-job="bench:'+esc(id)+'">'
          + '<span class="ico" style="background:#B5AE9C">'+esc(id.slice(0,3).toUpperCase())+'</span>'
          + '<span class="nm"><b>'+esc(id)+'</b><span>'+T('方法论就位','playbook ready')+'</span></span></div>').join('')
      + '</details>';
  }).join('');
  document.getElementById('cJobs').innerHTML = '<h2>'+T('岗位','Jobs')
    + '<span class="mini">'+(c.open||0)+T(' 件待修',' open')+'</span></h2>'
    + rows
    + '<div class="sect">'+T('在册待命 · 缺数据接入','On the bench · data not wired')+'</div>'
    + bench;
  document.querySelectorAll('[data-job]').forEach(e => e.onclick = () => { SEL = e.dataset.job; jobs(); stage(); });
}

function stage(){
  const el = document.getElementById('cStage');
  if (SEL.indexOf('bench:') === 0){
    const id = SEL.slice(6);
    el.innerHTML = '<h2>'+esc(id)+'</h2>'
      + '<div class="note">'+T('这个岗位的方法论已经在系统里，可以读；要它产出还需要接上对应的数据源。',
          'The playbook for this job is in the system and readable. Producing output needs its data source wired.')+'</div>'
      + '<button class="pbtn" data-pb="'+esc(id)+'">'+T('读方法论','read the playbook')+'</button><div class="pbody"></div>';
    document.querySelectorAll('.pbtn').forEach(b => b.onclick = () => openPlaybook(b));
    return;
  }
  const a = ROSTER.filter(x => x.id === SEL)[0] || ROSTER[0];
  const items = itemsFor(P, a.id, a.id === 'seo-audit');
  const view = VIEWS[a.id] ? VIEWS[a.id]() : '';
  el.innerHTML = '<h2>'+esc(ZH?a.zh:a.en)
    + '<span class="mini">'+esc(a.read(P) || T('待命','standing by'))+'</span></h2>'
    + view
    + (a.need ? '<div class="need">'+esc(a.need)+'</div>' : '')
    + (items.length ? '<div class="sect">'+T('这个岗位名下的活 · '+items.length+' 件',
        'queue for this job · '+items.length)+'</div>' + items.map(workItem).join('') : '')
    + '<button class="pbtn" data-pb="'+esc(a.id)+'">'+T('读方法论','read the playbook')+'</button><div class="pbody"></div>';
  document.querySelectorAll('.pbtn').forEach(b => b.onclick = () => openPlaybook(b));
  document.querySelectorAll('.act[data-k]').forEach(b => b.onclick = () => act(b.dataset.k, b.dataset.a, b));
}


function workItem(t){
  const badge = t.state === 'regressed'
    ? '<span class="rg">'+(t.neverVerified ? T('还在','still there') : T('又坏了','came back'))+'</span>'
    : t.state === 'new' ? '<span class="tag new">'+T('新','New')+'</span>' : '';
  return '<div class="wi"><div class="h">'
    + '<span class="pr pr-'+esc(t.priority)+'">'+esc(t.priority)+'</span>'
    + badge
    + '<span class="t">'+esc(t.title)+'</span>'
    + '<span class="stn">'+esc(STN[t.station] || t.station || '')+'</span></div>'
    + (t.rationale ? '<p class="acc">'+esc(t.rationale)+'</p>' : '')
    + '<p class="acc"><b>'+T('修到这样算好：','Done when: ')+'</b>'+esc((t.acceptance && t.acceptance.desc)||'—')+'</p>'
    + (t.fixHint ? '<pre class="hint">'+esc(t.fixHint)+'</pre>' : '')
    + '<div class="acts">'
    + '<button class="act go" data-k="'+esc(t.key)+'" data-a="done">'+T('我修好了','I fixed this')+'</button>'
    + '<button class="act" data-k="'+esc(t.key)+'" data-a="snooze">'+T('先放放','not now')+'</button>'
    + '<span class="mini">'+T('下次重爬会核对','the next crawl checks')+'</span></div></div>';
}

async function act(key, action, btn){
  btn.disabled = true;
  try {
    const r = await fetch('/api/feed', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id: ID, key: key, action: action, days: 7})});
    if (!r.ok) throw new Error('failed');
    P = await (await fetch('/api/project?id='+ID)).json();
    render();
  } catch { btn.disabled = false; btn.textContent = T('没存上，再点一次','did not save — try again'); }
}

async function openPlaybook(btn){
  const body = btn.nextElementSibling;
  if (body.dataset.open === '1'){ body.innerHTML=''; body.dataset.open='0'; btn.textContent = T('读方法论','read the playbook'); return; }
  btn.disabled = true; btn.textContent = T('取…','fetching…');
  try {
    const j = await (await fetch('/api/playbook?lang='+(ZH?'zh':'en')+'&skill='+encodeURIComponent(btn.dataset.pb))).json();
    const secs = (j.sections || []).slice(0, 3);
    body.innerHTML = secs.length
      ? secs.map(s => '<h4 style="margin:9px 0 3px;font:500 14px var(--serif)">'+esc(s.h)+'</h4>'+md(s.b)).join('')
        + '<div class="mini" style="margin-top:9px">'+esc(j.attribution||'')+'</div>'
      : '<p class="mini">'+T('这一节取不到。','Could not load.')+'</p>';
    body.dataset.open='1'; btn.textContent = T('收起','collapse');
  } catch {
    body.innerHTML = '<p class="mini">'+T('取不到，稍后再试。','Could not load. Try again.')+'</p>';
    btn.textContent = T('读方法论','read the playbook');
  }
  btn.disabled = false;
}

/* ── column 4 · ask ─────────────────────────────────────────────────────── */
function cmo(){
  const c = P.feedCounts || {};
  const daily = P.loop && P.loop.lastCheck;
  // The deal, first person, with the half we cannot do yet in the same breath.
  const hello = T(
    '<p>我读了你的网站，建好了档案，问过一个引擎，列出了要修的东西。</p>'
    + '<ul><li>每天重爬一次 —— ' + (daily ? '已经在跑' : '还没开始') + '</li>'
    + '<li>你说修好了，我下次重爬会核对</li>'
    + '<li>' + (c.open||0) + ' 件待修，就在中间那栏，点开直接动手</li></ul>'
    + '<p>我现在<b>做不到</b>的：替你写稿、替你发帖、跑 18 个引擎采样。这些还没接。</p>',
    '<p>I read your site, built the dossier, asked one engine, and listed what to fix.</p>'
    + '<ul><li>Re-crawled daily — ' + (daily ? 'already running' : 'not started yet') + '</li>'
    + '<li>Say you fixed something and the next crawl checks it</li>'
    + '<li>' + (c.open||0) + ' open items, in the middle column, actionable there</li></ul>'
    + '<p>What I <b>cannot</b> do yet: draft for you, post anywhere, or sample 18 engines. Not wired.</p>');
  document.getElementById('cCmo').innerHTML = '<h2>'+T('问它','Ask')+'</h2>'
    + '<div class="ask"><input id="q" placeholder="'+T('问这个项目的任何事','Ask anything about this project')+'"><button id="qs">'+T('问','Ask')+'</button></div>'
    + '<div id="qa"><div class="msg">'+hello+'</div></div>';
  const go = () => ask(document.getElementById('q').value);
  document.getElementById('qs').onclick = go;
  document.getElementById('q').onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function ask(q){
  q = String(q||'').trim(); if (!q) return;
  const el = document.getElementById('qa');
  el.innerHTML = '<div class="msg">'+T('想…','thinking…')+'</div>';
  try {
    const r = await fetch('/api/ask', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id: ID, q: q, lang: ZH ? 'zh' : 'en'})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'failed');
    el.innerHTML = '<div class="msg">'+md(j.answer)+'<div class="src">'+esc(j.grounding||'')+'</div></div>';
  } catch {
    el.innerHTML = '<div class="msg">'+T('这次没答上来。','Could not answer this time.')+'</div>';
  }
}

/* ── documents ──────────────────────────────────────────────────────────── */
function showDoc(k){
  const d = P.dossier || {};
  const b = d.brand || {};
  const M = {
    product: [T('产品档案','Product information'),
      '## ' + (b.name || '') + '\\n\\n' + (b.description || T('（空）','(empty)'))
      + (b.industry ? '\\n\\n**' + T('行业','Industry') + '**: ' + b.industry : '')
      + ((b.aliases||[]).length ? '\\n\\n**' + T('别名','Aliases') + '**: ' + b.aliases.join(', ') : '')],
    facts: [T('品牌事实库','Brand facts'),
      ((d.facts && d.facts.facts)||[]).map(f => '- [' + f.grade + '] ' + f.claim
        + (f.by === 'owner' ? ' _(' + T('你改的','yours') + ')_' : '')).join('\\n') || T('（空）','(empty)')],
    competitors: [T('竞品分析','Competitor analysis'),
      (d.competitorCandidates||[]).map(c => '- **' + c.name + '**' + (c.why ? ' — ' + c.why : '')).join('\\n') || T('（空）','(empty)')],
    questions: [T('买家问题库','Buyer questions'),
      (d.questions||[]).map(q => '- [' + q.market + '] ' + q.text).join('\\n') || T('（空）','(empty)')],
    voice: [T('品牌语气','Brand voice guide'),
      (P.voice && P.voice.filled)
        || ((((P.docs && P.docs.voice && P.docs.voice.evidence)) || []).map(e => '> ' + e.text).join('\\n\\n'))
        || T('（空）','(empty)')],
    strategy: [T('内容策略','Content strategy'),
      (((P.docs && P.docs.strategy && P.docs.strategy.pieces)) || []).map(p =>
        '## ' + p.title + '\\n\\n' + (p.why||'') + '\\n\\n**' + T('对着这个问题','Answers') + '**: ' + (p.question||'')).join('\\n\\n')
      || T('（空）','(empty)')],
  };
  const pair = M[k] || ['', ''];
  SHEET = { title: pair[0], text: pair[1] };
  document.getElementById('sht').textContent = pair[0];
  document.getElementById('shb').innerHTML = md(pair[1])
    + '<p class="mini" style="margin-top:20px">'+T('要改这份文档，去诊断页 —— 编辑器在那边。',
        'To edit this document, use the diagnosis page — the editor lives there.')+'</p>';
  document.getElementById('sheet').classList.add('on');
  document.getElementById('over').classList.add('on');
}

/* Enough Markdown for what these documents and playbooks contain. Escaped
   first: this is third-party text and it is never trusted as HTML. Every
   pattern is built from character classes, which need no escaping at any of
   the layers between here and the browser — a lesson that cost three deploys. */
function md(src){
  const lines = String(src||'').split('\\n');
  const out = [];
  let ul = false, tbl = false, fence = false, buf = [];
  const closeUl = () => { if (ul){ out.push('</ul>'); ul = false; } };
  const closeTbl = () => { if (tbl){ out.push('</tbody></table>'); tbl = false; } };
  const inline = s => esc(s)
    .replace(/[*][*]([^*]+)[*][*]/g, '<b>$1</b>')
    .replace(/[_]([^_]+)[_]/g, '<i>$1</i>')
    .replace(/[\\u0060]([^\\u0060]+)[\\u0060]/g, '<code>$1</code>');
  for (const raw of lines){
    const line = raw.replace(/\\s+$/, '');
    if (/^[\\u0060][\\u0060][\\u0060]/.test(line)){
      if (fence){ out.push('<pre>'+esc(buf.join('\\n'))+'</pre>'); buf = []; fence = false; }
      else { closeUl(); closeTbl(); fence = true; }
      continue;
    }
    if (fence){ buf.push(raw); continue; }
    const h = /^(#{2,4})[ ]+(.+)$/.exec(line);
    if (h){ closeUl(); closeTbl(); out.push('<h4>'+inline(h[2])+'</h4>'); continue; }
    if (/^[|]/.test(line)){
      if (/^[|][ -:|]+$/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (!tbl){ out.push('<table><tbody>'); tbl = true; }
      out.push('<tr>'+cells.map(c => '<td>'+inline(c)+'</td>').join('')+'</tr>');
      continue;
    }
    closeTbl();
    const q = /^[>][ ]?(.*)$/.exec(line);
    if (q){ closeUl(); out.push('<blockquote>'+inline(q[1])+'</blockquote>'); continue; }
    const li = /^[ ]{0,3}[-*][ ]+(.+)$/.exec(line);
    if (li){ if (!ul){ out.push('<ul>'); ul = true; } out.push('<li>'+inline(li[1])+'</li>'); continue; }
    closeUl();
    if (!line.trim()) continue;
    out.push('<p>'+inline(line)+'</p>');
  }
  closeUl(); closeTbl();
  if (fence && buf.length) out.push('<pre>'+esc(buf.join('\\n'))+'</pre>');
  return out.join('');
}

boot();
</script>
</body></html>`;
}
