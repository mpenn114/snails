import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { Simulation } from '../sim/simulation.js';
import type { SimEvent } from '../sim/events.js';
import type { Snail } from '../state/types.js';
import { DEFAULT_MOVEMENT_CONFIG } from './movement-config.js';
import { moveCommandHandler, movementSystem } from './movement.js';

type Field = (x: number, y: number) => number;

function makeSim(field: Field, start: { x: number; y: number }, facing = 0): Simulation {
  const grid = new SdfGrid(60, 30, 12, 1);
  for (let z = 0; z < 12; z++)
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 60; x++) grid.data[grid.index(x, y, z)] = field(x, y);
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 't',
        name: 't',
        colour: '#fff',
        snails: [{ id: 's', name: 's', position: { x: start.x, y: start.y, z: 6 } }],
      },
    ],
    terrain: { nx: 60, ny: 30, nz: 12 },
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  sim.registerCommandHandler('move', moveCommandHandler);
  sim.addSystem('movement', movementSystem());
  const snail = state.teams[0]?.snails[0] as Snail;
  snail.facing = facing;
  return sim;
}

const flat: Field = (_x, y) => y - 5.5;
const snailOf = (sim: Simulation): Snail => sim.state.teams[0]?.snails[0] as Snail;

function run(sim: Simulation, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step());
  return events;
}

describe('movement', () => {
  it('crawls along flat ground at crawl speed and rests on the surface', () => {
    const sim = makeSim(flat, { x: 10, y: 6 });
    run(sim, 1);
    const x0 = snailOf(sim).position.x;
    sim.enqueue({ type: 'move', snailId: 's', direction: 1 });
    run(sim, 60);
    const s = snailOf(sim);
    expect(s.position.x - x0).toBeCloseTo(DEFAULT_MOVEMENT_CONFIG.crawlSpeed, 1);
    expect(s.position.y).toBeCloseTo(5.5 + DEFAULT_MOVEMENT_CONFIG.radius, 1);
    expect(s.grounded).toBe(true);
  });

  it('crawls backwards without turning', () => {
    const sim = makeSim(flat, { x: 20, y: 6 });
    sim.enqueue({ type: 'move', snailId: 's', direction: -1 });
    run(sim, 30);
    expect(snailOf(sim).position.x).toBeLessThan(20);
    expect(snailOf(sim).facing).toBe(0);
  });

  it('cannot climb a slope steeper than the limit', () => {
    const t = Math.tan((65 * Math.PI) / 180);
    const c = Math.cos((65 * Math.PI) / 180);
    const steep: Field = (x, y) => Math.min(y - 3, (y - 3 - t * (x - 20)) * c);
    const sim = makeSim(steep, { x: 12, y: 3.5 });
    sim.enqueue({ type: 'move', snailId: 's', direction: 1 });
    run(sim, 300);
    expect(snailOf(sim).position.x).toBeLessThan(21);
    expect(snailOf(sim).grounded).toBe(true);
  });

  it('climbs a gentle slope', () => {
    const t = Math.tan((30 * Math.PI) / 180);
    const c = Math.cos((30 * Math.PI) / 180);
    const gentle: Field = (x, y) => Math.min(y - 3, (y - 3 - t * (x - 15)) * c);
    const sim = makeSim(gentle, { x: 10, y: 3.5 });
    sim.enqueue({ type: 'move', snailId: 's', direction: 1 });
    run(sim, 240);
    expect(snailOf(sim).position.x).toBeGreaterThan(15.5);
    expect(snailOf(sim).position.y).toBeGreaterThan(3.8);
  });

  it('walks off a ledge, falls and lands with an event', () => {
    const ledge: Field = (x, y) => Math.min(y - 3, Math.max(x - 20, y - 12));
    const sim = makeSim(ledge, { x: 17, y: 12.5 });
    sim.enqueue({ type: 'move', snailId: 's', direction: 1 });
    const events = run(sim, 240);
    // A tiny hop at the lip may also register; the real fall is the last landing.
    const landed = events.filter((e) => e.type === 'snailLanded');
    const e = landed[landed.length - 1] as SimEvent & { fallDistance: number; impactSpeed: number };
    expect((e as { snailId?: string }).snailId).toBe('s');
    expect(e.fallDistance).toBeGreaterThan(5);
    expect(e.impactSpeed).toBeGreaterThan(8);
    expect(snailOf(sim).grounded).toBe(true);
    expect(snailOf(sim).position.y).toBeLessThan(5);
  });

  it('jumps in an arc and lands', () => {
    const sim = makeSim(flat, { x: 10, y: 6 });
    run(sim, 2);
    const x0 = snailOf(sim).position.x;
    sim.enqueue({ type: 'move', snailId: 's', direction: 0, jump: true });
    let peak = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < 120; i++) {
      events.push(...sim.step());
      peak = Math.max(peak, snailOf(sim).position.y);
    }
    expect(peak).toBeGreaterThan(6 + 1);
    expect(events.filter((e) => e.type === 'snailLanded')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'snailJumped')).toEqual([
      { type: 'snailJumped', snailId: 's', air: false },
    ]);
    const s = snailOf(sim);
    expect(s.grounded).toBe(true);
    expect(s.position.x).toBeGreaterThan(x0 + 1.5);
    expect(s.moveIntent?.jumpRequested).toBe(false);
  });

  it('is deterministic', () => {
    const go = (): string => {
      const sim = makeSim(flat, { x: 10, y: 8 });
      sim.enqueue({ type: 'move', snailId: 's', direction: 1, jump: true });
      run(sim, 200);
      return JSON.stringify(sim.snapshot());
    };
    expect(go()).toBe(go());
  });
});
