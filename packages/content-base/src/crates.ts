import type { CrateDefinition } from '@snails/core';

/** Base-game crate kinds (drop gameplay lives in core). `weight` is the relative drop chance. */
export const crates: CrateDefinition[] = [
  {
    id: 'base:health-crate',
    name: 'Health Crate',
    kind: 'health',
    weight: 4,
    contents: { heal: 25 },
  },
  {
    id: 'base:calcium-crate',
    name: 'Calcium Crate',
    kind: 'calcium',
    weight: 3,
    contents: { calcium: 10 },
  },
  {
    id: 'base:supply-crate',
    name: 'Supply Crate',
    kind: 'supply',
    weight: 5,
    contents: { weapons: [{ weaponId: 'base:salt-shaker', count: 2 }] },
  },
];
