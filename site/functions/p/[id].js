/**
 * GET /p/<id> — the workbench.
 *
 * Shipped as a shell that boots empty and fills as the pipeline runs, because
 * that is the honest shape of the thing: the work takes minutes, and a spinner
 * over a blank page for two minutes reads as broken. The terminal is not
 * decoration — it is the only accurate way to say "someone started working for
 * you" while there is nothing to show yet.
 *
 * Four panes, the same ones the CLI has: the dossier it derived, the evidence it
 * collected, what to fix today, and what we can keep watching. No login: the URL
 * is the console.
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
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>FasterGEO</title><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#F6F3EC;--panel:#FCFAF5;--ink:#1C1A15;--ink2:#4C4739;--faint:#8A8371;
--rule:#DAD3C2;--rule2:#BFB6A0;--red:#B23A26;--red-wash:#F3E4DE;--green:#3A6B42;--green-wash:#E7EEE2;
--amber:#8A6100;--amber-wash:#F5EFDE;
--serif:"Newsreader","Songti SC",Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 var(--serif)}
.wrap{max-width:1560px;margin:0 auto;padding:14px}
.beat{display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:var(--ink);color:#E8E4D8;
padding:11px 18px;font:12.5px var(--mono);border-radius:9px 9px 0 0}
.beat b{font-family:var(--serif);font-size:17px}
.dot{width:7px;height:7px;border-radius:50%;background:#4ADE80;flex:none;
box-shadow:0 0 8px #4ADE80;animation:pulse 1.6s infinite}
@keyframes pulse{50%{opacity:.35}}
.dot.idle{animation:none;background:#6B7280;box-shadow:none}
.beat .meta{color:#B9B3A3}.beat .sp{flex:1}
.btn{background:#F6F3EC;color:#1C1A15;padding:6px 13px;text-decoration:none;font:12px var(--mono);
border:none;cursor:pointer}
.btn:hover{background:var(--red);color:#fff}
.term{background:#12100C;color:#C8C2B2;font:12.5px/1.85 var(--mono);padding:12px 18px;
max-height:190px;overflow:auto;border-radius:0}
.term div{white-space:pre-wrap}
.term .cur::after{content:"▋";animation:pulse 1s infinite}
.fn{background:var(--panel);border:1px solid var(--rule);border-top:none;padding:18px 20px}
.fn .verdict{font:500 19px/1.5 var(--serif);margin:0 0 14px;padding-left:13px;border-left:3px solid var(--red)}
.fn .verdict.ok{border-left-color:var(--green)}
.fn .stations{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule)}
@media(max-width:900px){.fn .stations{grid-template-columns:repeat(2,1fr)}}
.stn{background:var(--paper);padding:10px 9px;font:11.5px var(--mono);min-height:74px}
.stn.broken{background:var(--red-wash)}
.stn.ok{background:var(--green-wash)}
.stn.here{outline:2px solid var(--red);outline-offset:-2px;position:relative}
.stn .n{font:600 10px var(--mono);color:var(--faint)}
.stn .q{font:500 12.5px/1.45 var(--serif);color:var(--ink);margin:3px 0 5px}
.stn .s{font:10.5px var(--mono)}
.stn.broken .s{color:var(--red)}.stn.ok .s{color:var(--green)}
.stn.unmeasured .s,.stn.notcov .s{color:var(--faint)}
.stn .tc{float:right;font:600 10px var(--mono);color:var(--ink2)}
.fn .note{margin-top:11px;font:11.5px/1.8 var(--mono);color:var(--faint)}
.panes{display:grid;grid-template-columns:250px minmax(0,1fr) 330px;gap:1px;background:var(--rule);
border:1px solid var(--rule);border-top:none;border-radius:0 0 9px 9px}
@media(max-width:1100px){.panes{grid-template-columns:1fr}}
.pane{background:var(--panel);padding:16px 17px;min-width:0}
h2{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);
margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--rule);display:flex;
justify-content:space-between;align-items:center;gap:8px}
h2 b{color:var(--ink);font-size:12px}
h3{font:500 17px var(--serif);margin:0 0 3px}
p{color:var(--ink2);margin:0 0 12px;font-size:14.5px}
.fine{font:11.5px/1.75 var(--mono);color:var(--faint)}
.sub{font:11.5px var(--mono);color:var(--faint);margin-bottom:14px;word-break:break-all}
.sect{font:500 10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin:16px 0 7px}
.doc{display:flex;justify-content:space-between;gap:6px;padding:7px 0;border-bottom:1px dotted var(--rule2);
font-size:13.5px;cursor:pointer}
.doc:hover{color:var(--red)}
.doc:last-child{border-bottom:none}
.tag{font:600 9.5px var(--mono);padding:1px 6px;background:var(--green-wash);color:var(--green);white-space:nowrap}
.tag.warn{background:var(--amber-wash);color:var(--amber)}
.chip{display:inline-block;font:12px var(--mono);background:var(--paper);border:1px solid var(--rule);
border-radius:20px;padding:2px 9px;margin:0 4px 5px 0}
.said{border-left:4px solid var(--rule2);background:var(--paper);padding:15px 17px;margin-bottom:16px}
.said.bad{border-left-color:var(--red);background:var(--red-wash)}
.said.good{border-left-color:var(--green);background:var(--green-wash)}
.said.mid{border-left-color:var(--amber);background:var(--amber-wash)}
.said .q{font:11.5px var(--mono);color:var(--faint);margin-bottom:9px}
.said blockquote{margin:0;font-size:16.5px;line-height:1.65}
.said .foot{margin-top:11px;font:12px var(--mono);color:var(--ink2)}
.score{display:flex;gap:13px;align-items:center;margin-bottom:14px}
.score b{font:500 27px var(--mono)}.score small{color:var(--faint);font:12px var(--mono)}
.grade{font:500 19px var(--mono);border:1px solid var(--rule2);padding:6px 12px}
.g-D,.g-C{color:var(--red);border-color:var(--red)}.g-A,.g-B{color:var(--green);border-color:var(--green)}
.dim{display:grid;grid-template-columns:minmax(140px,1fr) 90px 72px;gap:9px;align-items:center;
font:12.5px var(--mono);padding:4px 0}
.dim .bar{height:6px;background:#EFEBE0;position:relative}
.dim .bar i{position:absolute;inset:0 auto 0 0;background:var(--ink);transition:width .6s}
.dim.low .bar i{background:var(--red)}
.dim .v{text-align:right}.dim em{color:var(--faint);font-style:normal}
.checks{margin-top:12px;font:12px var(--mono);display:flex;gap:13px;flex-wrap:wrap}
.ok{color:var(--green)}.no{color:var(--red)}
.funnel{display:flex;border:1px solid var(--rule);margin:16px 0 6px}
.st{flex:1;padding:10px 5px;text-align:center;border-right:1px solid var(--rule);font:11px var(--mono)}
.st:last-child{border-right:none}
.st span{display:block;font:500 15px var(--mono);margin-bottom:2px}
.st.bad{background:var(--red-wash)}.st.bad span{color:var(--red)}
.st.good{background:var(--green-wash)}.st.good span{color:var(--green)}
.st.na{background:var(--paper)}.st.na span{color:var(--faint)}
.tk{border:1px solid var(--rule);background:var(--paper);margin-bottom:8px}
.tk summary{padding:10px 12px;cursor:pointer;display:flex;gap:8px;align-items:baseline;font-size:14px}
.tk summary b{font-weight:500}
.tk .why,.tk .acc{margin:0 12px 9px;font-size:13px;color:var(--ink2)}
.tk .acc b{color:var(--green);font-weight:500}
.tk .hint{margin:0 12px 11px;padding:10px 12px;background:var(--panel);border:1px solid var(--rule);
font:11.5px/1.8 var(--mono);white-space:pre-wrap;color:var(--ink2);overflow-x:auto}
.pb{margin:0 12px 11px;padding:10px 12px;background:var(--green-wash);border-left:3px solid var(--green);font-size:12.5px;line-height:1.7}
.pb b{font:600 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--green);display:block;margin-bottom:4px}
.pbtn{margin-top:7px;background:none;border:1px solid var(--green);color:var(--green);
padding:5px 11px;font:11.5px var(--mono);cursor:pointer}
.pbtn:hover{background:var(--green);color:#fff}
.pbody{margin-top:10px;font:13px/1.75 var(--serif);color:var(--ink)}
.pbody:empty{display:none}
.pbody h4{font:600 13px var(--mono);margin:0 0 8px;color:var(--ink2)}
.pbody table{border-collapse:collapse;width:100%;margin:8px 0;font:12px var(--mono)}
.pbody th,.pbody td{border:1px solid var(--rule);padding:5px 8px;text-align:left}
.pbody th{background:var(--paper);font-weight:600}
.pbody ul,.pbody ol{margin:8px 0;padding-left:20px}
.pbody li{margin:3px 0}
.pbody pre{background:var(--ink);color:var(--paper);padding:9px 11px;overflow-x:auto;
font:11.5px var(--mono);white-space:pre-wrap}
.pbody code{font:12px var(--mono);background:var(--paper);padding:1px 4px}
.pbody .attr{margin-top:10px;font:10.5px var(--mono);color:var(--faint)}
.pb .nt{margin-top:7px;font:11.5px var(--mono);color:var(--ink2);opacity:.8}
.ch{font:600 9.5px var(--mono);padding:2px 6px;flex:none;letter-spacing:.05em}
.ch.nw{background:var(--ink);color:var(--paper)}
.ch.rg{background:var(--red);color:#fff}
.ch.sn{background:#EFEBE0;color:var(--faint)}
.unread{color:var(--red)}
.lnk{background:none;border:0;padding:0;margin:0 0 9px;color:var(--ink2);
font:11.5px var(--mono);cursor:pointer;text-decoration:underline}
.lnk:hover{color:var(--red)}
.rgw{color:var(--red)}
.acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 12px 11px}
.act{background:none;border:1px solid var(--rule);color:var(--ink2);
padding:4px 9px;font:11px var(--mono);cursor:pointer}
.act:hover{border-color:var(--ink);color:var(--ink)}
.act[disabled]{opacity:.5;cursor:default}
.dn{margin-top:14px;border-top:1px solid var(--rule);padding-top:10px}
.dn summary{font:11.5px var(--mono);color:var(--faint);cursor:pointer}
.dr{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;padding:7px 0;font-size:13px;color:var(--ink2)}
.dr b{font-weight:500;text-decoration:line-through;color:var(--faint)}
.pr{font:600 9.5px var(--mono);padding:2px 6px;flex:none}
.pr-P0{background:var(--red);color:#fff}.pr-P1{background:var(--amber-wash);color:var(--amber)}
.pr-P2{background:#EFEBE0;color:var(--ink2)}
form{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
input{flex:1;min-width:170px;padding:10px 12px;border:1px solid var(--rule2);background:#fff;
font:12.5px var(--mono);color:var(--ink)}
button.go{padding:10px 16px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);
font:12.5px var(--mono);cursor:pointer}
button.go:hover{background:var(--red);border-color:var(--red)}
.wm{margin-top:9px;font:12px var(--mono)}.wm.ok{color:var(--green)}.wm.err{color:var(--red)}
.rules{margin-top:18px;padding:10px 11px;background:var(--paper);font:11px/1.8 var(--mono);color:var(--faint)}
.rules b{color:var(--ink2)}
code{display:block;background:var(--ink);color:var(--paper);padding:10px 12px;font:12px var(--mono);
word-break:break-all;margin-top:8px}
dialog{border:1px solid var(--rule2);padding:0;max-width:820px;width:92vw;background:var(--panel)}
dialog::backdrop{background:rgba(28,26,21,.45)}
.dh{display:flex;justify-content:space-between;align-items:center;padding:12px 17px;
border-bottom:1px solid var(--rule);font:600 12.5px var(--mono)}
.dedit{display:none;border-top:1px solid var(--rule);padding:13px 19px;background:var(--paper)}
.dedit.on{display:block}
.dedit textarea{width:100%;min-height:220px;padding:11px 13px;border:1px solid var(--rule2);
background:#fff;font:12px/1.75 var(--mono);color:var(--ink);resize:vertical}
.drow{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:9px}
.dhint{font:11px var(--mono);color:var(--faint);flex:1}
.db{padding:15px 19px;max-height:70vh;overflow:auto;white-space:pre-wrap;font:12px/1.8 var(--mono)}
.empty{color:var(--faint);font:12.5px var(--mono);padding:14px 0}
</style></head><body>
<div class="wrap">
  <div class="beat"><span class="dot" id="dot"></span><b id="brand">…</b>
    <span class="meta" id="meta"></span><span class="sp"></span>
    <span class="meta" id="stage"></span></div>
  <div class="term" id="term"></div>
  <div id="funnel"></div>
  <div class="panes">
    <div class="pane" id="pProfile"></div>
    <div class="pane" id="pEvidence"></div>
    <div class="pane" id="pToday"></div>
  </div>
</div>
<dialog id="dlg"><div class="dh"><span id="dt"></span>
  <span><button class="btn" id="de"></button> <button class="btn" id="dx">×</button></span></div>
<div class="db" id="db"></div>
<div class="dedit" id="dedit"><textarea id="dta"></textarea>
  <div class="drow"><span class="dhint" id="dhint"></span>
    <button class="go" id="dsave"></button></div></div></dialog>
<script>
const ID = ${JSON.stringify(id)};
const ZH = ${JSON.stringify(lang === 'zh')};
const T = (zh, en) => ZH ? zh : en;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clean = s => String(s ?? '').replace(/[*_#]+/g,'').replace(new RegExp(String.fromCharCode(96),'g'),'').replace(/[ \\t]+/g, ' ').trim();
const DIMS = ZH
  ? {crawlability:'能不能被 AI 读到',length:'内容够不够多',structure:'结构清不清楚',
     blocks:'有没有值得被引用的段落',authority:'有没有署名和日期',relevance:'内容对不对得上问题'}
  : {crawlability:'Can AI read it',length:'Is there enough here',structure:'Is it clearly organised',
     blocks:'Anything worth quoting',authority:'Who wrote it, and when',relevance:'Does it match what people ask'};

const term = document.getElementById('term');
function print(m){ const d=document.createElement('div'); d.textContent='> '+m; term.appendChild(d); term.scrollTop=1e9; }
let P = null;

async function boot(){
  P = await (await fetch('/api/project?id='+ID)).json();
  if (P.error){ term.innerHTML = '<div>'+esc(T('这个项目不存在或已过期。','This project does not exist or has expired.'))+'</div>'; return; }
  P.log.forEach(l => print(l.m));
  render();
  if (P.stage !== 'done') loop();
  else document.getElementById('dot').className = 'dot idle';
}

/* One stage per request: a Worker cannot hold the connection for the whole
   pipeline, and each returned line is what makes the terminal real. */
async function loop(){
  for (let guard = 0; guard < 12; guard++){
    document.getElementById('stage').textContent = T('正在跑：','running: ') + P.stage;
    let r;
    try {
      r = await (await fetch('/api/step', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({id: ID})})).json();
    } catch { print(T('连接断了，刷新页面可以接着跑。','Connection dropped — reload to continue.')); break; }
    (r.newLines || []).forEach(l => print(l.m));
    P = await (await fetch('/api/project?id='+ID)).json();
    render();
    if (r.done || r.error) break;
  }
  document.getElementById('dot').className = 'dot idle';
  document.getElementById('stage').textContent = '';
}

function render(){
  const d = P.dossier, a = P.audit, q = P.probe;
  const brand = d?.brand?.name || new URL(P.url).hostname;
  document.getElementById('brand').textContent = brand;
  document.getElementById('meta').textContent = new URL(P.url).hostname + ' · ' + P.createdAt.slice(0,10)
    + (P.pageCount ? ' · ' + T(P.pageCount+' 页已读', P.pageCount+' pages read') : '');
  funnel(P.diagnosis);
  profile(d, brand);
  evidence(q, a);
  // The queue if there is one; the flat list only for projects created before
  // the queue existed. No migration — the next run merges them in for free.
  today(P.feedOpen || P.tickets || [], P.feedCounts, P.feedDone || []);
}

function funnel(dg){
  const el = document.getElementById('funnel');
  if (!dg){ el.innerHTML = ''; return; }
  const LABEL = ZH
    ? {ok:'没问题',broken:'断了',unmeasured:'未测','not-covered':'我们不测'}
    : {ok:'holds',broken:'breaks here',unmeasured:'not measured','not-covered':'we do not cover'};
  const cls = {ok:'ok',broken:'broken',unmeasured:'unmeasured','not-covered':'notcov'};
  const cells = dg.stations.map(s => {
    const meta = STN[s.id];
    return '<div class="stn '+cls[s.state]+(s.id===dg.breakAt?' here':'')+'">'
      + '<span class="n">'+meta.n+'</span>'
      + (s.ticketCount?'<span class="tc">'+s.ticketCount+'</span>':'')
      + '<div class="q">'+meta.q+'</div>'
      + '<div class="s">'+LABEL[s.state]+'</div></div>';
  }).join('');
  const detail = dg.stations.find(s => s.id === dg.breakAt);
  el.innerHTML = '<div class="fn">'
    + '<div class="verdict'+(dg.breakAt?'':' ok')+'">'+esc(ZH?dg.verdict.zh:dg.verdict.en)+'</div>'
    + '<div class="stations">'+cells+'</div>'
    + '<div class="note">'+T(
        '「未测」是没测，不是没问题。「我们不测」是我们真的不做这一栏 —— 说清楚比无限期挂着「即将推出」诚实。',
        '“Not measured” is an absence, not a pass. “We do not cover” means exactly that — saying so beats an indefinite “coming soon”.')
    + '</div></div>';
}

const STN = ZH ? {
  positioned:{n:0,q:'你说得清自己是什么吗'}, demand:{n:1,q:'有人在找这个吗'},
  discoverable:{n:2,q:'找得到你吗'}, comprehensible:{n:3,q:'读得懂、引得动吗'},
  credible:{n:4,q:'有谁替你说话'}, convertible:{n:5,q:'下得了单吗'},
  compounding:{n:6,q:'会带来下一个吗'},
} : {
  positioned:{n:0,q:'Can you say what you are'}, demand:{n:1,q:'Is anyone asking'},
  discoverable:{n:2,q:'Do they find you'}, comprehensible:{n:3,q:'Can they quote you'},
  credible:{n:4,q:'Does anyone vouch'}, convertible:{n:5,q:'Can they act'},
  compounding:{n:6,q:'Does one bring the next'},
};

function profile(d, brand){
  const el = document.getElementById('pProfile');
  if (!d){ el.innerHTML = h2(T('档案','Profile')) + waiting(); return; }
  const facts = d.facts?.facts || [];
  const sourced = facts.filter(f => f.status === 'confirmed').length;
  const unc = facts.length - sourced;
  const V = P.voice, S = P.strategy;
  const docs = [
    ['product', T('产品档案','Product'), ''],
    ['facts', T('品牌事实库','Brand facts'), sourced ? tag(T(sourced+' 条带来源', sourced+' sourced')) : ''],
    ['competitors', T('竞品分析','Competitors'), (d.competitorCandidates||[]).length ? tag(T((d.competitorCandidates||[]).length+' 待核',(d.competitorCandidates||[]).length+' to review'),1) : ''],
    ['questions', T('问题库','Questions'), (d.questions||[]).length ? tag(T((d.questions||[]).length+' 题',(d.questions||[]).length+' qs')) : ''],
    ['voice', T('语气指南','Voice'), V ? tag(T('待你填','yours to fill'),1) : ''],
    ['strategy', T('内容计划','Content plan'), S ? tag(T(S.pieces.length+' 篇',S.pieces.length+' pieces')) : ''],
  ];
  el.innerHTML = h2(T('档案','Profile'))
    + '<h3>'+esc(brand)+'</h3><div class="sub">'+esc(d.brand?.description||'')+'</div>'
    + '<div class="sect">'+T('四份档案','Four documents')+'</div>'
    + docs.map(([k,l,t]) => '<div class="doc" data-doc="'+k+'"><span>'+l+' '+t+'</span><span class="fine">›</span></div>').join('')
    + ((d.competitorCandidates||[]).length ? '<div class="sect">'+T('竞品 · 待人工核对','Competitors · to review')+'</div>'
        + d.competitorCandidates.map(c => '<span class="chip">'+esc(c.name)+'</span>').join('') : '')
    + (unc ? '<div class="fine" style="margin-top:12px">'+T(unc+' 条事实网站上没写，标了待确认，没有瞎猜。', unc+' facts were not on the site and are left unconfirmed rather than guessed.')+'</div>' : '')
    + '<div class="rules"><b>'+T('我们的纪律','Our discipline')+'</b><br>'
    + T('· 每个判定都带原话<br>· 算不出就写「未测」，绝不写 0<br>· 竞品是猜的，等你核','· Every verdict carries a quote<br>· Unmeasured stays unmeasured, never a zero<br>· Competitors are guesses until you confirm them')
    + '</div>';
  el.querySelectorAll('[data-doc]').forEach(x => x.onclick = () => showDoc(x.dataset.doc, d));
}

function evidence(q, a){
  const el = document.getElementById('pEvidence');
  if (!q && !a){ el.innerHTML = h2(T('证据','Evidence')) + waiting(); return; }
  let html = h2(T('证据','Evidence'), a ? T((a.pages||[]).length+' 页已体检',(a.pages||[]).length+' pages audited') : '');
  if (q){
    const V = {confused:['bad',T('它把你认成了别的公司','It has you mixed up with a different company')],
      unknown:['bad',T('它不知道你是谁','It does not know who you are')],
      knows:['good',T('它知道你是谁','It knows who you are')],
      unverified:['mid',T('你自己看 —— 这条我们不替你下结论','Read it yourself — we would not call this one for you')]};
    const v = V[q.verdict] || V.unverified;
    html += '<div class="said '+v[0]+'"><div class="q">'+esc(q.question)+'</div>'
      + '<blockquote>'+esc(clean(q.answer))+'</blockquote>'
      + '<div class="foot"><b>'+v[1]+'</b> · '+T('问的是 DeepSeek','asked of DeepSeek')+'</div>'
      + '<div class="fine" style="margin-top:5px">'+T('一个问题、一个引擎 —— 还说明不了 AI 会不会推荐你。','One question, one engine — it says nothing yet about whether AI recommends you.')+'</div></div>';
  }
  if (a){
    html += '<div class="score"><span class="grade g-'+gradeOf(a.avgScore)+'">'+gradeOf(a.avgScore)+'</span>'
      + '<div><b>'+(a.avgScore ?? '—')+'</b><small>/100 · '+T('网站 AI 就绪度','Site AI-readiness')+'</small></div></div>';
    const agg = {};
    for (const pg of a.pages||[]) for (const dm of pg.dimensions||[]) {
      if (dm.score === null || dm.score === undefined) { agg[dm.key] = agg[dm.key] || null; continue; }
      const cur = agg[dm.key] || {s:0,m:0}; agg[dm.key] = {s:cur.s+dm.score, m:cur.m+dm.max};
    }
    html += Object.keys(DIMS).map(k => {
      const v = agg[k];
      const pct = v ? Math.round(v.s/v.m*100) : 0;
      return '<div class="dim'+(v && pct<40?' low':'')+'"><span>'+DIMS[k]+'</span>'
        + '<span class="bar"><i style="width:'+pct+'%"></i></span>'
        + '<span class="v">'+(v ? pct+'%' : '<em>'+T('未测','not measured')+'</em>')+'</span></div>';
    }).join('');
    const s = a.site || {};
    const chk = (ok,l) => '<span class="'+(ok?'ok':'no')+'">'+(ok?'✓':'✗')+' '+l+'</span>';
    html += '<div class="checks">'+chk(s.robotsTxtFound,'robots.txt')
      + chk(!(s.blockedSearchCrawlers||s.blockedAiCrawlers||[]).length, T('AI 爬虫未被封','AI crawlers allowed'))
      + chk(s.sitemapFound,'sitemap')+chk(s.llmsTxtFound,'llms.txt')+'</div>'
      + '<div class="fine" style="margin-top:10px">'+T('「未测」是没测，不是 0。','“Not measured” is an absence, not a zero.')+'</div>';
  }
  el.innerHTML = html;
}

/* The state chip. Only shown when there is something to say — an item that is
   simply still open needs no label, and labelling everything makes the two
   states that matter (new, and came back) stop standing out. */
function chip(k){
  if (k.state === 'regressed') return k.neverVerified
    ? '<span class="ch rg">'+T('还在','still there')+'</span>'
    : '<span class="ch rg">'+T('又坏了','came back')+'</span>';
  if (k.state === 'new') return '<span class="ch nw">'+T('新','new')+'</span>';
  if (k.state === 'snoozed') return '<span class="ch sn">'+T('已推迟','snoozed')+'</span>';
  return '';
}

function today(ts, counts, done){
  const el = document.getElementById('pToday');
  done = done || [];
  if (!ts.length && !done.length){ el.innerHTML = h2(T('今天','Today')) + (P.stage==='done' ? '<div class="empty">'+T('没有待办。','Nothing queued.')+'</div>' : waiting()); return; }
  const unread = counts?.unread || 0;
  el.innerHTML = h2(T('今天','Today'),
      (ts.length ? T('修 '+ts.length+' 件','fix '+ts.length) : T('都清了','all clear'))
      + (unread ? ' <span class="unread">'+unread+' '+T('未读','unread')+'</span>' : ''))
    + (unread ? '<button class="lnk" id="markAll">'+T('全部标为已读','mark all read')+'</button>' : '')
    + ts.map((k,i) => '<details class="tk"'+(i===0?' open':'')+'>'
      + '<summary><span class="pr pr-'+esc(k.priority)+'">'+esc(k.priority)+'</span>'+chip(k)+'<b>'+esc(k.title)+'</b></summary>'
      + (k.state === 'regressed' ? '<p class="why rgw">'+(k.neverVerified
          ? T('你标了修好，但重爬还是能看到它。','You marked this done, but the crawl still finds it.')
          : T('这条之前是重爬确认修好的，现在又出现了。','This was verified fixed by a crawl and has come back.'))+'</p>' : '')
      + (k.rationale ? '<p class="why">'+esc(k.rationale)+'</p>' : '')
      + '<p class="acc"><b>'+T('修到这样算好：','Done when: ')+'</b>'+esc(k.acceptance?.desc||'—')+'</p>'
      + (k.fixHint ? '<pre class="hint">'+esc(k.fixHint)+'</pre>' : '')
      + (k.playbook ? '<div class="pb"><b>'+T('怎么做','How to do it')+'</b> '+esc(k.playbook.covers)
          + '<button class="pbtn" data-pb="'+esc(k.playbook.skill)+'" data-sec="'+esc(k.playbook.start||'')+'">'
          + T('展开方法论','read the playbook')+'</button><div class="pbody"></div>'
          + (k.playbook.notThis?'<div class="nt">'+esc(k.playbook.notThis)+'</div>':'')+'</div>' : '')
      + (k.key ? '<div class="acts">'
          + '<button class="act" data-k="'+esc(k.key)+'" data-a="done">'+T('我修好了','I fixed this')+'</button>'
          + '<button class="act" data-k="'+esc(k.key)+'" data-a="snooze">'+T('先放放','not now')+'</button>'
          + '<span class="fine">'+T('下次重爬会核对 —— 说了修好但没修好，它会自己回来。',
              'The next crawl checks. If it is not actually fixed, it comes back on its own.')+'</span></div>' : '')
      + '</details>').join('')
    /* Kept, not deleted. The finished pile is the only record that any of this
       worked, and a queue that empties itself leaves a user with nothing to
       show for the month. */
    + (done.length ? '<details class="dn"><summary>'+T('已经修好的 '+done.length+' 件','fixed: '+done.length)+'</summary>'
        + done.map(k => '<div class="dr"><b>'+esc(k.title)+'</b>'
            + '<span class="fine">'+(k.doneBy === 'owner' ? T('你标的','you marked it') : T('重爬确认','confirmed by crawl'))
            + (k.resolvedAt ? ' · '+esc(String(k.resolvedAt).slice(0,10)) : '')+'</span>'
            + (k.key ? '<button class="act" data-k="'+esc(k.key)+'" data-a="reopen">'+T('放回去','reopen')+'</button>' : '')
            + '</div>').join('') + '</details>' : '')
    + '<div class="sect">'+T('要我替你盯着吗？','Want me to watch it?')+'</div>'
    + '<p class="fine">'+T('留个邮箱，我把这一页记下来。<b>发信还没接通</b> —— 接通之前，重爬的结果会更新在这个页面上，链接不会变。',
        'Leave an address and I will keep this page on the list. <b>Email is not wired yet</b> — until it is, re-crawl results land on this page and the link stays put.')+'</p>'
    + '<form id="wf"><input id="we" type="email" required placeholder="you@company.com"><button class="go" type="submit">'+T('盯着','Watch')+'</button></form><div id="wm" class="wm"></div>'
    + '<div class="sect">'+T('看得更深','Go deeper')+'</div>'
    + '<p class="fine">'+T('这里问了 1 个引擎。命令行跑中外 18 个，并且每修一处都重爬验收。','This asked one engine. The CLI runs 18 across China and global, and re-crawls to verify every fix.')+'</p>'
    + '<code>npx fastergeo start '+esc(new URL(P.url).hostname)+'</code>';
  el.querySelectorAll('.pbtn').forEach(b => b.onclick = () => openPlaybook(b));
  el.querySelectorAll('.act').forEach(b => b.onclick = () => act(b.dataset.k, b.dataset.a, b));
  const ma = document.getElementById('markAll');
  if (ma) ma.onclick = () => act(null, 'seen-all', ma);
  const f = document.getElementById('wf');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    const m = document.getElementById('wm'); m.textContent='…';
    const r = await fetch('/api/watch', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id: ID, email: document.getElementById('we').value, kind:'project'})});
    const d = await r.json().catch(()=>({}));
    m.textContent = r.ok ? T('记下了。发信接通后你会第一批收到。','Noted. You will be in the first batch once email is wired.') : (d.error||'failed');
    m.className = 'wm ' + (r.ok?'ok':'err');
  };
}

/* Queue actions. The server is the only place that decides order and counts, so
   this re-reads the project rather than patching the DOM — a local guess that
   disagrees with the next reload is worse than a moment of waiting. */
async function act(key, action, btn){
  btn.disabled = true;
  try {
    const r = await fetch('/api/feed', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id: ID, key: key, action: action, days: 7})});
    if (!r.ok) throw new Error('failed');
    P = await (await fetch('/api/project?id='+ID)).json();
    render();
  } catch {
    btn.disabled = false;
    btn.textContent = T('没存上，再点一次','did not save — try again');
  }
}

/* Read it where the work is. Sending someone to a JSON page in another tab to
   learn how to do the thing they were just told to do is a handoff they mostly
   do not complete. */
async function openPlaybook(btn){
  const body = btn.nextElementSibling;
  if (body.dataset.open === '1'){ body.innerHTML=''; body.dataset.open='0';
    btn.textContent = T('展开方法论','read the playbook'); return; }
  btn.disabled = true; btn.textContent = T('取方法论…','fetching…');
  try {
    const u = '/api/playbook?lang='+(ZH?'zh':'en')+'&skill='+encodeURIComponent(btn.dataset.pb)
      + (btn.dataset.sec ? '&section='+encodeURIComponent(btn.dataset.sec) : '');
    const j = await (await fetch(u)).json();
    const sec = j.section || (j.sections||[])[0];
    body.innerHTML = (sec ? '<h4>'+esc(sec.h)+'</h4>'+md(sec.b) : '<p class="fine">'+T('这一节暂时取不到。','Could not load this section.')+'</p>')
      + '<div class="attr">'+esc(j.attribution||'')+'</div>';
    body.dataset.open='1';
    btn.textContent = T('收起','collapse');
  } catch {
    body.innerHTML = '<p class="fine">'+T('取不到，稍后再试。','Could not load. Try again.')+'</p>';
    btn.textContent = T('展开方法论','read the playbook');
  }
  btn.disabled = false;
}

/* Enough Markdown for what the playbooks actually contain: headings, tables,
   lists, fenced code, bold. Escaped first — this is third-party text and it is
   never trusted as HTML. */
function md(src){
  const NL = String.fromCharCode(10), BT = String.fromCharCode(96);
  const lines = esc(src).split(NL);
  let out='', inTable=false, inList=null, inFence=false, fence=[];
  const B = new RegExp('[*][*](.+?)[*][*]','g'), C = new RegExp(BT+'(.+?)'+BT,'g');
  const inline = t => t.replace(B,'<b>$1</b>').replace(C,'<code>$1</code>');
  const closeList = () => { if(inList){ out += '</'+inList+'>'; inList=null; } };
  const closeTable = () => { if(inTable){ out += '</tbody></table>'; inTable=false; } };
  const ROW = new RegExp('^[|](.+)[|]$'), SEP = new RegExp('^[ |:-]+$');
  const LI = new RegExp('^[ ]*[-*][ ]+(.+)$'), OL = new RegExp('^[ ]*[0-9]+[.)][ ]+(.+)$');
  const H = new RegExp('^[#]{2,4}[ ]+(.+)$');
  for (const raw of lines){
    const l = raw.replace(new RegExp('[ ]+$'),'');
    if (l.charCodeAt(0)===96 && l.charCodeAt(1)===96){
      if (inFence){ out += '<pre>'+fence.join(NL)+'</pre>'; fence=[]; inFence=false; }
      else { closeList(); closeTable(); inFence=true; }
      continue;
    }
    if (inFence){ fence.push(l); continue; }
    if (ROW.test(l)){
      if (SEP.test(l)) continue;
      const cells = l.slice(1,-1).split('|').map(c=>c.trim());
      if (!inTable){ closeList(); out += '<table><tbody>'; inTable=true; }
      out += '<tr>'+cells.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>';
      continue;
    }
    closeTable();
    const li = LI.exec(l), ol = OL.exec(l);
    if (li || ol){
      const want = li ? 'ul' : 'ol';
      if (inList !== want){ closeList(); out += '<'+want+'>'; inList=want; }
      out += '<li>'+inline((li||ol)[1])+'</li>';
      continue;
    }
    closeList();
    if (!l.trim()) continue;
    const h = H.exec(l);
    out += h ? '<h4>'+inline(h[1])+'</h4>' : '<p>'+inline(l)+'</p>';
  }
  closeList(); closeTable();
  if (inFence && fence.length) out += '<pre>'+fence.join(NL)+'</pre>';
  return out;
}

function showDoc(kind, d){
  const NL = String.fromCharCode(10);
  const F = d.facts || {};
  let title = kind, body = '';
  if (kind === 'product'){
    title = T('产品档案','Product dossier');
    body = [T('名称：','Name: ')+(d.brand?.name||'—'), T('一句话：','In one line: ')+(F.definition||d.brand?.description||'—'),
      T('行业：','Industry: ')+(d.brand?.industry||'—'), T('域名：','Domains: ')+(d.brand?.domains||[]).join(', '),
      T('别名：','Aliases: ')+((d.brand?.aliases||[]).join(', ')||'—'),
      (d.unresolved||[]).length ? '\\n'+T('网站上没找到（需要你补）：','Not found on the site (yours to fill): ')+d.unresolved.join(', ') : ''
    ].join('\\n');
  } else if (kind === 'facts'){
    title = T('品牌事实库','Brand facts');
    body = T('只有 confirmed 且非 E 级的事实允许进入生成内容。\\n\\n','Only confirmed, non-E facts may enter generated content.\\n\\n')
      + (F.facts||[]).map(f => '['+f.grade+'] '+f.claim+'\\n    '+(f.source||T('（网站上没找到）','(not found on the site)'))
        +'  ·  '+(f.status==='confirmed'?'confirmed':'UNCONFIRMED')).join('\\n\\n');
  } else if (kind === 'competitors'){
    title = T('竞品分析','Competitors');
    body = T('这些全部是从你的网站文字里猜的。真正的竞争集来自采样 AI 的回答，不是来自读你的首页。\\n\\n',
      'All of these are guesses from your site text. A real competitive set comes from sampling AI answers, not from reading a homepage.\\n\\n')
      + (d.competitorCandidates||[]).map(c => '['+c.confidence+'] '+c.name+'\\n    '+c.why).join('\\n\\n');
  } else if (kind === 'voice'){
    const V = P.voice;
    title = T('语气指南','Voice guide');
    body = V.intro + NL + NL
      + V.slots.map(x => x + NL + '  ' + T('（待你填）','(yours to fill)')).join(NL + NL)
      + NL + NL + '— ' + V.evidenceLabel + ' —' + NL + NL
      + V.evidence.map(e => '  ' + e.text).join(NL + NL);
  } else if (kind === 'strategy'){
    const S = P.strategy;
    title = T('内容计划','Content plan');
    body = T('每一篇都对着一个买家真会问的问题 —— 对不上问题的选题不会出现在这里。' + NL + NL,
             'Every piece answers a question buyers actually ask. A topic that maps to no question does not appear here.' + NL + NL)
      + S.pieces.map((x,i) => (i+1) + '. ' + x.title + NL
          + '   ' + T('回答：','Answers: ') + x.question + '  [' + x.market + ']' + NL
          + '   ' + T('可引用块：','Citable block: ') + (x.block||'-') + '  ·  ' + (x.format||'') + NL
          + '   ' + x.why).join(NL + NL);
  } else {
    title = T('问题库','Question bank');
    body = T('探测题会点名你的品牌，用来测 AI 认不认识你，严格排除在可见度指标之外。\\n\\n',
      'Probe questions name your brand — they measure recognition and are kept out of visibility metrics.\\n\\n')
      + (d.questions||[]).map(q => (q.brandInQuestion?'● ':'  ')+'['+q.market+'/'+q.group+'] '+q.text).join('\\n');
  }
  curDoc = kind;
  const deb = document.getElementById('de');
  deb.style.display = EDITABLE[kind] ? '' : 'none';
  deb.textContent = T('编辑','edit');
  document.getElementById('dedit').classList.remove('on');
  document.getElementById('dt').textContent = title;
  document.getElementById('db').textContent = body;
  document.getElementById('dlg').showModal();
}
/* Editing is the trust mechanism, not a convenience. The dossier is derived by
   a model from four pages and will be wrong about something; a document you
   cannot correct makes that permanent, and the reader stops believing the parts
   that are right. Plain text in, parsed back — a form with thirty inputs would
   be a worse way to fix a sentence. */
const EDITABLE = { product:1, facts:1, competitors:1, questions:1, voice:1 };
let curDoc = null;

function editable(kind, d){
  const NL = String.fromCharCode(10);
  if (kind === 'product'){
    const b = d.brand||{};
    return [b.name||'', b.description||'', b.industry||'', (b.aliases||[]).join(', ')].join(NL);
  }
  if (kind === 'facts') return ((d.facts||{}).facts||[]).map(f => f.claim + ' | ' + (f.source||'')).join(NL);
  if (kind === 'competitors') return (d.competitorCandidates||[]).map(c => c.name).join(NL);
  if (kind === 'questions') return (d.questions||[]).map(q => (q.market||'cn') + ' | ' + q.text).join(NL);
  if (kind === 'voice') return (P.voice && P.voice.filled) || '';
  return '';
}

const HINT = ZH ? {
  product:'四行：名称 / 一句话 / 行业 / 别名（逗号分隔）。别名漏了，你的可见度会被静默低估。',
  facts:'每行一条：事实 | 来源链接。你改过的会标成「你说的」，跟「网站上写的」分开算。',
  competitors:'每行一个竞品名。',
  questions:'每行：cn 或 global | 问题。改题库会开启新的测量序列，前后期不可比。',
  voice:'用你自己的话写。我们不会替你生成。',
} : {
  product:'Four lines: name / one-liner / industry / aliases (comma separated). A missing alias silently under-counts you.',
  facts:'One per line: claim | source URL. Your edits are marked as yours, kept apart from what the site said.',
  competitors:'One competitor name per line.',
  questions:'Each line: cn or global | question. Editing the bank starts a new measurement series.',
  voice:'In your own words. We will not generate this for you.',
};

function parseEdit(kind, txt){
  const NL = String.fromCharCode(10);
  const lines = txt.split(NL).map(l => l.trim());
  if (kind === 'product'){
    return { name:lines[0]||'', description:lines[1]||'', industry:lines[2]||'',
      aliases:(lines[3]||'').split(',').map(x=>x.trim()).filter(Boolean) };
  }
  if (kind === 'facts'){
    const prev = ((P.dossier.facts||{}).facts)||[];
    const out = lines.filter(Boolean).map((l,i)=>{
      const [claim, source] = l.split('|').map(x=>(x||'').trim());
      return { id:(prev[i]||{}).id, claim, source, grade:(prev[i]||{}).grade||'A', status:'confirmed' };
    });
    out.definition = (P.dossier.facts||{}).definition;
    return out;
  }
  if (kind === 'competitors') return lines.filter(Boolean).map(n=>({ name:n, by:'owner' }));
  if (kind === 'questions') return lines.filter(Boolean).map(l=>{
    const [m, ...rest] = l.split('|');
    return { market:(m||'').trim()==='global'?'global':'cn', text:rest.join('|').trim() };
  }).filter(q=>q.text);
  return txt;
}

const dlg = document.getElementById('dlg');
const de = document.getElementById('de'), ded = document.getElementById('dedit');
de.onclick = () => {
  if (ded.classList.contains('on')){ ded.classList.remove('on'); de.textContent = T('编辑','edit'); return; }
  document.getElementById('dta').value = editable(curDoc, P.dossier||{});
  document.getElementById('dhint').textContent = HINT[curDoc] || '';
  ded.classList.add('on');
  de.textContent = T('收起','close');
};
document.getElementById('dsave').textContent = T('保存','save');
document.getElementById('dsave').onclick = async () => {
  const btn = document.getElementById('dsave');
  btn.disabled = true; btn.textContent = T('保存中…','saving…');
  try {
    const r = await fetch('/api/edit', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: ID, doc: curDoc, value: parseEdit(curDoc, document.getElementById('dta').value) }) });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || 'failed');
    P = await (await fetch('/api/project?id='+ID)).json();
    render();
    showDoc(curDoc, P.dossier||{});
    document.getElementById('dedit').classList.add('on');
    document.getElementById('de').textContent = T('收起','close');
    btn.textContent = T('已保存','saved');
    setTimeout(()=>{ btn.textContent = T('保存','save'); btn.disabled=false; }, 1400);
  } catch(e){
    btn.textContent = T('保存失败：','failed: ') + e.message;
    btn.disabled = false;
  }
};
document.getElementById('dx').onclick = () => dlg.close();

const h2 = (t, r) => '<h2><b>'+t+'</b>'+(r?'<span class="fine">'+r+'</span>':'')+'</h2>';
const waiting = () => '<div class="empty">'+T('还在跑…','working…')+'</div>';
const tag = (t, warn) => '<span class="tag'+(warn?' warn':'')+'">'+t+'</span>';
const gradeOf = s => s === null || s === undefined ? '—' : s>=85?'A':s>=70?'B':s>=50?'C':'D';

boot();
</script></body></html>`;
}
