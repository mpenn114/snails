import type { WeaponDefinition } from '@snails/core';
import { dewBomb } from './dew-bomb.js';
import { pebbleToss } from './pebble-toss.js';
import { radulaMissile } from './radula-missile.js';
import { saltShaker } from './salt-shaker.js';
import { slimeGrenade } from './slime-grenade.js';

export { dewBomb, pebbleToss, radulaMissile, saltShaker, slimeGrenade };

/**
 * Base-game weapons in picker order (the first is the default). To add a weapon: create
 * `weapons/<name>.ts` exporting a `satisfies WeaponDefinition` constant, then export it above
 * and list it here.
 */
export const weapons: WeaponDefinition[] = [
  pebbleToss,
  saltShaker,
  slimeGrenade,
  dewBomb,
  radulaMissile,
];
