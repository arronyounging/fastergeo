import { describe, it, expect } from 'vitest';
import { parseLogLine } from '../src/parse.js';
import { analyzeBotlog } from '../src/analyze.js';

const NGINX = [
  // GPTBot crawling twice, one 403 (blocked)
  '20.171.207.1 - - [10/Aug/2026:13:55:36 +0000] "GET /pricing HTTP/1.1" 200 5316 "-" "Mozilla/5.0 AppleWebKit/537.36; compatible; GPTBot/1.2; +https://openai.com/gptbot"',
  '20.171.207.1 - - [10/Aug/2026:14:01:02 +0000] "GET /docs HTTP/1.1" 403 162 "-" "Mozilla/5.0 AppleWebKit/537.36; compatible; GPTBot/1.2; +https://openai.com/gptbot"',
  // ChatGPT-User real-time fetch
  '23.98.142.7 - - [10/Aug/2026:15:20:11 +0000] "GET /pricing HTTP/1.1" 200 5316 "-" "Mozilla/5.0; ChatGPT-User/1.0; +https://openai.com/bot"',
  // Human referred from ChatGPT
  '82.11.4.20 - - [10/Aug/2026:16:00:00 +0000] "GET /pricing HTTP/1.1" 200 5316 "https://chatgpt.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"',
  // Human referred from 豆包
  '116.30.1.9 - - [10/Aug/2026:16:05:00 +0000] "GET /zh/ HTTP/1.1" 200 4210 "https://www.doubao.com/chat/" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)"',
  // Ordinary human traffic — must not appear anywhere
  '93.184.216.34 - - [10/Aug/2026:16:10:00 +0000] "GET / HTTP/1.1" 200 8000 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"',
  // Garbage line — must be counted as skipped
  'this is not a log line',
].join('\n');

describe('parseLogLine', () => {
  it('parses combined format with timezone-aware timestamps', () => {
    const e = parseLogLine(NGINX.split('\n')[0])!;
    expect(e.path).toBe('/pricing');
    expect(e.status).toBe(200);
    expect(e.ua).toContain('GPTBot');
    expect(e.time!.toISOString()).toBe('2026-08-10T13:55:36.000Z');
  });

  it('parses Cloudflare Logpush JSON lines', () => {
    const e = parseLogLine(JSON.stringify({
      ClientRequestURI: '/docs', ClientRequestUserAgent: 'PerplexityBot/1.0',
      EdgeResponseStatus: 200, EdgeStartTimestamp: '2026-08-10T10:00:00Z',
      ClientRequestReferer: '', ClientRequestMethod: 'GET',
    }), 'cloudflare')!;
    expect(e.path).toBe('/docs');
    expect(e.ua).toContain('PerplexityBot');
    expect(e.time!.toISOString()).toBe('2026-08-10T10:00:00.000Z');
  });

  it('returns null for garbage instead of guessing', () => {
    expect(parseLogLine('not a log line')).toBeNull();
  });
});

describe('analyzeBotlog', () => {
  const r = analyzeBotlog(NGINX);

  it('counts skipped lines honestly', () => {
    expect(r.totalLines).toBe(7);
    expect(r.parsedLines).toBe(6);
    expect(r.skippedLines).toBe(1);
  });

  it('separates crawler purposes: training vs user-request', () => {
    expect(r.botHitsByPurpose.training).toBe(2);          // GPTBot ×2
    expect(r.botHitsByPurpose['user-request']).toBe(1);   // ChatGPT-User
    const gpt = r.bots.find(b => b.id === 'GPTBot')!;
    expect(gpt.statuses['4xx']).toBe(1);                  // the 403 is visible
    expect(gpt.topPaths[0].hits).toBe(1);
  });

  it('detects AI referral visits by referer host, cn and global', () => {
    const ids = r.aiReferrals.map(x => x.id).sort();
    expect(ids).toEqual(['chatgpt', 'doubao']);
    expect(r.aiReferrals.find(x => x.id === 'doubao')!.market).toBe('cn');
  });

  it('never counts ordinary traffic or crawler hits as referrals', () => {
    const total = r.aiReferrals.reduce((a, x) => a + x.hits, 0);
    expect(total).toBe(2); // google-referred human + crawler requests excluded
  });

  it('computes the observation window from timestamps', () => {
    expect(r.window.from).toBe('2026-08-10T13:55:36.000Z');
    expect(r.window.to).toBe('2026-08-10T16:10:00.000Z');
  });

  it('reports nothing as zero when nothing matched — empty arrays, stated skips', () => {
    const empty = analyzeBotlog('junk\nmore junk');
    expect(empty.bots).toEqual([]);
    expect(empty.skippedLines).toBe(2);
    expect(empty.window.from).toBeNull();
  });
});
