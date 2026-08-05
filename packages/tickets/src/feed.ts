import type { Ticket } from './types.js';

/**
 * The queue that survives a re-run.
 *
 * Regenerating tickets from a fresh audit and replacing the list wholesale
 * throws away the only state a user actually creates: what they have already
 * looked at, dismissed, or finished. It also means a fix that landed disappears
 * silently instead of being reported as done — which is the single most
 * valuable thing this product can say.
 *
 * So findings are merged, not replaced. Identity is `acceptance.check` rather
 * than the ticket id: the id is positional and drifts as findings come and go,
 * while the check is the semantic key — the same problem always produces the
 * same check, on this run and the next.
 *
 * The accumulating queue is also the retention mechanic. Okara's review feed
 * works because the work is still there when you come back; a queue that resets
 * every morning teaches people that nothing they did was recorded.
 */

export type FeedState = 'new' | 'seen' | 'snoozed' | 'done' | 'regressed';

export interface FeedItem extends Ticket {
  /** Stable across runs. */
  key: string;
  state: FeedState;
  firstSeen: string;
  lastSeen: string;
  /** Set when the finding cleared — the moment worth telling someone about. */
  resolvedAt?: string;
  /** Hidden until this time. */
  snoozeUntil?: string;
  /** Set when the user marked it done rather than a re-crawl confirming it. */
  doneBy?: 'owner';
  /** Regressed, but the "fix" was only ever a claim — say so differently. */
  neverVerified?: boolean;
  station?: string;
  playbook?: unknown;
}

export const feedKey = (t: { acceptance?: { check?: string; desc?: string }; title?: string }): string =>
  t.acceptance?.check || t.title || t.acceptance?.desc || 'unknown';

export interface MergeResult {
  items: FeedItem[];
  /** Findings that disappeared this run — a fix landed. */
  resolved: FeedItem[];
  /** Findings that had cleared and came back. */
  regressed: FeedItem[];
  /** Genuinely new since last run. */
  added: FeedItem[];
}

/**
 * @param prev the stored queue, including items whose findings are gone.
 * @param fresh what this run's audit produced.
 *
 * Resolved items are kept rather than deleted. "This is fixed" is a fact the
 * user earned and should be able to see; deleting it would make the queue shorter
 * and the product quieter about the only outcome it exists to produce.
 */
export function mergeFeed(prev: FeedItem[], fresh: Ticket[], now = new Date().toISOString()): MergeResult {
  const byKey = new Map(prev.map(i => [i.key, i]));
  const freshKeys = new Set(fresh.map(feedKey));
  const items: FeedItem[] = [];
  const added: FeedItem[] = [];
  const regressed: FeedItem[] = [];
  const resolved: FeedItem[] = [];

  for (const t of fresh) {
    const key = feedKey(t);
    const old = byKey.get(key);
    if (!old) {
      const item: FeedItem = { ...(t as FeedItem), key, state: 'new', firstSeen: now, lastSeen: now };
      items.push(item);
      added.push(item);
      continue;
    }
    if (old.state === 'done') {
      // It cleared and came back. Loud on purpose: the user already spent the
      // effort once, and losing it quietly is worse than never fixing it.
      //
      // But how it cleared changes what is true. A crawl-verified fix that came
      // back is a regression; a hand-marked one that the crawl never confirmed
      // was never verified in the first place, and calling it "this broke again"
      // would be telling the user something we do not know.
      const item: FeedItem = {
        ...(t as FeedItem), key, state: 'regressed',
        firstSeen: old.firstSeen, lastSeen: now,
        ...(old.doneBy === 'owner' ? { neverVerified: true } : {}),
      };
      items.push(item);
      regressed.push(item);
      continue;
    }
    // A snooze that has run out returns to the queue rather than staying hidden.
    const woke = old.state === 'snoozed' && old.snoozeUntil && old.snoozeUntil <= now;
    items.push({
      ...(t as FeedItem), key,
      state: woke ? 'seen' : old.state,
      firstSeen: old.firstSeen, lastSeen: now,
      ...(woke ? {} : old.snoozeUntil ? { snoozeUntil: old.snoozeUntil } : {}),
    });
  }

  for (const old of prev) {
    if (freshKeys.has(old.key)) continue;
    if (old.state === 'done') { items.push(old); continue; }
    const item: FeedItem = { ...old, state: 'done', resolvedAt: old.resolvedAt ?? now, lastSeen: now };
    items.push(item);
    resolved.push(item);
  }

  return { items, resolved, regressed, added };
}

export interface FeedCounts {
  unread: number; open: number; done: number; regressed: number; snoozed: number;
}

/** What the badge shows. Snoozed items are deliberately not counted. */
export function feedCounts(items: FeedItem[], now = new Date().toISOString()): FeedCounts {
  const live = items.filter(i => !(i.state === 'snoozed' && (i.snoozeUntil ?? '') > now));
  return {
    unread: live.filter(i => i.state === 'new' || i.state === 'regressed').length,
    open: live.filter(i => i.state === 'new' || i.state === 'seen' || i.state === 'regressed').length,
    done: items.filter(i => i.state === 'done').length,
    regressed: live.filter(i => i.state === 'regressed').length,
    snoozed: items.filter(i => i.state === 'snoozed' && (i.snoozeUntil ?? '') > now).length,
  };
}

const PRIORITY = { P0: 100, P1: 200, P2: 300 } as Record<string, number>;

/**
 * Queue order. Regressions first for the same reason they are reported loudly;
 * then priority; then oldest, so nothing rots at the bottom forever.
 */
export function sortFeed(items: FeedItem[], now = new Date().toISOString()): FeedItem[] {
  return items
    .filter(i => i.state !== 'done')
    .filter(i => !(i.state === 'snoozed' && (i.snoozeUntil ?? '') > now))
    .sort((a, b) =>
      (a.state === 'regressed' ? 0 : 1) - (b.state === 'regressed' ? 0 : 1)
      || (PRIORITY[a.priority] ?? 400) - (PRIORITY[b.priority] ?? 400)
      || a.firstSeen.localeCompare(b.firstSeen));
}
