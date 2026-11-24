import { describe, expect, it } from 'vitest';
import type { AreaDefinition, StatusDefinition } from '../content/types.js';
import { makeTestCtx } from '../sim/test-ctx.js';
import { spawnArea } from './area-system.js';
import { applyWater, findLowPoint } from './water-area.js';

const SALT: StatusDefinition = { id: 't:salt', name: 'Salt', perTurnDamage: 4 };
const POOL: AreaDefinition = {
  id: 't:pool',
  name: 'Pool',
  defaultRadius: 3,
  defaultTurns: 3,
  waterDepth: 0.9,
  drowns: true,
  extinguishes: ['t:salt'],
};

/** Flat test ground is y = 5.5; digs a pit of floor height `floor` around (x, z). */
function dig(ctx: ReturnType<typeof makeTestCtx>['ctx'], x: number, z: number, floor: number) {
  const g = ctx.terrain;
  for (let k = 0; k < 40; k++)
    for (let j = 0; j < 40; j++)
      for (let i = 0; i < 40; i++) {
        if (Math.hypot(i - x, k - z) < 1.5) g.data[g.index(i, j, k)] = j - floor;
      }
}

describe('water areas', () => {
  it('settle to the lowest ground within the radius', () => {
    const { ctx } = makeTestCtx({ areas: [POOL] });
    dig(ctx, 22, 20, 2.5);
    const low = findLowPoint(ctx.terrain, { x: 20, y: 5.5, z: 20 }, 3);
    expect(low.y).toBeCloseTo(2.5, 0);
    expect(Math.hypot(low.x - 22, low.z - 20)).toBeLessThan(1.6);
    const area = spawnArea(ctx, POOL, { position: { x: 20, y: 5.5, z: 20 }, sourceSnailId: 'a1' });
    expect(area.position.y).toBeCloseTo(2.5 + 0.9, 0);
  });

  it('stay at the impact height on flat ground', () => {
    const { ctx } = makeTestCtx({ areas: [POOL] });
    const area = spawnArea(ctx, POOL, { position: { x: 20, y: 5.5, z: 20 }, sourceSnailId: 'a1' });
    expect(area.position.x).toBeCloseTo(20);
    expect(area.position.y).toBeCloseTo(5.5 + 0.9, 0);
  });

  it('drown snails below the surface, spare those above and outside', () => {
    const { ctx, events } = makeTestCtx({
      areas: [POOL],
      positions: [
        { x: 20, y: 7.2, z: 20 },
        { x: 21, y: 6, z: 20 },
      ],
    });
    const area = spawnArea(ctx, POOL, { position: { x: 20, y: 5.5, z: 20 }, sourceSnailId: 'a1' });
    applyWater(ctx, area, POOL);
    const [a, b] = [ctx.state.teams[0]?.snails[0], ctx.state.teams[1]?.snails[0]];
    expect(a?.alive).toBe(true);
    expect(b?.alive).toBe(false);
    expect(events.filter((e) => e.type === 'snailDrowned')).toHaveLength(1);
  });

  it('remove listed statuses from touching snails only', () => {
    const { ctx } = makeTestCtx({ statuses: [SALT], areas: [{ ...POOL, drowns: false }] });
    const [a, b] = [ctx.state.teams[0]?.snails[0], ctx.state.teams[1]?.snails[0]];
    if (!a || !b) throw new Error('setup');
    const salted = { id: 't:salt', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' };
    a.statuses = [{ ...salted }];
    b.statuses = [{ ...salted }];
    a.position = { x: 10, y: 6, z: 20 };
    b.position = { x: 20, y: 6, z: 20 };
    const def = { ...POOL, drowns: false };
    const area = spawnArea(ctx, def, { position: { x: 20, y: 5.5, z: 20 }, sourceSnailId: 'a1' });
    applyWater(ctx, area, def);
    expect(b.statuses).toEqual([]);
    expect(a.statuses).toHaveLength(1);
  });
});
