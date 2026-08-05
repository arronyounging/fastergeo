import { describe, it, expect } from 'vitest';
import { mergeFeed, feedCounts, sortFeed, feedKey } from '../src/feed.js';
import type { FeedItem } from '../src/feed.js';
import type { Ticket } from '../src/types.js';

const tk = (check: string, over: Partial<Ticket> = {}): Ticket => ({
  id: 'T-x', title: check, priority: 'P1', rationale: 'r', status: 'todo', history: [],
  acceptance: { type: 'auto', check, desc: 'd' },
  ...over,
} as Ticket);

const seed = (check: string, over: Partial<FeedItem> = {}): FeedItem => ({
  ...(tk(check) as FeedItem), key: check, state: 'seen',
  firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-01-01T00:00:00Z', ...over,
});

const NOW = '2026-08-05T00:00:00Z';

describe('mergeFeed', () => {
  it('keys on the acceptance check, not the id — ids drift between runs', () => {
    expect(feedKey(tk('site.llms_txt'))).toBe('site.llms_txt');
    const prev = [seed('site.llms_txt', { id: 'T-001' })];
    // Same finding, different position in this run's list.
    const r = mergeFeed(prev, [tk('site.llms_txt', { id: 'T-004' })], NOW);
    expect(r.added).toHaveLength(0);
    expect(r.items[0].firstSeen).toBe('2026-01-01T00:00:00Z');
  });

  it('marks a finding that disappeared as done — a fix landed', () => {
    const r = mergeFeed([seed('site.llms_txt')], [], NOW);
    expect(r.resolved.map(i => i.key)).toEqual(['site.llms_txt']);
    expect(r.items[0].state).toBe('done');
    expect(r.items[0].resolvedAt).toBe(NOW);
  });

  it('keeps resolved items rather than deleting them', () => {
    // "This is fixed" is the outcome the product exists to produce. Deleting it
    // would make the queue shorter and the product quieter about its own point.
    const done = seed('site.sitemap', { state: 'done', resolvedAt: '2026-06-01T00:00:00Z' });
    const r = mergeFeed([done], [], NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].resolvedAt).toBe('2026-06-01T00:00:00Z');
    expect(r.resolved).toHaveLength(0);
  });

  it('flags a fix that stopped holding as regressed, keeping the original date', () => {
    const prev = [seed('site.llms_txt', { state: 'done', resolvedAt: '2026-06-01T00:00:00Z' })];
    const r = mergeFeed(prev, [tk('site.llms_txt')], NOW);
    expect(r.regressed).toHaveLength(1);
    expect(r.items[0].state).toBe('regressed');
    expect(r.items[0].firstSeen).toBe('2026-01-01T00:00:00Z');
  });

  it('separates a claim that did not hold from a verified fix that broke', () => {
    // "You said you fixed it, the crawl disagrees" and "this genuinely broke
    // again" are different facts. Reporting the first as the second tells the
    // user something we never established.
    const claimed = seed('a', { state: 'done', resolvedAt: '2026-06-01T00:00:00Z', doneBy: 'owner' });
    const verified = seed('b', { state: 'done', resolvedAt: '2026-06-01T00:00:00Z' });
    const r = mergeFeed([claimed, verified], [tk('a'), tk('b')], NOW);
    expect(r.items.find(i => i.key === 'a')!.neverVerified).toBe(true);
    expect(r.items.find(i => i.key === 'b')!.neverVerified).toBeUndefined();
  });

  it('preserves seen state so a re-run does not re-mark everything unread', () => {
    const r = mergeFeed([seed('a', { state: 'seen' })], [tk('a')], NOW);
    expect(r.items[0].state).toBe('seen');
    expect(r.added).toHaveLength(0);
  });

  it('wakes a snooze that has run out, and leaves a live one alone', () => {
    const expired = seed('a', { state: 'snoozed', snoozeUntil: '2026-01-02T00:00:00Z' });
    const live = seed('b', { state: 'snoozed', snoozeUntil: '2099-01-01T00:00:00Z' });
    const r = mergeFeed([expired, live], [tk('a'), tk('b')], NOW);
    expect(r.items.find(i => i.key === 'a')!.state).toBe('seen');
    expect(r.items.find(i => i.key === 'b')!.state).toBe('snoozed');
  });
});

describe('feedCounts', () => {
  it('counts new and regressed as unread, and excludes live snoozes', () => {
    const c = feedCounts([
      seed('a', { state: 'new' }),
      seed('b', { state: 'regressed' }),
      seed('c', { state: 'seen' }),
      seed('d', { state: 'done' }),
      seed('e', { state: 'snoozed', snoozeUntil: '2099-01-01T00:00:00Z' }),
    ], NOW);
    expect(c).toEqual({ unread: 2, open: 3, done: 1, regressed: 1, snoozed: 1 });
  });
});

describe('sortFeed', () => {
  it('puts a regression above a P0 — effort already spent is being lost', () => {
    const out = sortFeed([
      seed('a', { state: 'new', priority: 'P0' } as Partial<FeedItem>),
      seed('b', { state: 'regressed', priority: 'P2' } as Partial<FeedItem>),
    ], NOW);
    expect(out.map(i => i.key)).toEqual(['b', 'a']);
  });

  it('hides done and live-snoozed items, and breaks ties by age', () => {
    const out = sortFeed([
      seed('old', { firstSeen: '2026-01-01T00:00:00Z' }),
      seed('new', { firstSeen: '2026-07-01T00:00:00Z' }),
      seed('done', { state: 'done' }),
      seed('zzz', { state: 'snoozed', snoozeUntil: '2099-01-01T00:00:00Z' }),
    ], NOW);
    expect(out.map(i => i.key)).toEqual(['old', 'new']);
  });
});
