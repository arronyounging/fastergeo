/**
 * The three v1 connectors. Each returns a PublishResult and never throws —
 * a failed publish is a result, not an exception, so multi-target runs
 * report per-target outcomes.
 *
 * WeChat 公众号 drafts are deliberately absent from v1: the draft API
 * requires a pre-uploaded cover material and an IP-allowlisted server, which
 * cannot be made honest-by-default from an arbitrary laptop. Roadmap.
 */

import { createHmac } from 'node:crypto';
import { markdownToHtml, slugify } from './markdown.js';
import type {
  FetchLike, GithubTarget, PublishInput, PublishResult, WebhookTarget, WordpressTarget,
} from './types.js';

const TIMEOUT_MS = 20_000;

function requireEnv(name: string, env: Record<string, string | undefined>): string {
  const v = env[name];
  if (!v) throw new Error(`missing env ${name} — target configs reference secrets by env var name, set it first`);
  return v;
}

export interface ConnectorOptions {
  fetchFn?: FetchLike;
  env?: Record<string, string | undefined>;
}

export async function publishWordpress(
  target: WordpressTarget,
  input: PublishInput,
  opts: ConnectorOptions = {},
): Promise<PublishResult> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  try {
    const password = requireEnv(target.passwordEnv, opts.env ?? process.env);
    const auth = Buffer.from(`${target.username}:${password}`).toString('base64');
    const res = await fetchFn(`${target.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        title: input.title,
        content: markdownToHtml(input.markdown),
        status: target.status ?? 'draft',
        slug: input.slug ?? slugify(input.title),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, target: target.name, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    const j = JSON.parse(body);
    return { ok: true, target: target.name, id: j.id, url: j.link };
  } catch (err) {
    return { ok: false, target: target.name, error: String((err as Error).message ?? err) };
  }
}

export async function publishGithub(
  target: GithubTarget,
  input: PublishInput,
  opts: ConnectorOptions = {},
): Promise<PublishResult> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  try {
    const token = requireEnv(target.tokenEnv, opts.env ?? process.env);
    const slug = input.slug ?? slugify(input.title);
    const path = `${target.dir.replace(/\/$/, '')}/${slug}.md`;
    const content = `# ${input.title}\n\n${input.markdown}`;
    const res = await fetchFn(`https://api.github.com/repos/${target.repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'fastergeo-publish',
      },
      body: JSON.stringify({
        message: `content: ${input.title}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(target.branch ? { branch: target.branch } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, target: target.name, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    const j = JSON.parse(body);
    return { ok: true, target: target.name, url: j.content?.html_url, id: j.content?.sha };
  } catch (err) {
    return { ok: false, target: target.name, error: String((err as Error).message ?? err) };
  }
}

export async function publishWebhook(
  target: WebhookTarget,
  input: PublishInput,
  opts: ConnectorOptions = {},
): Promise<PublishResult> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  try {
    const payload = JSON.stringify({
      source: 'fastergeo',
      title: input.title,
      markdown: input.markdown,
      slug: input.slug ?? slugify(input.title),
      tags: input.tags ?? [],
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (target.secretEnv) {
      const secret = requireEnv(target.secretEnv, opts.env ?? process.env);
      headers['X-FasterGEO-Signature'] =
        `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    }
    const res = await fetchFn(target.url, {
      method: 'POST', headers, body: payload, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, target: target.name, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, target: target.name };
  } catch (err) {
    return { ok: false, target: target.name, error: String((err as Error).message ?? err) };
  }
}
