import type { ControlMode } from '@snails/protocol';

/** The roster fields the start rules look at. */
export interface StartCandidate {
  ready: boolean;
  teamIds: readonly string[];
}

/**
 * Why a match cannot start yet, or `undefined` when it can.
 *
 * - `perPlayer`: every phone plays exactly one team; at least two teams.
 * - `hotSeat`: a phone may serve several teams; each phone needs at least one; at least two
 *   teams overall (a single phone may cover them all).
 * Every phone must be ready. Mirrored by the controller's `lobby-logic.ts`.
 */
export function startBlocker(
  players: readonly StartCandidate[],
  mode: ControlMode,
): string | undefined {
  if (players.some((p) => p.teamIds.length === 0)) return 'Everyone must pick a team';
  if (mode === 'perPlayer' && players.some((p) => p.teamIds.length > 1))
    return 'Each phone can play only one team';
  if (players.some((p) => !p.ready)) return 'Everyone must be ready';
  if (new Set(players.flatMap((p) => p.teamIds)).size < 2) return 'Need two teams';
  return undefined;
}
