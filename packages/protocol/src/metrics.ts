/** Default upper bounds (ms) of the latency histogram buckets; one overflow bucket follows. */
export const LATENCY_BUCKETS_MS: readonly number[] = [
  1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000,
];

/** Summary of a {@link Histogram}. */
export interface HistogramSummary {
  count: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

/**
 * Fixed-bucket histogram with O(1) memory. Percentiles are bucket upper bounds (conservative);
 * values past the last bound report the observed maximum.
 */
export class Histogram {
  private readonly counts: number[];
  private n = 0;
  private maxSeen = 0;

  /** @param bounds strictly increasing, non-empty bucket upper bounds */
  constructor(private readonly bounds: readonly number[] = LATENCY_BUCKETS_MS) {
    this.counts = new Array<number>(bounds.length + 1).fill(0);
  }

  /** Records one sample; negative or non-finite samples are ignored. */
  record(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    let i = this.bounds.findIndex((b) => value <= b);
    if (i < 0) i = this.bounds.length;
    this.counts[i] = (this.counts[i] ?? 0) + 1;
    this.n++;
    if (value > this.maxSeen) this.maxSeen = value;
  }

  /** Number of samples. */
  get count(): number {
    return this.n;
  }

  /** Value at quantile `q` in [0,1] (0 when empty). */
  percentile(q: number): number {
    if (this.n === 0) return 0;
    const rank = Math.max(1, Math.ceil(q * this.n));
    let seen = 0;
    for (let i = 0; i < this.counts.length; i++) {
      seen += this.counts[i] ?? 0;
      if (seen >= rank) return i < this.bounds.length ? (this.bounds[i] ?? 0) : this.maxSeen;
    }
    return this.maxSeen;
  }

  /** Count and p50/p90/p99/max. */
  summary(): HistogramSummary {
    return {
      count: this.n,
      p50: this.percentile(0.5),
      p90: this.percentile(0.9),
      p99: this.percentile(0.99),
      max: this.maxSeen,
    };
  }

  /** Clears all samples. */
  reset(): void {
    this.counts.fill(0);
    this.n = 0;
    this.maxSeen = 0;
  }
}

/** Events-per-second meter over a sliding window (pure; time is passed in). */
export class RateMeter {
  private stamps: number[] = [];

  /** @param windowMs sliding window length */
  constructor(private readonly windowMs = 2000) {}

  /** Records one event at `now` (ms). */
  mark(now: number): void {
    this.stamps.push(now);
    this.trim(now);
  }

  /** Events per second over the window ending at `now`. */
  rate(now: number): number {
    this.trim(now);
    return (this.stamps.length * 1000) / this.windowMs;
  }

  private trim(now: number): void {
    const cut = now - this.windowMs;
    let i = 0;
    while (i < this.stamps.length && (this.stamps[i] ?? 0) < cut) i++;
    if (i > 0) this.stamps = this.stamps.slice(i);
  }
}
