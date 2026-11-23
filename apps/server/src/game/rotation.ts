import type { ControlMode } from '@snails/protocol';

/** Result of choosing the commanding player for a team's turn. */
export interface Pick {
  /** The chosen player id, or undefined for a team with no players. */
  playerId: string | undefined;
  /** Cursor to store for this team's next turn. */
  next: number;
}

/**
 * Picks which of a team's players commands this turn, rotating from `cursor` and skipping
 * players that are not connected (falls back to plain rotation if nobody is).
 */
export function pickActivePlayer(
  ids: readonly string[],
  cursor: number,
  isConnected: (id: string) => boolean,
): Pick {
  if (ids.length === 0) return { playerId: undefined, next: cursor };
  for (let i = 0; i < ids.length; i++) {
    const idx = (cursor + i) % ids.length;
    const id = ids[idx] as string;
    if (isConnected(id)) return { playerId: id, next: (idx + 1) % ids.length };
  }
  const idx = cursor % ids.length;
  return { playerId: ids[idx] as string, next: (idx + 1) % ids.length };
}

/**
 * Whether `playerId` may command the active team.
 * `perPlayer`: only the rotating active player; `hotSeat`: any player bound to the team.
 */
export function mayCommandTurn(
  mode: ControlMode,
  teamPlayers: readonly string[],
  activePlayerId: string | undefined,
  playerId: string,
): boolean {
  if (!teamPlayers.includes(playerId)) return false;
  return mode === 'hotSeat' || activePlayerId === undefined || activePlayerId === playerId;
}
