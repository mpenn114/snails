import type { ShellUpgradeDefinition, TechnologyDefinition, WeaponDefinition } from '@snails/core';

/** Base-game weapons. Values are in metres and m/s. */
export const weapons: WeaponDefinition[] = [
  {
    id: 'base:pebble-toss',
    name: 'Pebble Toss',
    kind: 'thrown',
    launch: {
      minSpeed: 3,
      maxSpeed: 20,
      gravityScale: 1,
      windScale: 1,
      projectileRadius: 0.15,
    },
    fuseSeconds: 0,
    explosion: { radius: 2, maxDamage: 35, knockback: 6, falloff: 'linear' },
    ammo: 'infinite',
  },
  {
    id: 'base:shell-shock-rocket',
    name: 'Shell Shock Rocket',
    kind: 'projectile',
    launch: {
      minSpeed: 5,
      maxSpeed: 30,
      gravityScale: 0.6,
      windScale: 1,
      projectileRadius: 0.3,
    },
    fuseSeconds: 0,
    explosion: { radius: 3, maxDamage: 40, knockback: 10, falloff: 'linear' },
    ammo: 3,
  },
  {
    id: 'base:salt-bomb',
    name: 'Salt Bomb',
    kind: 'thrown',
    launch: {
      minSpeed: 4,
      maxSpeed: 18,
      gravityScale: 1,
      windScale: 0.5,
      projectileRadius: 0.25,
    },
    fuseSeconds: 3,
    explosion: { radius: 3.5, maxDamage: 50, knockback: 12, falloff: 'quadratic' },
    ammo: 2,
    requiresTech: 'salt-refinery',
  },
];

/** Base-game technologies. */
export const technologies: TechnologyDefinition[] = [
  {
    id: 'salt-refinery',
    name: 'Salt Refinery',
    branch: 'weaponry',
    tier: 1,
    cost: 20,
    prerequisites: [],
    description: 'Unlocks the Salt Bomb.',
  },
  {
    id: 'shell-hardening',
    name: 'Shell Hardening',
    branch: 'shell',
    tier: 1,
    cost: 25,
    prerequisites: [],
    description: 'Unlocks the Calcified Shell.',
  },
  {
    id: 'slime-trail',
    name: 'Slime Trail',
    branch: 'mobility',
    tier: 1,
    cost: 15,
    prerequisites: [],
    description: 'Climb steeper slopes.',
  },
];

/** Base-game shell upgrades. */
export const shellUpgrades: ShellUpgradeDefinition[] = [
  {
    id: 'calcified-shell',
    name: 'Calcified Shell',
    armor: 5,
    material: 'chalk',
    requiresTech: 'shell-hardening',
  },
  { id: 'iron-spiral', name: 'Iron Spiral', armor: 10, material: 'iron' },
];
