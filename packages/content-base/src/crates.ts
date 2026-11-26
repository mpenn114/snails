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
    contents: { calcium: 40 },
  },
  {
    id: 'base:supply-crate',
    name: 'Supply Crate',
    kind: 'supply',
    weight: 5,
    // Salt Shaker is tech-gated; crate stock is usable without research (3 shots).
    contents: { weapons: [{ weaponId: 'base:salt-shaker', count: 3 }] },
  },
  {
    id: 'base:utility-crate',
    name: 'Utility Crate',
    kind: 'utility',
    weight: 2,
    // Shell Drill is infinite for everyone, so a crate of it would do nothing: grant tech-gated
    // utility instead (2 Slime Rope uses and a Snail Mail), usable without research.
    contents: {
      weapons: [
        { weaponId: 'base:slime-rope', count: 2 },
        { weaponId: 'base:snail-mail', count: 1 },
      ],
    },
  },
  {
    id: 'base:mystery-crate',
    name: 'Mystery Crate',
    kind: 'mystery',
    weight: 1,
    // Random outcome: heal 30, lose 15 health, 2 Radula Missiles, or get slowed by goo.
    contents: {
      heal: 30,
      weapons: [{ weaponId: 'base:radula-missile', count: 2 }],
      statusId: 'base:goo',
    },
  },
];
