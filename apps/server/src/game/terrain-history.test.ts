import { describe, expect, it } from 'vitest';
import type { MatchSettings, ServerMessage } from '@snails/protocol';
import type { Member, Room } from '../rooms/room.js';
import { MatchRunner } from './match-runner.js';
import type { SessionClock } from './game-session.js';

function member(
  id: string,
  team: string | null,
  role: Member['role'],
  out: ServerMessage[],
): Member {
  return {
    id,
    token: id,
    name: id,
    role,
    teamId: team,
    teamIds: team ? [team] : [],
    colour: null,
    ready: true,
    connected: true,
    send: (m) => out.push(m),
  };
}

const settings = { turnTimeSeconds: 20, snailsPerTeam: 1, seed: 7 } as unknown as MatchSettings;

const isTerrain = (e: { type: string }): boolean =>
  e.type === 'terrainCarved' || e.type === 'terrainCollapsed';

describe('terrain history catch-up', () => {
  it('sends the ordered terrain events after matchStarted and before the snapshot', () => {
    let t = 0;
    let tick: (() => void) | null = null;
    const clock: SessionClock = {
      now: () => t,
      setInterval: (fn) => {
        tick = fn;
        return 1;
      },
      clearInterval: () => undefined,
    };
    const tvOut: ServerMessage[] = [];
    const tv = member('tv', null, 'display', tvOut);
    const ann = member('ann', 'red', 'controller', []);
    const bob = member('bob', 'blue', 'controller', []);
    const room = {
      members: new Map([tv, ann, bob].map((m) => [m.token, m])),
      cpuTeams: [],
    } as unknown as Room;
    const runner = new MatchRunner(room, settings, [ann, bob], {
      clock,
      setTimeout: () => 0,
      clearTimeout: () => undefined,
    });
    const advance = (ms: number): void => {
      for (let i = 0; i < ms / 16; i++) {
        t += 16;
        (tick as (() => void) | null)?.();
      }
    };
    const liveTerrain = (): unknown[] =>
      tvOut.flatMap((m) => (m.type === 'eventBatch' ? m.events.filter(isTerrain) : []));

    advance(6000);
    const turn = tvOut.find((m) => m.type === 'turnStart');
    const commander = turn?.type === 'turnStart' && turn.teamId === 'red' ? ann : bob;
    runner.intent(commander, { type: 'aim', angle: 0.3, power: 0.3 });
    runner.intent(commander, { type: 'fire' });
    for (let i = 0; i < 40 && liveTerrain().length === 0; i++) advance(500);
    expect(liveTerrain().length).toBeGreaterThan(0);

    const late: ServerMessage[] = [];
    runner.catchUp(member('tv2', null, 'display', late));
    expect(late.slice(0, 3).map((m) => m.type)).toEqual([
      'matchStarted',
      'terrainHistory',
      'snapshot',
    ]);
    const hist = late[1];
    if (hist?.type !== 'terrainHistory') throw new Error('no history');
    expect(hist.events).toEqual(liveTerrain());
    runner.stop();
  });

  it('sends no history before anything changed the terrain', () => {
    const out: ServerMessage[] = [];
    const ann = member('ann', 'red', 'controller', []);
    const bob = member('bob', 'blue', 'controller', []);
    const room = { members: new Map(), cpuTeams: [] } as unknown as Room;
    const clock: SessionClock = {
      now: () => 0,
      setInterval: () => 1,
      clearInterval: () => undefined,
    };
    const runner = new MatchRunner(room, settings, [ann, bob], { clock });
    runner.catchUp(member('tv', null, 'display', out));
    expect(out.map((m) => m.type)).not.toContain('terrainHistory');
    runner.stop();
  });
});
