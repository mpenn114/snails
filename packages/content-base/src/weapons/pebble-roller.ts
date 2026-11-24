import type { WeaponDefinition } from '@snails/core';

/**
 * Pebble Roller: a heavy round stone that bounces and rolls (motion `bounce`) and detonates
 * only at the end of its 4 s fuse or when it touches a snail, never on terrain. 30 damage at the
 * core, r = 2.5 m. Wind barely moves it; it keeps running downhill after landing.
 */
export const pebbleRoller = {
  id: 'base:pebble-roller',
  name: 'Pebble Roller',
  category: 'bouncing',
  launch: { minSpeed: 4, maxSpeed: 18, gravityScale: 1, windScale: 0.3, projectileRadius: 0.3 },
  fuseSeconds: 4,
  motion: { kind: 'bounce', restitution: 0.45, friction: 0.2, rollDrag: 0.35 },
  effects: [
    { type: 'carve', radius: 2.2, power: 25 },
    { type: 'damage', radius: 2.5, maxDamage: 30, knockback: 8, falloff: 'linear' },
  ],
  ammo: 'infinite',
} satisfies WeaponDefinition;
