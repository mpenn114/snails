import type { WeaponDefinition } from '@snails/core';
import { beetleBarrage } from './beetle-barrage.js';
import { dewBomb } from './dew-bomb.js';
import { pebbleRoller } from './pebble-roller.js';
import { pebbleToss } from './pebble-toss.js';
import { radulaMissile } from './radula-missile.js';
import { saltShaker } from './salt-shaker.js';
import { shellDrill } from './shell-drill.js';
import { slimeGrenade } from './slime-grenade.js';
import { snailMail } from './snail-mail.js';
import { sporeCloud } from './spore-cloud.js';

export {
  beetleBarrage,
  dewBomb,
  pebbleRoller,
  pebbleToss,
  radulaMissile,
  saltShaker,
  shellDrill,
  slimeGrenade,
  snailMail,
  sporeCloud,
};

/**
 * Base-game weapons in picker order (the first is the default). To add a weapon: create
 * `weapons/<name>.ts` exporting a `satisfies WeaponDefinition` constant, then export it above
 * and list it here.
 */
export const weapons: WeaponDefinition[] = [
  pebbleToss,
  saltShaker,
  slimeGrenade,
  pebbleRoller,
  radulaMissile,
  dewBomb,
  shellDrill,
  sporeCloud,
  beetleBarrage,
  snailMail,
];
