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

/**
 * Research race rule: with `state.raceCapstones` set, the first team that has completed any of
 * them wins (teams are checked in order, so a same-step tie goes to the earlier team).
 */
export function evaluateResearchRace(state: GameState): MatchStatus {
  const caps = state.raceCapstones;
  const winner = caps && state.teams.find((t) => t.researched.some((id) => caps.includes(id)));
  if (!winner) return { status: 'playing', winnerTeamId: null };
  return { status: 'won', winnerTeamId: winner.id, reason: 'research' };
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

/**
 * Draw rule for a simultaneous elimination (no team has a living snail): the team that dealt
 * the most damage to other teams during the final turn (`state.turn.damageDealt`) wins; a tie
 * for most, or no damage at all, is a draw. Any other status passes through unchanged.
 */
export function resolveDraw(state: GameState, status: MatchStatus): MatchStatus {
  if (status.status !== 'draw') return status;
  let best: string | null = null;
  let bestDamage = 0;
  let tied = false;
  for (const [teamId, damage] of Object.entries(state.turn.damageDealt ?? {})) {
    if (damage > bestDamage) {
      best = teamId;
      bestDamage = damage;
      tied = false;
    } else if (damage === bestDamage && damage > 0) {
      tied = true;
    }
  }
  if (best === null || tied) return status;
  return { status: 'won', winnerTeamId: best };
}
