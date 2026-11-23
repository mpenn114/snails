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

async function boot(): Promise<{ open: () => Promise<Client>; code: string; tv: Client }> {
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
  return { open, code, tv };
}

async function join(c: Client, name: string, code: string): Promise<string> {
  c.send(hello('controller', name, code));
  return (await c.next((m) => m.type === 'welcome'))['playerId'] as string;
}

const errors = (c: Client): Msg[] => c.msgs.filter((m) => m.type === 'error');

describe('control modes over websockets', () => {
  it('perPlayer: only the designated phone of the active team commands', async () => {
    const { open, code, tv } = await boot();
    const [ann, cat, bob] = [await open(), await open(), await open()];
    const ids = [await join(ann, 'Ann', code), await join(cat, 'Cat', code)];
    const bobId = await join(bob, 'Bob', code);
    ann.send({ type: 'setTeam', teamId: 'red' });
    cat.send({ type: 'setTeam', teamId: 'red' });
    bob.send({ type: 'setTeam', teamId: 'blue' });
    for (const c of [ann, cat, bob]) c.send({ type: 'setReady', ready: true });
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 3,
    );
    ann.send({
      type: 'startMatch',
      settings: { turnTimeSeconds: 20, snailsPerTeam: 1, seed: 7, controlMode: 'perPlayer' },
    });
    const turn = await tv.next((m) => m.type === 'turnStart');
    const active = turn['activePlayerId'] as string;
    expect([...ids, bobId]).toContain(active);
    const byId = new Map([
      [ids[0] as string, ann],
      [ids[1] as string, cat],
      [bobId, bob],
    ]);
    await tv.next((m) => m.type === 'turnTimer');
    const members = turn['teamId'] === 'red' ? ids : [bobId];
    for (const id of byId.keys()) byId.get(id)?.send({ type: 'move', direction: 'left' });
    await sleep(150);
    for (const [id, c] of byId) {
      const allowed = id === active;
      expect(errors(c).filter((e) => e['code'] === 'not_your_turn')).toHaveLength(allowed ? 0 : 1);
    }
    expect(members).toContain(active);
  });

  it('hotSeat: one phone drives several teams across turns', async () => {
    const { open, code, tv } = await boot();
    const solo = await open();
    await join(solo, 'Solo', code);
    for (const teamId of ['red', 'blue']) solo.send({ type: 'toggleTeam', teamId });
    solo.send({ type: 'setReady', ready: true });
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { teamIds: string[] }[]).some((p) => p.teamIds.length === 2),
    );
    solo.send({
      type: 'startMatch',
      settings: { turnTimeSeconds: 10, snailsPerTeam: 1, seed: 7, controlMode: 'hotSeat' },
    });
    const started = await solo.next((m) => m.type === 'matchStarted');
    expect((started['settings'] as { controlMode: string }).controlMode).toBe('hotSeat');
    const first = await solo.next((m) => m.type === 'turnStart');
    expect(['red', 'blue']).toContain(first['teamId']);
    await solo.next((m) => m.type === 'turnTimer');
    solo.send({ type: 'move', direction: 'right' });
    solo.send({ type: 'endTurn' });
    const second = await solo.next(
      (m) => m.type === 'turnStart' && m['teamId'] !== first['teamId'],
    );
    expect(second['teamId']).not.toBe(first['teamId']);
    solo.send({ type: 'move', direction: 'left' });
    await sleep(150);
    expect(errors(solo)).toEqual([]);
  });

  it('keeps lobbyState phase "match" for roster updates during a match', async () => {
    const { open, code, tv } = await boot();
    const [ann, bob] = [await open(), await open()];
    await join(ann, 'Ann', code);
    await join(bob, 'Bob', code);
    ann.send({ type: 'setTeam', teamId: 'red' });
    bob.send({ type: 'setTeam', teamId: 'blue' });
    for (const c of [ann, bob]) c.send({ type: 'setReady', ready: true });
    await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { ready: boolean }[]).filter((p) => p.ready).length === 2,
    );
    ann.send({ type: 'startMatch', settings: { turnTimeSeconds: 20, snailsPerTeam: 1, seed: 7 } });
    await tv.next((m) => m.type === 'matchStarted');
    bob.ws.close();
    const mid = await tv.next(
      (m) =>
        m.type === 'lobbyState' &&
        (m['players'] as { connected: boolean }[]).some((p) => !p.connected),
    );
    expect(mid['phase']).toBe('match');
  });
});
