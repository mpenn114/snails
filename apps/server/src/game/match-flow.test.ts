import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { buildServer } from '../app.js';

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
  count(type: string): number {
    return this.msgs.filter((m) => m.type === type).length;
  }
  async next(pred: (m: Msg) => boolean): Promise<Msg> {
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }
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
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('match flow over websockets', () => {
  it('broadcasts the match, authorises turns and throttles aim previews', async () => {
    app = await buildServer({ staticDir: '/nonexistent', displayDir: '/nonexistent' });
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
    const ann = await open();
    const bob = await open();
    ann.send(hello('controller', 'Ann', code));
    const annId = (await ann.next((m) => m.type === 'welcome'))['playerId'] as string;
    bob.send(hello('controller', 'Bob', code));
    const bobId = (await bob.next((m) => m.type === 'welcome'))['playerId'] as string;
    ann.send({ type: 'setTeam', teamId: 'red' });
    bob.send({ type: 'setTeam', teamId: 'blue' });
    ann.send({ type: 'setReady', ready: true });
    bob.send({ type: 'setReady', ready: true });
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 2,
    );

    ann.send({ type: 'startMatch', settings: { turnTimeSeconds: 20, snailsPerTeam: 2, seed: 7 } });
    for (const c of [tv, ann, bob]) {
      const started = await c.next((m) => m.type === 'matchStarted');
      expect(started['seed']).toBe(7);
      expect(started['terrain']).toBeDefined();
      await c.next((m) => m.type === 'snapshot');
      await c.next((m) => m.type === 'turnStart');
    }
    const turn = tv.msgs.find((m) => m.type === 'turnStart') as Msg;
    const activeId = turn['teamId'] === 'red' ? annId : bobId;
    const active = activeId === annId ? ann : bob;
    const idle = activeId === annId ? bob : ann;

    // Inactive controller is rejected (once, rate-limited), active one is not.
    for (let i = 0; i < 5; i++) idle.send({ type: 'move', direction: 'left' });
    await idle.next((m) => m.type === 'error' && m['code'] === 'not_your_turn');
    await sleep(100);
    expect(idle.count('error')).toBe(1);
    expect(active.count('error')).toBe(0);

    // Display intents are refused.
    tv.send({ type: 'fire' });
    await tv.next((m) => m.type === 'error');

    await active.next((m) => m.type === 'turnTimer'); // action phase began
    // Aim burst: applied, relayed throttled to others, never echoed to the sender.
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      active.send({ type: 'aim', angle: i / 100, power: 0.5 });
      await sleep(5);
    }
    await sleep(150);
    const elapsed = Date.now() - t0;
    const previews = tv.msgs.filter((m) => m.type === 'aimPreview');
    expect(previews.length).toBeGreaterThan(1);
    expect(previews.length).toBeLessThanOrEqual(Math.ceil(elapsed / 66) + 1);
    expect(previews.at(-1)?.['angle']).toBeCloseTo(0.39);
    expect(idle.count('aimPreview')).toBe(previews.length);
    expect(active.count('aimPreview')).toBe(0);

    // Late display gets matchStarted + latest snapshot.
    const late = await open();
    late.send(hello('display', 'TV2', code));
    await late.next((m) => m.type === 'matchStarted');
    await late.next((m) => m.type === 'snapshot');
  }, 15000);

  it('returns the room to the lobby when all controllers leave', async () => {
    app = await buildServer({ staticDir: '/nonexistent', displayDir: '/nonexistent' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/ws`;
    const tv = await Client.open(url);
    clients.push(tv);
    tv.send(hello('display', 'TV'));
    const code = (await tv.next((m) => m.type === 'welcome'))['roomCode'] as string;
    const cs: Client[] = [];
    for (const [n, team] of [
      ['A', 'red'],
      ['B', 'blue'],
    ] as const) {
      const c = await Client.open(url);
      clients.push(c);
      cs.push(c);
      c.send(hello('controller', n, code));
      await c.next((m) => m.type === 'welcome');
      c.send({ type: 'setTeam', teamId: team });
      c.send({ type: 'setReady', ready: true });
    }
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 2,
    );
    cs[0]?.send({
      type: 'startMatch',
      settings: { turnTimeSeconds: 20, snailsPerTeam: 1, seed: 3 },
    });
    await tv.next((m) => m.type === 'matchStarted');
    for (const c of cs) c.ws.close();
    await sleep(100);
    const before = tv.count('snapshot');
    await sleep(300);
    expect(tv.count('snapshot')).toBe(before);
    expect(tv.msgs.at(-1)?.type).not.toBe('snapshot');
  });
});
