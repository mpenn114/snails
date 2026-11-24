import type { WeaponDefinition } from '@snails/core';

/**
 * Salt Shaker: a cluster of 5 salt grains fanned wider with more power. Each grain deals 8
 * damage (r = 1 m) and salts the snails it hits (`base:salt`: 4 damage per turn for 2 turns;
 * grains refresh the status, they do not stack it).
 */
export const saltShaker = {
  id: 'base:salt-shaker',
  name: 'Salt Shaker',
  category: 'projectile',
  launch: { minSpeed: 4, maxSpeed: 22, gravityScale: 1, windScale: 1.5, projectileRadius: 0.1 },
  fuseSeconds: 0,
  pattern: { count: 5, spread: 0.3, spreadByPower: true },
  effects: [
    { type: 'carve', radius: 0.8 },
    { type: 'damage', radius: 1, maxDamage: 8, knockback: 2, falloff: 'linear' },
    { type: 'status', statusId: 'base:salt', radius: 1, turns: 2 },
  ],
  ammo: 'infinite',
} satisfies WeaponDefinition;
