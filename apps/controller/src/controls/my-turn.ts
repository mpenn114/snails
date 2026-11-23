/** Minimal lobby player shape needed to find my team. */
export interface TeamMember {
  id: string;
  teamId: string | null;
}

/** Tracked turn state: which team's turn it is. */
export interface TurnState {
  activeTeamId: string | null;
  activeSnailId: string | null;
}

/** Returns the team id of `playerId` in the lobby roster, or null when unknown/unassigned. */
export function findMyTeam(playerId: string | null, players: readonly TeamMember[]): string | null {
  if (!playerId) return null;
  return players.find((p) => p.id === playerId)?.teamId ?? null;
}

/** True when the active turn belongs to my team. */
export function isMyTurn(myTeamId: string | null, turn: TurnState): boolean {
  return myTeamId !== null && turn.activeTeamId === myTeamId;
}
