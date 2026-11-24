import type { GameState } from '@snails/core';
import type { ServerMessage, Snapshot, WireEvent, WireTeamEntry } from '@snails/protocol';

/** Event types only the owning team's controllers may see (`researchCompleted` is public). */
export const PRIVATE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'calciumChanged',
  'researchQueued',
  'researchStarted',
  'researchCancelled',
]);

/** The research part of a decoded snapshot: preset plus per-team entries (all private data included). */
export function researchFields(
  state: Pick<GameState, 'research' | 'teams'>,
): Pick<Snapshot, 'research' | 'teams'> {
  if (!state.research || state.research === 'off') return {};
  const teams: WireTeamEntry[] = state.teams.map((t) => ({
    id: t.id,
    researching: t.research?.active != null,
    ...(t.researched.length > 0 ? { researched: [...t.researched] } : {}),
    ...(t.research ? { research: structuredClone(t.research) } : {}),
  }));
  return { research: state.research, teams };
}

/**
 * Removes private research data a viewer may not see. `viewerTeams` is the set of teams the
 * recipient controls: empty for a display, one team for a controller, several for a hot-seat phone.
 */
export function filterMessage(msg: ServerMessage, viewerTeams: readonly string[]): ServerMessage {
  if (msg.type === 'snapshot') return filterSnapshot(msg, viewerTeams);
  if (msg.type === 'eventBatch') {
    if (!msg.events.some(isHiddenFrom(viewerTeams))) return msg;
    return { ...msg, events: msg.events.filter((e) => !isHiddenFrom(viewerTeams)(e)) };
  }
  return msg;
}

/** Strips other teams' `research` objects from a snapshot (the `researching` flag stays). */
export function filterSnapshot(snap: Snapshot, viewerTeams: readonly string[]): Snapshot {
  if (!snap.teams) return snap;
  return {
    ...snap,
    teams: snap.teams.map((t) => {
      if (!t.research || viewerTeams.includes(t.id)) return t;
      return {
        id: t.id,
        ...(t.researching === undefined ? {} : { researching: t.researching }),
        ...(t.researched === undefined ? {} : { researched: t.researched }),
      };
    }),
  };
}

function isHiddenFrom(viewerTeams: readonly string[]): (e: WireEvent) => boolean {
  return (e) =>
    PRIVATE_EVENT_TYPES.has(e.type) &&
    !viewerTeams.includes((e as unknown as { teamId: string }).teamId);
}
