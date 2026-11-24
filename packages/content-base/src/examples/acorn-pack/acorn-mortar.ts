import type { WeaponDefinition } from '@snails/core';

/**
 * Acorn Mortar, the extensibility example weapon (docs/extensibility.md): a high-arcing bouncing
 * acorn that bursts after a 2.5 s fuse into a small cluster of 3 shots that spread salt. It is built
 * only from existing effects and motions and is NOT part of the base game.
 */
export const acornMortar = {
  id: 'acorn:acorn-mortar',
  name: 'Acorn Mortar',
  category: 'bouncing',
  launch: { minSpeed: 6, maxSpeed: 20, gravityScale: 1.2, windScale: 0.6, projectileRadius: 0.25 },
  fuseSeconds: 2.5,
  pattern: { count: 3, spread: 0.2 },
  motion: { kind: 'bounce', restitution: 0.55, friction: 0.15 },
  effects: [
    { type: 'carve', radius: 1.2, power: 15 },
    { type: 'damage', radius: 1.6, maxDamage: 14, knockback: 4, falloff: 'linear' },
    { type: 'status', statusId: 'base:salt', radius: 1.6, turns: 2 },
  ],
  ammo: 'infinite',
} satisfies WeaponDefinition;
