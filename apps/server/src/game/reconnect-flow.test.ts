import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { buildServer } from '../app.js';
import { RoomManager } from '../rooms/room-manager.js';
import type { HeartbeatOptions } from '../net/heartbeat.js';

type Msg = Record<string, unknown> & { type: string };

class Client {
  readonly msgs: Msg[] = [];
  closed = false;
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      this.msgs.push(JSON.parse(String(d)) as Msg);
      this.waiters.splice(0).forEach((w) => w());
    });
    ws.on('close', () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async open(url: string, autoPong = true): Promise<Client> {
    const ws = new WebSocket(url, { autoPong });
    await new Promise((res, rej) => ws.once('open', res).once('error', rej));
    return new Client(ws);
  }
  send(m: object): void {
    this.ws.send(JSON.stringify(m));
  }
  async next(pred: (m: Msg) => boolean): Promise<Msg> {
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }
  async untilClosed(): Promise<void> {
    while (!this.closed) await new Promise<void>((r) => this.waiters.push(r));
  }
}

let app: FastifyInstance | undefined;
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await app?.close();
  app = undefined;
});

const hello = (role: string, name: string, extra: object = {}): object => ({
  type: 'hello',
  role,
  name,
  protocolVersion: PROTOCOL_VERSION,
  ...extra,
});

async function boot(rooms: RoomManager, heartbeat?: HeartbeatOptions): Promise<string> {
  app = await buildServer({
    staticDir: '/nonexistent',
    displayDir: '/nonexistent',
    rooms,
    ...(heartbeat ? { heartbeat } : {}),
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  return `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/ws`;
}

async function open(url: string, autoPong = true): Promise<Client> {
  const c = await Client.open(url, autoPong);
  clients.push(c);
  return c;
}

interface Match {
  tv: Client;
  code: string;
  players: { c: Client; id: string; token: string; team: string }[];
  active: number;
}

async function startMatch(url: string): Promise<Match> {
  const tv = await open(url);
  tv.send(hello('display', 'TV'));
  const code = (await tv.next((m) => m.type === 'welcome'))['roomCode'] as string;
  const players: Match['players'] = [];
  for (const [name, team] of [
    ['Ann', 'red'],
    ['Bob', 'blue'],
  ] as const) {
    const c = await open(url);
    c.send(hello('controller', name, { roomCode: code }));
    const w = await c.next((m) => m.type === 'welcome');
    players.push({ c, id: w['playerId'] as string, token: w['sessionToken'] as string, team });
    c.send({ type: 'setTeam', teamId: team });
    c.send({ type: 'setReady', ready: true });
  }
  await tv.next(
    (m) =>
      m.type === 'lobbyState' &&
      (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 2,
  );
  players[0]?.c.send({
    type: 'startMatch',
    settings: { turnTimeSeconds: 20, snailsPerTeam: 2, seed: 7 },
  });
  const turn = await tv.next((m) => m.type === 'turnStart');
  const active = players.findIndex((p) => p.team === turn['teamId']);
  return { tv, code, players, active };
}

describe('reconnect during a match', () => {
  it('restores lobby, match, snapshot and turn state within 3 s and can still act', async () => {
    const url = await boot(new RoomManager());
    const { tv, code, players, active } = await startMatch(url);
    const me = players[active]!;
    await me.c.next((m) => m.type === 'turnTimer'); // action phase
    me.c.ws.terminate();
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { id: string; connected: boolean }[]).some(
          (p) => p.id === me.id && !p.connected,
        ),
    );

    const t0 = Date.now();
    const c2 = await open(url);
    c2.send(hello('controller', 'Ann', { roomCode: code, sessionToken: me.token }));
    const welcome = await c2.next((m) => m.type === 'welcome');
    expect(welcome['playerId']).toBe(me.id);
    expect(welcome['sessionToken']).toBe(me.token);
    const lobby = await c2.next((m) => m.type === 'lobbyState');
    const mine = (lobby['players'] as { id: string; teamId: string; ready: boolean }[]).find(
      (p) => p.id === me.id,
    );
    expect(mine).toMatchObject({ teamId: me.team, ready: true });
    await c2.next((m) => m.type === 'matchStarted');
    await c2.next((m) => m.type === 'snapshot');
    const ts = await c2.next((m) => m.type === 'turnStart');
    expect(ts['teamId']).toBe(me.team);
    const timer = await c2.next((m) => m.type === 'turnTimer');
    expect(timer['remainingMs']).toBeGreaterThan(0);
    expect(timer['remainingMs']).toBeLessThanOrEqual(20_000);
    expect(Date.now() - t0).toBeLessThan(3000);

    // Still allowed to act on the active turn.
    c2.send({ type: 'move', direction: 'left' });
    c2.send({ type: 'endTurn' });
    const next = await c2.next((m) => m.type === 'turnStart' && m['teamId'] !== me.team);
    expect(next['teamId']).toBe(players[1 - active]!.team);
    expect(c2.msgs.some((m) => m.type === 'error' && m['code'] === 'not_your_turn')).toBe(false);
  }, 15000);

  it('a second connection with the same token replaces the first', async () => {
    const url = await boot(new RoomManager());
    const { code, players } = await startMatch(url);
    const me = players[0]!;
    const c2 = await open(url);
    c2.send(hello('controller', 'Ann', { roomCode: code, sessionToken: me.token }));
    await c2.next((m) => m.type === 'welcome');
    await me.c.untilClosed();
  }, 15000);

  it('rejects unknown tokens with bad_session', async () => {
    const url = await boot(new RoomManager());
    const { code } = await startMatch(url);
    const c = await open(url);
    c.send(hello('controller', 'Zed', { roomCode: code, sessionToken: 'f'.repeat(32) }));
    await c.next((m) => m.type === 'error' && m['code'] === 'bad_session');
    await c.untilClosed();
  }, 15000);

  it('ends the turn of a team nobody is connected for after the grace', async () => {
    const url = await boot(new RoomManager({ runner: { absentTurnGraceMs: 150 } }));
    const { tv, players, active } = await startMatch(url);
    const me = players[active]!;
    await tv.next((m) => m.type === 'turnTimer');
    me.c.ws.terminate();
    const next = await tv.next((m) => m.type === 'turnStart' && m['teamId'] !== me.team);
    expect(next['teamId']).toBe(players[1 - active]!.team);
  }, 15000);
});

describe('heartbeat over a real socket', () => {
  it('terminates a client that never answers pings or speaks', async () => {
    const rooms = new RoomManager();
    const url = await boot(rooms, { intervalMs: 40, timeoutMs: 200 });
    const c = await open(url, false);
    c.send(hello('display', 'TV'));
    const code = (await c.next((m) => m.type === 'welcome'))['roomCode'] as string;
    await c.untilClosed();
    const room = rooms.getRoom(code)!;
    expect([...room.members.values()][0]?.connected).toBe(false);
  }, 15000);

  it('keeps a client alive that answers pings', async () => {
    const url = await boot(new RoomManager(), { intervalMs: 40, timeoutMs: 200 });
    const c = await open(url, true);
    c.send(hello('display', 'TV'));
    await c.next((m) => m.type === 'welcome');
    await new Promise((r) => setTimeout(r, 500));
    expect(c.closed).toBe(false);
  }, 15000);
});
