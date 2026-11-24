import { describe, expect, it } from 'vitest';
import type { CrateDefinition } from '../content/types.js';
import { collectCrate } from '../crate/crate-pickup.js';
import type { SimEvent } from '../sim/events.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { SimContext } from '../sim/types.js';
import { addCalcium, CALCIUM_INCOME } from './calcium.js';

const CALCIUM_CRATE: CrateDefinition = {
  id: 't:calcium',
  name: 'Calcium',
  kind: 'calcium',
  weight: 1,
  contents: { calcium: 25 },
};

function match(research: 'on' | 'off' = 'on'): MatchSetup {
  return createMatch({
    ...testMatchOptions(7),
    crates: [CALCIUM_CRATE],
    settings: { research },
  });
}

function ctxOf(m: MatchSetup, events: SimEvent[]): SimContext {
  const { sim } = m;
  return {
    state: sim.state,
    terrain: sim.terrain,
    rng: sim.rng,
    dt: 1 / 60,
    emit: (e) => events.push(e),
  };
}

/** Emits `events` through the sim's own context (so observers run) on the next step. */
function emitNextStep(m: MatchSetup, events: SimEvent[]): SimEvent[] {
  let once = true;
  m.sim.addSystem('test-emit', (ctx) => {
    if (!once) return;
    once = false;
    for (const e of events) ctx.emit(e);
  });
  return m.sim.step();
}

function hit(snailId: string, by: string | null, amount: number): SimEvent {
  return {
    type: 'snailDamaged',
    snailId,
    amount,
    remaining: 50,
    sourceSnailId: by,
    cause: 'explosion',
  };
}

function calcium(m: MatchSetup, id: string): number {
  return m.sim.state.teams.find((t) => t.id === id)?.research?.calcium ?? -1;
}

function changes(ev: SimEvent[]): SimEvent[] {
  return ev.filter((e) => e.type === 'calciumChanged');
}

describe('Calcium economy', () => {
  it('gives turn income to the active team only', () => {
    const m = match();
    expect(m.sim.state.research).toBe('on');
    const first = m.sim.step();
    expect(calcium(m, 'a')).toBe(CALCIUM_INCOME.perTurn);
    expect(calcium(m, 'b')).toBe(0);
    expect(changes(first)).toEqual([
      { type: 'calciumChanged', teamId: 'a', delta: 10, balance: 10, reason: 'turnIncome' },
    ]);
  });

  it('pays 1 per 5 damage with a carried remainder and a per-turn cap', () => {
    const m = match();
    m.sim.step();
    emitNextStep(m, [hit('b:0', 'a:0', 3), hit('b:0', 'a:0', 3)]);
    expect(calcium(m, 'a')).toBe(10 + 1);
    emitNextStep(m, [hit('b:0', 'a:0', 1000)]);
    expect(m.sim.state.teams[0]?.research?.damageCalciumThisTurn).toBe(
      CALCIUM_INCOME.damageCapPerTurn,
    );
    expect(calcium(m, 'a')).toBe(10 + 15);
  });

  it('ignores self, team and environmental damage', () => {
    const m = match();
    m.sim.step();
    const ev = emitNextStep(m, [
      hit('a:0', 'a:0', 50),
      hit('a:1', 'a:0', 50),
      hit('b:0', null, 50),
    ]);
    expect(changes(ev)).toEqual([]);
    expect(calcium(m, 'a')).toBe(10);
  });

  it('pays a kill bonus to the team that last damaged the victim', () => {
    const m = match();
    m.sim.step();
    emitNextStep(m, [
      hit('b:0', 'a:0', 1),
      { type: 'snailDied', snailId: 'b:0', teamId: 'b', cause: 'explosion' },
      { type: 'snailDied', snailId: 'b:1', teamId: 'b', cause: 'drown' },
    ]);
    expect(calcium(m, 'a')).toBe(10 + CALCIUM_INCOME.perKill);
  });

  it('clamps at zero and emits the applied delta', () => {
    const m = match();
    const events: SimEvent[] = [];
    const ctx = ctxOf(m, events);
    addCalcium(ctx, 'a', 5, 'refund');
    addCalcium(ctx, 'a', -20, 'spent');
    expect(calcium(m, 'a')).toBe(0);
    expect(events.map((e) => (e.type === 'calciumChanged' ? e.delta : null))).toEqual([5, -5]);
    addCalcium(ctx, 'a', -1, 'spent');
    expect(events).toHaveLength(2);
  });

  it('pays a Calcium crate to the collecting team', () => {
    const m = match();
    m.sim.step();
    const events: SimEvent[] = [];
    const snail = m.sim.state.teams[1]?.snails[0];
    if (!snail) throw new Error('no snail');
    const crate = {
      id: 'c1',
      defId: CALCIUM_CRATE.id,
      position: { ...snail.position },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
    };
    collectCrate(ctxOf(m, events), m.content, crate, snail);
    expect(calcium(m, 'b')).toBe(25);
    expect(changes(events)).toHaveLength(1);
  });

  it('tracks roundsSinceDamage for the Moss Tax', () => {
    const m = match();
    m.sim.step();
    const research = m.sim.state.teams[0]?.research;
    expect(research?.roundsSinceDamage).toBe(1);
    emitNextStep(m, [hit('b:0', 'a:0', 1)]);
    expect(research?.roundsSinceDamage).toBe(0);
  });

  it('has no Calcium state and no events when research is off', () => {
    const m = match('off');
    expect(m.sim.state.research).toBeUndefined();
    expect(m.sim.state.teams.every((t) => t.research === undefined)).toBe(true);
    const ev = emitNextStep(m, [hit('b:0', 'a:0', 50)]);
    expect(changes(ev)).toEqual([]);
  });
});
