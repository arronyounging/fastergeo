/**
 * @fastergeo/tickets — Diagnosis → tickets → machine verification.
 *
 * The line between "a service" and "advice": whatever can be verified by a
 * program is never confirmed by word of mouth. Tickets carry acceptance
 * criteria; verify() re-audits and flips todo→done — and done→regressed when
 * a fix rots. Unverifiable criteria stay 'pending-manual', never auto-passed.
 */

import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';

export type Priority = 'P0' | 'P1' | 'P2';

export type TicketStatus = 'todo' | 'done' | 'regressed' | 'pending-manual';

/**
 * Machine-checkable acceptance criterion. `check` is a compact DSL:
 *   site.llms_txt · site.sitemap · site.no_ai_block
 *   site.avg_score_gte:<n> · pages.no_blockers
 *   pages.issue_lte:<code>:<n>   (pages carrying <code> drops to ≤ n)
 *   metrics.mention_rate_gte:<market>:<x>
 *   metrics.no_confusion:<market>
 */
export interface AutoAcceptance {
  type: 'auto';
  check: string;
  desc: string;
}

export interface ManualAcceptance {
  type: 'manual';
  desc: string;
}

export interface Ticket {
  id: string;
  title: string;
  priority: Priority;
  market?: 'cn' | 'global' | 'both';
  /** Why this ticket exists — issue codes / evidence quotes it traces to. */
  rationale: string;
  acceptance: AutoAcceptance | ManualAcceptance;
  status: TicketStatus;
  /** Baseline measurement at generation time, for progress display. */
  baseline?: number;
  history: Array<{ at: string; from: TicketStatus; to: TicketStatus; note: string }>;
}

/** Everything verify() can measure against. Missing inputs → unmeasurable. */
export interface VerifyContext {
  audit?: SiteAudit;
  metrics?: MetricsReport;
}

export interface TicketVerdict {
  ticketId: string;
  outcome: 'pass' | 'fail' | 'unmeasurable' | 'manual';
  detail: string;
}

export interface VerifySummary {
  verifiedAt: string;
  verdicts: TicketVerdict[];
  transitions: Array<{ ticketId: string; from: TicketStatus; to: TicketStatus }>;
  counts: { pass: number; fail: number; unmeasurable: number; manual: number };
}
