import type { TechnologyDefinition } from '@snails/core';

/** Weather Vane (docs/technology-research.md): Next turn's wind is shown in advance. */
export const weatherVane: TechnologyDefinition = {
  id: 'weather-vane',
  name: 'Weather Vane',
  branch: 'utility',
  tier: 1,
  cost: 20,
  researchTurns: 1,
  prerequisites: [],
  description: "Next turn's wind is shown in advance.",
  effects: [
    {
      type: 'setFlag',
      flag: 'seeNextWind',
    },
  ],
  visual: { attachments: ['antenna'] },
};
