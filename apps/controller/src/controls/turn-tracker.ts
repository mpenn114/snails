import type { ControllerClient } from '../net/client';
import { findMyTeam, isMyTurn } from './my-turn';
import type { TimerModel } from './turn-timer';
import { startTimer, syncTimer } from './turn-timer';

/** Observable turn/match state derived from server messages. */
export interface TurnView {
  myTeamId: string | null;
  myTurn: boolean;
  teamName: string | null;
  snailName: string | null;
  timer: TimerModel | null;
}

/** A live tracker: read `view`, subscribe to changes, dispose when done. */
export interface TurnTracker {
  readonly view: TurnView;
  /** Subscribes to changes; returns an unsubscribe. */
  onChange(fn: (v: TurnView) => void): () => void;
  dispose(): void;
}

/**
 * Tracks whose turn it is from `lobbyState` (my team), `matchStarted` (names) and
 * `turnStart`/`turnTimer` (active team and clock).
 */
export function trackTurns(
  client: ControllerClient,
  playerId: string | null,
  now: () => number = () => Date.now(),
): TurnTracker {
  const names = new Map<string, { team: string; snails: Map<string, string> }>();
  const turn = { activeTeamId: null as string | null, activeSnailId: null as string | null };
  const view: TurnView = {
    myTeamId: null,
    myTurn: false,
    teamName: null,
    snailName: null,
    timer: null,
  };
  const listeners = new Set<(v: TurnView) => void>();

  const refresh = (): void => {
    const team = turn.activeTeamId ? names.get(turn.activeTeamId) : undefined;
    view.myTurn = isMyTurn(view.myTeamId, turn);
    view.teamName = team?.team ?? null;
    view.snailName = (turn.activeSnailId && team?.snails.get(turn.activeSnailId)) || null;
    listeners.forEach((fn) => fn(view));
  };

  const offs = [
    client.on('lobbyState', (m) => {
      view.myTeamId = findMyTeam(playerId, m.players);
      refresh();
    }),
    client.on('matchStarted', (m) => {
      names.clear();
      for (const t of m.teams) {
        names.set(t.id, { team: t.name, snails: new Map(t.snails.map((s) => [s.id, s.name])) });
      }
      refresh();
    }),
    client.on('turnStart', (m) => {
      turn.activeTeamId = m.teamId;
      turn.activeSnailId = m.snailId;
      view.timer = startTimer(m.durationMs, now());
      refresh();
    }),
    client.on('turnTimer', (m) => {
      view.timer = syncTimer(m.remainingMs, now());
      refresh();
    }),
  ];

  return {
    view,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      offs.forEach((off) => off());
      listeners.clear();
    },
  };
}
