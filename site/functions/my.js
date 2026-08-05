/**
 * GET /my — the sites you are watching.
 *
 * The no-login design is right for the first minute and wrong by the second
 * visit: the URL is the console, and a console you can lose by closing a tab is
 * one people lose. This is the cheapest honest fix — the list lives in this
 * browser, and the page says so rather than implying an account exists.
 *
 * It reads each project fresh instead of trusting what it stored, because the
 * only reason to come back is to find out what changed, and a list rendered
 * from a week-old cache would answer that question wrong.
 */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function onRequestGet({ request }) {
  const lang = new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  return new Response(page(lang), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function page(lang) {
  const zh = lang === 'zh';
  const T = (a, b) => esc(zh ? a : b);
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${T('我盯着的站点 — FasterGEO', 'Sites you are watching — FasterGEO')}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#F6F3EC;--panel:#FCFAF5;--ink:#1C1A15;--ink2:#4C4739;--faint:#8A8371;
--rule:#DAD3C2;--red:#B23A26;--green:#3A6B42;--amber:#8A6100;--amber-wash:#F5EFDE;
--serif:"Newsreader","Songti SC",Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 var(--serif)}
.wrap{max-width:840px;margin:0 auto;padding:34px 18px 70px}
h1{font:500 27px var(--serif);margin:0 0 6px}
.sub{font:12px/1.8 var(--mono);color:var(--faint);margin:0 0 26px}
.row{display:flex;gap:14px;align-items:baseline;background:var(--panel);border:1px solid var(--rule);
padding:14px 16px;margin-bottom:9px;text-decoration:none;color:inherit}
.row:hover{border-color:var(--ink)}
.row .nm{font:500 17px var(--serif);flex:none}
.row .ho{font:11.5px var(--mono);color:var(--faint);flex:1;word-break:break-all}
.row .st{font:11.5px var(--mono);color:var(--ink2);text-align:right;white-space:nowrap}
.row .un{font:600 10px var(--mono);background:var(--red);color:#fff;padding:2px 6px}
.row .brk{color:var(--red)}
.row .clean{color:var(--green)}
.empty{background:var(--panel);border:1px solid var(--rule);padding:22px;font:13px/1.85 var(--mono);color:var(--ink2)}
.note{margin-top:24px;padding:12px 14px;background:var(--amber-wash);font:11.5px/1.85 var(--mono);color:var(--amber)}
.act{margin-top:20px;font:12px var(--mono)}
.act a{color:var(--ink);text-decoration:underline}
button.rm{background:none;border:0;color:var(--faint);font:11px var(--mono);cursor:pointer;padding:0 0 0 6px}
button.rm:hover{color:var(--red)}
</style></head><body><div class="wrap">
<h1>${T('我盯着的站点', 'Sites you are watching')}</h1>
<p class="sub">${T('这个列表存在这台浏览器里 —— 换设备、清缓存就没了。跨设备要有账号，账号还没做。',
  'This list lives in this browser. Clear it or switch devices and it is gone. Accounts would fix that; accounts do not exist yet.')}</p>
<div id="list"><p class="sub">${T('读取中…', 'loading…')}</p></div>
<div class="act"><a href="${zh ? '/zh/' : '/'}">${T('扫一个新站点', 'Scan a new site')}</a></div>
<script>
const ZH = ${JSON.stringify(zh)};
const T = (a, b) => ZH ? a : b;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY = 'fastergeo.projects';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

const STATION = ZH
  ? {positioned:'说得清',demanded:'有人要',discoverable:'找得到',comprehensible:'看得懂',credible:'信得过',convertible:'买得下',compounding:'传得开'}
  : {positioned:'positioned',demanded:'demand',discoverable:'discoverable',comprehensible:'comprehensible',credible:'credible',convertible:'convertible',compounding:'compounding'};

async function load(){
  const saved = read();
  const el = document.getElementById('list');
  if (!saved.length){
    el.innerHTML = '<div class="empty">' + T(
      '这台浏览器还没打开过任何项目面板。扫一个站点，它会自动出现在这里。',
      'No project panel has been opened in this browser yet. Scan a site and it shows up here.') + '</div>';
    return;
  }
  // Read fresh. The reason to come back is to find out what changed, and a list
  // drawn from what we stored last time would answer that question wrong.
  const rows = await Promise.all(saved.map(async s => {
    try {
      const r = await fetch('/api/project?id=' + encodeURIComponent(s.id));
      if (!r.ok) return { s, gone: true };
      return { s, p: await r.json() };
    } catch { return { s, err: true }; }
  }));

  el.innerHTML = rows.map(({s, p, gone, err}) => {
    if (gone) return '<div class="row"><span class="nm">' + esc(s.brand || s.url) + '</span>'
      + '<span class="ho">' + T('这个项目已经过期或被删掉了。', 'This project has expired or been removed.') + '</span>'
      + '<button class="rm" data-id="' + esc(s.id) + '">' + T('从列表移除', 'remove') + '</button></div>';
    if (err) return '<div class="row"><span class="nm">' + esc(s.brand || s.url) + '</span>'
      + '<span class="ho">' + T('这次没读到，刷新试试。', 'Could not load this one. Try refreshing.') + '</span></div>';

    const c = p.feedCounts || {};
    const brand = (p.dossier && p.dossier.brand && p.dossier.brand.name) || s.brand || p.url;
    let host = p.url; try { host = new URL(p.url).hostname; } catch {}
    const running = p.stage && p.stage !== 'done';
    const brk = p.diagnosis && p.diagnosis.breakAt;
    // Three different facts, said as three different things. "Still running",
    // "breaks at station N", and "nothing open" are not interchangeable, and
    // collapsing them into one number is what makes a dashboard useless.
    const state = running
      ? '<span>' + T('还在跑…', 'still running…') + '</span>'
      : (c.open
          ? '<span class="brk">' + T(c.open + ' 件待修', c.open + ' open') + '</span>'
            + (brk ? ' <span class="brk">' + T('断在「' + (STATION[brk] || brk) + '」', 'breaks at ' + (STATION[brk] || brk)) + '</span>' : '')
          : '<span class="clean">' + T('都清了', 'all clear') + '</span>');

    return '<a class="row" href="/p/' + encodeURIComponent(s.id) + (s.lang === 'zh' ? '?lang=zh' : '') + '">'
      + '<span class="nm">' + esc(brand) + '</span>'
      + '<span class="ho">' + esc(host) + '</span>'
      + '<span class="st">' + (c.unread ? '<span class="un">' + c.unread + ' ' + T('未读', 'unread') + '</span> ' : '') + state + '</span></a>';
  }).join('');

  el.querySelectorAll('.rm').forEach(b => b.onclick = () => {
    localStorage.setItem(KEY, JSON.stringify(read().filter(x => x.id !== b.dataset.id)));
    load();
  });
}
load();
</script>
<div class="note">${T('没有账号，所以这一页只能看到你在这台浏览器上打开过的项目。项目本身没丢 —— 它的链接就是钥匙，谁拿到谁能看。',
  'With no accounts, this page can only show projects opened in this browser. The projects themselves are fine — their URL is the key, and anyone holding it can read them.')}</div>
</div></body></html>`;
}
