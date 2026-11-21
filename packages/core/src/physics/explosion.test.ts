import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import type { SimEvent } from '../sim/events.js';
import type { SimContext } from '../sim/types.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { computeFalloff, resolveExplosion, type ExplosionSpec } from './explosion.js';

const SPEC: ExplosionSpec = { radius: 5, maxDamage: 50, knockback: 10, falloff: 'linear' };
const SRC = { weaponId: 'bomb', ownerSnailId: 'a' };

function setup(): { ctx: SimContext; events: SimEvent[] } {
  const g = new SdfGrid(30, 30, 30, 1);
  for (let i = 0; i < g.data.length; i++) g.data[i] = -1;
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 't',
        name: 'T',
        colour: '#fff',
        snails: [
          { id: 'a', name: 'A', position: { x: 15, y: 15, z: 15 } },
          { id: 'b', name: 'B', position: { x: 18, y: 15, z: 15 } },
          { id: 'far', name: 'F', position: { x: 28, y: 15, z: 15 } },
          { id: 'dead', name: 'D', position: { x: 15, y: 15, z: 16 } },
        ],
      },
    ],
    terrain: { nx: 30, ny: 30, nz: 30 },
  });
  state.teams[0]!.snails[3]!.alive = false;
  const events: SimEvent[] = [];
  const ctx: SimContext = {
    state,
    terrain: g,
    rng: new RngStreams(1),
    dt: 1 / 60,
    emit: (e) => events.push(e),
  };
  return { ctx, events };
}

describe('computeFalloff', () => {
  it('follows linear and quadratic curves', () => {
    expect(computeFalloff(0, 4, 'linear')).toBe(1);
    expect(computeFalloff(2, 4, 'linear')).toBe(0.5);
    expect(computeFalloff(2, 4, 'quadratic')).toBe(0.25);
    expect(computeFalloff(4, 4, 'linear')).toBe(0);
    expect(computeFalloff(9, 4, 'quadratic')).toBe(0);
    expect(computeFalloff(-1, 4, 'linear')).toBe(1);
  });
});

describe('resolveExplosion', () => {
  it('damages by distance, ignores far and dead snails, orders events', () => {
    const { ctx, events } = setup();
    const snails = ctx.state.teams[0]!.snails;
    const res = resolveExplosion(ctx, { x: 15, y: 15, z: 15 }, SPEC, SRC);
    expect(res.damaged.find((h) => h.snailId === 'a')?.amount).toBe(50);
    expect(snails[1]!.health).toBe(100 - Math.round(50 * (1 - 2.5 / 5)));
    expect(snails[2]!.health).toBe(100);
    expect(snails[3]!.health).toBe(100);
    expect(events.map((e) => e.type)).toEqual([
      'explosion',
      'terrainCarved',
      'snailDamaged',
      'snailDamaged',
    ]);
    expect(res.carve.cellsChanged).toBeGreaterThan(0);
  });

  it('carves terrain to air at centre', () => {
    const { ctx } = setup();
    resolveExplosion(ctx, { x: 10, y: 10, z: 10 }, SPEC, SRC);
    expect(ctx.terrain.get(10, 10, 10)).toBeGreaterThan(0);
  });

  it('knocks back away from centre with upward bias', () => {
    const { ctx } = setup();
    resolveExplosion(ctx, { x: 15, y: 15, z: 15 }, SPEC, SRC);
    const b = ctx.state.teams[0]!.snails[1]!;
    expect(b.velocity.x).toBeGreaterThan(0);
    expect(b.velocity.y).toBeGreaterThan(0);
    expect(b.velocity.z).toBeCloseTo(0);
    expect(b.grounded).toBe(false);
    expect(b.airborneFromY).toBe(b.position.y);
  });

  it('emits snailDied on kill', () => {
    const { ctx, events } = setup();
    const res = resolveExplosion(ctx, { x: 15, y: 15, z: 15 }, { ...SPEC, maxDamage: 500 }, SRC);
    expect(res.killed).toEqual(['a', 'b']);
    expect(events.filter((e) => e.type === 'snailDied')).toEqual([
      { type: 'snailDied', snailId: 'a', teamId: 't', cause: 'explosion' },
      { type: 'snailDied', snailId: 'b', teamId: 't', cause: 'explosion' },
    ]);
  });
});
