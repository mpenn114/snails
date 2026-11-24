import type { WeaponDefinition } from '@snails/core';

/**
 * Radula Missile: launches, then the firing player steers it left/right with the joystick for
 * 4 s (`steer` command; the turn rate is 1.4 rad/s). It flies light (gravity 0.35) and catches
 * the wind twice as hard (`windScale` 2), so it drifts if left alone. 35 damage at the core,
 * r = 2.5 m. Two in stock.
 */
export const radulaMissile = {
  id: 'base:radula-missile',
  name: 'Radula Missile',
  category: 'guided',
  launch: { minSpeed: 6, maxSpeed: 16, gravityScale: 0.35, windScale: 2, projectileRadius: 0.2 },
  fuseSeconds: 10,
  motion: { kind: 'guided', steerRate: 1.4, guidanceSeconds: 4 },
  effects: [
    { type: 'carve', radius: 2.5, power: 35 },
    { type: 'damage', radius: 2.5, maxDamage: 35, knockback: 8, falloff: 'linear' },
  ],
  ammo: 2,
  requiresTech: 'radula-guidance',
} satisfies WeaponDefinition;
