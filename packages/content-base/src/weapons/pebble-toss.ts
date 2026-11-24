import type { WeaponDefinition } from '@snails/core';

/** Pebble Toss: a plain stone lobbed with power control. 15 damage at the core, r = 1.5 m. */
export const pebbleToss = {
  id: 'base:pebble-toss',
  name: 'Pebble Toss',
  category: 'projectile',
  launch: { minSpeed: 3, maxSpeed: 20, gravityScale: 1, windScale: 1, projectileRadius: 0.15 },
  fuseSeconds: 0,
  effects: [
    { type: 'carve', radius: 1.5 },
    { type: 'damage', radius: 1.5, maxDamage: 15, knockback: 4, falloff: 'linear' },
  ],
  ammo: 'infinite',
} satisfies WeaponDefinition;
