import type { WeaponDefinition } from '@snails/core';

/**
 * Shell Bash: a headbutt with the shell. Melee delivery: no projectile; the effects run 1 m in
 * front of the snail along its facing, and the attacker is never hurt. 20 damage and a heavy
 * shove (12 m/s, enough to send an enemy off a shore into the water). `announce: false` keeps
 * the blast visuals and scorch off; clients show a small puff for the `meleeStruck` event.
 * `launch` is unused for melee and only satisfies the schema.
 */
export const shellBash = {
  id: 'base:shell-bash',
  name: 'Shell Bash',
  category: 'melee',
  launch: { minSpeed: 1, maxSpeed: 1, gravityScale: 0, windScale: 0, projectileRadius: 0.1 },
  fuseSeconds: 0,
  melee: { reach: 1 },
  effects: [
    {
      type: 'damage',
      radius: 1.2,
      maxDamage: 20,
      knockback: 12,
      falloff: 'linear',
      announce: false,
    },
  ],
  ammo: 'infinite',
} satisfies WeaponDefinition;
