import { randomBytes } from 'node:crypto';
import type { ErrorCode, MatchSettings, Role } from '@snails/protocol';
import { MatchRunner, type MatchRunnerOptions } from '../game/match-runner.js';
import { Room, type Member, type SendFn } from './room.js';

export { Room } from './room.js';
export type { LobbyAction, Member, SendFn, MatchStartHook } from './room.js';

/** Room codes avoid ambiguous letters (no I, O). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Maximum controllers per room; displays are unlimited. */
export const MAX_CONTROLLERS = 8;

/** Timer functions, injectable for tests. */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** Options for {@link RoomManager}. */
export interface RoomManagerOptions {
  /** Random source in [0,1) for room codes. */
  random?: () => number;
  /** Source of session tokens. Defaults to 16 random bytes as hex. */
  token?: () => string;
  timers?: Timers;
  /** Overrides for match runners (tests). */
  runner?: MatchRunnerOptions;
  /** Settings new rooms start with (the remembered ones). */
  initialSettings?: MatchSettings;
  /** Called when a room's lobby settings change. */
  onSettingsChange?: (settings: MatchSettings) => void;
  /** Delay before an empty room is deleted. Defaults to 30 s. */
  emptyRoomDelayMs?: number;
  /** How long a disconnected lobby member is kept before removal. Defaults to 60 s. */
  lobbyGraceMs?: number;
  /** How long a disconnected member's slot is held while a match runs. Defaults to 120 s. */
  matchHoldMs?: number;
}

/** Extra join parameters for reconnects and socket ownership. */
export interface JoinOptions {
  /** Session token of an existing member to re-attach (requires the room code). */
  sessionToken?: string;
  /** Closes the joining socket; invoked when a later connection takes the slot over. */
  detach?: () => void;
}

/** Result of {@link RoomManager.join}. */
export type JoinResult = { ok: true; room: Room; member: Member } | { ok: false; code: ErrorCode };

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Tracks rooms and their members. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private emptyTimers = new Map<string, unknown>();
  private dropTimers = new Map<string, unknown>();
  private nextId = 1;
  private defaultCode: string | null = null;
  private readonly initialSettings: MatchSettings | undefined;
  private readonly onSettingsChange: ((settings: MatchSettings) => void) | undefined;
  private readonly random: () => number;
  private readonly token: () => string;
  private readonly timers: Timers;
  private readonly emptyDelay: number;
  private readonly lobbyGrace: number;
  private readonly matchHold: number;
  private readonly runnerOptions: MatchRunnerOptions;

  constructor(opts: RoomManagerOptions = {}) {
    this.random = opts.random ?? Math.random;
    this.token = opts.token ?? ((): string => randomBytes(16).toString('hex'));
    this.timers = opts.timers ?? realTimers;
    this.runnerOptions = opts.runner ?? {};
    this.initialSettings = opts.initialSettings;
    this.onSettingsChange = opts.onSettingsChange;
    this.emptyDelay = opts.emptyRoomDelayMs ?? 30_000;
    this.lobbyGrace = opts.lobbyGraceMs ?? 60_000;
    this.matchHold = opts.matchHoldMs ?? 120_000;
  }

  /** Creates a room with a unique random 4-letter code. */
  createRoom(): Room {
    let code: string;
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)],
      ).join('');
    } while (this.rooms.has(code));
    const room = new Room(code);
    room.random = this.random;
    if (this.initialSettings) room.settings = { ...this.initialSettings };
    if (this.onSettingsChange) room.onSettingsChange = this.onSettingsChange;
    room.onMatchStart = (settings, members) => {
      room.match = new MatchRunner(room, settings, members, this.runnerOptions);
    };
    this.rooms.set(code, room);
    return room;
  }

  /** Marks the room a display with no room code attaches to (the one the server created at start). */
  setDefaultRoom(code: string): void {
    this.defaultCode = code.toUpperCase();
  }

  /** The default room for code-less displays, if it still exists. */
  getDefaultRoom(): Room | undefined {
    return this.defaultCode ? this.rooms.get(this.defaultCode) : undefined;
  }

  /** Returns a room by code (case-insensitive). */
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Number of live rooms. */
  get roomCount(): number {
    return this.rooms.size;
  }

  /** Adds a client to a room. Does not broadcast; the caller sends `welcome` first. */
  join(code: string, name: string, role: Role, send: SendFn, jo: JoinOptions = {}): JoinResult {
    const room = this.getRoom(code);
    if (!room) return { ok: false, code: jo.sessionToken ? 'bad_session' : 'no_room' };
    if (jo.sessionToken) return this.resume(room, role, send, jo);
    if (role === 'controller') {
      if (room.phase !== 'lobby') return { ok: false, code: 'match_in_progress' };
      if (room.controllerCount() >= MAX_CONTROLLERS) return { ok: false, code: 'room_full' };
    }
    const member: Member = {
      id: `p${this.nextId++}`,
      token: this.token(),
      name,
      role,
      teamId: null,
      teamIds: [],
      colour: null,
      ready: false,
      connected: true,
      send,
      ...(jo.detach ? { detach: jo.detach } : {}),
    };
    if (role === 'controller' && !room.autoAssign(member)) return { ok: false, code: 'teams_full' };
    room.add(member);
    this.cancelEmpty(room.code);
    return { ok: true, room, member };
  }

  private resume(room: Room, role: Role, send: SendFn, jo: JoinOptions): JoinResult {
    const member = room.members.get(jo.sessionToken ?? '');
    if (!member || member.role !== role) return { ok: false, code: 'bad_session' };
    const stale = member.detach;
    member.send = send;
    if (jo.detach) member.detach = jo.detach;
    else delete member.detach;
    stale?.();
    this.cancelDrop(member.token);
    this.cancelEmpty(room.code);
    return { ok: true, room, member };
  }

  /**
   * Handles a socket loss: the member stays (marked disconnected) and is removed after the
   * lobby grace, or the longer match hold while a match runs. Ignored if `detach` is no longer
   * the member's current connection (a newer socket already took over).
   */
  disconnect(code: string, token: string, detach?: () => void): void {
    const room = this.getRoom(code);
    const member = room?.members.get(token);
    if (!room || !member || member.detach !== detach) return;
    room.markDisconnected(member);
    this.cancelDrop(token);
    const ms = room.phase === 'playing' ? this.matchHold : this.lobbyGrace;
    this.dropTimers.set(
      token,
      this.timers.set(() => {
        this.dropTimers.delete(token);
        if (!member.connected) this.leave(code, token);
      }, ms),
    );
  }

  /** Removes a member; an emptied room is deleted after the configured delay. */
  leave(code: string, token: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    this.cancelDrop(token);
    room.remove(token);
    if (room.members.size > 0 || this.emptyTimers.has(room.code)) return;
    this.emptyTimers.set(
      room.code,
      this.timers.set(() => {
        this.emptyTimers.delete(room.code);
        if (room.members.size === 0) this.rooms.delete(room.code);
      }, this.emptyDelay),
    );
  }

  /** Cancels all pending deletions (for shutdown). */
  dispose(): void {
    for (const h of this.emptyTimers.values()) this.timers.clear(h);
    this.emptyTimers.clear();
    for (const h of this.dropTimers.values()) this.timers.clear(h);
    this.dropTimers.clear();
  }

  private cancelDrop(token: string): void {
    const h = this.dropTimers.get(token);
    if (h === undefined) return;
    this.timers.clear(h);
    this.dropTimers.delete(token);
  }

  private cancelEmpty(code: string): void {
    const h = this.emptyTimers.get(code);
    if (h === undefined) return;
    this.timers.clear(h);
    this.emptyTimers.delete(code);
  }
}
