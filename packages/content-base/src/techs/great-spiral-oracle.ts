import type { TechnologyDefinition } from '@snails/core';

/** Great Spiral: Oracle (docs/technology-research.md): See all hidden information; steal one queued tech per round (ability data only). */
export const greatSpiralOracle: TechnologyDefinition = {
  id: 'great-spiral-oracle',
  name: 'Great Spiral: Oracle',
  branch: 'utility',
  tier: 4,
  cost: 100,
  researchTurns: 2,
  prerequisites: [],
  anyOf: ['snail-mail'],
  capstone: true,
  description: 'See all hidden information; steal one queued tech per round (ability data only).',
  effects: [
    {
      type: 'setFlag',
      flag: 'seeAll',
    },
    {
      type: 'setFlag',
      flag: 'seeNextWind',
    },
    {
      type: 'setFlag',
      flag: 'seeOpponentResearch',
    },
    {
      type: 'setFlag',
      flag: 'fullAimPreview',
    },
    {
      type: 'setFlag',
      flag: 'seeCrates',
    },
    {
      type: 'addAbility',
      abilityId: 'steal-tech',
    },
  ],
  visual: { glow: 'spiral-violet' },
};
