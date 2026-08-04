/**
 * Push the daily digest somewhere a person will actually see it.
 *
 * `hire` installs a job and `cycle` writes today.md, and until this existed the
 * chain still ended on disk: somebody had to remember to go and read it. A
 * daily agent nobody hears from is a cron job, not an agent.
 *
 * Two channels, both dependency-free:
 *   telegram — the Bot API, one HTTPS call
 *   webhook  — a POST of the digest; email goes through a relay you control
 *
 * There is deliberately no SMTP. Doing mail properly means a dependency, a
 * credential store, and deliverability problems that are not this tool's job;
 * a webhook into whatever already sends your mail is the honest version.
 *
 * Failures are recorded and surfaced on the NEXT run. A push that fails
 * silently is worse than no push at all: the user believes they are being told
 * about regressions and they are not.
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

const ERR_FILE = '.notify-error.json';

/** Telegram caps a message at 4096 chars; cut on a line, never mid-sentence. */
function clip(text, max = 3900) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf('\n');
  return (at > max * 0.6 ? cut.slice(0, at) : cut) + '\n\n…(truncated — full digest in today.md)';
}

async function sendTelegram(text, env) {
  const token = env.FASTERGEO_TG_TOKEN;
  const chat = env.FASTERGEO_TG_CHAT;
  if (!token || !chat) throw new Error('FASTERGEO_TG_TOKEN / FASTERGEO_TG_CHAT not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat, text: clip(text), parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    // Telegram returns the real reason in the body; a bare status hides
    // "chat not found" and "bot was blocked", the two failures users hit.
    const body = await res.text().catch(() => '');
    throw new Error(`telegram ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function sendWebhook(text, env, meta) {
  const url = env.FASTERGEO_WEBHOOK_URL;
  if (!url) throw new Error('FASTERGEO_WEBHOOK_URL not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.FASTERGEO_WEBHOOK_SECRET ? { 'X-FasterGEO-Secret': env.FASTERGEO_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ ...meta, digest: text }),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

/**
 * A failure the user has not been told about yet. Returned so the caller can
 * say it out loud at the start of the next run, in its own words.
 */
export function pendingNotifyError(dir) {
  const p = `${dir}/${ERR_FILE}`;
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function clearNotifyError(dir) {
  const p = `${dir}/${ERR_FILE}`;
  if (existsSync(p)) rmSync(p);
}

/**
 * @returns {Promise<{sent: boolean, channel: string, error?: string}>}
 *   Never throws. A broken notification must not take down the run that
 *   produced the finding — the digest is already on disk either way.
 */
export async function notify(dir, channel, text, meta = {}, env = process.env) {
  if (!channel || channel === 'none') return { sent: false, channel: 'none' };
  try {
    if (channel === 'telegram') await sendTelegram(text, env);
    else if (channel === 'webhook') await sendWebhook(text, env, meta);
    else throw new Error(`unknown channel "${channel}" (telegram | webhook | none)`);
    clearNotifyError(dir);
    return { sent: true, channel };
  } catch (err) {
    const error = String(err?.message ?? err);
    writeFileSync(`${dir}/${ERR_FILE}`, JSON.stringify({
      at: new Date().toISOString(), channel, error,
    }, null, 2));
    return { sent: false, channel, error };
  }
}

/** Env var names a channel needs — used by `hire` to carry them into the job. */
export function channelEnvKeys(channel) {
  if (channel === 'telegram') return ['FASTERGEO_TG_TOKEN', 'FASTERGEO_TG_CHAT'];
  if (channel === 'webhook') return ['FASTERGEO_WEBHOOK_URL', 'FASTERGEO_WEBHOOK_SECRET'];
  return [];
}
