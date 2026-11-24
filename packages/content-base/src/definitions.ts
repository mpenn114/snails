import type { ShellUpgradeDefinition, TechnologyDefinition } from '@snails/core';

/** Legacy placeholder; the Snail Mail tech replaces it (removed by the Utility techs job). */
export const legacyTechnologies: TechnologyDefinition[] = [
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
    requiresTech: 'calcified-shell',
  },
  { id: 'iron-spiral', name: 'Iron Spiral', armor: 10, material: 'iron' },
];
