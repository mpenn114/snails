import { describe, expect, it } from 'vitest';
import type { MatchSetup } from '../sim/match.js';
import type { SimEvent } from '../sim/events.js';
import { endTurn, researchMatch, tech } from './research-test-helper.js';

const TECHS = [
  tech('t1'),
  tech('t2', { cost: 20, researchTurns: 2 }),
  tech('t3', { cost: 30 }),
  tech('t4', { tier: 2 }),
  tech('b1', { tier: 1, prerequisites: ['t1'] }),
  tech('o1', { anyOf: ['t1', 't2'] }),
  tech('cap1', { capstone: true, cost: 5 }),
  tech('cap2', { capstone: true, cost: 5 }),
];

const q = (techId: string, teamId = 'a') => ({ type: 'queueResearch', teamId, techId }) as const;
const cancel = (techId: string) => ({ type: 'cancelResearch', teamId: 'a', techId }) as const;
const types = (e: SimEvent[]) => e.map((x) => x.type);

function ready(setting: 'on' | 'fast' = 'on', calcium = 100): MatchSetup {
  const m = researchMatch(TECHS, setting, calcium);
  m.sim.step();
  return m;
}
/** Submits as team a and runs one step. */
function run(m: MatchSetup, cmd: Parameters<MatchSetup['sim']['submit']>[0]): SimEvent[] {
  expect(m.sim.submit(cmd, 'a')).toEqual({ ok: true });
  return m.sim.step();
}
function rejected(m: MatchSetup, techId: string, reason: string): void {
  expect(m.sim.submit(q(techId), 'a')).toMatchObject({ ok: false, reason });
}
const teamA = (m: MatchSetup) => m.sim.state.teams[0]!;

describe('research queue', () => {
  it('starts an idle queue at once, pays, and completes at the next own turn start', () => {
    const m = ready();
    const events = run(m, q('t1'));
    expect(types(events)).toEqual(['researchQueued', 'calciumChanged', 'researchStarted', 'tick']);
    expect(teamA(m).research).toMatchObject({ calcium: 90, active: { turnsLeft: 1, paid: 10 } });
    expect(types(endTurn(m))).not.toContain('researchCompleted'); // b's turn start
    expect(teamA(m).researched).toEqual([]);
    const a = endTurn(m); // a's next turn start
    expect(types(a)).toContain('researchCompleted');
    expect(teamA(m).researched).toEqual(['t1']);
    expect(teamA(m).research?.active).toBeNull();
  });

  it('multi-turn techs take their turns; the next queued tech starts in the same turn start', () => {
    const m = ready();
    run(m, q('t2'));
    run(m, q('t3'));
    expect(teamA(m).research?.queue).toEqual(['t3']);
    endTurn(m);
    endTurn(m); // a's turn start 1: 2 -> 1
    expect(teamA(m).researched).toEqual([]);
    expect(teamA(m).research?.active?.turnsLeft).toBe(1);
    endTurn(m);
    const ev = endTurn(m); // a's turn start 2: completes t2, starts t3
    expect(types(ev)).toContain('researchStarted');
    expect(teamA(m).researched).toEqual(['t2']);
    expect(teamA(m).research?.active?.techId).toBe('t3');
  });

  it('cancel: waiting is free, active refunds half rounded down', () => {
    const m = ready('on', 25);
    run(m, q('t2')); // pays 20, 5 left
    run(m, q('t3')); // unaffordable, waits
    expect(teamA(m).research?.queue).toEqual(['t3']);
    const c1 = run(m, cancel('t3'));
    expect(c1).toContainEqual(expect.objectContaining({ type: 'researchCancelled', refund: 0 }));
    expect(teamA(m).research?.calcium).toBe(5);
    const c2 = run(m, cancel('t2'));
    expect(c2).toContainEqual(expect.objectContaining({ type: 'researchCancelled', refund: 10 }));
    expect(c2).toContainEqual(
      expect.objectContaining({ type: 'calciumChanged', delta: 10, balance: 15, reason: 'refund' }),
    );
    expect(teamA(m).research).toMatchObject({ calcium: 15, active: null });
  });

  it('rounds the refund down for odd payments', () => {
    const m = ready('on', 100);
    run(m, q('cap1')); // paid 5
    const ev = run(m, cancel('cap1'));
    expect(ev).toContainEqual(expect.objectContaining({ type: 'researchCancelled', refund: 2 }));
  });

  it('an unaffordable tech waits and starts once Calcium arrives', () => {
    const m = ready('on', 5);
    run(m, q('t1'));
    expect(teamA(m).research?.active).toBeNull();
    expect(teamA(m).research?.queue).toEqual(['t1']);
    teamA(m).research!.calcium = 10;
    endTurn(m);
    endTurn(m); // a's turn start picks it up
    expect(teamA(m).research?.active?.techId).toBe('t1');
    expect(teamA(m).research?.calcium).toBe(0);
  });

  it('enforces the tier gate (tier N needs N-1 techs, queued ones count)', () => {
    const m = ready();
    rejected(m, 't4', 'TIER_LOCKED');
    run(m, q('t1'));
    expect(m.sim.submit(q('t4'), 'a')).toEqual({ ok: true });
  });

  it('checks prerequisites and anyOf', () => {
    const m = ready();
    rejected(m, 'b1', 'PREREQ_MISSING');
    rejected(m, 'o1', 'PREREQ_MISSING');
    run(m, q('t1'));
    expect(m.sim.submit(q('b1'), 'a')).toEqual({ ok: true });
    expect(m.sim.submit(q('o1'), 'a')).toEqual({ ok: true });
  });

  it('allows one capstone per team and limits the waiting queue', () => {
    const m = ready('on', 5);
    run(m, q('cap1'));
    rejected(m, 'cap2', 'CAPSTONE_LIMIT');
    run(m, q('t1'));
    run(m, q('t2'));
    rejected(m, 't3', 'QUEUE_FULL');
  });

  it('fast mode halves cost (rounded up) and shortens turns', () => {
    const m = ready('fast');
    run(m, q('t2'));
    expect(teamA(m).research).toMatchObject({ calcium: 90, active: { turnsLeft: 1, paid: 10 } });
    run(m, q('cap1')); // cost 5 -> 3, waits behind the active tech
    expect(teamA(m).research?.queue).toEqual(['cap1']);
    endTurn(m);
    endTurn(m);
    expect(teamA(m).researched).toEqual(['t2']);
    expect(teamA(m).research).toMatchObject({ calcium: 87, active: { techId: 'cap1', paid: 3 } });
  });

  it('rejects invalid commands', () => {
    const m = ready();
    rejected(m, 'nope', 'UNKNOWN_TECH');
    run(m, q('t1'));
    rejected(m, 't1', 'ALREADY_QUEUED');
    expect(m.sim.submit(q('t1', 'b'), 'a')).toMatchObject({ reason: 'NOT_YOUR_TURN' });
    expect(m.sim.submit(q('t1', 'zz'), 'zz')).toMatchObject({ reason: 'UNKNOWN_TEAM' });
    expect(m.sim.submit(cancel('t3'), 'a')).toMatchObject({ reason: 'NOT_QUEUED' });
    endTurn(m);
    endTurn(m);
    rejected(m, 't1', 'ALREADY_RESEARCHED');
  });

  it('accepts research from either team in any phase, and rejects when research is off', () => {
    const m = ready();
    expect(m.sim.submit(q('t1', 'b'), 'b')).toEqual({ ok: true });
    m.sim.state.turn.phase = 'resolve';
    expect(m.sim.submit(q('t1'), 'a')).toEqual({ ok: true });
    m.sim.state.research = 'off';
    rejected(m, 't3', 'RESEARCH_OFF');
  });

  it('drops a queued tech that is no longer valid when it would start', () => {
    const m = ready();
    teamA(m).research!.queue = ['cap2'];
    teamA(m).researched.push('cap1');
    endTurn(m);
    const events = endTurn(m);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'researchCancelled', techId: 'cap2', refund: 0 }),
    );
    expect(teamA(m).research?.queue).toEqual([]);
  });
});
