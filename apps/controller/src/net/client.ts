import { ClientMessage, PROTOCOL_VERSION, parseServerMessage } from '@snails/protocol';
import type { ErrorCode, ServerMessage } from '@snails/protocol';
import { backoffDelay } from './url';
import { loadSession, clearSession, saveSession } from './session-store';
import type { StorageLike } from './session-store';
import { safeStorage } from '../platform/ios';
import { CommandLatency } from './command-latency';

/** Connection lifecycle. `mismatch` means the app is outdated and must be refreshed. */
export type ConnectionState =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'mismatch';

/** Minimal socket surface (browser WebSocket satisfies it). */
export interface SocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

/** Injectable environment (all defaulted for production). */
export interface ClientDeps {
  createSocket: (url: string) => SocketLike;
  storage?: StorageLike;
  random: () => number;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  log: (msg: string, detail?: unknown) => void;
}

/** Client construction options. */
export interface ClientOptions {
  url: string;
  name: string;
  roomCode: string;
  deps?: Partial<ClientDeps>;
}

const OPEN = 1;
const INTENT_MAX_AGE_MS = 1000;
const PING_MS = 3000;
const INTENT_TYPES = new Set([
  'move',
  'jump',
  'aim',
  'selectWeapon',
  'fire',
  'endTurn',
  'queueResearch',
]);
const LOBBY_TYPES = new Set(['createRoom', 'setTeam', 'setColour', 'setReady', 'startMatch']);

type Handler<T extends ServerMessage['type']> = (m: Extract<ServerMessage, { type: T }>) => void;

function defaultDeps(): ClientDeps {
  return {
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    storage: safeStorage(),
    random: Math.random,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    log: (msg, detail) => console.warn(msg, detail),
  };
}

/** WebSocket client for a phone controller: validation, reconnect, queueing and RTT tracking. */
export class ControllerClient {
  /** Round-trip time of the last ping in ms (undefined until measured). */
  rttMs: number | undefined;
  /** Last protocol error code received, if any. */
  lastError: ErrorCode | undefined;
  /** Command-to-effect latency stats (intents are stamped with a `seq`; see `ack`). */
  readonly latency = new CommandLatency();
  private seq = 0;
  private connState: ConnectionState = 'idle';
  private readonly deps: ClientDeps;
  private ws: SocketLike | undefined;
  private attempt = 0;
  private retry: unknown;
  private pinger: unknown;
  private token: string | undefined;
  private queue: { msg: ClientMessage; at: number }[] = [];
  private readonly handlers = new Map<string, Set<(m: never) => void>>();
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();

  constructor(private readonly opts: ClientOptions) {
    this.deps = { ...defaultDeps(), ...opts.deps };
    this.token = loadSession(this.deps.storage)?.sessionToken;
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this.connState;
  }

  /** Observes state changes; returns an unsubscribe function. */
  onState(fn: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  /** Subscribes to one server message type; returns an unsubscribe function. */
  on<T extends ServerMessage['type']>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = handler as (m: never) => void;
    set.add(h);
    return () => set.delete(h);
  }

  /** Opens the connection. */
  connect(): void {
    if (this.connState !== 'idle' && this.connState !== 'closed') return;
    this.open('connecting');
  }

  /**
   * Re-checks the connection after the page returns from the background or the back/forward
   * cache (iOS Safari silently drops sockets while suspended). Reconnects immediately, skipping
   * any backoff wait, when the socket is gone or dead; no-op when healthy or closed for good.
   */
  resume(): void {
    if (this.connState === 'idle' || this.connState === 'closed' || this.connState === 'mismatch')
      return;
    const rs = this.ws?.readyState;
    if (this.ws && (rs === 0 || rs === OPEN)) return;
    this.deps.clearTimeout(this.retry);
    this.stopPing();
    const stale = this.ws;
    this.ws = undefined;
    if (stale) {
      stale.onclose = null;
      stale.close();
    }
    this.attempt = 0;
    this.open('reconnecting');
  }

  /** Validates and sends (or queues, while not open) a client message. */
  send(msg: ClientMessage): void {
    const parsed = ClientMessage.safeParse(msg);
    if (!parsed.success) {
      this.deps.log('dropping invalid outbound message', parsed.error.message);
      return;
    }
    const data = this.stamp(parsed.data);
    if (this.ws && this.ws.readyState === OPEN && this.connState === 'open') {
      this.ws.send(JSON.stringify(data));
      if ('seq' in data && data.seq !== undefined) this.latency.sent(data.seq, this.deps.now());
    } else if (parsed.data.type !== 'ping' && parsed.data.type !== 'hello') {
      if (this.connState === 'reconnecting' || this.connState === 'connecting')
        this.queue.push({ msg: data, at: this.deps.now() });
    }
  }

  /** Adds a client sequence number to intents that lack one. */
  private stamp(msg: ClientMessage): ClientMessage {
    if (!INTENT_TYPES.has(msg.type) || ('seq' in msg && msg.seq !== undefined)) return msg;
    return { ...msg, seq: this.seq++ } as ClientMessage;
  }

  /** Closes for good and releases timers and the socket. */
  close(): void {
    this.teardown();
    this.queue = [];
    this.setState('closed');
  }

  private teardown(): void {
    this.deps.clearTimeout(this.retry);
    this.stopPing();
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }

  private setState(s: ConnectionState): void {
    if (s === this.connState) return;
    this.connState = s;
    for (const fn of this.stateListeners) fn(s);
  }

  private open(state: ConnectionState): void {
    this.setState(state);
    const ws = this.deps.createSocket(this.opts.url);
    this.ws = ws;
    ws.onopen = () => this.sendHello(ws);
    ws.onmessage = (e) => this.handleMessage(e.data);
    ws.onclose = () => this.handleClose(ws);
    ws.onerror = () => undefined;
  }

  private sendHello(ws: SocketLike): void {
    ws.send(
      JSON.stringify({
        type: 'hello',
        role: 'controller',
        name: this.opts.name,
        roomCode: this.opts.roomCode,
        protocolVersion: PROTOCOL_VERSION,
        ...(this.token ? { sessionToken: this.token } : {}),
      }),
    );
  }

  private handleMessage(data: unknown): void {
    let msg: ServerMessage;
    try {
      msg = parseServerMessage(JSON.parse(String(data)));
    } catch (err) {
      this.deps.log('dropping invalid inbound message', err);
      return;
    }
    if (msg.type === 'welcome') this.handleWelcome(msg.sessionToken, msg.roomCode);
    else if (msg.type === 'pong') this.rttMs = Math.max(0, this.deps.now() - msg.t);
    else if (msg.type === 'error') this.handleError(msg.code);
    else if (msg.type === 'ack') this.latency.acked(msg.seq, msg.serverTick);
    else if (msg.type === 'snapshot') this.latency.snapshot(msg.tick, this.deps.now());
    for (const h of this.handlers.get(msg.type) ?? []) (h as (m: ServerMessage) => void)(msg);
  }

  private handleWelcome(token: string, roomCode: string): void {
    this.token = token;
    this.lastError = undefined;
    this.attempt = 0;
    saveSession(this.deps.storage, { name: this.opts.name, roomCode, sessionToken: token });
    this.setState('open');
    const now = this.deps.now();
    const queued = this.queue;
    this.queue = [];
    for (const q of queued) {
      if (LOBBY_TYPES.has(q.msg.type) || now - q.at <= INTENT_MAX_AGE_MS) this.send(q.msg);
    }
    this.stopPing();
    const ping = (): void => this.send({ type: 'ping', t: this.deps.now() });
    this.pinger = this.deps.setInterval(ping, PING_MS);
    ping();
  }

  private handleError(code: ErrorCode): void {
    this.lastError = code;
    if (code === 'protocol_mismatch') {
      this.teardown();
      this.setState('mismatch');
    } else if (code === 'no_room' || code === 'room_full' || code === 'bad_session') {
      if (code === 'bad_session') {
        this.token = undefined;
        clearSession(this.deps.storage);
      }
      this.close();
    }
  }

  private handleClose(ws: SocketLike): void {
    if (ws !== this.ws) return;
    this.stopPing();
    this.ws = undefined;
    this.setState('reconnecting');
    const delay = backoffDelay(this.attempt++, this.deps.random());
    this.retry = this.deps.setTimeout(() => {
      if (this.connState === 'reconnecting') this.open('reconnecting');
    }, delay);
  }

  private stopPing(): void {
    if (this.pinger !== undefined) this.deps.clearInterval(this.pinger);
    this.pinger = undefined;
  }
}
