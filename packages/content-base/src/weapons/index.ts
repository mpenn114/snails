import type { WeaponDefinition } from '@snails/core';
import { pebbleToss } from './pebble-toss.js';
import { pebbleRoller } from './pebble-roller.js';
import { saltShaker } from './salt-shaker.js';
import { shellDrill } from './shell-drill.js';

export { pebbleRoller, pebbleToss, saltShaker, shellDrill };

/**
 * Base-game weapons in picker order (the first is the default). To add a weapon: create
 * `weapons/<name>.ts` exporting a `satisfies WeaponDefinition` constant, then export it above
 * and list it here.
 */
export const weapons: WeaponDefinition[] = [pebbleToss, saltShaker, pebbleRoller, shellDrill];
