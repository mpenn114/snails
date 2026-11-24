import { describe, expect, it } from 'vitest';
import type { TechnologyDefinition } from '@snails/core';
import type { WireEvent } from '@snails/protocol';
import { actingTeam, createHoldReveal } from './hold-reveal';
import { buildResearchModel } from './research-model';
import { createResearchStore, rejectionText } from './research-store';

const tech = (p: Partial<TechnologyDefinition> & { id: string }): TechnologyDefinition => ({
  name: p.id.toUpperCase(),
  branch: 'weaponry',
  tier: 1,
  cost: 20,
  prerequisites: [],
  description: '',
  ...p,
});
const techs = [
  tech({ id: 'a' }),
  tech({ id: 'b', branch: 'shell', cost: 30, researchTurns: 2 }),
  tech({ id: 'c', tier: 2, prerequisites: ['a'] }),
  tech({ id: 'd', tier: 3, prerequisites: ['zzz'] }),
];
const research = (over = {}) => ({
  calcium: 50,
  queue: [],
  active: null,
  damageCalciumThisTurn: 0,
  roundsSinceDamage: 0,
  ...over,
});
const card = (m: ReturnType<typeof buildResearchModel>, id: string) =>
  m?.columns.flatMap((c) => c.cards).find((c) => c.id === id);

describe('buildResearchModel', () => {
  it('is null when research is off or the private entry is missing', () => {
    expect(
      buildResearchModel({ setting: 'off', entry: { id: 'A', research: research() }, techs }),
    ).toBe(null);
    expect(buildResearchModel({ setting: 'on', entry: { id: 'A' }, techs })).toBe(null);
  });

  it('resolves card states, costs and lock reasons', () => {
    const m = buildResearchModel({
      setting: 'on',
      entry: {
        id: 'A',
        researched: ['a'],
        research: research({ active: { techId: 'b', turnsLeft: 1, paid: 30 }, queue: ['c'] }),
      },
      techs,
    });
    expect(card(m, 'a')?.state).toBe('researched');
    expect(card(m, 'b')?.state).toBe('active');
    expect(card(m, 'c')?.state).toBe('queued');
    expect(card(m, 'd')?.state).toBe('locked');
    expect(card(m, 'd')?.reason).toBeTruthy();
    expect(m?.calcium).toBe(50);
    expect(m?.active).toMatchObject({ techId: 'b', turns: 1 });
    expect(m?.queue.map((q) => q.techId)).toEqual(['c']);
    expect(m?.columns.map((c) => c.branch)).toEqual(['weaponry', 'shell', 'mobility', 'utility']);
  });

  it('marks tier-1 techs available and honours fast mode cost and turns', () => {
    const entry = { id: 'A', research: research() };
    expect(card(buildResearchModel({ setting: 'on', entry, techs }), 'b')).toMatchObject({
      state: 'available',
      cost: 30,
      turns: 2,
    });
    expect(card(buildResearchModel({ setting: 'fast', entry, techs }), 'b')).toMatchObject({
      cost: 15,
      turns: 1,
    });
  });

  it('locks everything but queued techs once the queue is full', () => {
    const entry = { id: 'A', research: research({ queue: ['a', 'b'] }) };
    const m = buildResearchModel({ setting: 'on', entry, techs: [...techs, tech({ id: 'e' })] });
    expect(card(m, 'e')).toMatchObject({ state: 'locked', reason: 'the queue is full' });
  });
});

describe('createHoldReveal', () => {
  it('reveals only while held and notifies once per change', () => {
    const h = createHoldReveal();
    const seen: boolean[] = [];
    h.onChange((r) => seen.push(r));
    h.press();
    h.press();
    expect(h.revealed).toBe(true);
    h.release();
    h.release();
    expect(h.revealed).toBe(false);
    h.press();
    h.reset();
    expect(seen).toEqual([true, false, true, false]);
  });
});

describe('actingTeam', () => {
  it('follows the active team in hot-seat and the own team otherwise', () => {
    expect(actingTeam(true, ['A', 'B'], 'B', 'A')).toBe('B');
    expect(actingTeam(true, ['A'], 'C', 'A')).toBe(null);
    expect(actingTeam(false, ['A'], 'B', 'A')).toBe('A');
    expect(actingTeam(false, [], null, null)).toBe(null);
  });
});

describe('createResearchStore', () => {
  const names = (id: string): string => id.toUpperCase();
  it('mirrors snapshots and applies calcium and completion events', () => {
    const s = createResearchStore();
    expect(s.setting).toBe('off');
    s.applySnapshot({ research: 'on', teams: [{ id: 'A', research: research() }, { id: 'B' }] });
    const events: WireEvent[] = [
      { type: 'calciumChanged', teamId: 'A', delta: 5, balance: 55, reason: 'turnIncome' },
      { type: 'researchCompleted', teamId: 'A', techId: 'a' },
      { type: 'researchCompleted', teamId: 'B', techId: 'b' },
      { type: 'commandRejected', command: 'queueResearch', reason: 'QUEUE_FULL' },
      { type: 'commandRejected', command: 'fire', reason: 'x' },
    ];
    expect(s.applyEvents(events, ['A'], names)).toEqual(['A researched!', 'The queue is full']);
    expect(s.entry('A')?.research?.calcium).toBe(55);
    expect(s.entry('A')?.researched).toEqual(['a']);
    expect(s.entry('B')?.researched).toEqual(['b']);
  });

  it('maps rejection codes in any case and falls back to the code', () => {
    expect(rejectionText('tier_locked')).toBe('Not enough techs for this tier');
    expect(rejectionText('weird')).toBe('weird');
  });
});
