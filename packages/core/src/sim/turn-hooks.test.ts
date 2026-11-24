import { describe, expect, it } from 'vitest';
import type { StatusDefinition } from '../content/types.js';
import { applyStatus } from '../status/status-system.js';
import type { Simulation } from './simulation.js';
import { createMatch } from './match.js';
import { testMatchOptions } from './test-match.js';

const SALT: StatusDefinition = { id: 't:salt', name: 'Salt', perTurnDamage: 4, defaultTurns: 2 };

function stepToAction(sim: Simulation): void {
  for (let i = 0; i < 600 && sim.state.turn.phase !== 'action'; i++) sim.step();
}

describe('turn-start hooks', () => {
  it('run in registration order, once per turn including the first', () => {
    const { sim } = createMatch(testMatchOptions(5));
    const calls: string[] = [];
    sim.registerTurnStartHook('one', (_ctx, info) => calls.push(`one:${info.turnNumber}`));
    sim.registerTurnStartHook('two', (_ctx, info) => calls.push(`two:${info.teamId}`));
    expect(sim.turnStartHookNames()).toContain('one');
    sim.step();
    expect(calls).toEqual(['one:1', 'two:a']);
    stepToAction(sim);
    sim.enqueue({ type: 'endTurn', teamId: 'a' });
    for (let i = 0; i < 2000 && calls.length < 4; i++) sim.step();
    expect(calls).toEqual(['one:1', 'two:a', 'one:2', 'two:b']);
  });

  it('process statuses at the start of the afflicted team turn (integration)', () => {
    const { sim, content } = createMatch({ ...testMatchOptions(5), statuses: [SALT] });
    const victim = sim.state.teams[1]?.snails[0];
    if (!victim) throw new Error('no victim');
    const ctx = {
      state: sim.state,
      terrain: sim.terrain,
      rng: sim.rng,
      dt: 1 / 60,
      emit: () => {},
    };
    applyStatus(ctx, victim, content.statuses.require('t:salt'), {
      turns: 2,
      sourceSnailId: 'a:0',
    });
    stepToAction(sim);
    sim.enqueue({ type: 'endTurn', teamId: 'a' });
    let damaged = 0;
    for (let i = 0; i < 3000 && sim.state.turn.turnNumber < 2; i++) {
      damaged += sim.step().filter((e) => e.type === 'snailDamaged').length;
    }
    expect(victim.health).toBe(96);
    expect(damaged).toBe(1);
  });
});
