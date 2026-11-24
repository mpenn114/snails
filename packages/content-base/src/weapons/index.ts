import type { WeaponDefinition } from '@snails/core';
import { pebbleToss } from './pebble-toss.js';
import { radulaMissile } from './radula-missile.js';
import { saltShaker } from './salt-shaker.js';

export { pebbleToss, radulaMissile, saltShaker };
import { dewBomb } from './dew-bomb.js';
import { slimeGrenade } from './slime-grenade.js';
import { saltShaker } from './salt-shaker.js';

export { dewBomb, pebbleToss, saltShaker, slimeGrenade };

/**
 * Base-game weapons in picker order (the first is the default). To add a weapon: create
 * `weapons/<name>.ts` exporting a `satisfies WeaponDefinition` constant, then export it above
 * and list it here.
 */
export const weapons: WeaponDefinition[] = [pebbleToss, saltShaker, radulaMissile];
export const weapons: WeaponDefinition[] = [pebbleToss, saltShaker, slimeGrenade, dewBomb];
