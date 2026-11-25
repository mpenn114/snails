/** Motion tuning derived from the reduced-motion preference. */
export interface MotionConfig {
  /** Whether reduced motion is on. */
  reduced: boolean;
  /** Multiplier for camera shake amplitude (0 disables shake). */
  shakeScale: number;
  /** Multiplier for camera smoothing time; above 1 makes pans slower and gentler. */
  panSlowdown: number;
}

/**
 * Whether reduced motion is requested: a `reducedMotion=1|true|0|false` URL param wins over the
 * media query.
 * @param search location.search string
 * @param mediaMatches result of `prefers-reduced-motion: reduce`
 */
export function resolveReducedMotion(search: string, mediaMatches: boolean): boolean {
  const v = new URLSearchParams(search).get('reducedMotion');
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return mediaMatches;
}

/**
 * Motion tuning for the camera: no shake and 2.5x slower pans when reduced.
 * @param reduced reduced-motion flag
 */
export function motionConfig(reduced: boolean): MotionConfig {
  return reduced
    ? { reduced, shakeScale: 0, panSlowdown: 2.5 }
    : { reduced, shakeScale: 1, panSlowdown: 1 };
}
