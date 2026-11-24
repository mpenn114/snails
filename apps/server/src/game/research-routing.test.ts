import { describe, expect, it } from 'vitest';
import { MatchSettings, type ServerMessage, type Snapshot } from '@snails/protocol';
import type { Member, Room } from '../rooms/room.js';
import type { GameState } from '@snails/core';
import { MatchRunner } from './match-runner.js';
import { GameSession } from './game-session.js';

const settings = {
  turnTimeSeconds: 10,
  snailsPerTeam: 1,
  seed: 7,
  research: 'on' as const,
  controlMode: 'perPlayer' as const,
};

type Fake = Member & { got: ServerMessage[] };

function member(id: string, role: Member['role'], teamIds: string[]): Fake {
  const got: ServerMessage[] = [];
  return {
    id,
    token: id,
    name: id,
    role,
    teamId: teamIds[0] ?? null,
    teamIds,
    colour: null,
    ready: true,
    connected: true,
    send: (m: ServerMessage) => void got.push(m),
    got,
  } as Fake;
}

function start(hotSeat = false): { runner: MatchRunner; tv: Fake; a: Fake; b: Fake } {
  const tv = member('tv', 'display', []);
  const a = member('a1', 'controller', hotSeat ? ['a', 'b'] : ['a']);
  const b = member('b1', 'controller', ['b']);
  const all = hotSeat ? [tv, a] : [tv, a, b];
  const room = { members: new Map(all.map((m) => [m.id, m])) } as unknown as Room;
  const cfg = { ...settings, controlMode: hotSeat ? ('hotSeat' as const) : ('perPlayer' as const) };
  return { runner: new MatchRunner(room, MatchSettings.parse(cfg), all), tv, a, b };
}

const lastTeams = (m: Fake): NonNullable<Snapshot['teams']> =>
  m.got.filter((x): x is Snapshot => x.type === 'snapshot').at(-1)?.teams ?? [];

/** Turns research on in the running sim (the core economy job wires this at match start). */
function enableResearch(runner: MatchRunner): void {
  const session = (runner as unknown as { session: GameSession }).session;
  const { state } = (session as unknown as { match: { sim: { state: GameState } } }).match.sim;
  state.research = 'on';
  for (const t of state.teams)
    t.research = {
      calcium: 7,
      queue: [],
      active: null,
      damageCalciumThisTurn: 0,
      roundsSinceDamage: 0,
    };
  session.advance(200);
}

describe('research privacy in the match runner', () => {
  it('display sees no research objects; controllers only their own', () => {
    const { runner, tv, a, b } = start();
    enableResearch(runner);
    runner.stop();
    expect(lastTeams(tv)).toHaveLength(2);
    expect(lastTeams(tv).every((t) => t.research === undefined)).toBe(true);
    expect(lastTeams(a).map((t) => [t.id, !!t.research])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(lastTeams(b).map((t) => [t.id, !!t.research])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('hot-seat phone sees every team; catch-up is filtered the same way', () => {
    const { runner, a } = start(true);
    enableResearch(runner);
    expect(lastTeams(a)).toHaveLength(2);
    expect(lastTeams(a).every((t) => !!t.research)).toBe(true);
    const late = member('tv2', 'display', []);
    runner.catchUp(late);
    const ctl = member('b1', 'controller', ['b']);
    runner.catchUp(ctl);
    runner.stop();
    expect(lastTeams(late)).toHaveLength(2);
    expect(lastTeams(late).some((t) => t.research !== undefined)).toBe(false);
    expect(lastTeams(ctl).map((t) => !!t.research)).toEqual([false, true]);
  });

  it('routes research intents to the sim with the sender team in any phase', () => {
    const calls: unknown[][] = [];
    const s = new GameSession({
      settings,
      teams: [
        { id: 'a', name: 'A', colour: '#f00', playerIds: ['p1'] },
        { id: 'b', name: 'B', colour: '#00f', playerIds: ['p2'] },
      ],
    });
    const { sim } = (s as unknown as { match: { sim: { submit: (...a: unknown[]) => unknown } } })
      .match as { sim: { submit: (...a: unknown[]) => unknown } };
    const orig = sim.submit.bind(sim);
    sim.submit = (...args: unknown[]) => (calls.push(args), orig(...args));
    s.applyIntent('p2', { type: 'queueResearch', techId: 'iron-plating' });
    s.applyIntent('p1', { type: 'cancelResearch', techId: 'iron-plating' });
    expect(calls).toEqual([
      [{ type: 'queueResearch', teamId: 'b', techId: 'iron-plating' }, 'b'],
      [{ type: 'cancelResearch', teamId: 'a', techId: 'iron-plating' }, 'a'],
    ]);
    expect(s.applyIntent('nobody', { type: 'queueResearch', techId: 'x' })).toEqual({
      ok: false,
      reason: 'unknown_player',
    });
  });

  it('a real session registers the base techs: queueing one starts research', () => {
    const s = new GameSession({
      settings,
      teams: [
        { id: 'a', name: 'A', colour: '#f00', playerIds: ['p1'] },
        { id: 'b', name: 'B', colour: '#00f', playerIds: ['p2'] },
      ],
    });
    const { state } = (s as unknown as { match: { sim: { state: GameState } } }).match.sim;
    const team = state.teams.find((t) => t.id === 'a')!;
    team.research!.calcium = 100;
    expect(s.applyIntent('p1', { type: 'queueResearch', techId: 'salt-mining' })).toEqual({
      ok: true,
    });
    s.advance(50);
    // Paid at once; the match's first turn start may already have completed the 1-turn tech.
    expect(team.research?.calcium).toBe(90);
    const done = team.researched.includes('salt-mining');
    expect(done || team.research?.active?.techId === 'salt-mining').toBe(true);
  });
});
