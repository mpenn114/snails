import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { Simulation } from '../sim/simulation.js';
import type { Snail } from '../state/types.js';
import { DEFAULT_MOVEMENT_CONFIG } from './movement-config.js';
import { moveCommandHandler, movementSystem } from './movement.js';
import { snailPenetration, snailSeparationSystem } from './snail-collision.js';

const R = DEFAULT_MOVEMENT_CONFIG.radius;

function makeSim(xs: number[], facing = 0): Simulation {
  const grid = new SdfGrid(60, 30, 12, 1);
  for (let z = 0; z < 12; z++)
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 60; x++) grid.data[grid.index(x, y, z)] = y - 5.5;
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 't',
        name: 't',
        colour: '#fff',
        snails: xs.map((x, i) => ({ id: `s${i}`, name: `s${i}`, position: { x, y: 6, z: 6 } })),
      },
    ],
    terrain: { nx: 60, ny: 30, nz: 12 },
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  sim.registerCommandHandler('move', moveCommandHandler);
  sim.addSystem('movement', movementSystem());
  sim.addSystem('separation', snailSeparationSystem());
  for (const s of state.teams[0]?.snails ?? []) s.facing = facing;
  return sim;
}

const snails = (sim: Simulation): Snail[] => sim.state.teams[0]?.snails as Snail[];
const first = (sim: Simulation): Snail => snails(sim)[0] as Snail;
const run = (sim: Simulation, n: number): void => {
  for (let i = 0; i < n; i++) sim.step();
};
const gap = (sim: Simulation): number => {
  const [a, b] = snails(sim) as [Snail, Snail];
  return snailPenetration(a.position, b.position, R);
};

describe('two-axis turning', () => {
  it('turns while standing and crawling, at turnRate', () => {
    const sim = makeSim([10]);
    run(sim, 1);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 0, turn: 1 });
    run(sim, 60);
    expect(first(sim).facing).toBeCloseTo(DEFAULT_MOVEMENT_CONFIG.turnRate, 1);
    expect(first(sim).position.x).toBeCloseTo(10, 1);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 1, turn: -1 });
    run(sim, 60);
    expect(first(sim).position.z).not.toBeCloseTo(6, 1);
  });

  it('is deterministic and clamps or ignores the turn input', () => {
    const final = (): string => {
      const sim = makeSim([10]);
      sim.enqueue({ type: 'move', snailId: 's0', direction: 1, turn: 0.4 });
      run(sim, 90);
      return JSON.stringify(sim.state);
    };
    expect(final()).toBe(final());
    const sim = makeSim([10]);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 0, turn: 99 });
    run(sim, 60);
    expect(first(sim).facing).toBeCloseTo(DEFAULT_MOVEMENT_CONFIG.turnRate, 1);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 0 });
    run(sim, 1);
    const f = first(sim).facing;
    run(sim, 30);
    expect(first(sim).facing).toBe(f);
  });
});

describe('snail-to-snail collision', () => {
  it('blocks crawling through another snail but allows crawling away', () => {
    const sim = makeSim([10, 12]);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 1 });
    run(sim, 180);
    expect(gap(sim)).toBeLessThanOrEqual(1e-3);
    expect(first(sim).position.x).toBeLessThan(11.05);
    expect((snails(sim)[1] as Snail).position.x).toBeCloseTo(12, 1);
    sim.enqueue({ type: 'move', snailId: 's0', direction: -1 });
    run(sim, 30);
    expect(first(sim).position.x).toBeLessThan(10.5);
  });

  it('separates a jump that lands on another snail', () => {
    const sim = makeSim([10, 11.4]);
    run(sim, 1);
    sim.enqueue({ type: 'move', snailId: 's0', direction: 0, jump: true });
    run(sim, 120);
    const [a, b] = snails(sim) as [Snail, Snail];
    expect(a.grounded).toBe(true);
    expect(snailPenetration(a.position, b.position, R)).toBeLessThanOrEqual(1e-3);
  });

  it('separates a knocked-back snail from the one it flies into', () => {
    const sim = makeSim([10, 13]);
    run(sim, 1);
    const [a, b] = snails(sim) as [Snail, Snail];
    a.grounded = false;
    a.velocity = { x: 8, y: 2, z: 0 };
    run(sim, 120);
    expect(a.grounded).toBe(true);
    expect(snailPenetration(a.position, b.position, R)).toBeLessThanOrEqual(1e-3);
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it('breaks same-column ties deterministically', () => {
    const sim = makeSim([10, 10]);
    run(sim, 5);
    expect(gap(sim)).toBeLessThanOrEqual(1e-3);
    const [a, b] = snails(sim) as [Snail, Snail];
    expect(a.position.x).toBeLessThan(b.position.x);
  });
});
