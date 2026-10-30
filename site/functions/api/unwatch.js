/**
 * /api/unwatch?id=…&t=… — stop the letters.
 *
 * GET shows a button; only POST acts. Mail security scanners fetch every link
 * in a message before a human sees it, and an unsubscribe that fires on GET
 * would quietly switch off the one letter a user actually wanted. POST is also
 * what a mail client sends for one-click List-Unsubscribe, so both the button
 * and the inbox's own "unsubscribe" land on the same code.
 *
 * The project page itself is kept: stopping the letters is not deleting the
 * work, and the link someone pasted into a chat should still open.
 */
import { kv, loadScan, saveWatchedScan } from './_store.js';
import { loadProject, saveProject } from './project.js';

const HTML_H = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

async function authorised(env, url) {
  const id = url.searchParams.get('id');
  const t = url.searchParams.get('t');
  // Either kind of watched thing: a project, or a scan from the landing page.
  const proj = await loadProject(env, id);
  const p = proj ?? await loadScan(env, id);
  if (!p || !t || !p.unsub || t !== p.unsub) return null;
  p.kind = proj ? 'p' : 'r';
  return p;
}

const page = (body, zh) => `<!DOCTYPE html><html lang="${zh ? 'zh' : 'en'}"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
  + `<title>FasterGEO</title></head><body style="font:16px/1.6 Georgia,serif;color:#1C1A15;background:#F6F3EC;`
  + `max-width:520px;margin:12vh auto;padding:0 20px">${body}</body></html>`;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const p = await authorised(env, url);
  if (!p) return new Response(page('<p>This link is not valid any more.</p>', false), { status: 404, headers: HTML_H });
  const zh = p.lang === 'zh';
  const host = new URL(p.url).hostname;
  if (!p.email) {
    return new Response(page(`<p>${zh ? `已经不再盯 ${host} 了。` : `Already not watching ${host}.`}</p>`, zh), { headers: HTML_H });
  }
  return new Response(page(
    `<p>${zh ? `不再给你写关于 ${host} 的信？页面会保留，链接照常能打开。` : `Stop letters about ${host}? The page is kept and its link still opens.`}</p>`
    + `<form method="post"><button style="font:inherit;padding:8px 16px;background:#1C1A15;color:#F6F3EC;border:0;cursor:pointer">`
    + `${zh ? '停止' : 'Stop'}</button></form>`, zh), { headers: HTML_H });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const p = await authorised(env, url);
  if (!p) return new Response(page('<p>This link is not valid any more.</p>', false), { status: 404, headers: HTML_H });
  const zh = p.lang === 'zh';
  if (p.email) {
    await kv(env).delete(`w:${p.email}:${p.id}`);
    delete p.email;
    p.unwatchedAt = new Date().toISOString();
    const { kind, ...rec } = p;
    // Both savers restore the 30-day expiry for a record nobody watches.
    if (kind === 'p') await saveProject(env, rec);
    else await saveWatchedScan(env, rec);
  }
  return new Response(page(`<p>${zh ? '好了，不会再写信。' : 'Done — no more letters.'}</p>`
    + `<p><a href="/${p.kind}/${encodeURIComponent(p.id)}" style="color:#B23A26">${zh ? '回到页面' : 'Back to the page'} →</a></p>`, zh),
    { headers: HTML_H });
}
