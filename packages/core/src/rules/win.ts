import { livingSnailsOfTeam } from '../entities/snail.js';
import type { GameState, MatchStatus, Team } from '../state/types.js';

/**
 * Last-team-standing rule. Pure: returns `won` when exactly one team has living snails, `draw`
 * when no team does, and `playing` otherwise.
 */
export function evaluateMatch(state: GameState): MatchStatus {
  const alive = state.teams.filter((t) => livingSnailsOfTeam(state, t.id).length > 0);
  if (alive.length === 1) return { status: 'won', winnerTeamId: alive[0]!.id };
  if (alive.length === 0) return { status: 'draw', winnerTeamId: null };
  return { status: 'playing', winnerTeamId: null };
}

/** Sum of health over a team's living snails (dead snails count as zero). */
export function teamHealth(team: Team): number {
  return team.snails.reduce((sum, s) => (s.alive ? sum + s.health : sum), 0);
}

/**
 * Turn-limit rule. Once `state.turn.turnNumber` has reached `maxTurns`, the team with the most
 * total health wins; a tie for the most health is a draw. Returns `playing` while under the
 * limit or when `maxTurns` is undefined (unlimited).
 */
export function evaluateTurnLimit(state: GameState, maxTurns: number | undefined): MatchStatus {
  if (maxTurns === undefined || state.turn.turnNumber < maxTurns) {
    return { status: 'playing', winnerTeamId: null };
  }
  let best: Team | undefined;
  let bestHealth = -1;
  let tied = false;
  for (const team of state.teams) {
    const hp = teamHealth(team);
    if (hp > bestHealth) {
      best = team;
      bestHealth = hp;
      tied = false;
    } else if (hp === bestHealth) {
      tied = true;
    }
  }
  if (!best || tied) return { status: 'draw', winnerTeamId: null };
  return { status: 'won', winnerTeamId: best.id };
}
