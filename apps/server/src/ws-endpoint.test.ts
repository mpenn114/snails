import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { buildServer } from './app.js';

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

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const readyCount = (m: Msg): number =>
  (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length;

describe('/ws integration', () => {
  it('display creates a room, controllers join, host starts the match', async () => {
    app = await buildServer({ staticDir: '/nonexistent', displayDir: '/nonexistent' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/ws`;
    const hello = (role: string, name: string, roomCode?: string) => ({
      type: 'hello',
      role,
      name,
      protocolVersion: PROTOCOL_VERSION,
      ...(roomCode ? { roomCode } : {}),
    });

    const tv = await Client.open(url);
    tv.send(hello('display', 'TV'));
    const welcome = await tv.next((m) => m.type === 'welcome');
    const code = welcome['roomCode'] as string;
    expect(code).toMatch(/^[A-Z]{4}$/);

    const c1 = await Client.open(url);
    const c2 = await Client.open(url);
    c1.send(hello('controller', 'Ann', code.toLowerCase()));
    const w1 = await c1.next((m) => m.type === 'welcome');
    c2.send(hello('controller', 'Bob', code));
    await c2.next((m) => m.type === 'welcome');
    const lobby = await tv.next(
      (m) => m.type === 'lobbyState' && (m['players'] as unknown[]).length === 3,
    );
    expect(lobby['hostId']).toBe(w1['playerId']);

    c1.send({ type: 'setTeam', teamId: 'red' });
    c2.send({ type: 'setTeam', teamId: 'blue' });
    c1.send({ type: 'setReady', ready: true });
    c2.send({ type: 'setReady', ready: true });
    await tv.next((m) => m.type === 'lobbyState' && readyCount(m) === 2);

    const settings = { turnTimeSeconds: 20, snailsPerTeam: 2, seed: 99 };
    c2.send({ type: 'startMatch', settings });
    await c2.next((m) => m.type === 'error' && m['code'] === 'not_host');
    c1.send({ type: 'startMatch', settings });
    const started = await tv.next(
      (m) => m.type === 'lobbyState' && (m['settings'] as { seed: number }).seed === 99,
    );
    expect(started['settings']).toEqual({ ...settings, controlMode: 'perPlayer' });

    c1.send({ type: 'ping', t: 3 });
    expect(await c1.next((m) => m.type === 'pong')).toEqual({ type: 'pong', t: 3 });
    for (const c of [tv, c1, c2]) c.ws.close();
  });
});
