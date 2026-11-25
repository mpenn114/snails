import type { Layer } from './recipes.js';

/** Seconds per bar of the music bed. */
export const BAR_SECONDS = 4;

/** Chord roots (Hz) cycled one per bar: a gentle I - vi - IV - V in C. */
export const CHORD_ROOTS: readonly number[] = [130.81, 110, 87.31, 98];

/** Pentatonic ratios used for the sparse lead notes. */
const LEAD_RATIOS: readonly number[] = [2, 2.25, 2.5, 3, 3.375, 4];

/**
 * Layers of one bar of the music bed (soft pad fifth, bass, and two sparse lead plinks).
 * Deterministic from the bar index so tests and playback agree.
 * @param bar bar counter (0-based, may exceed the chord cycle)
 * @returns layers with `delay` relative to the bar start
 */
export function musicBar(bar: number): Layer[] {
  const root = CHORD_ROOTS[
    ((bar % CHORD_ROOTS.length) + CHORD_ROOTS.length) % CHORD_ROOTS.length
  ] as number;
  const pad = (f: number): Layer => ({
    wave: 'sine',
    from: f,
    to: f,
    dur: BAR_SECONDS,
    gain: 0.05,
    filter: { type: 'lowpass', freq: 900 },
  });
  const lead = (k: number, delay: number): Layer => ({
    wave: 'triangle',
    from: root * (LEAD_RATIOS[(bar * 3 + k) % LEAD_RATIOS.length] as number),
    to: root * (LEAD_RATIOS[(bar * 3 + k) % LEAD_RATIOS.length] as number),
    dur: 1.2,
    gain: 0.035,
    delay,
  });
  return [
    pad(root),
    pad(root * 1.5),
    { wave: 'sine', from: root / 2, to: root / 2, dur: BAR_SECONDS * 0.5, gain: 0.07 },
    lead(0, 1),
    lead(1, 2.5),
  ];
}
