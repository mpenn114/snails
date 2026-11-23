import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { Connection, type ConnectionHandler, type SocketLike } from './connection.js';
import { RoomManager, type Member } from '../rooms/room-manager.js';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closed: number | undefined;
  pings = 0;
  terminated = false;
  private cbs: Record<string, ((d?: unknown) => void) | undefined> = {};
  send(d: string): void {
    this.sent.push(JSON.parse(d) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closed = code ?? 1000;
  }
  on(event: string, cb: (d?: unknown) => void): void {
    this.cbs[event] = cb;
  }
  ping(): void {
    this.pings++;
  }
  terminate(): void {
    this.terminated = true;
  }
  recv(v: object): void {
    this.cbs['message']?.(JSON.stringify(v));
  }
  fire(event: string): void {
    this.cbs[event]?.();
  }
}

const handler: ConnectionHandler = { onLobbyAction() {}, onIntent() {}, onPing() {} };
const hello = (extra: object): object => ({
  type: 'hello',
  role: 'controller',
  name: 'Ann',
  protocolVersion: PROTOCOL_VERSION,
  ...extra,
});

function lobby() {
  const rooms = new RoomManager();
  const tv = new FakeSocket();
  new Connection(tv, { rooms, handler });
  tv.recv(hello({ role: 'display', name: 'TV' }));
  const code = tv.sent[0]!['roomCode'] as string;
  const join = (extra: object = {}): FakeSocket => {
    const s = new FakeSocket();
    new Connection(s, { rooms, handler });
    s.recv(hello({ roomCode: code, ...extra }));
    return s;
  };
  return { rooms, tv, code, join };
}

describe('session resume', () => {
  it('reattaches the member, closes the stale socket and ignores its late close', () => {
    const { rooms, code, join } = lobby();
    const a = join();
    const w = a.sent[0]!;
    const b = join({ sessionToken: w['sessionToken'] });
    expect(b.sent[0]).toMatchObject({ type: 'welcome', playerId: w['playerId'] });
    expect(b.sent[1]).toMatchObject({ type: 'lobbyState' });
    expect(a.closed).toBe(1000);
    a.fire('close');
    const m = rooms.getRoom(code)!.members.get(w['sessionToken'] as string) as Member;
    expect(m.connected).toBe(true);
  });

  it('reports bad_session for unknown tokens, wrong roles and unknown rooms', () => {
    const { tv, code, join } = lobby();
    const a = join({ sessionToken: 'nope' });
    expect(a.sent[0]).toMatchObject({ type: 'error', code: 'bad_session' });
    expect(a.closed).toBe(1008);
    const b = join({ sessionToken: tv.sent[0]!['sessionToken'] });
    expect(b.sent[0]).toMatchObject({ code: 'bad_session' });
    const c = new FakeSocket();
    new Connection(c, { rooms: new RoomManager(), handler });
    c.recv(hello({ roomCode: code, sessionToken: 'nope' }));
    expect(c.sent[0]).toMatchObject({ code: 'bad_session' });
  });
});

describe('heartbeat', () => {
  it('pings, accepts pongs and terminates a silent socket', () => {
    let now = 0;
    let tick: (() => void) | undefined;
    const sock = new FakeSocket();
    const rooms = new RoomManager();
    new Connection(sock, {
      rooms,
      handler,
      heartbeat: {
        intervalMs: 5000,
        timeoutMs: 15_000,
        now: () => now,
        timers: {
          setInterval: (f) => ((tick = f), 1),
          clearInterval: () => void (tick = undefined),
        },
      },
    });
    sock.recv(hello({ role: 'display', name: 'TV' }));
    now = 5000;
    tick?.();
    now = 10_000;
    sock.fire('pong');
    now = 20_000;
    tick?.();
    expect(sock.pings).toBe(2);
    now = 26_000;
    tick?.();
    expect(sock.terminated).toBe(true);
    const code = sock.sent[0]!['roomCode'] as string;
    expect([...rooms.getRoom(code)!.members.values()][0]?.connected).toBe(false);
  });
});
