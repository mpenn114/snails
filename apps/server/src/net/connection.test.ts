import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { Connection, type ConnectionHandler, type SocketLike } from './connection.js';
import { RoomManager } from '../rooms/room-manager.js';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closed: number | undefined;
  private msg: ((d: unknown) => void) | undefined;
  private cls: (() => void) | undefined;
  send(d: string): void {
    this.sent.push(JSON.parse(d) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closed = code ?? 1000;
  }
  on(event: 'message', cb: (d: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: string, cb: (d?: unknown) => void): void {
    if (event === 'message') this.msg = cb;
    else this.cls = cb;
  }
  recv(v: unknown): void {
    this.msg?.(typeof v === 'string' ? v : JSON.stringify(v));
  }
  hangUp(): void {
    this.cls?.();
  }
}

const hello = (extra: object = {}) => ({
  type: 'hello',
  role: 'display',
  name: 'TV',
  protocolVersion: PROTOCOL_VERSION,
  ...extra,
});

function setup(maxStrikes?: number) {
  const calls: string[] = [];
  const handler: ConnectionHandler = {
    onLobbyAction: (_c, a) => void calls.push(`lobby:${a.type}`),
    onIntent: (_c, i) => void calls.push(`intent:${i.type}`),
    onPing: () => void calls.push('ping'),
  };
  const rooms = new RoomManager();
  const sock = new FakeSocket();
  new Connection(sock, { rooms, handler, ...(maxStrikes ? { maxStrikes } : {}) });
  return { sock, rooms, calls };
}

describe('Connection', () => {
  it('display hello creates a room and gets a welcome with a random token', () => {
    const { sock, rooms } = setup();
    sock.recv(hello());
    const w = sock.sent[0]!;
    expect(w).toMatchObject({ type: 'welcome', role: 'display' });
    expect(w['sessionToken']).toMatch(/^[0-9a-f]{32}$/);
    expect(w['sessionToken']).not.toBe(w['playerId']);
    expect(rooms.getRoom(w['roomCode'] as string)).toBeDefined();
    expect(sock.sent[1]).toMatchObject({ type: 'lobbyState' });
  });

  it('closes when the first message is not a valid hello', () => {
    const a = setup();
    a.sock.recv({ type: 'ping', t: 1 });
    expect(a.sock.sent[0]).toMatchObject({ type: 'error', code: 'bad_message' });
    expect(a.sock.closed).toBe(1008);
    const b = setup();
    b.sock.recv('not json');
    expect(b.sock.closed).toBe(1008);
  });

  it('reports protocol mismatch and unknown rooms, then closes', () => {
    const a = setup();
    a.sock.recv(hello({ protocolVersion: PROTOCOL_VERSION + 1 }));
    expect(a.sock.sent[0]).toMatchObject({ code: 'protocol_mismatch', got: PROTOCOL_VERSION + 1 });
    expect(a.sock.closed).toBe(1008);
    const b = setup();
    b.sock.recv(hello({ role: 'controller', roomCode: 'ZZZZ' }));
    expect(b.sock.sent[0]).toMatchObject({ code: 'no_room' });
    const c = setup();
    c.sock.recv(hello({ role: 'controller' }));
    expect(c.sock.sent[0]).toMatchObject({ code: 'no_room' });
  });

  it('answers pings and dispatches lobby actions and intents', () => {
    const { sock, calls } = setup();
    sock.recv(hello());
    sock.recv({ type: 'ping', t: 5 });
    expect(sock.sent.at(-1)).toEqual({ type: 'pong', t: 5 });
    sock.recv({ type: 'setReady', ready: true });
    sock.recv({ type: 'jump' });
    expect(calls).toEqual(['ping', 'lobby:setReady', 'intent:jump']);
  });

  it('counts strikes for invalid messages and closes after the limit', () => {
    const { sock, calls } = setup(3);
    sock.recv(hello());
    sock.recv({ type: 'nope' });
    sock.recv('garbage');
    expect(sock.closed).toBeUndefined();
    sock.recv({ type: 'createRoom' });
    expect(sock.sent.filter((m) => m['code'] === 'bad_message')).toHaveLength(3);
    expect(sock.closed).toBe(1008);
    expect(calls).toEqual([]);
  });

  it('removes the member on close', () => {
    const { sock, rooms } = setup();
    sock.recv(hello());
    const code = sock.sent[0]!['roomCode'] as string;
    sock.hangUp();
    expect(rooms.getRoom(code)?.members.size).toBe(0);
  });
});
