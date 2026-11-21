import { describe, expect, it } from 'vitest';
import { moveCommandHandler, movementSystem } from '../movement/movement.js';
import { RngStreams } from '../rng-streams.js';
import { Simulation } from '../sim/simulation.js';
import type { SimEvent } from '../sim/types.js';
import { createInitialState } from '../state/game-state.js';
import type { Snail } from '../state/types.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import {
  computeFallDamage,
  DEFAULT_HAZARD_CONFIG,
  type HazardConfig,
  registerHazards,
} from './hazards.js';

const cfg = DEFAULT_HAZARD_CONFIG;

/** Flat ground with its surface at y = 5.5 (grid origin at 0). */
const flatField = (_x: number, y: number): number => y - 5.5;

function makeSim(opts: {
  movement: boolean;
  waterLevel?: number;
  y?: number;
  airborne?: boolean;
  hazards?: HazardConfig | false;
}) {
  const grid = new SdfGrid(60, 30, 12, 1);
  for (let z = 0; z < 12; z++)
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 60; x++) grid.data[grid.index(x, y, z)] = flatField(x, y);
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 't',
        name: 't',
        colour: '#fff',
        snails: [{ id: 's', name: 's', position: { x: 10, y: opts.y ?? 6, z: 6 } }],
      },
    ],
    terrain: { nx: 60, ny: 30, nz: 12, waterLevel: opts.waterLevel ?? 0 },
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  sim.registerCommandHandler('move', moveCommandHandler);
  if (opts.movement) sim.addSystem('movement', movementSystem());
  if (opts.hazards !== false) registerHazards(sim, opts.hazards);
  const snail = state.teams[0]?.snails[0] as Snail;
  if (opts.airborne) {
    snail.grounded = false;
    snail.airborneFromY = snail.position.y;
  }
  return { sim, snail };
}

function run(sim: Simulation, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step());
  return events;
}

const ofType = (events: SimEvent[], type: string): SimEvent[] =>
  events.filter((e) => e.type === type);

describe('computeFallDamage', () => {
  it('is zero up to and including the safe distance', () => {
    expect(computeFallDamage(0, cfg)).toBe(0);
    expect(computeFallDamage(cfg.safeFallDistance, cfg)).toBe(0);
  });

  it('scales per metre beyond the safe distance and rounds to an integer', () => {
    expect(computeFallDamage(4, cfg)).toBe(4);
    expect(computeFallDamage(5, cfg)).toBe(8);
    expect(computeFallDamage(3.1, cfg)).toBe(0);
    expect(Number.isInteger(computeFallDamage(7.3, cfg))).toBe(true);
  });

  it('caps at maxFallDamage', () => {
    expect(computeFallDamage(1000, cfg)).toBe(cfg.maxFallDamage);
    expect(computeFallDamage(Number.POSITIVE_INFINITY, cfg)).toBe(cfg.maxFallDamage);
  });

  it('treats non-numeric input as no damage', () => {
    expect(computeFallDamage(Number.NaN, cfg)).toBe(0);
  });
});

describe('fall damage', () => {
  it('ignores a small lip landing below minFallDistance', () => {
    const { sim, snail } = makeSim({ movement: false });
    snail.pendingLanding = { impactSpeed: 1, fallDistance: cfg.minFallDistance - 0.1 };
    const events = run(sim, 1);
    expect(snail.health).toBe(snail.maxHealth);
    expect(ofType(events, 'snailDamaged')).toHaveLength(0);
    expect(snail.pendingLanding).toBeUndefined();
  });

  it('a snail dropped from height takes damage on landing through the real movement system', () => {
    const { sim, snail } = makeSim({ movement: true, y: 20, airborne: true });
    const events = run(sim, 200);
    const landed = ofType(events, 'snailLanded');
    expect(landed).toHaveLength(1);
    const fall = (landed[0] as unknown as { fallDistance: number }).fallDistance;
    const expected = computeFallDamage(fall, cfg);
    expect(fall).toBeGreaterThan(cfg.safeFallDistance);
    expect(expected).toBeGreaterThan(0);
    expect(snail.health).toBe(snail.maxHealth - expected);
    const damaged = ofType(events, 'snailDamaged');
    expect(damaged).toHaveLength(1);
    expect(damaged[0]).toMatchObject({ snailId: 's', amount: expected, cause: 'fall' });
    expect(snail.grounded).toBe(true);
  });

  it('a short drop from the ground within the safe distance causes no damage', () => {
    const { sim, snail } = makeSim({ movement: true, y: 7.5, airborne: true });
    const events = run(sim, 200);
    expect(ofType(events, 'snailLanded')).toHaveLength(1);
    expect(snail.health).toBe(snail.maxHealth);
    expect(ofType(events, 'snailDamaged')).toHaveLength(0);
  });

  it('a lethal landing emits snailDied with cause fall', () => {
    const { sim, snail } = makeSim({ movement: false });
    snail.health = cfg.maxFallDamage;
    snail.pendingLanding = { impactSpeed: 30, fallDistance: 1000 };
    const events = run(sim, 1);
    expect(snail.alive).toBe(false);
    expect(ofType(events, 'snailDied')).toEqual([
      { type: 'snailDied', snailId: 's', teamId: 't', cause: 'fall' },
    ]);
  });
});

describe('drowning and world floor', () => {
  it('kills a snail below the water and emits snailDrowned and snailDied', () => {
    const { sim, snail } = makeSim({ movement: false, waterLevel: 4, y: 2 });
    const events = run(sim, 1);
    expect(snail.alive).toBe(false);
    expect(snail.health).toBe(0);
    expect(ofType(events, 'snailDrowned')).toEqual([{ type: 'snailDrowned', snailId: 's' }]);
    expect(ofType(events, 'snailDied')).toEqual([
      { type: 'snailDied', snailId: 's', teamId: 't', cause: 'drown' },
    ]);
  });

  it('leaves a snail above the water alone', () => {
    const { sim, snail } = makeSim({ movement: false, waterLevel: 4, y: 4.5 });
    const events = run(sim, 1);
    expect(snail.alive).toBe(true);
    expect(ofType(events, 'snailDrowned')).toHaveLength(0);
  });

  it('respects drownDepth: centre must be deeper than waterLevel - drownDepth', () => {
    const { sim, snail } = makeSim({
      movement: false,
      waterLevel: 4,
      y: 3.5,
      hazards: { ...cfg, drownDepth: 1 },
    });
    run(sim, 1);
    expect(snail.alive).toBe(true);
  });

  it('kills a snail below the world floor', () => {
    const { sim, snail } = makeSim({ movement: false, waterLevel: -20, y: -1 });
    const events = run(sim, 1);
    expect(snail.alive).toBe(false);
    expect(ofType(events, 'snailDied')).toEqual([
      { type: 'snailDied', snailId: 's', teamId: 't', cause: 'void' },
    ]);
    expect(ofType(events, 'snailDrowned')).toHaveLength(0);
  });

  it('ignores dead snails', () => {
    const { sim, snail } = makeSim({ movement: false, waterLevel: 4, y: 2 });
    snail.alive = false;
    snail.health = 0;
    snail.pendingLanding = { impactSpeed: 30, fallDistance: 1000 };
    const events = run(sim, 1);
    expect(events.filter((e) => e.type !== 'tick')).toHaveLength(0);
    expect(snail.health).toBe(0);
  });
});
