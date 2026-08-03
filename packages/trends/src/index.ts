/**
 * @fastergeo/trends — Period history and attribution discipline.
 *
 * Sampling AI answers is inherently noisy. The discipline, in code:
 * - a change between two periods is an OBSERVATION, never a conclusion
 * - only two consecutive same-direction changes constitute a TREND
 * - a few high-signal events alert immediately regardless (new brand
 *   confusion, blocker counts rising) because they are deterministic
 *   findings, not sampled distributions; ticket regressions are alerted by
 *   verify itself at transition time (tickets are not part of PeriodRecord)
 */

import type { SiteAudit } from '@fastergeo/audit';
import type { MetricsReport } from '@fastergeo/metrics';

export interface PeriodRecord {
  /** ISO date, e.g. '2026-08-02'. One record per period. */
  date: string;
  metrics?: MetricsReport;
  audit?: SiteAudit;
}

export type Direction = 'up' | 'down' | 'flat';

export type TrendVerdict =
  | { kind: 'trend'; direction: 'up' | 'down' }
  | { kind: 'observation'; direction: Direction }
  | { kind: 'insufficient' };

export interface MetricDelta {
  key: string;                       // e.g. 'doubao.mentionRate' | 'site.avgScore'
  market?: 'cn' | 'global';
  prev: number | null;
  curr: number | null;
  direction: Direction;
  verdict: TrendVerdict;
}

export interface Alert {
  level: 'P0' | 'warn';
  message: string;
}

export interface TrendReport {
  periods: string[];
  deltas: MetricDelta[];
  alerts: Alert[];
}

const EPS = 1e-9;

function dirOf(prev: number, curr: number): Direction {
  if (curr > prev + EPS) return 'up';
  if (curr < prev - EPS) return 'down';
  return 'flat';
}

/**
 * Assess a metric series (oldest → newest) under the two-period rule.
 * A trend requires the last two changes to be the same non-flat direction.
 */
export function assessTrend(series: Array<number | null>): TrendVerdict {
  const vals = series.filter((v): v is number => v !== null);
  if (vals.length < 2) return { kind: 'insufficient' };
  const last = dirOf(vals[vals.length - 2], vals[vals.length - 1]);
  if (vals.length < 3) return { kind: 'observation', direction: last };
  const prev = dirOf(vals[vals.length - 3], vals[vals.length - 2]);
  if (last !== 'flat' && last === prev) return { kind: 'trend', direction: last };
  return { kind: 'observation', direction: last };
}

/** Extract a named metric series across periods. */
function series(
  periods: PeriodRecord[],
  pick: (p: PeriodRecord) => number | null | undefined,
): Array<number | null> {
  return periods.map(p => pick(p) ?? null);
}

export type TrendLang = 'en' | 'zh';

const AL = {
  en: {
    newConfusion: (id: string) => `New brand confusion: ${id} started misattributing the brand this period (none last period)`,
    blockersUp: (a: number, b: number) => `Blocker count rising: ${a} → ${b} (ticket problems regressed)`,
    mentionDrop: (key: string, pp: string) => `${key} dropped ${pp}pp — single-period changes are observations by default; wait for two consecutive periods before concluding`,
  },
  zh: {
    newConfusion: (id: string) => `新增张冠李戴：${id} 本期开始把品牌归错（上期无）`,
    blockersUp: (a: number, b: number) => `Blocker 数量上升：${a} → ${b}（门票问题回归）`,
    mentionDrop: (key: string, pp: string) => `${key} 下降 ${pp}pp — 单期波动默认只作观察，连续两期再定性`,
  },
} as const;

export function computeTrends(periodsInput: PeriodRecord[], lang: TrendLang = 'en'): TrendReport {
  const A = AL[lang];
  const periods = [...periodsInput].sort((a, b) => a.date.localeCompare(b.date));
  const deltas: MetricDelta[] = [];
  const alerts: Alert[] = [];
  const last = periods[periods.length - 1];
  const prev = periods[periods.length - 2];

  const addDelta = (
    key: string,
    s: Array<number | null>,
    market?: 'cn' | 'global',
  ): void => {
    const curr = s[s.length - 1];
    const pv = s.length >= 2 ? s[s.length - 2] : null;
    deltas.push({
      key,
      market,
      prev: pv,
      curr,
      direction: pv !== null && curr !== null ? dirOf(pv, curr) : 'flat',
      verdict: assessTrend(s),
    });
  };

  // Site score
  if (periods.some(p => p.audit)) {
    addDelta('site.avgScore', series(periods, p => p.audit?.avgScore));
  }

  // Per-platform mention rate + own-domain citation rate
  const platformIds = new Set<string>();
  for (const p of periods) for (const pl of p.metrics?.platforms ?? []) platformIds.add(pl.providerId);
  for (const id of platformIds) {
    const find = (p: PeriodRecord) => p.metrics?.platforms.find(x => x.providerId === id);
    const market = find(last)?.market ?? find(periods[0])?.market;
    addDelta(`${id}.mentionRate`, series(periods, p => find(p)?.mentionRate), market);
    addDelta(`${id}.ownDomainCiteRate`, series(periods, p => find(p)?.ownDomainCiteRate), market);
  }

  // ── Immediate alerts (deterministic findings, not sampled noise) ─────────
  if (prev && last) {
    const confusedBy = (p: PeriodRecord): Set<string> =>
      new Set((p.metrics?.platforms ?? [])
        .filter(x => (x.probe?.recognition.confused ?? 0) > 0)
        .map(x => x.providerId));
    const before = confusedBy(prev);
    for (const id of confusedBy(last)) {
      if (!before.has(id)) {
        alerts.push({ level: 'P0', message: A.newConfusion(id) });
      }
    }

    const blockersOf = (p: PeriodRecord): number =>
      (p.audit?.pages ?? []).reduce((a, x) => a + x.blockers.length, 0) + (p.audit?.blockers.length ?? 0);
    if (blockersOf(last) > blockersOf(prev)) {
      alerts.push({ level: 'P0', message: A.blockersUp(blockersOf(prev), blockersOf(last)) });
    }

    // Mention-rate drop >10pp — flagged as observation-level warning
    for (const d of deltas) {
      if (d.key.endsWith('.mentionRate') && d.prev !== null && d.curr !== null && d.prev - d.curr > 0.1) {
        alerts.push({
          level: 'warn',
          message: A.mentionDrop(d.key, ((d.prev - d.curr) * 100).toFixed(0)),
        });
      }
    }
  }

  return { periods: periods.map(p => p.date), deltas, alerts };
}
