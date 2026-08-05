/**
 * GET /c/<id> — the console.
 *
 * The diagnostic panel at /p/<id> answers "what is wrong with this site". That
 * is a report, and a report is something you read once. This is the other
 * thing: a place that looks like a team is working for you, because one is.
 *
 * Four columns, the shape a marketing console has settled into:
 *
 *   context   what we know about you — the documents every agent reads first
 *   analytics what we measured, graded, with the failures sorted by severity
 *   agents    a roster, each with today's output and what it wants from you
 *   cmo       one place to ask, plus the running log of what happened
 *
 * The roster is the point. Sixty-nine playbooks are bundled here, and every one
 * of them becomes a named job with a stated scope. Some have data behind them
 * today and produce something; the rest say exactly what they would need to
 * start. What they never do is imply an output that does not exist — a console
 * full of agents pretending to work is worse than an empty one, because the
 * first time a user checks, everything else we said stops counting too.
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
--red:#C0492F;--green:#4E8455;--amber:#B08417;--blue:#4A6A8A;
--serif:"Newsreader","Songti SC",Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.65 var(--serif);overflow:hidden}
.top{display:flex;align-items:center;gap:14px;padding:0 16px;height:46px;background:var(--chrome);
border-bottom:1px solid var(--line);font:12px var(--mono);flex:none}
.top b{font-family:var(--serif);font-size:16px;color:var(--hi);font-weight:500}
.top .sep{color:var(--dim)}
.top .sp{flex:1}
.lamp{display:inline-flex;align-items:center;gap:6px;color:var(--dim)}
.lamp i{width:7px;height:7px;border-radius:50%;background:var(--green);display:block}
.lamp.warn i{background:var(--amber)}.lamp.bad i{background:var(--red);box-shadow:0 0 7px var(--red)}
.top a{color:var(--dim);text-decoration:none}.top a:hover{color:var(--hi)}
.digest{display:flex;gap:0;background:var(--chrome);border-bottom:1px solid var(--line);flex:none;overflow-x:auto}
.digest .d{padding:9px 16px;border-right:1px solid var(--line);font:11.5px var(--mono);white-space:nowrap}
.digest .d b{color:var(--hi);font-family:var(--mono);font-weight:600}
.digest .d.act{cursor:pointer}.digest .d.act:hover{background:#221E18}
.digest .d em{color:var(--dim);font-style:normal}
.grid{display:grid;grid-template-columns:238px 340px minmax(0,1fr) 330px;gap:1px;background:var(--line);
height:calc(100vh - 46px - 35px);overflow:hidden}
@media(max-width:1280px){.grid{grid-template-columns:220px 300px minmax(0,1fr)}#cCmo{display:none}}
@media(max-width:980px){.grid{grid-template-columns:1fr;height:auto;overflow:auto}body{overflow:auto}}
.col{background:var(--paper);color:var(--ink);overflow-y:auto;padding:14px 15px;min-width:0}
.col.dark{background:var(--chrome);color:var(--txt)}
h2{font:500 10.5px var(--mono);letter-spacing:.15em;text-transform:uppercase;color:var(--faint);
margin:0 0 11px;padding-bottom:7px;border-bottom:1px solid var(--rule);display:flex;
justify-content:space-between;align-items:center;gap:8px}
.col.dark h2{color:var(--dim);border-bottom-color:var(--line)}
h3{font:500 16px var(--serif);margin:0 0 2px}
.mini{font:11px var(--mono);color:var(--faint)}
.col.dark .mini{color:var(--dim)}
.doc{display:flex;justify-content:space-between;gap:6px;padding:6px 0;border-bottom:1px dotted var(--rule);
font-size:13px;cursor:pointer}
.doc:hover{color:var(--red)}.doc:last-child{border-bottom:none}
.tag{font:600 9px var(--mono);padding:1px 5px;background:#E7EEE2;color:var(--green);white-space:nowrap}
.tag.warn{background:#F5EFDE;color:var(--amber)}
.tag.no{background:#EFEBE0;color:var(--faint)}
.chip{display:inline-block;font:11.5px var(--mono);background:var(--panel);border:1px solid var(--rule);
border-radius:20px;padding:1px 8px;margin:0 4px 5px 0}
.sect{font:500 9.5px var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--faint);margin:15px 0 6px}
.score{display:flex;gap:11px;align-items:baseline;margin-bottom:10px}
.score b{font:500 30px var(--mono)}
.dim{display:grid;grid-template-columns:minmax(90px,1fr) 66px 46px;gap:7px;align-items:center;
font:11.5px var(--mono);padding:3px 0}
.dim .bar{height:5px;background:#EFEBE0;position:relative}
.dim .bar i{position:absolute;inset:0 auto 0 0;background:var(--ink)}
.dim.low .bar i{background:var(--red)}
.dim .v{text-align:right}
.tabs{display:flex;gap:0;border-bottom:1px solid var(--rule);margin-bottom:10px}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:5px 9px;
font:11.5px var(--mono);color:var(--faint);cursor:pointer}
.tabs button.on{color:var(--ink);border-bottom-color:var(--red)}
.iss{display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px dotted var(--rule);font-size:13px}
.iss:last-child{border-bottom:none}
.sev{font:600 9px var(--mono);padding:1px 5px;flex:none}
.sev.crit{background:var(--red);color:#fff}
.sev.warn{background:#F5EFDE;color:var(--amber)}
.ag{background:var(--panel);border:1px solid var(--rule);margin-bottom:8px}
.ag.on{border-left:3px solid var(--green)}
.ag.idle{border-left:3px solid var(--rule)}
.ag summary{padding:9px 11px;cursor:pointer;display:flex;gap:9px;align-items:baseline;font-size:14px;list-style:none}
.ag summary::-webkit-details-marker{display:none}
.ag summary .who{font:500 14.5px var(--serif);flex:none}
.ag summary .out{flex:1;font:11.5px var(--mono);color:var(--ink2)}
.ag summary .out.none{color:var(--faint)}
.ag .body{padding:0 11px 11px;font-size:13px;color:var(--ink2)}
.ag .need{margin:6px 0 0;padding:8px 10px;background:#F5EFDE;font:11.5px/1.7 var(--mono);color:var(--amber)}
.ag .pbody{margin-top:9px;font:13px/1.7 var(--serif)}
.ag .pbody:empty{display:none}
.pbtn{margin-top:7px;background:none;border:1px solid var(--green);color:var(--green);
padding:4px 10px;font:11px var(--mono);cursor:pointer}
.pbtn:hover{background:var(--green);color:#fff}
.grp{margin:14px 0 5px}
.grp summary{font:500 10.5px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint);
cursor:pointer;padding:5px 0;border-top:1px solid var(--rule)}
.term{font:11.5px/1.75 var(--mono);color:var(--txt)}
.term div{padding:2px 0;border-bottom:1px solid #201C17;white-space:pre-wrap}
.term .t{color:var(--dim)}
.ask{display:flex;gap:6px;margin-bottom:10px}
.ask input{flex:1;background:#0E0C09;border:1px solid var(--line);color:var(--hi);
padding:8px 10px;font:12px var(--mono)}
.ask button{background:var(--hi);border:0;color:var(--bg);padding:8px 12px;font:11.5px var(--mono);cursor:pointer}
.ans{background:#0E0C09;border:1px solid var(--line);padding:11px 12px;margin-bottom:12px;
font:13px/1.7 var(--serif);color:var(--txt)}
.ans .src{margin-top:8px;font:10.5px var(--mono);color:var(--dim)}
.empty{color:var(--faint);font:12px var(--mono);padding:10px 0}
.bar2{height:5px;background:#EFEBE0;position:relative;margin-top:4px}
.bar2 i{position:absolute;inset:0 auto 0 0;background:var(--green)}
a.plain{color:inherit;text-decoration:none}
dialog{border:1px solid var(--rule);background:var(--panel);color:var(--ink);max-width:760px;width:92%;padding:0}
dialog::backdrop{background:rgba(18,16,12,.6)}
dialog .dh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;
border-bottom:1px solid var(--rule);font:12px var(--mono)}
dialog .dc{padding:16px;max-height:66vh;overflow:auto;font:14px/1.75 var(--serif)}
dialog button{background:none;border:1px solid var(--rule);padding:4px 10px;font:11px var(--mono);cursor:pointer}
</style></head><body>
<div class="top">
  <b id="brand">…</b><span class="sep">|</span><span>FasterGEO Console</span>
  <span class="mini" id="host"></span>
  <span class="sp"></span>
  <span class="lamp" id="lamp"><i></i><span id="lampT">…</span></span>
  <a href="/p/${esc(id)}${zh ? '?lang=zh' : ''}">${zh ? '诊断页' : 'Diagnosis'}</a>
  <a href="/my${zh ? '?lang=zh' : ''}">${zh ? '我的站点' : 'My sites'}</a>
</div>
<div class="digest" id="digest"></div>
<div class="grid">
  <div class="col" id="cCtx"></div>
  <div class="col" id="cAna"></div>
  <div class="col" id="cAgents"></div>
  <div class="col dark" id="cCmo"></div>
</div>
<dialog id="dlg"><div class="dh"><span id="dt"></span><button id="dx">×</button></div><div class="dc" id="dc"></div></dialog>
<script>
const ID = ${JSON.stringify(id)};
const ZH = ${JSON.stringify(zh)};
const T = (a, b) => ZH ? a : b;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let P = null;

/* ── the roster ───────────────────────────────────────────────────────────
   Every entry names a real playbook in the bundle. The read() hook pulls whatever the
   project actually has for that job; returning null means the job is staffed
   and idle, not that it secretly ran. Nothing here fabricates an output. */
const ROSTER = [
  { id:'seo-audit', zh:'SEO 巡检官', en:'SEO inspector', grp:'find',
    read: p => { const n = issues(p).length; return n ? T(n+' 个页面问题待修', n+' page issues to fix') : null; },
    need: T('这一栏是实测的，不需要你补东西。','Measured. Nothing needed from you.') },
  { id:'ai-seo', zh:'GEO 可见度官', en:'GEO visibility', grp:'find',
    read: p => { const v = p.probe; if(!v || !v.verdict) return null;
      const m = {knows:T('AI 认识你','AI knows you'),confused:T('AI 把你认错了','AI has you confused'),
                 unknown:T('AI 不知道你','AI does not know you')};
      return (m[v.verdict] || T('问过 1 个引擎','asked 1 engine')) + T('（1 个引擎）',' (1 engine)'); },
    need: T('现在只问了 1 个引擎。中外 18 个引擎的托管采样还没做 —— 那是这一栏真正的值钱处。',
            'Only one engine is asked today. Hosted sampling across 18 engines is not built — that is where this job gets valuable.') },
  { id:'technical-seo-checker', zh:'技术体检官', en:'Technical', grp:'find',
    read: p => { const b = (p.audit && p.audit.pages || []).filter(x => (x.blockers||[]).length).length;
      return b ? T(b+' 个页面 AI 爬虫读不到', b+' pages invisible to AI crawlers') : null; },
    need: T('实测的。','Measured.') },
  { id:'schema', zh:'结构化数据官', en:'Schema', grp:'find',
    read: p => { const s = p.audit && p.audit.site; if(!s) return null;
      return s.llmsTxtFound ? null : T('llms.txt 没有','no llms.txt'); },
    need: T('实测的。','Measured.') },
  { id:'competitor-analysis', zh:'竞品雷达', en:'Competitor radar', grp:'know',
    read: p => { const c = (p.dossier && p.dossier.competitorCandidates) || []; return c.length ? T(c.length+' 个候选竞品待你核', c.length+' candidates for you to confirm') : null; },
    need: T('这些是从你网站文字里猜的。真正的竞争集要靠采样 AI 的回答 —— 缺 18 引擎采样。',
            'These are guessed from your own copy. The real competitive set comes from sampling AI answers — needs the 18-engine sampling.') },
  { id:'product-marketing', zh:'定位官', en:'Positioning', grp:'know',
    read: p => { const f = p.dossier && p.dossier.facts && p.dossier.facts.facts; return f && f.length ? T(f.length+' 条品牌事实已立', f.length+' brand facts on file') : null; },
    need: T('事实库是所有生成的地基。改一条，下游全跟着变。','The fact base is the floor everything else is generated from. Change one and everything downstream follows.') },
  { id:'content-strategy', zh:'内容策略官', en:'Content strategy', grp:'make',
    read: p => { const s = p.docs && p.docs.strategy; return s && s.pieces && s.pieces.length ? T(s.pieces.length+' 篇选题，每篇对着一个真问题', s.pieces.length+' pieces, each against a real question') : null; },
    need: T('选题有了，稿子没有 —— 生成能力在命令行里，网页还没接。','Topics yes, drafts no. Generation lives in the CLI and is not wired to the web yet.') },
  { id:'marketing-loops', zh:'循环调度官', en:'Loop scheduler', grp:'run',
    read: p => { const l = p.loop && p.loop.lastCheck; if(!l) return null;
      const c = p.feedCounts || {};
      return T('每天重爬 · '+(c.unread||0)+' 条新情况', 'daily re-crawl · '+(c.unread||0)+' new'); },
    need: T('铁律：大多数运行应该是「查过了，没事可做」。天天有话说的循环是坏循环。',
            'The rule: most runs should be "checked, nothing to do". A loop that speaks every day is a broken loop.') },
];

/* The rest of the bundle. Staffed, scoped, and honest about needing an input we
   do not have yet — grouped so the list reads as a department, not a graveyard. */
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
    ids:['analytics','attribution','performance-reporter','alert-manager','revops','ab-testing','memory-management'] },
  know: { zh:'说得清（战略与研究）', en:'Strategy',
    ids:['marketing-council','marketing-plan','marketing-ideas','marketing-psychology','customer-research',
         'competitor-profiling','competitors','monid','workctl'] },
};

const issues = p => {
  const out = [];
  for (const pg of (p.audit && p.audit.pages) || []) {
    for (const b of pg.blockers || []) out.push({ sev:'crit', t:b, u:pg.url });
    for (const d of pg.dimensions || []) for (const i of d.issues || []) out.push({ sev:'warn', t:i, u:pg.url });
  }
  return out;
};

async function boot(){
  document.getElementById('dx').onclick = () => document.getElementById('dlg').close();
  try { P = await (await fetch('/api/project?id='+ID)).json(); }
  catch { document.getElementById('cCtx').innerHTML = '<div class="empty">'+T('读不到这个项目。','Could not load this project.')+'</div>'; return; }
  if (P.error){ document.getElementById('cCtx').innerHTML = '<div class="empty">'+T('这个项目不存在或已过期。','This project does not exist or has expired.')+'</div>'; return; }
  render();
}

function render(){
  const d = P.dossier || {};
  const brand = (d.brand && d.brand.name) || P.url;
  document.getElementById('brand').textContent = brand;
  let host = P.url; try { host = new URL(P.url).hostname; } catch {}
  document.getElementById('host').textContent = host;
  lamp(); digest(); context(d, brand); analytics(); agents(); cmo();
}

/* The health lamp is computed, never decorative: red only when something is
   actually blocking, amber when there is unread work, green when there is not. */
function lamp(){
  const crit = issues(P).filter(i => i.sev === 'crit').length;
  const c = P.feedCounts || {};
  const el = document.getElementById('lamp');
  el.className = 'lamp' + (crit ? ' bad' : c.unread ? ' warn' : '');
  document.getElementById('lampT').textContent = crit
    ? T(crit+' 个阻断', crit+' blocking')
    : c.unread ? T(c.unread+' 条未读', c.unread+' unread') : T('正常','healthy');
}

function digest(){
  const c = P.feedCounts || {};
  const staffed = ROSTER.filter(a => a.read(P)).length;
  const last = P.loop && P.loop.lastCheck;
  const cells = [
    { b: staffed + '/' + ROSTER.length, t: T('个岗位今天有产出','jobs produced today') },
    { b: c.open || 0, t: T('件待修','open'), go: 'cAgents' },
    { b: c.done || 0, t: T('件已清','cleared') },
    { b: last ? new Date(last).toISOString().slice(5,10) : '—', t: T('上次自动重爬','last auto re-crawl') },
  ];
  document.getElementById('digest').innerHTML = cells.map(x =>
    '<div class="d'+(x.go?' act':'')+'"'+(x.go?' data-go="'+x.go+'"':'')+'><b>'+esc(x.b)+'</b> <em>'+esc(x.t)+'</em></div>').join('')
    + '<div class="d"><em>'+T('69 个岗位在册 · 有数据的才会报产出','69 jobs on the roster · only the ones with data report output')+'</em></div>';
  document.querySelectorAll('[data-go]').forEach(e => e.onclick = () =>
    document.getElementById(e.dataset.go).scrollIntoView({behavior:'smooth'}));
}

/* ── column 1 · context ─────────────────────────────────────────────────── */
function context(d, brand){
  const b = d.brand || {};
  const docs = [
    ['product', T('产品档案','Product'), b.description ? 'ok' : 'no'],
    ['facts', T('品牌事实库','Brand facts'), (d.facts && d.facts.facts||[]).length ? 'ok' : 'no'],
    ['competitors', T('竞品分析','Competitors'), (d.competitorCandidates||[]).length ? 'warn' : 'no'],
    ['questions', T('买家问题库','Buyer questions'), (d.questions||[]).length ? 'ok' : 'no'],
    ['voice', T('品牌语气','Brand voice'), (P.voice && P.voice.filled) ? 'ok' : 'warn'],
    ['strategy', T('内容策略','Content strategy'), (P.docs && P.docs.strategy) ? 'ok' : 'no'],
  ];
  const lbl = { ok:T('已就位','ready'), warn:T('待你填','needs you'), no:T('没有','none') };
  document.getElementById('cCtx').innerHTML =
    '<h2>'+T('公司','Company')+'</h2>'
    + '<h3>'+esc(brand)+'</h3>'
    + '<p class="mini">'+esc(b.industry || '')+'</p>'
    + (b.description ? '<p style="font-size:13.5px;color:var(--ink2)">'+esc(b.description)+'</p>' : '')
    + '<div class="sect">'+T('文档 · 每个岗位动手前都先读这些','Documents · every job reads these first')+'</div>'
    + docs.map(([k,n,st]) => '<div class="doc" data-doc="'+k+'"><span>'+esc(n)+'</span><span class="tag '+(st==='ok'?'':st)+'">'+lbl[st]+'</span></div>').join('')
    + '<div class="sect">'+T('竞品','Competitors')+'</div>'
    + ((d.competitorCandidates||[]).length
        ? (d.competitorCandidates||[]).slice(0,12).map(c => '<span class="chip">'+esc(c.name)+'</span>').join('')
          + '<p class="mini" style="margin-top:6px">'+T('从你网站文字里猜的，等你核。','Guessed from your own copy. Yours to confirm.')+'</p>'
        : '<div class="empty">'+T('还没找到。','None found yet.')+'</div>')
    + '<div class="sect">'+T('这一栏能改','Editable')+'</div>'
    + '<p class="mini">'+T('机器读你四页文案写出来的东西一定有错的地方。点开就能改，改完下游全跟着变。',
        'What a model derived from four pages of your copy will be wrong somewhere. Open one and fix it; everything downstream follows.')+'</p>';
  document.querySelectorAll('[data-doc]').forEach(e => e.onclick = () => showDoc(e.dataset.doc));
}

/* ── column 2 · analytics ───────────────────────────────────────────────── */
let anaTab = 'health';
function analytics(){
  const a = P.audit || {};
  const all = issues(P);
  const crit = all.filter(i => i.sev === 'crit');
  const warn = all.filter(i => i.sev === 'warn');
  // Dimensions are scored out of their own max, not out of 100. Averaging the
  // raw numbers would rank a 15/15 below a 20/40 — the bug this replaces.
  const DIM = ZH
    ? {crawlability:'爬得到',length:'讲够了',structure:'结构读得懂',blocks:'能被摘走',
       authority:'有出处',relevance:'答对题'}
    : {crawlability:'crawlable',length:'substantial',structure:'structured',blocks:'extractable',
       authority:'sourced',relevance:'on-question'};
  const dims = {};
  for (const pg of a.pages || []) for (const d of pg.dimensions || []) {
    const k = DIM[d.key] || d.key || '—';
    dims[k] = dims[k] || { s:0, m:0 };
    dims[k].s += d.score; dims[k].m += (d.max || 0);
  }
  const tabs = [['health',T('体检','Health')],['issues',T('问题 '+all.length,'Issues '+all.length)],['geo',T('GEO','GEO')]];
  let body = '';
  if (anaTab === 'health'){
    body = '<div class="score"><b>'+(a.avgScore==null?'—':a.avgScore)+'</b><span class="mini">'+T('/100 AI 就绪度 · '+((a.pages||[]).length)+' 页','/100 AI readiness · '+((a.pages||[]).length)+' pages')+'</span></div>'
      + Object.entries(dims).map(([n,v]) => { const s = v.m ? Math.round(v.s/v.m*100) : 0;
          return '<div class="dim'+(s<50?' low':'')+'"><span>'+esc(n)+'</span><span class="bar"><i style="width:'+s+'%"></i></span><span class="v">'+s+'</span></div>'; }).join('')
      + '<p class="mini" style="margin-top:10px">'+T('这些不需要任何 Key 就能测 —— 爬得到、渲染得出、结构读得懂。','Measured with no keys at all — reachable, renderable, machine-readable.')+'</p>';
  } else if (anaTab === 'issues'){
    body = (crit.concat(warn)).slice(0,60).map(i =>
      '<div class="iss"><span class="sev '+i.sev+'">'+(i.sev==='crit'?T('阻断','BLOCK'):T('警告','WARN'))+'</span>'
      + '<span>'+esc(i.t)+'<br><span class="mini">'+esc(i.u)+'</span></span></div>').join('')
      || '<div class="empty">'+T('没有问题。','No issues.')+'</div>';
  } else {
    const at = P.probe && P.probe.verdict ? [P.probe] : [];
    body = at.length ? at.map(x =>
      '<div class="iss"><span class="sev '+(x.verdict==='knows'?'warn':'crit')+'">'+esc(x.verdict||'—')+'</span>'
      + '<span>'+esc(x.question||'')+(x.evidence?'<br><span class="mini">「'+esc(x.evidence)+'」</span>':'')+'</span></div>').join('')
      : '<div class="empty">'+T('还没问过引擎。','No engine asked yet.')+'</div>';
    body += '<p class="mini" style="margin-top:10px">'+T('这里只问了 1 个引擎（DeepSeek）。中外 18 个引擎的托管采样还没做。',
      'One engine asked here (DeepSeek). Hosted sampling across 18 engines is not built yet.')+'</p>';
  }
  document.getElementById('cAna').innerHTML = '<h2>'+T('分析','Analytics')+'</h2>'
    + '<div class="tabs">'+tabs.map(([k,n]) => '<button data-tab="'+k+'" class="'+(anaTab===k?'on':'')+'">'+esc(n)+'</button>').join('')+'</div>'
    + body;
  document.querySelectorAll('[data-tab]').forEach(e => e.onclick = () => { anaTab = e.dataset.tab; analytics(); });
}

/* ── column 3 · the roster ──────────────────────────────────────────────── */
function agents(){
  const on = [], idle = [];
  for (const a of ROSTER){
    const out = a.read(P);
    (out ? on : idle).push(card(a, out));
  }
  const bench = Object.entries(BENCH).map(([k,g]) =>
    '<details class="grp"><summary>'+esc(ZH?g.zh:g.en)+' · '+g.ids.length+'</summary>'
    + g.ids.map(id => card({ id, zh:id, en:id, bench:true }, null)).join('') + '</details>').join('');
  document.getElementById('cAgents').innerHTML = '<h2>'+T('岗位','Agents')
    + '<span class="mini">'+T(on.length+' 个今天有产出', on.length+' produced today')+'</span></h2>'
    + on.join('') + idle.join('')
    + '<div class="sect">'+T('在册待命 · 方法论就位，缺数据接入','On the bench · playbook ready, data not wired')+'</div>'
    + bench;
  document.querySelectorAll('.pbtn').forEach(b => b.onclick = () => openPlaybook(b));
}

function card(a, out){
  const name = a.bench ? a.id : (ZH ? a.zh : a.en);
  return '<details class="ag '+(out?'on':'idle')+'">'
    + '<summary><span class="who">'+esc(name)+'</span>'
    + '<span class="out'+(out?'':' none')+'">'+esc(out || T('待命','standing by'))+'</span></summary>'
    + '<div class="body">'
    + (a.need ? '<div class="need">'+esc(a.need)+'</div>' : '')
    + (a.bench ? '<p class="mini" style="margin:7px 0 0">'+T('这个岗位的方法论已经在系统里，可以读；要它产出还需要接上对应的数据源。',
        'The playbook for this job is in the system and readable. Producing output needs its data source wired.')+'</p>' : '')
    + '<button class="pbtn" data-pb="'+esc(a.id)+'">'+T('读方法论','read the playbook')+'</button>'
    + '<div class="pbody"></div></div></details>';
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

/* ── column 4 · ask, and the running log ────────────────────────────────── */
function cmo(){
  const log = (P.log || []).slice(-40).reverse();
  document.getElementById('cCmo').innerHTML = '<h2>'+T('问它','Ask')+'</h2>'
    + '<div class="ask"><input id="q" placeholder="'+T('问这个项目的任何事','Ask anything about this project')+'"><button id="qs">'+T('问','Ask')+'</button></div>'
    + '<div id="qa"></div>'
    + '<h2 style="margin-top:16px">'+T('它做过什么','What it did')+'</h2>'
    + '<div class="term">'+(log.length ? log.map(l =>
        '<div><span class="t">'+new Date(l.t).toISOString().slice(11,16)+'</span>  '+esc(l.m)+'</div>').join('')
      : '<div class="empty">'+T('还没有记录。','Nothing logged yet.')+'</div>')+'</div>';
  const go = () => ask(document.getElementById('q').value);
  document.getElementById('qs').onclick = go;
  document.getElementById('q').onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function ask(q){
  q = String(q||'').trim(); if (!q) return;
  const el = document.getElementById('qa');
  el.innerHTML = '<div class="ans">'+T('想…','thinking…')+'</div>';
  try {
    const r = await fetch('/api/ask', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id: ID, q: q, lang: ZH?'zh':'en'})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error||'failed');
    el.innerHTML = '<div class="ans">'+esc(j.answer).replace(/\\n/g,'<br>')
      + '<div class="src">'+esc(j.grounding||'')+'</div></div>';
  } catch (e) {
    el.innerHTML = '<div class="ans">'+T('这次没答上来。','Could not answer this time.')+'</div>';
  }
}

/* ── shared bits ────────────────────────────────────────────────────────── */
function showDoc(k){
  const d = P.dossier || {};
  const M = {
    product: [T('产品档案','Product'), (d.brand && d.brand.description) || T('（空）','(empty)')],
    facts: [T('品牌事实库','Brand facts'), ((d.facts && d.facts.facts)||[]).map(f => '- ['+f.grade+'] '+f.claim).join('\\n') || T('（空）','(empty)')],
    competitors: [T('竞品分析','Competitors'), (d.competitorCandidates||[]).map(c => '- '+c.name+(c.why?' — '+c.why:'')).join('\\n') || T('（空）','(empty)')],
    questions: [T('买家问题库','Buyer questions'), (d.questions||[]).map(q => '- ['+q.market+'] '+q.text).join('\\n') || T('（空）','(empty)')],
    voice: [T('品牌语气','Brand voice'), (P.voice && P.voice.filled) || (((P.docs && P.docs.voice && P.docs.voice.evidence)||[]).map(e => '> '+e.text).join('\\n\\n')) || T('（空）','(empty)')],
    strategy: [T('内容策略','Content strategy'), ((P.docs && P.docs.strategy && P.docs.strategy.pieces)||[]).map(p => '### '+p.title+'\\n'+(p.why||'')).join('\\n\\n') || T('（空）','(empty)')],
  };
  const [t, b] = M[k] || ['', ''];
  document.getElementById('dt').textContent = t;
  document.getElementById('dc').innerHTML = md(b)
    + '<p class="mini" style="margin-top:14px">'+T('要改这份文档，去诊断页 —— 编辑器在那边。','To edit this document, use the diagnosis page — the editor lives there.')+'</p>';
  document.getElementById('dlg').showModal();
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
    .replace(/[\u0060]([^\u0060]+)[\u0060]/g, '<code>$1</code>');
  for (const raw of lines){
    const line = raw.replace(/\\s+$/, '');
    if (/^[\u0060][\u0060][\u0060]/.test(line)){
      if (fence){ out.push('<pre>'+esc(buf.join('\\n'))+'</pre>'); buf = []; fence = false; }
      else { closeUl(); closeTbl(); fence = true; }
      continue;
    }
    if (fence){ buf.push(raw); continue; }
    const h = /^(#{2,4})[ ]+(.+)$/.exec(line);
    if (h){ closeUl(); closeTbl(); out.push('<h4>'+inline(h[2])+'</h4>'); continue; }
    if (/^[|]/.test(line)){
      const cells = line.split('[|]'.length ? '|' : '|').slice(1, -1).map(c => c.trim());
      if (/^[|][ -:|]+$/.test(line)) continue;
      if (!tbl){ out.push('<table><tbody>'); tbl = true; }
      out.push('<tr>'+cells.map(c => '<td>'+inline(c)+'</td>').join('')+'</tr>');
      continue;
    }
    closeTbl();
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
