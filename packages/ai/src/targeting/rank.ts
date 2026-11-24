import { livingSnails, type GameState, type Snail } from '@snails/core';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './weights.js';

/** A ranked target. */
export interface RankedTarget {
  snailId: string;
  value: number;
}

function armour(s: Snail): number {
  const id = s.shell.upgradeId;
  if (id === null) return 1;
  if (/crystal/i.test(id)) return 0.4;
  if (/iron|calcified/i.test(id)) return 0.7;
  return 0.9;
}

/**
 * Ranks living enemies of `teamId` by `threat x killChance x resourceValue`. Threat grows with
 * the owning team's researched techs and weapon stock; kill chance with missing health; armoured
 * shells are deprioritised; resource value is 1 plus the revenge bonus. Sorted descending,
 * ties broken by snail id.
 */
export function rankTargets(
  state: GameState,
  teamId: string,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): RankedTarget[] {
  const out: RankedTarget[] = [];
  for (const s of livingSnails(state)) {
    if (s.teamId === teamId) continue;
    const team = state.teams.find((t) => t.id === s.teamId);
    const stock = Object.values(team?.inventory ?? {}).filter((n) => n > 0).length;
    const threat = 1 + 0.2 * (team?.researched.length ?? 0) + 0.05 * stock;
    const killChance = (1 - 0.8 * (s.health / Math.max(1, s.maxHealth))) * armour(s);
    const rv = weights.revenge;
    const resource = rv && (rv.snailId === s.id || rv.teamId === s.teamId) ? rv.factor : 1;
    out.push({ snailId: s.id, value: threat * killChance * resource });
  }
  return out.sort((a, b) => b.value - a.value || (a.snailId < b.snailId ? -1 : 1));
}
