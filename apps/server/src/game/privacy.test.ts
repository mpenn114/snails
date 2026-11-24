import { describe, expect, it } from 'vitest';
import type { EventBatch, Snapshot } from '@snails/protocol';
import { filterMessage, researchFields } from './privacy.js';

const research = (calcium: number): NonNullable<Snapshot['teams']>[number]['research'] => ({
  calcium,
  queue: ['x'],
  active: { techId: 'iron-plating', turnsLeft: 2, paid: 10 },
  damageCalciumThisTurn: 0,
  roundsSinceDamage: 0,
});

const snap: Snapshot = {
  type: 'snapshot',
  tick: 1,
  wind: [0, 0],
  turn: [null, null, 0, 0, 1],
  snails: [],
  projectiles: [],
  research: 'on',
  teams: [
    { id: 'a', researching: true, research: research(5) },
    { id: 'b', researching: false, research: research(9) },
  ],
};

const batch: EventBatch = {
  type: 'eventBatch',
  tick: 1,
  events: [
    { type: 'tick', tick: 1 },
    { type: 'calciumChanged', teamId: 'a', delta: 1, balance: 5, reason: 'turnIncome' },
    { type: 'researchQueued', teamId: 'b', techId: 't' },
    { type: 'researchStarted', teamId: 'a', techId: 't', turns: 1, cost: 5 },
    { type: 'researchCancelled', teamId: 'b', techId: 't', refund: 2 },
    { type: 'researchCompleted', teamId: 'b', techId: 't' },
  ],
};

const teamsOf = (m: unknown): Snapshot['teams'] => (m as Snapshot).teams;
const typesOf = (m: unknown): string[] => (m as EventBatch).events.map((e) => e.type);

describe('privacy filter', () => {
  it('strips every research object for a display but keeps researching flags', () => {
    const t = teamsOf(filterMessage(snap, []));
    expect(t?.map((e) => e.research)).toEqual([undefined, undefined]);
    expect(t?.map((e) => e.researching)).toEqual([true, false]);
  });

  it('shows a controller only its own team, hot-seat all of its teams', () => {
    expect(teamsOf(filterMessage(snap, ['a']))?.map((e) => !!e.research)).toEqual([true, false]);
    expect(teamsOf(filterMessage(snap, ['a', 'b']))?.map((e) => !!e.research)).toEqual([
      true,
      true,
    ]);
  });

  it('does not mutate the input snapshot', () => {
    filterMessage(snap, []);
    expect(snap.teams?.[0]?.research?.calcium).toBe(5);
  });

  it('filters private events per owner and keeps researchCompleted public', () => {
    expect(typesOf(filterMessage(batch, []))).toEqual(['tick', 'researchCompleted']);
    expect(typesOf(filterMessage(batch, ['a']))).toEqual([
      'tick',
      'calciumChanged',
      'researchStarted',
      'researchCompleted',
    ]);
    expect(typesOf(filterMessage(batch, ['a', 'b']))).toHaveLength(6);
  });

  it('passes other messages through and omits research fields when off', () => {
    const ping = { type: 'turnTimer', remainingMs: 1 } as const;
    expect(filterMessage(ping, [])).toBe(ping);
    expect(researchFields({ teams: [] })).toEqual({});
    expect(researchFields({ research: 'off', teams: [] })).toEqual({});
  });
});

describe('intel techs', () => {
  const withFlags = (aFlags: string[]): Snapshot => ({
    ...snap,
    nextWind: [3000, 100],
    teams: [
      { id: 'a', researching: true, research: research(5), flags: aFlags },
      { id: 'b', researching: false, research: research(9) },
    ],
  });

  it('Scouting Mist reveals opponents research to its team only', () => {
    const s = withFlags(['seeOpponentResearch']);
    expect(teamsOf(filterMessage(s, ['a']))?.map((e) => !!e.research)).toEqual([true, true]);
    expect(teamsOf(filterMessage(s, ['b']))?.map((e) => !!e.research)).toEqual([false, true]);
    expect(teamsOf(filterMessage(s, []))?.map((e) => !!e.research)).toEqual([false, false]);
  });

  it('the Oracle reveals research and the next wind; Weather Vane only the wind', () => {
    const oracle = filterMessage(withFlags(['seeAll']), ['a']) as Snapshot;
    expect(oracle.nextWind).toEqual([3000, 100]);
    expect(oracle.teams?.[1]?.research).toBeDefined();
    const vane = filterMessage(withFlags(['seeNextWind']), ['a']) as Snapshot;
    expect(vane.nextWind).toEqual([3000, 100]);
    expect(vane.teams?.[1]?.research).toBeUndefined();
  });

  it('hides the next wind from everyone without the flag and exposes team flags', () => {
    const s = withFlags(['seeNextWind']);
    expect((filterMessage(s, ['b']) as Snapshot).nextWind).toBeUndefined();
    expect((filterMessage(s, []) as Snapshot).nextWind).toBeUndefined();
    expect(teamsOf(filterMessage(s, ['b']))?.[0]?.flags).toEqual(['seeNextWind']);
  });

  it('researchFields lists the flags of completed techs', () => {
    const team = { id: 'a', researched: ['t'], snails: [] } as never;
    const techs = {
      get: () => ({ effects: [{ type: 'setFlag', flag: 'seeAll' }] }) as never,
    };
    expect(researchFields({ research: 'on', teams: [team] }, techs).teams?.[0]?.flags).toEqual([
      'seeAll',
    ]);
  });
});
