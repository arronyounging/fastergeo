/**
 * /api/confirm?id=…&t=… — "yes, this is my address, write to me".
 *
 * Anyone can type anyone's address into a watch form. Until the owner of the
 * inbox says yes, the re-crawl runs and its results land on the page, but no
 * letter leaves. GET only shows a button, for the same reason as unsubscribe:
 * mail scanners open every link, and a scanner must not be able to say yes.
 */
import { loadWatched, saveWatched, page, HTML_H } from './_watched.js';

const invalid = () => new Response(page('<p>This link is not valid any more.</p>', false), { status: 404, headers: HTML_H });

async function authorised(env, url) {
  const w = await loadWatched(env, url.searchParams.get('id'));
  const t = url.searchParams.get('t');
  if (!w || !w.rec.email || !t || !w.rec.confirmToken || t !== w.rec.confirmToken) return null;
  return w;
}

export async function onRequestGet({ request, env }) {
  const w = await authorised(env, new URL(request.url));
  if (!w) return invalid();
  const zh = w.rec.lang === 'zh';
  const host = new URL(w.rec.url).hostname;
  if (w.rec.emailConfirmed) {
    return new Response(page(`<p>${zh ? `已经确认过了，${host} 有真实变化时会写信给你。` : `Already confirmed. You will hear about ${host} when something real changes.`}</p>`, zh), { headers: HTML_H });
  }
  return new Response(page(
    `<p>${zh ? `确认接收关于 ${host} 的信？只有重爬核对到真实变化时才会写。` : `Confirm letters about ${host}? You only hear from us when a check confirms a real change.`}</p>`
    + `<form method="post"><button style="font:inherit;padding:8px 16px;background:#1C1A15;color:#F6F3EC;border:0;cursor:pointer">`
    + `${zh ? '确认' : 'Confirm'}</button></form>`, zh), { headers: HTML_H });
}

export async function onRequestPost({ request, env }) {
  const w = await authorised(env, new URL(request.url));
  if (!w) return invalid();
  const zh = w.rec.lang === 'zh';
  if (!w.rec.emailConfirmed) {
    w.rec.emailConfirmed = true;
    await saveWatched(env, w);
  }
  return new Response(page(`<p>${zh ? '确认好了。' : 'Confirmed.'}</p>`
    + `<p><a href="/${w.kind}/${encodeURIComponent(w.rec.id)}" style="color:#B23A26">${zh ? '回到页面' : 'Back to the page'} →</a></p>`, zh),
    { headers: HTML_H });
}
