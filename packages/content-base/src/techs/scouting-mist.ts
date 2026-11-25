import type { TechnologyDefinition } from '@snails/core';

/** Scouting Mist (docs/technology-research.md): See opponents' queued research. */
export const scoutingMist: TechnologyDefinition = {
  id: 'scouting-mist',
  name: 'Scouting Mist',
  branch: 'utility',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: ['eye-stalk-optics'],
  description: "See opponents' queued research.",
  effects: [
    {
      type: 'setFlag',
      flag: 'seeOpponentResearch',
    },
  ],
  visual: { glow: 'eye-glow', attachments: ['antenna'] },
};
