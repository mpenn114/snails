import type { QualityTier } from '@snails/render';

/** One rung of the quality ladder (index 0 is the best). */
export interface QualityLevel {
  tier: QualityTier;
  /** Extra multiplier on the tier's pixel ratio. */
  pixelRatioScale: number;
  /** Frame cap in fps; 0 means uncapped (display refresh rate). */
  fpsCap: number;
}

/**
 * Quality ladder. The `mobile` tier already has shadows off, so the lower rungs trade resolution
 * and finally frame rate (a steady 30 fps beats an uneven 45).
 */
export const QUALITY_LADDER: readonly QualityLevel[] = [
  { tier: 'mobile', pixelRatioScale: 1, fpsCap: 0 },
  { tier: 'mobile', pixelRatioScale: 0.85, fpsCap: 0 },
  { tier: 'mobile', pixelRatioScale: 0.7, fpsCap: 0 },
  { tier: 'mobile', pixelRatioScale: 0.55, fpsCap: 0 },
  { tier: 'mobile', pixelRatioScale: 0.55, fpsCap: 30 },
];

/** Lowest rung, used by the battery saver. */
export const LOWEST_LEVEL = QUALITY_LADDER.length - 1;

/** Governor tuning. */
export interface GovernorOptions {
  /** Target frame rate when uncapped (default 60). */
  targetFps?: number;
  /** Rolling window of frame times in ms (default 2000). */
  windowMs?: number;
  /** p90 above budget times this steps down (default 1.25). */
  downFactor?: number;
  /** p90 at or below budget times this counts as headroom (default 1.1). */
  upFactor?: number;
  /** Sustained headroom required before stepping up, ms (default 15000). */
  upAfterMs?: number;
  /** A step down within this time after a step up doubles the next step-up wait (default 30000). */
  flapWindowMs?: number;
}

/** Result of a level change. */
export interface LevelChange {
  level: number;
  settings: QualityLevel;
}

/** Returns the p-th percentile (0..1) of values using the nearest-rank method. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

/**
 * Pure adaptive-quality controller. Feed it frame times; it steps down the ladder when the rolling
 * p90 misses the frame budget and steps back up after sustained headroom, with hysteresis
 * (separate thresholds, a cooldown that needs a fresh full window, and exponential back-off after
 * a step-up that had to be undone). Battery saver pins the lowest rung.
 */
export class QualityGovernor {
  private levelIdx = 0;
  private saver = false;
  private samples: { t: number; dt: number }[] = [];
  private headroomSince: number | null = null;
  private windowStart = 0;
  private upWaitMultiplier = 1;
  private lastUpAt = -Infinity;
  private readonly o: Required<GovernorOptions>;

  constructor(options: GovernorOptions = {}) {
    this.o = {
      targetFps: options.targetFps ?? 60,
      windowMs: options.windowMs ?? 2000,
      downFactor: options.downFactor ?? 1.25,
      upFactor: options.upFactor ?? 1.1,
      upAfterMs: options.upAfterMs ?? 15000,
      flapWindowMs: options.flapWindowMs ?? 30000,
    };
  }

  /** Current ladder index. */
  get level(): number {
    return this.levelIdx;
  }

  /** Current level settings (lowest rung while battery saver is on). */
  get settings(): QualityLevel {
    return QUALITY_LADDER[this.saver ? LOWEST_LEVEL : this.levelIdx] ?? QUALITY_LADDER[0]!;
  }

  /** Effective fps cap: 30 under battery saver, else the level's cap (0 = uncapped). */
  get fpsCap(): number {
    return this.saver ? 30 : this.settings.fpsCap;
  }

  /** Whether battery saver is on. */
  get batterySaver(): boolean {
    return this.saver;
  }

  /** Enables or disables battery saver; returns the level change to apply, if any. */
  setBatterySaver(on: boolean, nowMs: number): LevelChange | null {
    if (on === this.saver) return null;
    this.saver = on;
    this.resetWindow(nowMs);
    return this.change();
  }

  /** Forgets collected samples (call after the page was hidden). */
  resetWindow(nowMs: number): void {
    this.samples = [];
    this.headroomSince = null;
    this.windowStart = nowMs;
  }

  /**
   * Records one frame time (ms between frames) observed at `nowMs`. Returns the new level when
   * a step happened, else null.
   */
  pushFrame(dtMs: number, nowMs: number): LevelChange | null {
    if (this.saver) return null;
    this.samples.push({ t: nowMs, dt: dtMs });
    const cutoff = nowMs - this.o.windowMs;
    while (this.samples.length > 0 && (this.samples[0]?.t ?? 0) < cutoff) this.samples.shift();
    if (nowMs - this.windowStart < this.o.windowMs) return null;
    const p90 = percentile(
      this.samples.map((s) => s.dt),
      0.9,
    );
    const cap = this.settings.fpsCap;
    const budget = 1000 / (cap > 0 ? Math.min(cap, this.o.targetFps) : this.o.targetFps);
    if (p90 > budget * this.o.downFactor) return this.stepDown(nowMs);
    if (p90 <= budget * this.o.upFactor) return this.considerStepUp(nowMs);
    this.headroomSince = null;
    return null;
  }

  private stepDown(nowMs: number): LevelChange | null {
    if (nowMs - this.lastUpAt < this.o.flapWindowMs) {
      this.upWaitMultiplier = Math.min(8, this.upWaitMultiplier * 2);
    }
    this.headroomSince = null;
    if (this.levelIdx >= LOWEST_LEVEL) return null;
    this.levelIdx++;
    this.resetWindow(nowMs);
    return this.change();
  }

  private considerStepUp(nowMs: number): LevelChange | null {
    if (this.levelIdx === 0) return null;
    this.headroomSince ??= nowMs;
    if (nowMs - this.headroomSince < this.o.upAfterMs * this.upWaitMultiplier) return null;
    this.levelIdx--;
    this.lastUpAt = nowMs;
    this.resetWindow(nowMs);
    return this.change();
  }

  private change(): LevelChange {
    return { level: this.saver ? LOWEST_LEVEL : this.levelIdx, settings: this.settings };
  }
}
