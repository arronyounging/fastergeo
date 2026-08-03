import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { publishTo, markdownToHtml, slugify } from '../src/index.js';
import type { FetchLike, PublishInput } from '../src/types.js';
import type { FactStore } from '@fastergeo/content';

const FACTS: FactStore = {
  brand: 'Custyle',
  definition: 'Custyle 是 AI 定制商品平台。',
  facts: [
    { id: 'F-001', claim: '支持 18 类商品定制', grade: 'A', source: 'https://custyle.ai', status: 'confirmed' },
  ],
};

const INPUT: PublishInput = { title: '定制指南', markdown: '支持 18 类商品定制，流程简单。' };
const DIRTY: PublishInput = { title: 'x', markdown: '已服务 99999 名用户。' };

interface Call { url: string; init: Parameters<FetchLike>[1] }
function fakeFetch(response: unknown, status = 201): { fetchFn: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, text: async () => JSON.stringify(response) };
  };
  return { fetchFn, calls };
}

describe('fabrication gate', () => {
  const wp = { type: 'wordpress' as const, name: 'blog', baseUrl: 'https://b.example', username: 'u', passwordEnv: 'WP_PW' };
  const env = { WP_PW: 'secret' };

  it('refuses content that fails the gate, with the issues attached', async () => {
    const { fetchFn, calls } = fakeFetch({});
    const r = await publishTo(wp, DIRTY, { facts: FACTS, fetchFn, env });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('fabrication gate');
    expect(r.gateIssues!.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0); // nothing was sent anywhere
  });

  it('force publishes but records gateForced', async () => {
    const { fetchFn } = fakeFetch({ id: 1, link: 'https://b.example/x' });
    const r = await publishTo(wp, DIRTY, { facts: FACTS, force: true, fetchFn, env });
    expect(r.ok).toBe(true);
    expect(r.gateForced).toBe(true);
    expect(r.gateIssues!.length).toBeGreaterThan(0);
  });

  it('clean content passes without gate flags', async () => {
    const { fetchFn } = fakeFetch({ id: 2, link: 'https://b.example/y' });
    const r = await publishTo(wp, INPUT, { facts: FACTS, fetchFn, env });
    expect(r.ok).toBe(true);
    expect(r.gateForced).toBeUndefined();
  });
});

describe('connectors', () => {
  it('wordpress: basic auth from env, markdown converted to HTML, default draft', async () => {
    const { fetchFn, calls } = fakeFetch({ id: 7, link: 'https://b.example/p' });
    const r = await publishTo(
      { type: 'wordpress', name: 'blog', baseUrl: 'https://b.example/', username: 'u', passwordEnv: 'WP_PW' },
      { title: 'T', markdown: '## Section\n\ntext' },
      { fetchFn, env: { WP_PW: 'pw' } },
    );
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://b.example/p');
    const body = JSON.parse(calls[0].init!.body!);
    expect(body.status).toBe('draft');           // humans press the final button
    expect(body.content).toContain('<h2');
    expect(calls[0].init!.headers!.Authorization).toBe(`Basic ${Buffer.from('u:pw').toString('base64')}`);
  });

  it('github: PUT contents with base64 body under the configured dir', async () => {
    const { fetchFn, calls } = fakeFetch({ content: { html_url: 'https://github.com/x', sha: 'abc' } });
    const r = await publishTo(
      { type: 'github', name: 'site', repo: 'me/blog', dir: 'posts', tokenEnv: 'GH_T' },
      { title: 'Hello World', markdown: 'body' },
      { fetchFn, env: { GH_T: 't' } },
    );
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('https://api.github.com/repos/me/blog/contents/posts/hello-world.md');
    const body = JSON.parse(calls[0].init!.body!);
    expect(Buffer.from(body.content, 'base64').toString()).toContain('# Hello World');
  });

  it('webhook: HMAC signature over the exact payload', async () => {
    const { fetchFn, calls } = fakeFetch({}, 200);
    const r = await publishTo(
      { type: 'webhook', name: 'hook', url: 'https://hook.example/x', secretEnv: 'HOOK_SECRET' },
      { title: 'T', markdown: 'm' },
      { fetchFn, env: { HOOK_SECRET: 's3' } },
    );
    expect(r.ok).toBe(true);
    const expected = `sha256=${createHmac('sha256', 's3').update(calls[0].init!.body!).digest('hex')}`;
    expect(calls[0].init!.headers!['X-FasterGEO-Signature']).toBe(expected);
  });

  it('missing secret env fails with the env var name, never a partial request', async () => {
    const { fetchFn, calls } = fakeFetch({});
    const r = await publishTo(
      { type: 'wordpress', name: 'blog', baseUrl: 'https://b.example', username: 'u', passwordEnv: 'WP_MISSING' },
      INPUT, { fetchFn, env: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('WP_MISSING');
    expect(calls).toHaveLength(0);
  });

  it('HTTP errors become results, not exceptions', async () => {
    const { fetchFn } = fakeFetch({ message: 'nope' }, 401);
    const r = await publishTo(
      { type: 'webhook', name: 'hook', url: 'https://hook.example/x' },
      INPUT, { fetchFn },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('401');
  });
});

describe('markdown helpers', () => {
  it('converts markdown and slugifies with CJK preserved', () => {
    expect(markdownToHtml('# A\n\n- x')).toContain('<li>x</li>');
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('定制T恤 指南')).toBe('定制t恤-指南');
  });
});
