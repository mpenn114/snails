import { describe, expect, it } from 'vitest';
import {
  SdfGrid,
  carveSphere,
  resolveCollapse,
  type FallenCluster,
  type SimEvent,
} from '@snails/core';
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
  c.materials.set(g.materials);
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

  it('applies per-material resistance and power like core', () => {
    const core = makeGrid();
    for (let i = 0; i < core.materials.length; i++) core.materials[i] = i % 5 < 2 ? 3 : 2;
    const local = copy(core);
    const centre = { x: 8, y: 9, z: 12 };
    const res = carveSphere(core, centre, 4, 10);
    const r = new TerrainReplica({ grid: local });
    r.applyEvents([{ type: 'terrainCarved', centre, radius: 4, power: 10, chunks: res.chunks }]);
    expect(Array.from(local.data)).toEqual(Array.from(core.data));
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
    r.applyEvents([
      {
        type: 'terrainCollapsed',
        chunks: [0],
        removedCells: 2,
        fallen: [fallen],
        cellIndices: [
          local.index(5, 14, 5),
          local.index(5, 15, 5),
          local.index(5, 10, 5),
          local.index(5, 11, 5),
        ],
        cellValues: [1, 1, -1, -1],
      },
    ]);
    expect(local.get(5, 14, 5)).toBe(1);
    expect(local.get(5, 15, 5)).toBe(1);
    expect(local.get(5, 10, 5)).toBe(-1);
    expect(got).toEqual([fallen]);
    expect(dirty).toContain(0);
  });

  it('replays a non-convex (U-shaped) collapse sample-for-sample', () => {
    const core = makeGrid();
    // Pillar at (12,10..13,12) holding a U-shaped slab at y=14; a ledge at x=15 catches one arm.
    for (let y = 10; y < 14; y++) core.set(12, y, 12, -1);
    for (let y = 10; y < 12; y++) core.set(15, y, 10, -1);
    for (let x = 9; x <= 15; x++) core.set(x, 14, 10, -1);
    for (let x = 9; x <= 15; x++) core.set(x, 14, 12, -1);
    for (let z = 10; z <= 12; z++) core.set(9, 14, z, -1);
    core.set(12, 14, 12, -1);
    core.takeDirtyChunks();
    const local = copy(core);
    const centre = { x: 12, y: 12, z: 12 };
    const carve = carveSphere(core, centre, 2);
    const col = resolveCollapse(core, centre, 2);
    expect(col.fallen.length).toBeGreaterThan(0);
    const events: SimEvent[] = [
      { type: 'terrainCarved', centre, radius: 2, chunks: carve.chunks },
      {
        type: 'terrainCollapsed',
        chunks: col.chunks,
        removedCells: col.removedCells,
        fallen: col.fallen,
        cellIndices: col.cellIndices,
        cellValues: col.cellValues,
      },
    ];
    new TerrainReplica({ grid: local }).applyEvents(events);
    expect(Array.from(local.data)).toEqual(Array.from(core.data));
  });

  it('applyHistory equals applying the live events, without debris callbacks', () => {
    const core = makeGrid();
    const live = copy(core);
    const late = copy(core);
    const events: SimEvent[] = [];
    for (const x of [6, 9, 12, 15]) {
      const centre = { x, y: 9, z: 12 };
      const res = carveSphere(core, centre, 2.5);
      events.push({ type: 'terrainCarved', centre, radius: 2.5, chunks: res.chunks });
    }
    const lateFallen: FallenCluster[][] = [];
    const a = new TerrainReplica({ grid: live });
    const b = new TerrainReplica({ grid: late, onFallen: (c) => lateFallen.push([...c]) });
    a.applyEvents(events);
    b.applyHistory(events);
    expect(Array.from(late.data)).toEqual(Array.from(live.data));
    expect(Array.from(late.data)).toEqual(Array.from(core.data));
    expect(b.applied).toBe(4);
    expect(lateFallen).toEqual([]);
  });
});
