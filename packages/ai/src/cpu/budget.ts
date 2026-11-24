/**
 * Per-turn think-time meter. The primary limit is a deterministic work budget counted in
 * `predictImpact` calls, so the same state and config always produce the same plan. An optional
 * wall-clock deadline is an emergency stop only: when it fires the plan depends on machine speed.
 */
export class ThinkMeter {
  /** Work units (predictImpact calls) spent so far. */
  used = 0;
  /** True once the wall-clock deadline cut the planning short. */
  cutoff = false;
  private readonly deadlineAt: number | undefined;

  /**
   * @param limit - Total work units the turn may spend.
   * @param deadlineMs - Optional wall-clock emergency limit in milliseconds from now.
   */
  constructor(
    readonly limit: number,
    deadlineMs?: number,
  ) {
    this.deadlineAt = deadlineMs === undefined ? undefined : performance.now() + deadlineMs;
  }

  /** Work units still available (never negative). */
  remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  /** Records `n` work units as spent. */
  spend(n: number): void {
    this.used += n;
  }

  /** True when the emergency wall-clock deadline has passed (sticky). */
  expired(): boolean {
    if (this.deadlineAt === undefined) return false;
    if (!this.cutoff && performance.now() > this.deadlineAt) this.cutoff = true;
    return this.cutoff;
  }
}
