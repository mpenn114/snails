import type { AreaDefinition } from '@snails/core';

/** Goo splat: a sticky patch; anyone in it at turn start is slowed (`base:goo`) for a turn. */
export const gooSplat = {
  id: 'base:goo-splat',
  name: 'Goo Splat',
  defaultRadius: 2.5,
  defaultTurns: 2,
  applyStatus: { statusId: 'base:goo', turns: 1 },
} satisfies AreaDefinition;

/**
 * Puddle: water, 0.9 m deep (a snail resting on the lowest ground is 0.5 m up, so it drowns).
 * Settles into the lowest terrain within its radius; snails below the surface drown and salt
 * is put out for snails touching it. Lasts 3 turns.
 */
export const puddle = {
  id: 'base:puddle',
  name: 'Puddle',
  defaultRadius: 2.5,
  defaultTurns: 3,
  waterDepth: 0.9,
  drowns: true,
  extinguishes: ['base:salt'],
} satisfies AreaDefinition;

/** Base-game lingering areas. */
export const areas: AreaDefinition[] = [gooSplat, puddle];
