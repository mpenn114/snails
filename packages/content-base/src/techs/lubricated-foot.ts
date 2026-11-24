import type { TechnologyDefinition } from '@snails/core';

/** Lubricated Foot (docs/technology-research.md): Move budget +3 s; crawl speed +15%. */
export const lubricatedFoot: TechnologyDefinition = {
  id: 'lubricated-foot',
  name: 'Lubricated Foot',
  branch: 'mobility',
  tier: 1,
  cost: 20,
  researchTurns: 1,
  prerequisites: [],
  description: 'Move budget +3 s; crawl speed +15%.',
  effects: [
    {
      type: 'modifyStat',
      stat: 'moveBudgetSeconds',
      op: 'add',
      value: 3,
    },
    {
      type: 'modifyStat',
      stat: 'crawlSpeed',
      op: 'mul',
      value: 1.15,
    },
  ],
};
