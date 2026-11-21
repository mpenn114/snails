import { describe, expect, it } from 'vitest';
import { movementSystem } from '../movement/movement.js';
import { RngStreams } from '../rng-streams.js';
import { registerHazards } from '../rules/hazards.js';
import type { SimEvent } from '../sim/events.js';
import { Simulation } from '../sim/simulation.js';
import { createInitialState } from '../state/game-state.js';
import { collapseFloating, findFloatingClusters, resolveCollapse } from './collapse.js';
import { SdfGrid } from './sdf-grid.js';

const N = 24;

/** Air grid with a solid ground slab (y 0..2). */
function ground(): SdfGrid {
  const g = new SdfGrid(N, N, N, 1, 1);
  for (let z = 0; z < N; z++)
    for (let y = 0; y < 3; y++) for (let x = 0; x < N; x++) g.set(x, y, z, -1);
  return g;
}

function box(g: SdfGrid, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number) {
  for (let z = z0; z < z0 + sz; z++)
    for (let y = y0; y < y0 + sy; y++)
      for (let x = x0; x < x0 + sx; x++) g.set(x, y, z, -1 - ((x + y + z) % 3) * 0.1);
}

describe('collapse fall mode', () => {
  it('lands a floating block on the ground with identical shape', () => {
    const g = ground();
    box(g, 8, 10, 8, 3, 3, 3);
    const before = [...g.data];
    const res = collapseFloating(g, findFloatingClusters(g));
    expect(res.removedCells).toBe(0);
    expect(res.fallen).toHaveLength(1);
    expect(res.fallen[0]).toMatchObject({ cellCount: 27, dropCells: 7, dropMetres: 7 });
    expect(res.fallen[0]!.bounds.min).toEqual({ x: 8, y: 3, z: 8 });
    for (let z = 8; z < 11; z++)
      for (let y = 10; y < 13; y++)
        for (let x = 8; x < 11; x++) {
          expect(g.get(x, y - 7, z)).toBe(before[g.index(x, y, z)]);
          expect(g.get(x, y, z)).toBe(1);
        }
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(findFloatingClusters(g)).toHaveLength(0);
  });

  it('removes a block with nothing below it', () => {
    const g = new SdfGrid(N, N, N, 1, 1);
    box(g, 8, 10, 8, 3, 3, 3);
    const res = collapseFloating(g, findFloatingClusters(g));
    expect(res.removedCells).toBe(27);
    expect(res.fallen).toHaveLength(0);
    expect(g.get(9, 11, 9)).toBeGreaterThan(0);
  });

  it('settles two stacked floating blocks without interpenetration', () => {
    const g = ground();
    box(g, 8, 8, 8, 3, 3, 3);
    box(g, 8, 14, 8, 3, 3, 3);
    const res = collapseFloating(g, findFloatingClusters(g));
    expect(res.fallen).toHaveLength(2);
    let solid = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i]! < 0) solid++;
    expect(solid).toBe(N * N * 3 + 54);
    expect(g.get(9, 8, 9)).toBeLessThan(0);
    expect(g.get(9, 3, 9)).toBeLessThan(0);
    expect(g.get(9, 9, 9)).toBeGreaterThan(0);
  });

  it('rests on the highest support column when overhanging a ledge', () => {
    const g = ground();
    box(g, 12, 3, 8, 3, 4, 3); // ledge top at y = 6
    box(g, 9, 12, 8, 6, 2, 3); // slab over ledge and open ground
    const res = collapseFloating(g, findFloatingClusters(g).slice(-1));
    expect(res.fallen[0]!.dropCells).toBe(5); // lowest 12 - ledge top 6 - 1
    expect(g.get(9, 7, 9)).toBeLessThan(0);
    expect(g.get(9, 6, 9)).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const run = (): number[] => {
      const g = ground();
      box(g, 4, 8, 4, 2, 2, 2);
      box(g, 14, 10, 14, 3, 3, 3);
      const out = collapseFloating(g, findFloatingClusters(g));
      return [...g.data, JSON.stringify(out).length];
    };
    expect(run()).toEqual(run());
  });

  it('keeps remove semantics via resolveCollapse mode', () => {
    const g = ground();
    box(g, 8, 10, 8, 3, 3, 3);
    const res = resolveCollapse(g, { x: 9, y: 11, z: 9 }, 3, { mode: 'remove' });
    expect(res.removedCells).toBe(27);
  });

  it('sets a snail on the block airborne; it lands and takes fall damage', () => {
    const grid = ground();
    box(grid, 8, 14, 8, 3, 3, 3);
    const state = createInitialState({
      seed: 1,
      teams: [
        {
          id: 't',
          name: 't',
          colour: '#fff',
          snails: [{ id: 's', name: 's', position: { x: 9, y: 17, z: 9 } }],
        },
      ],
      terrain: { nx: N, ny: N, nz: N, waterLevel: 0 },
    });
    const snail = state.teams[0]!.snails[0]!;
    const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
    sim.addSystem('movement', movementSystem());
    registerHazards(sim);
    const res = resolveCollapse(grid, { x: 9, y: 15, z: 9 }, 3, { snails: [snail] });
    expect(res.fallen[0]!.dropCells).toBe(11);
    expect(snail.grounded).toBe(false);
    expect(snail.position.y).toBe(17);
    const events: SimEvent[] = [];
    for (let i = 0; i < 240; i++) events.push(...sim.step());
    expect(events.some((e) => e.type === 'snailLanded')).toBe(true);
    expect(snail.grounded).toBe(true);
    expect(snail.position.y).toBeLessThan(8);
    expect(snail.health).toBeLessThan(100);
  });
});
