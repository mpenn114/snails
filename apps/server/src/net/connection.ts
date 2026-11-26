import { PROTOCOL_VERSION, checkHello, parseClientMessage } from '@snails/protocol';
import type { ClientMessage, ErrorCode, Role, ServerMessage } from '@snails/protocol';
import { Heartbeat, type HeartbeatOptions } from './heartbeat.js';
import type { LobbyAction, Member, RoomManager } from '../rooms/room-manager.js';

/** Minimal socket surface; satisfied by `ws` and test fakes. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'pong', cb: () => void): void;
  /** Sends a protocol-level ping (ws). */
  ping?(): void;
  /** Destroys the socket immediately (ws). Falls back to `close`. */
  terminate?(): void;
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
  {
    type:
      | 'move'
      | 'jump'
      | 'aim'
      | 'steer'
      | 'selectWeapon'
      | 'fire'
      | 'endTurn'
      | 'queueResearch'
      | 'cancelResearch';
  }
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
  /** Enables ping/timeout liveness checks; omitted means none (unit tests). */
  heartbeat?: HeartbeatOptions;
  /** Observes every message sent to an authenticated client (latency instrumentation). */
  onSend?: (ctx: ClientContext, m: ServerMessage) => void;
}

/** Websocket close code for policy violations. */
const POLICY = 1008;
const LOBBY_TYPES = new Set([
  'setTeam',
  'toggleTeam',
  'setTeamName',
  'setSnailNames',
  'setColour',
  'setReady',
  'setSettings',
  'addCpu',
  'removeCpu',
  'startMatch',
]);
const INTENT_TYPES = new Set([
  'move',
  'jump',
  'aim',
  'steer',
  'selectWeapon',
  'fire',
  'endTurn',
  'queueResearch',
  'cancelResearch',
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
  private heartbeat: Heartbeat | undefined;
  private detach: (() => void) | undefined;
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
    socket.on('message', (data) => {
      this.heartbeat?.seen();
      this.onMessage(data);
    });
    socket.on('close', () => this.onClose());
    if (opts.heartbeat) {
      this.heartbeat = new Heartbeat(
        opts.heartbeat,
        () => socket.ping?.(),
        () => this.terminate(),
      );
      socket.on('pong', () => this.heartbeat?.seen());
    }
  }

  private send(m: ServerMessage): void {
    if (this.closed) return;
    this.socket.send(serialise(m));
    if (this.ctx) this.opts.onSend?.(this.ctx, m);
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
    const code =
      roomCode ??
      (role === 'display' ? (rooms.getDefaultRoom() ?? rooms.createRoom()).code : undefined);
    if (!code) return this.fail('no_room');
    const detach = (): void => this.supersede();
    const res = rooms.join(code, name, role, (m) => this.send(m), {
      detach,
      ...(check.hello.sessionToken ? { sessionToken: check.hello.sessionToken } : {}),
    });
    if (!res.ok) return this.fail(res.code);
    this.detach = detach;
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
    if (check.hello.sessionToken) res.room.markConnected(res.member);
    else res.room.broadcastLobby();
    res.room.match?.catchUp(res.member);
  }

  /** Heartbeat timeout: drop the socket without a closing handshake. */
  private terminate(): void {
    if (this.socket.terminate) this.socket.terminate();
    else this.socket.close(POLICY, 'heartbeat timeout');
    this.onClose();
  }

  /** A newer connection took over this member's slot: close quietly, no disconnect handling. */
  private supersede(): void {
    if (this.closed) return;
    this.closed = true;
    this.heartbeat?.stop();
    this.ctx = undefined;
    this.socket.close(1000, 'superseded');
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.heartbeat?.stop();
    if (this.ctx && this.member) {
      this.opts.rooms.disconnect(this.ctx.roomCode, this.member.token, this.detach);
    }
    this.ctx = undefined;
  }
}
