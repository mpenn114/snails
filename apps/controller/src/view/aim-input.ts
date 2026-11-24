import type { AimHintInput } from '@snails/render';
import type { WeaponDefinition } from '@snails/core';

/** Aim used before the player has dragged this turn and the snapshot knows none. */
export const DEFAULT_LOCAL_AIM = { angle: 0.4, power: 0.6 } as const;

/** Where the aim of a snail comes from, best first: the local drag, the snapshot, the default. */
export function resolveAim(
  local: { angle: number; power: number } | null,
  snapshotAim: { angle: number; power: number } | undefined,
): { angle: number; power: number } {
  return local ?? snapshotAim ?? DEFAULT_LOCAL_AIM;
}

/**
 * Aim-hint input for the local player's snail from the selected weapon's own data (launch
 * spec, motion, melee reach), so drills, melee and missiles preview like they fly. Null when
 * the weapon is unknown or not an attack that has a trajectory (utilities).
 */
export function aimHintInput(
  snailId: string,
  weapon: Pick<WeaponDefinition, 'launch' | 'motion' | 'melee' | 'category'> | undefined,
  aim: { angle: number; power: number },
): AimHintInput | null {
  if (!weapon || weapon.category === 'utility') return null;
  return {
    snailId,
    launch: weapon.launch,
    ...(weapon.motion ? { motion: weapon.motion } : {}),
    ...(weapon.melee ? { melee: weapon.melee } : {}),
    angle: aim.angle,
    power: aim.power,
  };
}
