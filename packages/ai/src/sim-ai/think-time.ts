/** Percentile summary of think times in milliseconds. */
export interface ThinkTimeStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Nearest-rank percentile of an ascending array. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] as number;
}

/** p50, p95, p99 and max (nearest rank) of `times`; all zero for an empty array. */
export function thinkTimeStats(times: readonly number[]): ThinkTimeStats {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? (sorted[sorted.length - 1] as number) : 0,
  };
}
