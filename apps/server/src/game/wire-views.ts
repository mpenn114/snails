import type { GameState, Snail } from '@snails/core';
import type { CrateState, DecodedSnapshot, ScheduledState } from '@snails/protocol';

/** Wire view of the telegraphed scheduled effects. */
export function wireScheduled(list: GameState['scheduled']): ScheduledState[] {
  return list.map((e) => ({
    id: e.id,
    groupId: e.groupId,
    position: e.position,
    radius: e.telegraph.radius,
    turnsLeft: e.turnsLeft,
    style: e.telegraph.style,
  }));
}

/** Wire view of the crates. */
export function wireCrates(list: GameState['crates']): CrateState[] {
  return list.map((c) => ({
    id: c.id,
    defId: c.defId,
    position: c.position,
    grounded: c.grounded,
  }));
}

/** Wire state code of a snail. */
export function snailWireState(n: Snail): 'dead' | 'grounded' | 'airborne' {
  if (!n.alive) return 'dead';
  return n.grounded === false ? 'airborne' : 'grounded';
}

/** King of the Hill zone and per-team scores (roster order) for the snapshot; empty in other modes. */
export function wireHill(s: GameState): { hill?: NonNullable<DecodedSnapshot['hill']> } {
  const h = s.hill;
  if (!h) return {};
  return {
    hill: {
      position: h.position,
      radius: h.radius,
      scores: s.teams.map((t) => h.scores[t.id] ?? 0),
    },
  };
}
