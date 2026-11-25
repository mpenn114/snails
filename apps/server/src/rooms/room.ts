import { MatchSettings, type MatchSettingsInput } from '@snails/protocol';
import { startBlocker } from './start-rules.js';
import {
  MAX_TEAMS,
  cpuLobbyPlayer,
  cpuName,
  freeColour,
  nextCpuId,
  type CpuTeam,
} from './cpu-teams.js';
import type { IntentMessage } from '../net/connection.js';
import type {
  CpuDifficulty,
  CpuPersonality,
  ErrorCode,
  LobbyPlayer,
  Role,
  ServerMessage,
} from '@snails/protocol';

/** Delivers one server message to a client (transport-agnostic). */
export type SendFn = (message: ServerMessage) => void;

/** A lobby message from a controller, already validated by `@snails/protocol`. */
export type LobbyAction =
  | { type: 'setTeam'; teamId: string }
  | { type: 'toggleTeam'; teamId: string }
  | { type: 'setColour'; colour: string }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setSettings'; settings: MatchSettingsInput }
  | { type: 'addCpu'; difficulty: CpuDifficulty; personality: CpuPersonality }
  | { type: 'removeCpu'; teamId: string }
  | { type: 'startMatch'; settings: MatchSettingsInput };

/** One connected participant, stored by session token. */
export interface Member {
  id: string;
  /** Secret, random token (the key under which the member is stored). */
  token: string;
  name: string;
  role: Role;
  /** Primary team (first of `teamIds`), or null. */
  teamId: string | null;
  /** Every team this phone controls: one in `perPlayer`, possibly several in `hotSeat`. */
  teamIds: string[];
  colour: string | null;
  ready: boolean;
  /** False while the socket is gone but the slot is held for a reconnect. */
  connected: boolean;
  send: SendFn;
  /** Closes the current socket; called when a newer connection takes over the slot. */
  detach?: () => void;
}

/** Called when the host starts a match, with validated settings and the roster. */
export type MatchStartHook = (settings: MatchSettings, members: readonly Member[]) => void;

/** A running match attached to a room (implemented by the match runner). */
export interface ActiveMatch {
  /** Sends `matchStarted`, a fresh snapshot and the current turn state to a (re)joining member. */
  catchUp(member: Member): void;
  /** Called when a member connects or disconnects (turn-skip policy). */
  membersChanged(): void;
  /** Handles a gameplay intent from a member. */
  intent(member: Member, intent: IntentMessage): void;
  /** Current simulation tick (latency instrumentation). */
  currentTick?(): number;
  /** Stops timers and the simulation. */
  stop(): void;
}

/** Default match settings for a fresh lobby. */
export const DEFAULT_SETTINGS: MatchSettings = MatchSettings.parse({});

type Failure = [ErrorCode, string] | undefined;

/**
 * One lobby/match room. Members are keyed by session token so a later reconnect can find them.
 * Colours are unique per player (case-insensitive) within the room.
 */
export class Room {
  /** Members by session token, in join order. */
  readonly members = new Map<string, Member>();
  hostId: string | null = null;
  /** CPU teams added by the host; they have no phone and count as ready. */
  cpuTeams: CpuTeam[] = [];
  settings: MatchSettings = { ...DEFAULT_SETTINGS };
  phase: 'lobby' | 'playing' = 'lobby';
  /** Plug-in point for the game session; no-op by default. */
  onMatchStart: MatchStartHook = () => {};
  /** The running match while `phase === 'playing'`. */
  match: ActiveMatch | null = null;
  /** Optional hook called when a match ends (latency summary). */
  onMatchEnd?: () => void;

  constructor(readonly code: string) {}

  /** Adds a member and (re)computes the host. Does not broadcast. */
  add(member: Member): void {
    this.members.set(member.token, member);
    this.assignHost();
  }

  /** Removes a member by token, reassigns the host, and broadcasts. */
  remove(token: string): void {
    if (!this.members.delete(token)) return;
    this.assignHost();
    if (this.phase === 'playing' && this.controllerCount() === 0) this.endMatch();
    else this.broadcastLobby();
  }

  /** Marks a member as disconnected (slot kept) and tells everyone. */
  markDisconnected(member: Member): void {
    if (!member.connected) return;
    member.connected = false;
    this.broadcastLobby();
    this.match?.membersChanged();
  }

  /** Re-attaches a member to a new transport and tells everyone. */
  markConnected(member: Member): void {
    member.connected = true;
    this.broadcastLobby();
    this.match?.membersChanged();
  }

  /** Routes an intent: displays may never send one; otherwise the running match decides. */
  handleIntent(member: Member, intent: IntentMessage): void {
    if (member.role !== 'controller') {
      member.send({ type: 'error', code: 'bad_message', message: 'Displays cannot send intents' });
    } else if (this.match) this.match.intent(member, intent);
  }

  /** Host is the first controller in join order; null if there is none. */
  private assignHost(): void {
    const all = [...this.members.values()];
    if (all.some((m) => m.id === this.hostId)) return;
    this.hostId = all.find((m) => m.role === 'controller')?.id ?? null;
  }

  /** Number of controllers. */
  controllerCount(): number {
    return [...this.members.values()].filter((m) => m.role === 'controller').length;
  }

  /** Builds the current lobby snapshot message. */
  lobbyState(): ServerMessage {
    const players: LobbyPlayer[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      teamId: m.teamId,
      teamIds: [...m.teamIds],
      colour: m.colour,
      ready: m.ready,
      connected: m.connected,
    }));
    players.push(...this.cpuTeams.map(cpuLobbyPlayer));
    return {
      type: 'lobbyState',
      roomCode: this.code,
      hostId: this.hostId,
      phase: this.phase === 'playing' ? 'match' : 'lobby',
      players,
      settings: this.settings,
    };
  }

  /** Sends `lobbyState` to every client in the room. */
  broadcastLobby(): void {
    const msg = this.lobbyState();
    for (const m of this.members.values()) m.send(msg);
  }

  /** Returns the match to the lobby (ready flags cleared) and broadcasts. */
  endMatch(): void {
    this.match?.stop();
    this.match = null;
    this.onMatchEnd?.();
    this.phase = 'lobby';
    for (const m of this.members.values()) m.ready = false;
    this.broadcastLobby();
  }

  /** Applies a lobby action from `member`; errors go back to that member only. */
  handleLobbyAction(member: Member, action: LobbyAction): void {
    const err = this.apply(member, action);
    if (err) member.send({ type: 'error', code: err[0], message: err[1] });
    else this.broadcastLobby();
  }

  private apply(member: Member, action: LobbyAction): Failure {
    if (member.role !== 'controller') return ['bad_message', 'Only controllers use the lobby'];
    if (action.type === 'startMatch') return this.start(member, action.settings);
    if (this.phase !== 'lobby') return ['not_in_lobby', 'Match already started'];
    switch (action.type) {
      case 'setTeam':
        member.teamIds = [action.teamId];
        member.teamId = action.teamId;
        return undefined;
      case 'toggleTeam':
        member.teamIds = member.teamIds.includes(action.teamId)
          ? member.teamIds.filter((t) => t !== action.teamId)
          : [...member.teamIds, action.teamId];
        member.teamId = member.teamIds[0] ?? null;
        if (member.teamIds.length === 0) member.ready = false;
        return undefined;
      case 'setColour':
        return this.setColour(member, action.colour);
      case 'setSettings':
        return this.setSettings(member, action.settings);
      case 'addCpu':
        return this.addCpu(member, action);
      case 'removeCpu':
        return this.removeCpu(member, action.teamId);
      case 'setReady':
        if (action.ready && member.teamIds.length === 0) return ['not_ready', 'Pick a team first'];
        member.ready = action.ready;
        return undefined;
    }
  }

  private setColour(member: Member, colour: string): Failure {
    const wanted = colour.toLowerCase();
    const taken =
      this.cpuTeams.some((c) => c.colour.toLowerCase() === wanted) ||
      [...this.members.values()].some((m) => m !== member && m.colour?.toLowerCase() === wanted);
    if (taken) return ['invalid_settings', 'Colour already taken'];
    member.colour = colour;
    return undefined;
  }

  /** Host edits the settings in the lobby; everyone (the display especially) sees them. */
  private setSettings(member: Member, raw: MatchSettingsInput): Failure {
    if (member.id !== this.hostId) return ['not_host', 'Only the host can change settings'];
    const parsed = MatchSettings.safeParse(raw);
    if (!parsed.success) return ['invalid_settings', 'Invalid match settings'];
    this.settings = parsed.data;
    return undefined;
  }

  /** Ids of every team in the lobby (phones' teams and CPU teams). */
  private teamIdSet(): Set<string> {
    const ids = new Set<string>(this.cpuTeams.map((c) => c.id));
    for (const m of this.members.values()) for (const t of m.teamIds) ids.add(t);
    return ids;
  }

  /** Host adds a CPU team with the next free id and colour. */
  private addCpu(
    member: Member,
    a: { difficulty: CpuDifficulty; personality: CpuPersonality },
  ): Failure {
    if (member.id !== this.hostId) return ['not_host', 'Only the host can add a CPU'];
    const ids = this.teamIdSet();
    if (ids.size >= MAX_TEAMS) return ['teams_full', 'No room for another team'];
    const claimed = new Set<string>(this.cpuTeams.map((c) => c.colour.toLowerCase()));
    for (const m of this.members.values()) if (m.colour) claimed.add(m.colour.toLowerCase());
    this.cpuTeams.push({
      id: nextCpuId(ids),
      name: cpuName(a, this.cpuTeams),
      colour: freeColour(claimed, this.cpuTeams.length),
      difficulty: a.difficulty,
      personality: a.personality,
    });
    return undefined;
  }

  /** Host removes a CPU team. */
  private removeCpu(member: Member, teamId: string): Failure {
    if (member.id !== this.hostId) return ['not_host', 'Only the host can remove a CPU'];
    if (!this.cpuTeams.some((c) => c.id === teamId)) return ['bad_message', 'No such CPU team'];
    this.cpuTeams = this.cpuTeams.filter((c) => c.id !== teamId);
    return undefined;
  }

  private start(member: Member, raw: MatchSettingsInput): Failure {
    if (member.id !== this.hostId) return ['not_host', 'Only the host can start'];
    if (this.phase !== 'lobby') return ['match_in_progress', 'Match already started'];
    const parsed = MatchSettings.safeParse(raw);
    if (!parsed.success) return ['invalid_settings', 'Invalid match settings'];
    const players = [...this.members.values()].filter((m) => m.role === 'controller');
    const cpuPlayers = this.cpuTeams.map((c) => ({ ready: true, teamIds: [c.id] }));
    const blocked = startBlocker([...players, ...cpuPlayers], parsed.data.controlMode);
    if (blocked) return ['not_ready', blocked];
    this.settings = parsed.data;
    this.phase = 'playing';
    this.broadcastLobby();
    this.onMatchStart(parsed.data, [...this.members.values()]);
    return undefined;
  }
}

/** Re-exported for callers that only need the role type. */
export type { Role };
