import type { TechnologyDefinition } from '@snails/core';

/** Great Spiral: Citadel (docs/technology-research.md): A full-health snail ignores the first hit each turn. */
export const greatSpiralCitadel: TechnologyDefinition = {
  id: 'great-spiral-citadel',
  name: 'Great Spiral: Citadel',
  branch: 'shell',
  tier: 4,
  cost: 100,
  researchTurns: 2,
  prerequisites: [],
  anyOf: ['crystal-lattice', 'regrowth'],
  capstone: true,
  description: 'A full-health snail ignores the first hit each turn.',
  effects: [
    {
      type: 'setFlag',
      flag: 'citadelShield',
    },
  ],
  visual: { glow: 'spiral-blue' },
};
