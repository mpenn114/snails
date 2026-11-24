import type { WeaponDefinition } from '../content/types.js';
import type { MatchOptions } from './match.js';

/** Weapon used by headless full-match tests. */
export const PEBBLE: WeaponDefinition = {
  id: 'test:pebble-toss',
  name: 'Pebble Toss',
  category: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 22, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  effects: [
    { type: 'carve', radius: 4 },
    { type: 'damage', radius: 4, maxDamage: 45, knockback: 6, falloff: 'linear' },
  ],
  ammo: 'infinite',
};

/** Standard two-team test match options. */
export function testMatchOptions(seed: number): MatchOptions {
  return {
    seed,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1', 'A2'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1', 'B2'] },
    ],
    terrain: { nx: 64, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false, baseHeight: 8 },
    turn: { introDuration: 0.5, retreatDuration: 0.5, maxTurns: 60 },
    weapons: [PEBBLE],
  };
}
