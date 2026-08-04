import type { Ticket } from './types.js';

/**
 * Which three things to put in front of someone today.
 *
 * `tickets.slice(0, 3)` was the previous answer and it is wrong in two ways: it
 * shows work already verified as done, and it buries a regression — the one
 * event that genuinely deserves to interrupt a morning — underneath whatever
 * happened to be generated first.
 *
 * The ordering is deliberately short and explainable. A ranking a user cannot
 * predict is a ranking they stop trusting, and "why is this at the top" has to
 * be answerable in one sentence: a regression, then blockers, then whatever you
 * can actually close.
 */

/** Lower sorts first. */
function rankOf(t: Ticket): number {
  // Something that was fixed and broke again. Nothing outranks this: it is the
  // only item where the user already spent effort and is now losing it.
  if (t.status === 'regressed') return 0;

  const byPriority = { P0: 100, P1: 200, P2: 300 }[t.priority] ?? 400;

  // Machine-verifiable work gets a nudge over manual work of the same priority.
  // Not because it matters more, but because the user finds out whether it
  // worked — an unverifiable fix leaves them exactly as uncertain as before.
  const verifiable = t.acceptance?.type === 'auto' ? 0 : 20;

  // A ticket that already says where and how to fix it is one a person can
  // start now; one that does not needs a research step first.
  const actionable = t.fixHint ? 0 : 8;

  // Waiting on a human decision sits below work that can just be done.
  const blocked = t.status === 'pending-manual' ? 40 : 0;

  return byPriority + verifiable + actionable + blocked;
}

export interface RankedTickets {
  /** What to put in front of someone right now. */
  today: Ticket[];
  /** Everything still open, ranked. */
  open: Ticket[];
  counts: { done: number; regressed: number; open: number; all: number };
}

/**
 * @param limit how many to surface as "today". Three is the default because a
 *   list of fourteen is read as a backlog and actioned as nothing.
 */
export function rankTickets(tickets: Ticket[], limit = 3): RankedTickets {
  const all = tickets ?? [];
  // Verified-done work leaves the queue entirely. Keeping it visible turns the
  // list into a changelog, and the point of this list is what to do next.
  const open = all.filter(t => t.status !== 'done')
    .map((t, i) => ({ t, i, r: rankOf(t) }))
    // Stable within a rank: generation order already encodes empirical impact
    // weighting, so ties keep it rather than reshuffling arbitrarily.
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map(x => x.t);
  return {
    today: open.slice(0, limit),
    open,
    counts: {
      done: all.filter(t => t.status === 'done').length,
      regressed: all.filter(t => t.status === 'regressed').length,
      open: open.length,
      all: all.length,
    },
  };
}
