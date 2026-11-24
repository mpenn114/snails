import type { WeaponPattern } from '../content/types.js';

/** One projectile of a (possibly clustered) shot: offsets from the aim. */
export interface PatternOffset {
  /** Added to the aim elevation, radians. */
  angle: number;
  /** Added to the facing (yaw), radians. */
  yaw: number;
}

/**
 * Offsets for each projectile of a shot. No pattern gives one centred shot. A cluster fans
 * `count` projectiles evenly across +-`spread` radians of elevation (`spread` is multiplied by
 * the aim power when `spreadByPower` is set), with a deterministic alternating yaw wobble of a
 * quarter of that fan. No randomness is involved.
 */
export function patternOffsets(pattern: WeaponPattern | undefined, power: number): PatternOffset[] {
  if (!pattern) return [{ angle: 0, yaw: 0 }];
  const half = pattern.spread * (pattern.spreadByPower === true ? power : 1);
  return Array.from({ length: pattern.count }, (_, i) => {
    const t = pattern.count === 1 ? 0 : (2 * i) / (pattern.count - 1) - 1;
    return { angle: half * t, yaw: (i % 2 === 0 ? 0.25 : -0.25) * half * Math.abs(t) };
  });
}
