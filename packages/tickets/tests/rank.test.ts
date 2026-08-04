import { describe, it, expect } from 'vitest';
import { rankTickets } from '../src/rank.js';
import type { Ticket } from '../src/types.js';

const mk = (over: Partial<Ticket>): Ticket => ({
  id: 'T', title: 't', priority: 'P1', rationale: 'r', status: 'todo', history: [],
  acceptance: { type: 'auto', check: 'site.llms_txt', desc: 'd' },
  ...over,
} as Ticket);

describe('rankTickets', () => {
  it('puts a regression first, above every P0', () => {
    const r = rankTickets([
      mk({ id: 'A', priority: 'P0' }),
      mk({ id: 'B', priority: 'P2', status: 'regressed' }),
    ]);
    expect(r.today.map(t => t.id)).toEqual(['B', 'A']);
  });

  it('drops verified-done work out of the queue entirely', () => {
    const r = rankTickets([
      mk({ id: 'A', status: 'done' }),
      mk({ id: 'B' }), mk({ id: 'C' }), mk({ id: 'D' }), mk({ id: 'E' }),
    ]);
    expect(r.today.map(t => t.id)).toEqual(['B', 'C', 'D']);
    expect(r.open.map(t => t.id)).not.toContain('A');
    expect(r.counts).toEqual({ done: 1, regressed: 0, open: 4, all: 5 });
  });

  it('orders by priority before anything else', () => {
    const r = rankTickets([
      mk({ id: 'P2', priority: 'P2' }),
      mk({ id: 'P1', priority: 'P1' }),
      mk({ id: 'P0', priority: 'P0' }),
    ]);
    expect(r.today.map(t => t.id)).toEqual(['P0', 'P1', 'P2']);
  });

  it('prefers machine-verifiable work within the same priority', () => {
    const r = rankTickets([
      mk({ id: 'manual', acceptance: { type: 'manual', desc: 'ask someone' } as Ticket['acceptance'] }),
      mk({ id: 'auto' }),
    ]);
    expect(r.today[0].id).toBe('auto');
  });

  it('prefers a ticket that already says how to fix it', () => {
    const r = rankTickets([mk({ id: 'bare' }), mk({ id: 'hinted', fixHint: 'edit robots.txt' })]);
    expect(r.today[0].id).toBe('hinted');
  });

  it('sinks work that is blocked on a human decision', () => {
    const r = rankTickets([mk({ id: 'blocked', status: 'pending-manual' }), mk({ id: 'open' })]);
    expect(r.today[0].id).toBe('open');
  });

  it('keeps generation order for ties — it already encodes impact weighting', () => {
    const r = rankTickets([mk({ id: 'first' }), mk({ id: 'second' }), mk({ id: 'third' })]);
    expect(r.today.map(t => t.id)).toEqual(['first', 'second', 'third']);
  });

  it('surfaces three by default and survives an empty backlog', () => {
    expect(rankTickets([]).today).toEqual([]);
    expect(rankTickets(Array.from({ length: 9 }, (_, i) => mk({ id: 'T' + i }))).today).toHaveLength(3);
  });
});
