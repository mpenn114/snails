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
