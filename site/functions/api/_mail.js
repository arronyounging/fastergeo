/**
 * The acceptance letter: the one email this product sends.
 *
 * The daily loop already knows when a fix lands. What it could not do is tell
 * anyone who was not looking at the page that morning — and the people who most
 * need to hear "it worked" are the ones who left to go fix their site. This is
 * that hand-off, and nothing else: no digests, no "your weekly score", no
 * nudges. A letter that arrives only when something real happened is a letter
 * people keep opening.
 *
 * Provider-agnostic on purpose. The only transport today is Resend's REST API
 * (a fetch, workers-safe, no SDK), selected by MAIL_API_KEY + MAIL_FROM. With
 * either missing nothing is sent and the caller is told so — the panel copy is
 * driven by that same check, so the page never promises a letter that cannot
 * leave the building.
 */

/** Loop reasons that justify interrupting someone's inbox. */
const FIXED = new Set(['blocker cleared', 'llms.txt added', 'ticket cleared', 'ai learned']);
const BROKE = new Set(['regressed', 'claim not confirmed', 'new blocker', 'crawler blocked', 'ai confused']);

/** Unguessable, per project: the unsubscribe link must not be forgeable from the id. */
export function newUnsubToken() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mailReady(env) {
  return Boolean(env?.MAIL_API_KEY && env?.MAIL_FROM);
}

/**
 * Whether a loop result is worth a letter. Score movement alone never is —
 * scores wobble, and narrating wobble is how a product trains people to filter
 * it. An unreachable site is not either: one bad morning is usually theirs to
 * notice, and the page already records it.
 */
export function letterKind(result) {
  const r = result?.reasons ?? [];
  if (r.some(x => FIXED.has(x))) return 'fixed';
  if (r.some(x => BROKE.has(x))) return 'broke';
  return null;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param p      the stored project (needs id, url, lang, unsub)
 * @param result runDailyCheck's return — its `lines` are what the page logged
 * @param origin site origin for links, e.g. https://fastergeo.co
 */
export function composeLetter(p, result, origin) {
  const kind = letterKind(result);
  if (!kind) return null;
  const zh = p.lang === 'zh';
  const host = new URL(p.url).hostname;
  const lines = (result.lines ?? []).map(l => l.m);
  const page = `${origin}/${p.path === 'r' ? 'r' : 'p'}/${p.id}`;
  const unsub = `${origin}/api/unwatch?id=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.unsub ?? '')}`;

  // Which instrument saw it decides what the letter may claim: a re-crawl
  // proves what the site serves, a re-ask proves what an engine answered.
  const r = result.reasons ?? [];
  const aiOnly = r.some(x => x.startsWith('ai ')) && !r.some(x => FIXED.has(x) && !x.startsWith('ai '));
  if (aiOnly && kind === 'fixed') {
    const subj = zh ? `${host}：AI 对你的说法变了` : `${host}: AI changed what it says about you`;
    const ld = zh ? '这周重问了 AI 同一个问题，连问三次，回答都和上次不同。下面是它现在的说法。'
                  : 'We asked the AI the same question as last time, three times, and every answer differed from before. Here is what it says now.';
    return finish(subj, ld);
  }
  const subject = kind === 'fixed'
    ? (zh ? `${host}：重爬确认修好了` : `${host}: a fix is confirmed by re-crawl`)
    : (zh ? `${host}：有一处需要你看一眼` : `${host}: something needs a look`);
  const lead = kind === 'fixed'
    ? (zh ? '今天的重爬核对到了下面的变化。这不是你说的，也不是我们猜的 —— 是爬虫重新读你的网站读到的。'
          : 'Today\'s re-crawl found the change below. Not taken on your word or ours — the crawler read your site again and saw it.')
    : (zh ? '今天的重爬发现了下面的变化。写信只因为它会影响 AI 能不能读到你。'
          : 'Today\'s re-crawl found the change below. Writing only because it affects whether AI can read you.');
  return finish(subject, lead);

  function finish(subject, lead) {
    const cta = zh ? '打开你的页面' : 'Open your page';
    const foot = zh
      ? '只有核对到真实变化时才会写信；分数小幅波动不算。不想再收：'
      : 'You only hear from us when a check confirms a real change; score wobble does not count. Stop these:';
    const stop = zh ? '取消盯梢' : 'stop watching';

    const text = [lead, '', ...lines.map(l => `· ${l}`), '', `${cta}: ${page}`, '', `${foot} ${unsub}`].join('\n');
    const html = `<div style="font:15px/1.6 Georgia,serif;color:#1C1A15;max-width:560px">`
      + `<p>${esc(lead)}</p><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
      + `<p><a href="${esc(page)}" style="color:#B23A26">${esc(cta)} →</a></p>`
      + `<p style="font:12px/1.5 monospace;color:#6b665c">${esc(foot)} <a href="${esc(unsub)}" style="color:#6b665c">${esc(stop)}</a></p></div>`;
    return { kind, subject, text, html, unsub };
  }
}

/** @returns {{sent: boolean, reason?: string, id?: string}} never throws */
export async function sendMail(env, to, letter) {
  if (!mailReady(env)) return { sent: false, reason: 'mail not configured' };
  try {
    const r = await fetch(env.MAIL_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.MAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM, to: [to], subject: letter.subject, text: letter.text, html: letter.html,
        // One-click unsubscribe is what Gmail and Yahoo now require of bulk
        // senders; cheap to do right from the first letter.
        headers: { 'List-Unsubscribe': `<${letter.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    if (!r.ok) return { sent: false, reason: `mail ${r.status}` };
    const d = await r.json().catch(() => ({}));
    return { sent: true, id: d.id };
  } catch (e) {
    return { sent: false, reason: `mail ${e.message}` };
  }
}
