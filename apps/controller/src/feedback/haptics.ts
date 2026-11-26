import type { Cue } from './cues';

/** Vibration patterns in ms (on/off alternating) per cue kind. */
export const HAPTIC_PATTERNS: Readonly<Record<Cue['kind'], number[]>> = {
  turnStart: [80, 60, 80, 60, 160],
  fire: [40],
  damage: [120, 40, 60],
  explosion: [200],
  tick: [15],
  select: [8],
  click: [6],
};

/** Environment for haptics (injectable). */
export interface HapticsEnv {
  /** `navigator.vibrate`, absent on iOS and desktop. */
  vibrate?: (pattern: number[]) => boolean;
  /** Whether `prefers-reduced-motion: reduce` is set. */
  reducedMotion: () => boolean;
}

/** Plays a vibration for own cues; returns true if one was issued. Never throws. */
export function playHaptic(cue: Cue, env: HapticsEnv): boolean {
  if (!cue.own || !env.vibrate) return false;
  try {
    if (env.reducedMotion()) return false;
    return env.vibrate(HAPTIC_PATTERNS[cue.kind]);
  } catch {
    return false;
  }
}

/** Builds the browser environment, feature-detected. */
export function browserHapticsEnv(nav: Navigator, win: Window): HapticsEnv {
  const v = (nav as Navigator & { vibrate?: (p: number[]) => boolean }).vibrate;
  return {
    vibrate: typeof v === 'function' ? (p) => v.call(nav, p) : undefined,
    reducedMotion: () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}
