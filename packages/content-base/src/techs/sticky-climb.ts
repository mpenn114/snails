import type { TechnologyDefinition } from '@snails/core';

/** Sticky Climb (docs/technology-research.md): Climb slopes up to 80 degrees (base 50). */
export const stickyClimb: TechnologyDefinition = {
  id: 'sticky-climb',
  name: 'Sticky Climb',
  branch: 'mobility',
  tier: 1,
  cost: 25,
  researchTurns: 1,
  prerequisites: [],
  description: 'Climb slopes up to 80 degrees (base 50).',
  effects: [
    {
      type: 'modifyStat',
      stat: 'maxClimbDegrees',
      op: 'add',
      value: 30,
    },
  ],
};
