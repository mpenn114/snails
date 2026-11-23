import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';

/** One snail in the roster with its last known health (null until a snapshot arrives). */
export interface SpectateSnail {
  id: string;
  name: string;
  hp: number | null;
}

/** One team in turn order. */
export interface SpectateTeam {
  id: string;
  name: string;
  colour: string;
  snails: SpectateSnail[];
}

/** Match flow as seen by this phone. */
export type SpectatePhase = 'lobby' | 'playing' | 'ended';

/** Accumulated spectate state, derived purely from server messages. */
export interface SpectateState {
  playerId: string | null;
  phase: SpectatePhase;
  teams: SpectateTeam[];
  myTeamId: string | null;
  activeTeamId: string | null;
  activeSnailId: string | null;
  /** Increments each time my team's turn starts (drives the flash transition). */
  flashSeq: number;
  status: 'won' | 'draw' | null;
  winnerTeamId: string | null;
}

/** Fresh state for a player. */
export function initialSpectate(playerId: string | null): SpectateState {
  return {
    playerId,
    phase: 'lobby',
    teams: [],
    myTeamId: null,
    activeTeamId: null,
    activeSnailId: null,
    flashSeq: 0,
    status: null,
    winnerTeamId: null,
  };
}

function setHp(teams: SpectateTeam[], id: string, hp: number): SpectateTeam[] {
  return teams.map((t) => ({
    ...t,
    snails: t.snails.map((s) => (s.id === id ? { ...s, hp } : s)),
  }));
}

function reduceEvents(
  state: SpectateState,
  msg: Extract<ServerMessage, { type: 'eventBatch' }>,
): SpectateState {
  let next = state;
  for (const e of decodeEventBatch(msg)) {
    if (e.type === 'snailDamaged') {
      next = { ...next, teams: setHp(next.teams, e.snailId, e.remaining) };
    } else if (e.type === 'snailDied') {
      next = { ...next, teams: setHp(next.teams, e.snailId, 0) };
    } else if (e.type === 'matchEnded' && e.status !== 'playing') {
      next = { ...next, phase: 'ended', status: e.status, winnerTeamId: e.winnerTeamId ?? null };
    }
  }
  return next;
}

/** Pure reducer: folds one server message into the spectate state. */
export function reduceSpectate(state: SpectateState, msg: ServerMessage): SpectateState {
  switch (msg.type) {
    case 'lobbyState': {
      const me = msg.players.find((p) => p.id === state.playerId);
      const myTeamId = me?.teamId ?? null;
      // The lobby resuming after a finished match returns everyone to the lobby.
      if (state.phase === 'ended') return { ...initialSpectate(state.playerId), myTeamId };
      return { ...state, myTeamId };
    }
    case 'matchStarted':
      return {
        ...state,
        phase: 'playing',
        status: null,
        winnerTeamId: null,
        activeTeamId: null,
        activeSnailId: null,
        teams: msg.teams.map((t) => ({
          id: t.id,
          name: t.name,
          colour: t.colour,
          snails: t.snails.map((s) => ({ id: s.id, name: s.name, hp: null })),
        })),
      };
    case 'turnStart':
      return {
        ...state,
        activeTeamId: msg.teamId,
        activeSnailId: msg.snailId,
        flashSeq: msg.teamId === state.myTeamId ? state.flashSeq + 1 : state.flashSeq,
      };
    case 'snapshot': {
      const hp = new Map(decodeSnapshot(msg).snails.map((s) => [s.id, s.health]));
      const teams = state.teams.map((t) => ({
        ...t,
        snails: t.snails.map((s) => ({ ...s, hp: hp.get(s.id) ?? s.hp })),
      }));
      return { ...state, teams };
    }
    case 'eventBatch':
      return reduceEvents(state, msg);
    default:
      return state;
  }
}

/** What the screen should show. */
export interface SpectateView {
  kind: 'hidden' | 'waiting' | 'myTurn' | 'ended';
  title: string;
  colour: string | null;
  hint: string;
  mySnails: SpectateSnail[];
}

const alive = (t: SpectateTeam): boolean => t.snails.some((s) => s.hp === null || s.hp > 0);

/** Number of turns until my team plays (1 = next), or null when not derivable. */
export function turnsUntilMine(state: SpectateState): number | null {
  const { teams, myTeamId, activeTeamId } = state;
  const from = teams.findIndex((t) => t.id === activeTeamId);
  if (from < 0 || !myTeamId || myTeamId === activeTeamId) return null;
  let n = 0;
  for (let i = 1; i <= teams.length; i++) {
    const t = teams[(from + i) % teams.length] as SpectateTeam;
    if (!alive(t)) continue;
    n++;
    if (t.id === myTeamId) return n;
  }
  return null;
}

/** "Your turn next" / "Your turn in N turns" or an empty string. */
export function turnHint(state: SpectateState): string {
  const n = turnsUntilMine(state);
  if (n === null) return '';
  return n === 1 ? 'Your turn next' : `Your turn in ${n} turns`;
}

function endedTitle(state: SpectateState): string {
  if (state.status === 'draw') return 'Draw!';
  const win = state.teams.find((t) => t.id === state.winnerTeamId);
  if (!win) return 'Match over';
  return win.id === state.myTeamId ? 'Victory!' : `${win.name} wins`;
}

/** Derives the display model from state. */
export function deriveView(state: SpectateState): SpectateView {
  const mine = state.teams.find((t) => t.id === state.myTeamId);
  const mySnails = mine?.snails ?? [];
  if (state.phase === 'ended') {
    const win = state.teams.find((t) => t.id === state.winnerTeamId);
    const colour = win?.colour ?? null;
    return { kind: 'ended', title: endedTitle(state), colour, hint: '', mySnails };
  }
  const active = state.teams.find((t) => t.id === state.activeTeamId);
  if (state.phase !== 'playing' || !active) {
    return { kind: 'hidden', title: '', colour: null, hint: '', mySnails };
  }
  const snail = active.snails.find((s) => s.id === state.activeSnailId);
  const title = `${active.name}'s turn${snail ? ` — ${snail.name}` : ''}`;
  const isMine = active.id === state.myTeamId;
  return {
    kind: isMine ? 'myTurn' : 'waiting',
    title,
    colour: active.colour,
    hint: turnHint(state),
    mySnails,
  };
}
