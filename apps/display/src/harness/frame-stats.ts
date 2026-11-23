/** Rolling frame-time statistics: smoothed FPS and 1% low FPS. */
export interface FrameStats {
  /** Records one frame duration in milliseconds. */
  record(frameMs: number): void;
  /** Exponentially smoothed frames per second. */
  readonly fps: number;
  /** FPS implied by the average of the slowest 1% of recent frames. */
  readonly fpsLow1: number;
  /** Most recent frame time in ms. */
  readonly lastMs: number;
}

/**
 * Creates frame statistics over a ring of the last `window` frames.
 * @param window - Number of frames kept for the 1% low (default 300).
 * @param smoothing - EMA factor for the smoothed FPS in (0, 1] (default 0.1).
 */
export function createFrameStats(window = 300, smoothing = 0.1): FrameStats {
  const ring: number[] = [];
  let head = 0;
  let ema = 0;
  let last = 0;
  return {
    record(frameMs) {
      if (!(frameMs > 0)) return;
      last = frameMs;
      if (ring.length < window) ring.push(frameMs);
      else ring[head++ % window] = frameMs;
      ema = ema === 0 ? frameMs : ema + (frameMs - ema) * smoothing;
    },
    get fps() {
      return ema > 0 ? 1000 / ema : 0;
    },
    get fpsLow1() {
      if (ring.length === 0) return 0;
      const sorted = [...ring].sort((a, b) => b - a);
      const n = Math.max(1, Math.ceil(sorted.length * 0.01));
      const avg = sorted.slice(0, n).reduce((a, b) => a + b, 0) / n;
      return 1000 / avg;
    },
    get lastMs() {
      return last;
    },
  };
}
