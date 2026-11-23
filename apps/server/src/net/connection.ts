import { PROTOCOL_VERSION, checkHello, parseClientMessage } from '@snails/protocol';
import type { ClientMessage, ErrorCode, Role, ServerMessage } from '@snails/protocol';
import type { LobbyAction, Member, RoomManager } from '../rooms/room-manager.js';

/** Minimal socket surface; satisfied by `ws` and test fakes. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
}

/** Identity of an authenticated connection. */
export interface ClientContext {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  role: Role;
}

/** Controller intent messages (gameplay input). */
export type IntentMessage = Extract<
  ClientMessage,
  { type: 'move' | 'jump' | 'aim' | 'selectWeapon' | 'fire' | 'endTurn' | 'queueResearch' }
>;
/** Heartbeat message. */
export type PingMessage = Extract<ClientMessage, { type: 'ping' }>;

/** What the room/session layer implements to receive post-hello messages. */
export interface ConnectionHandler {
  onLobbyAction(ctx: ClientContext, action: LobbyAction): void;
  onIntent(ctx: ClientContext, intent: IntentMessage): void;
  onPing(ctx: ClientContext, ping: PingMessage): void;
}

/** Options for {@link Connection}. */
export interface ConnectionOptions {
  rooms: RoomManager;
  handler: ConnectionHandler;
  /** Intents per second allowed per connection (token bucket). Default 60. */
  intentsPerSecond?: number;
  /** Clock in ms for rate limiting. Default `Date.now`. */
  now?: () => number;
  /** Invalid messages tolerated before the socket is closed. Default 5. */
  maxStrikes?: number;
}

/** Websocket close code for policy violations. */
const POLICY = 1008;
const LOBBY_TYPES = new Set(['setTeam', 'setColour', 'setReady', 'startMatch']);
const INTENT_TYPES = new Set([
  'move',
  'jump',
  'aim',
  'selectWeapon',
  'fire',
  'endTurn',
  'queueResearch',
]);

const serialised = new WeakMap<object, string>();

/** JSON-encodes a message once per message object, so broadcasts do not re-serialise per client. */
function serialise(m: ServerMessage): string {
  let s = serialised.get(m);
  if (s === undefined) {
    s = JSON.stringify(m);
    serialised.set(m, s);
  }
  return s;
}

/** One client connection: handshake, validation, strike counting and dispatch. */
export class Connection {
  private ctx: ClientContext | undefined;
  private member: Member | undefined;
  private strikes = 0;
  private closed = false;
  private tokens: number;
  private tokenAt: number;
  private readonly maxStrikes: number;

  constructor(
    private readonly socket: SocketLike,
    private readonly opts: ConnectionOptions,
  ) {
    this.maxStrikes = opts.maxStrikes ?? 5;
    this.tokens = opts.intentsPerSecond ?? 60;
    this.tokenAt = (opts.now ?? Date.now)();
    socket.on('message', (data) => this.onMessage(data));
    socket.on('close', () => this.onClose());
  }

  private send(m: ServerMessage): void {
    if (!this.closed) this.socket.send(serialise(m));
  }

  /** Token bucket: returns false (drop) when the connection exceeds its intent rate. */
  private allowIntent(): boolean {
    const rate = this.opts.intentsPerSecond ?? 60;
    const now = (this.opts.now ?? Date.now)();
    this.tokens = Math.min(rate, this.tokens + ((now - this.tokenAt) / 1000) * rate);
    this.tokenAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private fail(code: ErrorCode): void {
    this.send({ type: 'error', code, message: code });
    this.socket.close(POLICY, code);
  }

  private onMessage(data: unknown): void {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch {
      raw = undefined;
    }
    if (!this.ctx) return this.hello(raw);
    let msg: ClientMessage;
    try {
      msg = parseClientMessage(raw);
    } catch {
      return this.strike();
    }
    this.dispatch(this.ctx, msg);
  }

  private strike(): void {
    this.strikes++;
    this.send({ type: 'error', code: 'bad_message', message: 'Invalid message' });
    if (this.strikes >= this.maxStrikes) this.socket.close(POLICY, 'too many bad messages');
  }

  private dispatch(ctx: ClientContext, msg: ClientMessage): void {
    const { handler } = this.opts;
    if (msg.type === 'ping') {
      this.send({ type: 'pong', t: msg.t });
      handler.onPing(ctx, msg);
    } else if (LOBBY_TYPES.has(msg.type)) {
      handler.onLobbyAction(ctx, msg as LobbyAction);
    } else if (INTENT_TYPES.has(msg.type)) {
      if (this.allowIntent()) handler.onIntent(ctx, msg as IntentMessage);
    } else {
      this.strike();
    }
  }

  private hello(raw: unknown): void {
    const check = checkHello(raw);
    if (!check.ok) {
      if (check.error === 'protocol_mismatch') {
        this.send({
          type: 'error',
          code: 'protocol_mismatch',
          message: 'Protocol mismatch',
          expected: check.expected,
          got: check.got,
        });
        this.socket.close(POLICY, 'protocol_mismatch');
        return;
      }
      return this.fail('bad_message');
    }
    const { role, name, roomCode } = check.hello;
    const { rooms } = this.opts;
    const code = roomCode ?? (role === 'display' ? rooms.createRoom().code : undefined);
    if (!code) return this.fail('no_room');
    const res = rooms.join(code, name, role, (m) => this.send(m));
    if (!res.ok) return this.fail(res.code);
    this.member = res.member;
    const { id, token } = res.member;
    this.ctx = { roomCode: res.room.code, playerId: id, sessionToken: token, role };
    this.send({
      type: 'welcome',
      playerId: id,
      roomCode: res.room.code,
      sessionToken: token,
      role,
      protocolVersion: PROTOCOL_VERSION,
    });
    res.room.broadcastLobby();
    res.room.match?.catchUp(res.member);
  }

  private onClose(): void {
    this.closed = true;
    if (this.ctx && this.member) this.opts.rooms.leave(this.ctx.roomCode, this.member.token);
    this.ctx = undefined;
  }
}
