import type { WeaponDefinition } from '@snails/core';

/**
 * Spore Cloud: a mushroom spore canister. It bursts on landing (no damage, no crater) into a
 * `base:spore-cloud` area that lingers 3 turns: 6 damage per turn start to every snail within
 * r = 4 m, shell or not, while it drifts with the wind. The canister is light, so wind pushes
 * it twice as hard as a normal shell.
 */
export const sporeCloud = {
  id: 'base:spore-cloud',
  name: 'Spore Cloud',
  category: 'area',
  launch: { minSpeed: 3, maxSpeed: 18, gravityScale: 1, windScale: 2, projectileRadius: 0.2 },
  fuseSeconds: 0,
  effects: [{ type: 'spawn', spawn: { what: 'area', areaId: 'base:spore-cloud' } }],
  ammo: 2,
} satisfies WeaponDefinition;
