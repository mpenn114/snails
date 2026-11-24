import type { WeaponDefinition } from '@snails/core';

/**
 * Beetle Barrage: a flare marks a target point and six beetle shells are called in across a
 * 12 m line centred on it (x axis, snapped to the ground). Telegraphed: the warning rings show
 * for the whole of the next turn and the shells land at the start of the turn after (2 turn
 * starts), each carving a small crater and dealing 18 damage (r = 2.5 m). Needs the
 * `beetle-calls` technology.
 */
export const beetleBarrage = {
  id: 'base:beetle-barrage',
  name: 'Beetle Barrage',
  category: 'special',
  launch: { minSpeed: 3, maxSpeed: 20, gravityScale: 1, windScale: 0.5, projectileRadius: 0.15 },
  fuseSeconds: 0,
  effects: [
    {
      type: 'schedule',
      turns: 2,
      line: { count: 6, length: 12 },
      telegraph: { radius: 2.5, style: 'strike' },
      effects: [
        { type: 'carve', radius: 1.5, power: 10 },
        { type: 'damage', radius: 2.5, maxDamage: 18, knockback: 6, falloff: 'linear' },
      ],
    },
  ],
  ammo: 1,
  requiresTech: 'beetle-calls',
} satisfies WeaponDefinition;
