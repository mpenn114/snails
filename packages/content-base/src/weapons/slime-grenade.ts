import type { WeaponDefinition } from '@snails/core';

/**
 * Slime Grenade: a short-arc throw with a 3 s fuse. It bursts for 25 damage (r = 3 m), makes a
 * small crater and slimes every snail in range with `base:goo` (half crawl speed for one of
 * their turns), leaving a sticky `base:goo-splat` patch for 2 turns. Until a bouncing motion
 * lands, the fuse is the maximum flight time and the grenade also bursts on first contact.
 */
export const slimeGrenade = {
  id: 'base:slime-grenade',
  name: 'Slime Grenade',
  category: 'thrown',
  launch: { minSpeed: 3, maxSpeed: 16, gravityScale: 1, windScale: 0.5, projectileRadius: 0.2 },
  fuseSeconds: 3,
  effects: [
    { type: 'carve', radius: 1.5, power: 10 },
    { type: 'damage', radius: 3, maxDamage: 25, knockback: 5, falloff: 'linear' },
    { type: 'status', statusId: 'base:goo', radius: 3, turns: 2 },
    { type: 'spawn', spawn: { what: 'area', areaId: 'base:goo-splat' } },
  ],
  ammo: 3,
  requiresTech: 'sticky-slime',
} satisfies WeaponDefinition;
