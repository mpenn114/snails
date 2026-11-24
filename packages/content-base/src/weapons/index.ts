import type { WeaponDefinition } from '@snails/core';
import { pebbleToss } from './pebble-toss.js';
import { saltShaker } from './salt-shaker.js';

export { pebbleToss, saltShaker };

/**
 * Base-game weapons in picker order (the first is the default). To add a weapon: create
 * `weapons/<name>.ts` exporting a `satisfies WeaponDefinition` constant, then export it above
 * and list it here.
 */
export const weapons: WeaponDefinition[] = [pebbleToss, saltShaker];
