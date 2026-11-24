import type { ControllerClient } from '../net/client';

/** Joystick offset (px) along X below which no steering is sent. */
export const STEER_DEADZONE = 10;

/** Minimal weapon shape needed to know whether a weapon is guided. */
export interface GuidedWeaponLike {
  id: string;
  motion?: { kind: string } | undefined;
}

/**
 * Maps a horizontal thumb offset to a steering input in -1..1 (negative = left, positive =
 * right), with a dead zone and a full-deflection `radius` (both px). The sign is the wire
 * convention of `steer`: positive turns the missile clockwise as seen side-on.
 */
export function stickToSteer(dx: number, radius: number, deadzone = STEER_DEADZONE): number {
  if (radius <= deadzone) return 0;
  if (Math.abs(dx) < deadzone) return 0;
  const v = (Math.abs(dx) - deadzone) / (radius - deadzone);
  return Math.sign(dx) * Math.min(1, Math.max(0, v));
}

/** Ids of the guided weapons in `weapons`. */
export function guidedWeaponIds(weapons: readonly GuidedWeaponLike[]): Set<string> {
  return new Set(weapons.filter((w) => w.motion?.kind === 'guided').map((w) => w.id));
}

/** True when any wire projectile `[id, weaponId, ...]` is of a guided weapon. */
export function hasGuidedProjectile(
  projectiles: readonly (readonly [string, string, ...unknown[]])[],
  guided: ReadonlySet<string>,
): boolean {
  return projectiles.some((p) => guided.has(p[1]));
}

/**
 * Tracks from snapshots whether a guided projectile is in flight. While it is, the joystick
 * steers it (the controls only send during my turn, and only the active team can have a guided
 * projectile in flight).
 */
export function trackSteering(
  client: ControllerClient,
  weapons: readonly GuidedWeaponLike[],
): { active: () => boolean; dispose: () => void } {
  const guided = guidedWeaponIds(weapons);
  let active = false;
  const off = client.on('snapshot', (s) => {
    active = hasGuidedProjectile(s.projectiles, guided);
  });
  return { active: () => active, dispose: off };
}
