/**
 * Sampling statistics. Visibility is a distribution, not a point value —
 * a rate from n samples needs an interval, not false precision.
 */

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion (default 95%).
 * Preferred over the normal approximation because it behaves at the
 * extremes GEO data lives at: small n, and rates of exactly 0 or 1.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval | null {
  if (n <= 0 || successes < 0 || successes > n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}
