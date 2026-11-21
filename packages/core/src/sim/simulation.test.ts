import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import type { GameState } from '../state/types.js';
import { Simulation } from './simulation.js';
import { FIXED_DT } from '../physics/ballistics.js';

function make(seed = 1): Simulation {
  const state = createInitialState({ seed, teams: [], terrain: { nx: 2, ny: 2, nz: 2 } });
  return new Simulation({
    state,
    terrain: new SdfGrid(2, 2, 2, 1),
    rng: new RngStreams(seed),
  });
}

describe('Simulation', () => {
  it('increments tick and returns a tick event', () => {
    const sim = make();
    expect(sim.step()).toEqual([{ type: 'tick', tick: 1 }]);
    sim.step();
    expect(sim.state.tick).toBe(2);
  });

  it('rejects non-fixed dt', () => {
    expect(() => make().step(0.5)).toThrow(/FIXED_DT/);
  });

  it('drains commands FIFO and only once', () => {
    const sim = make();
    const seen: string[] = [];
    sim.registerCommandHandler('endTurn', (_c, cmd) => seen.push(cmd.teamId));
    sim.enqueue({ type: 'endTurn', teamId: 'a' });
    sim.enqueue({ type: 'endTurn', teamId: 'b' });
    sim.step();
    sim.step();
    expect(seen).toEqual(['a', 'b']);
  });

  it('runs systems in insertion order, after commands, and returns emitted events', () => {
    const sim = make();
    const order: string[] = [];
    sim.registerCommandHandler('fire', (ctx) => {
      order.push('cmd');
      ctx.emit({ type: 'snailDrowned', snailId: 'a' });
    });
    sim.addSystem('one', (ctx) => {
      order.push('one');
      ctx.emit({ type: 'snailDrowned', snailId: 'b' });
    });
    sim.addSystem('two', () => order.push('two'));
    sim.enqueue({ type: 'fire', snailId: 's', weaponId: 'w' });
    const events = sim.step();
    expect(order).toEqual(['cmd', 'one', 'two']);
    expect(events.map((e) => e.type)).toEqual(['snailDrowned', 'snailDrowned', 'tick']);
    expect(sim.systemNames()).toEqual(['one', 'two']);
  });

  it('is deterministic for same seed and commands', () => {
    const run = (): GameState => {
      const sim = make(42);
      sim.addSystem('wind', (ctx) => {
        ctx.state.wind.strength += ctx.rng.wind.next();
      });
      sim.registerCommandHandler('aim', (ctx, c) => {
        ctx.state.wind.direction += c.angle;
      });
      for (let i = 0; i < 30; i++) {
        if (i % 7 === 0) sim.enqueue({ type: 'aim', snailId: 's', angle: i, power: 0.5 });
        sim.step(FIXED_DT);
      }
      return sim.snapshot();
    };
    expect(run()).toEqual(run());
  });
});
