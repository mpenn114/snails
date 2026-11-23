import { describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { ControllerClient } from './client';
import type { SocketLike } from './client';
import { loadSession } from './session-store';
import type { StorageLike } from './session-store';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  closed = false;
  send(d: string): void {
    this.sent.push(JSON.parse(d) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  recv(m: unknown): void {
    this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const welcome = (token = 'tok'): object => ({
  type: 'welcome',
  playerId: 'p1',
  roomCode: 'ABCD',
  sessionToken: token,
  role: 'controller',
  protocolVersion: PROTOCOL_VERSION,
});

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  const intervals: { fn: () => void; id: number; cleared: boolean }[] = [];
  let now = 1000;
  const store = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
  const log = vi.fn();
  const client = new ControllerClient({
    url: 'ws://x/ws',
    name: 'Bob',
    roomCode: 'ABCD',
    deps: {
      createSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      storage,
      random: () => 1,
      now: () => now,
      setTimeout: (fn, ms) => {
        const t = { fn, ms, id: timers.length };
        timers.push(t);
        return t.id;
      },
      clearTimeout: () => undefined,
      setInterval: (fn) => {
        intervals.push({ fn, id: intervals.length, cleared: false });
        return intervals.length - 1;
      },
      clearInterval: (id) => {
        const i = intervals[id as number];
        if (i) i.cleared = true;
      },
      log,
    },
  });
  return {
    client,
    sockets,
    timers,
    intervals,
    storage,
    log,
    advance: (ms: number) => (now += ms),
  };
}

describe('ControllerClient', () => {
  it('sends hello on open, goes open on welcome and persists the token', () => {
    const t = setup();
    const states: string[] = [];
    t.client.onState((s) => states.push(s));
    t.client.connect();
    t.client.connect();
    expect(t.sockets).toHaveLength(1);
    t.sockets[0]!.open();
    expect(t.sockets[0]!.sent[0]).toMatchObject({
      type: 'hello',
      role: 'controller',
      name: 'Bob',
      roomCode: 'ABCD',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(t.sockets[0]!.sent[0]).not.toHaveProperty('sessionToken');
    const got = vi.fn();
    t.client.on('welcome', got);
    t.sockets[0]!.recv(welcome());
    expect(got).toHaveBeenCalledOnce();
    expect(states).toEqual(['connecting', 'open']);
    expect(loadSession(t.storage)?.sessionToken).toBe('tok');
  });

  it('drops invalid inbound and outbound messages', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.open();
    t.sockets[0]!.recv(welcome());
    const before = t.sockets[0]!.sent.length;
    t.sockets[0]!.recv('not json');
    t.sockets[0]!.recv({ type: 'nope' });
    t.client.send({ type: 'aim', angle: 99, power: 2 });
    expect(t.log).toHaveBeenCalledTimes(3);
    expect(t.sockets[0]!.sent).toHaveLength(before);
  });

  it('unsubscribes handlers', () => {
    const t = setup();
    const h = vi.fn();
    const off = t.client.on('pong', h);
    t.client.connect();
    t.sockets[0]!.open();
    off();
    t.sockets[0]!.recv({ type: 'pong', t: 1 });
    expect(h).not.toHaveBeenCalled();
  });

  it('pings and tracks RTT', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.open();
    t.sockets[0]!.recv(welcome());
    const ping = t.sockets[0]!.sent.find((m) => m.type === 'ping')!;
    t.advance(40);
    t.sockets[0]!.recv({ type: 'pong', t: ping.t });
    expect(t.client.rttMs).toBe(40);
    t.intervals[0]!.fn();
    expect(t.sockets[0]!.sent.filter((m) => m.type === 'ping')).toHaveLength(2);
  });

  it('reconnects with backoff, resends hello with token, queues and ages out intents', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.open();
    t.sockets[0]!.recv(welcome());
    t.sockets[0]!.drop();
    expect(t.client.state).toBe('reconnecting');
    expect(t.intervals[0]!.cleared).toBe(true);
    expect(t.timers[0]!.ms).toBe(250);
    t.client.send({ type: 'jump' });
    t.client.send({ type: 'setReady', ready: true });
    t.client.send({ type: 'ping', t: 1 });
    t.advance(1500);
    t.client.send({ type: 'fire' });
    t.timers[0]!.fn();
    expect(t.sockets).toHaveLength(2);
    t.sockets[1]!.open();
    expect(t.sockets[1]!.sent[0]).toMatchObject({ type: 'hello', sessionToken: 'tok' });
    t.sockets[1]!.recv(welcome('tok2'));
    const types = t.sockets[1]!.sent.map((m) => m.type);
    expect(types).toEqual(['hello', 'setReady', 'fire', 'ping']);
    t.sockets[1]!.drop();
    t.sockets[1]!.drop();
    expect(t.timers).toHaveLength(2);
    expect(t.timers[1]!.ms).toBe(250);
  });

  it('backs off further on repeated failures', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.drop();
    t.timers[0]!.fn();
    t.sockets[1]!.drop();
    expect(t.timers[1]!.ms).toBe(500);
  });

  it('stops reconnecting on protocol_mismatch', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.open();
    t.sockets[0]!.recv({
      type: 'error',
      code: 'protocol_mismatch',
      message: 'x',
      expected: 2,
      got: 1,
    });
    expect(t.client.state).toBe('mismatch');
    expect(t.sockets[0]!.closed).toBe(true);
    t.sockets[0]!.drop();
    expect(t.timers).toHaveLength(0);
  });

  it('closes on join errors and clears a bad session token', () => {
    const t = setup();
    t.client.connect();
    t.sockets[0]!.recv({ type: 'error', code: 'room_full', message: 'x' });
    expect(t.client.state).toBe('closed');
    expect(t.client.lastError).toBe('room_full');
    t.client.connect();
    t.sockets[1]!.recv({ type: 'error', code: 'bad_session', message: 'x' });
    expect(t.client.state).toBe('closed');
    t.client.close();
  });

  it('ignores sends while idle and ignores other errors', () => {
    const t = setup();
    t.client.send({ type: 'jump' });
    t.client.connect();
    t.sockets[0]!.recv({ type: 'error', code: 'not_host', message: 'x' });
    expect(t.client.state).toBe('connecting');
  });
});
