import { describe, expect, it } from 'vitest';
import { SdfGrid, carveSphere, type FallenCluster, type SimEvent } from '@snails/core';
import { TerrainReplica } from './terrain-replica.js';

/** 24^3 grid, 8-cell chunks, solid below y=10. */
function makeGrid(): SdfGrid {
  const g = new SdfGrid(24, 24, 24, 1, 1, 8);
  for (let z = 0; z < 24; z++)
    for (let y = 0; y < 10; y++) for (let x = 0; x < 24; x++) g.set(x, y, z, y - 9.5);
  g.takeDirtyChunks();
  return g;
}

const copy = (g: SdfGrid): SdfGrid => {
  const c = new SdfGrid(g.nx, g.ny, g.nz, g.cellSize, 1, g.chunkSize);
  c.data.set(g.data);
  return c;
};

describe('TerrainReplica', () => {
  it('carve matches core carveSphere and marks neighbours dirty', () => {
    const core = makeGrid();
    const local = copy(core);
    const centre = { x: 8, y: 9, z: 12 };
    const res = carveSphere(core, centre, 3.3);
    const dirty: number[] = [];
    const r = new TerrainReplica({ grid: local, target: { markDirty: (i) => dirty.push(i) } });
    r.applyEvents([{ type: 'terrainCarved', centre, radius: 3.3, chunks: res.chunks }]);
    expect(Array.from(local.data)).toEqual(Array.from(core.data));
    for (const id of res.chunks) expect(dirty).toContain(id);
    expect(local.takeDirtyChunks().length).toBeGreaterThan(0);
  });

  it('ignores irrelevant and duplicate events', () => {
    const local = makeGrid();
    const r = new TerrainReplica({ grid: local });
    const carve: SimEvent = {
      type: 'terrainCarved',
      centre: { x: 4, y: 9, z: 4 },
      radius: 2,
      chunks: [0],
    };
    r.applyEvents([{ type: 'tick', tick: 1 }]);
    expect(local.takeDirtyChunks()).toEqual([]);
    r.applyEvents([carve]);
    local.takeDirtyChunks();
    r.applyEvents([carve]);
    expect(local.takeDirtyChunks()).toEqual([]);
  });

  it('collapse moves floating cells down and reports fallen clusters', () => {
    const local = makeGrid();
    for (let y = 14; y < 16; y++) local.set(5, y, 5, -1);
    const fallen: FallenCluster = {
      cellCount: 2,
      dropCells: 4,
      dropMetres: 4,
      bounds: { min: { x: 5, y: 10, z: 5 }, max: { x: 5, y: 11, z: 5 } },
    };
    const got: FallenCluster[] = [];
    const dirty: number[] = [];
    const r = new TerrainReplica({
      grid: local,
      target: { markDirty: (i) => dirty.push(i) },
      onFallen: (c) => got.push(...c),
    });
    r.applyEvents([{ type: 'terrainCollapsed', chunks: [0], removedCells: 2, fallen: [fallen] }]);
    expect(local.get(5, 14, 5)).toBe(1);
    expect(local.get(5, 15, 5)).toBe(1);
    expect(local.get(5, 10, 5)).toBe(-1);
    expect(got).toEqual([fallen]);
    expect(dirty).toContain(0);
  });
});
