import type { ShellUpgradeDefinition, TechnologyDefinition } from '@snails/core';

/** Base-game technologies. */
export const technologies: TechnologyDefinition[] = [
  {
    id: 'salt-refinery',
    name: 'Salt Refinery',
    branch: 'weaponry',
    tier: 1,
    cost: 20,
    prerequisites: [],
    description: 'Refines salt for the Salt Shaker.',
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
  {
    id: 'beetle-callers',
    name: 'Beetle Callers',
    branch: 'weaponry',
    tier: 3,
    cost: 60,
    prerequisites: ['salt-refinery'],
    description: 'Unlocks the Beetle Barrage.',
  },
  {
    id: 'snail-mail-network',
    name: 'Snail Mail Network',
    branch: 'utility',
    tier: 1,
    cost: 30,
    prerequisites: [],
    description: 'Unlocks Snail Mail.',
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
