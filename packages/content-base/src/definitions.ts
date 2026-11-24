import type { ShellUpgradeDefinition } from '@snails/core';

/** Base-game shell upgrades. */
export const shellUpgrades: ShellUpgradeDefinition[] = [
  {
    id: 'calcified-shell',
    name: 'Calcified Shell',
    armor: 5,
    material: 'chalk',
    requiresTech: 'calcified-shell',
  },
  { id: 'iron-spiral', name: 'Iron Spiral', armor: 10, material: 'iron' },
];
