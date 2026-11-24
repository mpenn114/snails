import type { WeaponDefinition } from '@snails/core';

/**
 * Dew Bomb: a water balloon. 5 damage (r = 3 m) and a `base:puddle` that lasts 3 turns. The
 * puddle settles into the lowest ground within its radius, drowns snails below its surface and
 * puts out salt.
 */
export const dewBomb = {
  id: 'base:dew-bomb',
  name: 'Dew Bomb',
  category: 'area',
  launch: { minSpeed: 3, maxSpeed: 18, gravityScale: 1, windScale: 0.7, projectileRadius: 0.2 },
  fuseSeconds: 0,
  effects: [
    { type: 'damage', radius: 3, maxDamage: 5, knockback: 2, falloff: 'linear' },
    { type: 'spawn', spawn: { what: 'area', areaId: 'base:puddle' } },
  ],
  ammo: 2,
} satisfies WeaponDefinition;
