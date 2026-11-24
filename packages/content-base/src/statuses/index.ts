import type { StatusDefinition } from '@snails/core';

/** Salt: the snail's nemesis. 4 damage at the start of each of its team's turns, for 2 turns. */
export const salt = {
  id: 'base:salt',
  name: 'Salted',
  perTurnDamage: 4,
  defaultTurns: 2,
} satisfies StatusDefinition;

/** Base-game statuses. */
export const statuses: StatusDefinition[] = [salt];
