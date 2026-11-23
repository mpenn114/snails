import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { buildServer } from '../app.js';
import { RoomManager } from '../rooms/room-manager.js';

type Msg = Record<string, unknown> & { type: string };

class Client {
  readonly msgs: Msg[] = [];
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      this.msgs.push(JSON.parse(String(d)) as Msg);
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async open(url: string): Promise<Client> {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => ws.once('open', res).once('error', rej));
    return new Client(ws);
  }
  send(m: object): void {
    this.ws.send(JSON.stringify(m));
  }
  async next(pred: (m: Msg) => boolean, from = 0): Promise<Msg> {
    for (;;) {
      const hit = this.msgs.slice(from).find(pred);
      if (hit) return hit;
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }
}

/** Test-only view into the runner's session to eliminate a team. */
interface Peek {
  session: {
    match: {
      sim: { state: { teams: { id: string; snails: { alive: boolean; health: number }[] }[] } };
    };
  };
}

let app: FastifyInstance | undefined;
const clients: Client[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.close();
  await app?.close();
  app = undefined;
});

const hello = (role: string, name: string, roomCode?: string): object => ({
  type: 'hello',
  role,
  name,
  protocolVersion: PROTOCOL_VERSION,
  ...(roomCode ? { roomCode } : {}),
});

const endedBatch = (m: Msg): boolean =>
  m.type === 'eventBatch' &&
  (m['events'] as { type: string }[]).some((e) => e.type === 'matchEnded');

describe('match end over websockets', () => {
  it('announces the winner, returns to a reset lobby and allows a new match', async () => {
    const rooms = new RoomManager({ runner: { endHoldMs: 200 } });
    app = await buildServer({ staticDir: '/nonexistent', displayDir: '/nonexistent', rooms });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/ws`;
    const open = async (): Promise<Client> => {
      const c = await Client.open(url);
      clients.push(c);
      return c;
    };
    const tv = await open();
    tv.send(hello('display', 'TV'));
    const code = (await tv.next((m) => m.type === 'welcome'))['roomCode'] as string;
    const players: Client[] = [];
    for (const [n, team] of [
      ['Ann', 'red'],
      ['Bob', 'blue'],
    ] as const) {
      const c = await open();
      c.send(hello('controller', n, code));
      await c.next((m) => m.type === 'welcome');
      c.send({ type: 'setTeam', teamId: team });
      c.send({ type: 'setReady', ready: true });
      players.push(c);
    }
    const everyone = [tv, ...players];
    const readyTwo = (m: Msg): boolean =>
      m.type === 'lobbyState' &&
      (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 2;
    await tv.next(readyTwo);
    const settings = { turnTimeSeconds: 20, snailsPerTeam: 1, seed: 5 };
    players[0]?.send({ type: 'startMatch', settings });
    const turn = await tv.next((m) => m.type === 'turnStart');
    await tv.next((m) => m.type === 'turnTimer');

    // Eliminate the team that is not on turn, then the active player ends the turn.
    const room = rooms.getRoom(code);
    const peek = room?.match as unknown as Peek;
    const loser = turn['teamId'] === 'red' ? 'blue' : 'red';
    for (const t of peek.session.match.sim.state.teams)
      if (t.id === loser) for (const s of t.snails) Object.assign(s, { alive: false, health: 0 });
    const mark = tv.msgs.length;
    (turn['teamId'] === 'red' ? players[0] : players[1])?.send({ type: 'endTurn' });

    for (const c of everyone) {
      const batch = await c.next(endedBatch);
      const ev = (batch['events'] as Msg[]).find((e) => e.type === 'matchEnded');
      expect(ev).toMatchObject({ status: 'won', winnerTeamId: turn['teamId'] });
    }
    const back = await tv.next((m) => m.type === 'lobbyState' && m['phase'] === 'lobby', mark);
    expect((back['players'] as { ready: boolean }[]).every((p) => !p.ready)).toBe(true);
    expect(tv.msgs.indexOf(back)).toBeGreaterThan(tv.msgs.findIndex(endedBatch));
    expect(room?.phase).toBe('lobby');

    // A fresh match can start in the same room.
    const mark2 = tv.msgs.length;
    for (const c of players) c.send({ type: 'setReady', ready: true });
    await tv.next(readyTwo, mark2);
    players[0]?.send({ type: 'startMatch', settings: { ...settings, seed: 6 } });
    const again = await tv.next((m) => m.type === 'matchStarted', mark2);
    expect(again['seed']).toBe(6);
    await tv.next((m) => m.type === 'turnStart', mark2);
  }, 20000);
});
