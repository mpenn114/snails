import { randomBytes } from 'node:crypto';
import type { ErrorCode, Role } from '@snails/protocol';
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
  /** Delay before an empty room is deleted. Defaults to 30 s. */
  emptyRoomDelayMs?: number;
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
  private nextId = 1;
  private readonly random: () => number;
  private readonly token: () => string;
  private readonly timers: Timers;
  private readonly emptyDelay: number;
  private readonly runnerOptions: MatchRunnerOptions;

  constructor(opts: RoomManagerOptions = {}) {
    this.random = opts.random ?? Math.random;
    this.token = opts.token ?? ((): string => randomBytes(16).toString('hex'));
    this.timers = opts.timers ?? realTimers;
    this.runnerOptions = opts.runner ?? {};
    this.emptyDelay = opts.emptyRoomDelayMs ?? 30_000;
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
    room.onMatchStart = (settings, members) => {
      room.match = new MatchRunner(room, settings, members, this.runnerOptions);
    };
    this.rooms.set(code, room);
    return room;
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
  join(code: string, name: string, role: Role, send: SendFn): JoinResult {
    const room = this.getRoom(code);
    if (!room) return { ok: false, code: 'no_room' };
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
      colour: null,
      ready: false,
      send,
    };
    room.add(member);
    this.cancelEmpty(room.code);
    return { ok: true, room, member };
  }

  /** Removes a member; an emptied room is deleted after the configured delay. */
  leave(code: string, token: string): void {
    const room = this.getRoom(code);
    if (!room) return;
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
  }

  private cancelEmpty(code: string): void {
    const h = this.emptyTimers.get(code);
    if (h === undefined) return;
    this.timers.clear(h);
    this.emptyTimers.delete(code);
  }
}
