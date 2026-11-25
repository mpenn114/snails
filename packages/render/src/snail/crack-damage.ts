/** Crack state of a snail shell, by health ratio (see docs/snail-visuals.md "Health damage"). */
export type CrackState = 'pristine' | 'scratched' | 'cracked' | 'critical';

/**
 * Crack state for a health ratio `health / maxHealth`: above 75% pristine, above 50% scratched,
 * above 25% cracked, otherwise critical. Out-of-range ratios are clamped by the comparisons.
 */
export function crackStateFor(ratio: number): CrackState {
  if (ratio > 0.75) return 'pristine';
  if (ratio > 0.5) return 'scratched';
  if (ratio > 0.25) return 'cracked';
  return 'critical';
}

/** Time constant scale (s) of the displayed-damage easing; it settles in about this long. */
export const DAMAGE_EASE_SECONDS = 0.5;

/** Damage (0 intact .. 1 destroyed) for a health ratio; gaining max health only ever lowers it. */
export function damageForRatio(ratio: number): number {
  return 1 - Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 1));
}

/** Moves the displayed damage toward `target` over ~{@link DAMAGE_EASE_SECONDS}, snapping when close. */
export function easeDamage(current: number, target: number, dt: number): number {
  if (dt <= 0) return current;
  const next = current + (target - current) * (1 - Math.exp((-6 * dt) / DAMAGE_EASE_SECONDS));
  return Math.abs(target - next) < 0.002 ? target : next;
}
