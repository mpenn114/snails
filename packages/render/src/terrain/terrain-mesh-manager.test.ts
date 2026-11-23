import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SdfGrid } from '@snails/core';
import { DirtyChunkQueue } from './dirty-chunk-queue.js';
import { handleMeshRequest, type MeshRequest, type MeshResponse } from './mesh-protocol.js';
import { createInProcessTransport, createPoolTransport } from './mesh-transport.js';
import type { MeshTransport } from './mesh-transport.js';
import { TerrainMeshManager } from './terrain-mesh-manager.js';

/** 16^3 grid, 8-cell chunks (8 chunks), with a solid block inside chunk 0. */
function makeGrid(): SdfGrid {
  const g = new SdfGrid(16, 16, 16, 1, 1, 8);
  for (let z = 2; z < 6; z++)
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) g.set(x, y, z, -1);
  g.takeDirtyChunks();
  return g;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Transport whose replies are released manually. */
function manualTransport(): {
  t: MeshTransport;
  sent: MeshRequest[];
  reply: (i: number) => void;
} {
  const sent: MeshRequest[] = [];
  let cb: ((r: MeshResponse) => void) | null = null;
  return {
    sent,
    t: {
      post: (m) => void sent.push(m),
      onMessage: (c) => {
        cb = c;
      },
      terminate: () => undefined,
    },
    reply: (i) => cb?.(handleMeshRequest(sent[i] as MeshRequest)),
  };
}

describe('DirtyChunkQueue', () => {
  it('dedupes keys and orders by priority', () => {
    const q = new DirtyChunkQueue();
    [3, 1, 3, 2].forEach((k) => q.markDirty(k));
    expect(q.pendingCount).toBe(3);
    expect(q.take(2, (k) => -k).map((j) => j.key)).toEqual([3, 2]);
    expect(q.take(5).map((j) => j.key)).toEqual([1]);
    expect(q.take(0)).toEqual([]);
  });

  it('discards stale results and re-requests dirtied in-flight chunks', () => {
    const q = new DirtyChunkQueue();
    q.markDirty(1);
    const [job] = q.take(1);
    q.markDirty(1);
    expect(q.take(1)).toEqual([]);
    expect(q.complete(job!)).toBe(false);
    expect(q.complete(job!)).toBe(false);
    const [again] = q.take(1);
    expect(again!.version).toBe(2);
    expect(q.complete(again!)).toBe(true);
  });

  it('reads and clears grid dirty flags', () => {
    const g = makeGrid();
    g.markDirty(1);
    const q = new DirtyChunkQueue();
    expect(q.markDirtyFrom(g)).toBe(1);
    expect(g.isDirty(1)).toBe(false);
    q.clear();
    expect(q.pendingCount + q.inFlightCount).toBe(0);
  });
});

describe('TerrainMeshManager', () => {
  it.each([true, false])('sets shadow flags to %s on chunk meshes', async (shadows) => {
    const m = new TerrainMeshManager({
      grid: makeGrid(),
      transport: createInProcessTransport(),
      budgetMs: Infinity,
      shadows,
    });
    m.markAllDirty();
    for (let i = 0; i < 3; i++) {
      m.update();
      await flush();
    }
    const mesh = m.getMesh(0)!;
    expect(mesh.castShadow).toBe(shadows);
    expect(mesh.receiveShadow).toBe(shadows);
    m.dispose();
  });

  it('creates, updates and removes chunk meshes', async () => {
    const g = makeGrid();
    const m = new TerrainMeshManager({
      grid: g,
      transport: createInProcessTransport(),
      budgetMs: Infinity,
    });
    m.markAllDirty();
    m.update();
    await flush();
    m.update();
    await flush();
    m.update();
    expect(m.idle).toBe(true);
    expect(m.meshCount).toBe(1);
    const first = m.getMesh(0)!;
    expect(m.group.children).toContain(first);
    const oldGeo = first.geometry;

    g.set(3, 3, 3, 1);
    m.update();
    await flush();
    m.update();
    expect(m.getMesh(0)).toBe(first);
    expect(first.geometry).not.toBe(oldGeo);

    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) g.set(i, j, k, 1);
    m.update();
    await flush();
    m.update();
    expect(m.meshCount).toBe(0);
    expect(m.group.children).toHaveLength(0);
    m.dispose();
  });

  it('hands buffers over and respects maxInFlight with focus priority', () => {
    const g = makeGrid();
    for (const c of [0, 8])
      for (const d of [0, 8]) for (const e of [0, 8]) g.set(c + 6, d + 6, e + 6, -1);
    g.takeDirtyChunks();
    const seen: ArrayBuffer[][] = [];
    const base = createInProcessTransport({ onPost: (_m, tr) => seen.push(tr) });
    const sent: number[] = [];
    const m = new TerrainMeshManager({
      grid: g,
      transport: {
        ...base,
        post: (msg, tr) => {
          sent.push(msg.chunkKey);
          base.post(msg, tr);
        },
      },
      maxInFlight: 2,
      initialMaxInFlight: 2,
    });
    m.setFocus(new THREE.Vector3(15, 2, 0));
    m.markAllDirty();
    m.update();
    expect(sent).toEqual([1, 3]);
    expect(seen[0]).toEqual([expect.any(ArrayBuffer)]);
    m.dispose();
  });

  it('never dispatches trivially empty chunks and removes stale meshes', () => {
    const g = makeGrid();
    const { t, sent, reply } = manualTransport();
    const m = new TerrainMeshManager({ grid: g, transport: t });
    m.markAllDirty();
    m.update();
    expect(sent.map((r) => r.chunkKey)).toEqual([0]);
    expect(m.stats.totalDispatched).toBe(1);
    reply(0);
    m.update();
    expect(m.meshCount).toBe(1);
    for (let z = 2; z < 6; z++)
      for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) g.set(x, y, z, 1);
    m.update();
    expect(sent).toHaveLength(1);
    expect(m.meshCount).toBe(0);
    expect(m.idle).toBe(true);
    m.dispose();
  });

  it('uses the larger initial in-flight limit only until the first build drains', () => {
    const g = makeGrid();
    for (const c of [0, 8])
      for (const d of [0, 8]) for (const e of [0, 8]) g.set(c + 6, d + 6, e + 6, -1);
    g.takeDirtyChunks();
    const { t, sent, reply } = manualTransport();
    const m = new TerrainMeshManager({
      grid: g,
      transport: t,
      maxInFlight: 1,
      initialMaxInFlight: 5,
    });
    m.markAllDirty();
    m.update();
    expect(sent).toHaveLength(5);
    for (let i = 0; i < 5; i++) reply(i);
    m.update();
    m.update();
    for (let i = 5; i < 8; i++) reply(i);
    m.update();
    expect(m.idle).toBe(true);
    g.markDirty(0);
    g.markDirty(1);
    m.update();
    expect(sent).toHaveLength(9);
    m.dispose();
  });

  it('meshes far chunks coarser and re-meshes when the focus approaches', () => {
    const g = new SdfGrid(32, 16, 16, 1, 1, 16);
    for (let c = 0; c < 2; c++)
      for (let z = 0; z < 16; z++)
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++)
            g.data[g.index(c * 16 + x, y, z)] = Math.hypot(x - 8, y - 8, z - 8) - 5.3;
    g.takeDirtyChunks();
    const m = new TerrainMeshManager({
      grid: g,
      transport: createInProcessTransport({ sync: true }),
      lodDistance: 10,
      budgetMs: 1e6,
    });
    m.setFocus(new THREE.Vector3(8, 8, 8));
    m.markAllDirty();
    for (let i = 0; i < 3; i++) m.update();
    const tris = (k: number): number => (m.getMesh(k)?.geometry.index?.count ?? 0) / 3;
    expect(tris(0)).toBeGreaterThan(tris(1) * 1.5);
    m.setFocus(new THREE.Vector3(24, 8, 8));
    for (let i = 0; i < 3; i++) m.update();
    expect(tris(1)).toBeGreaterThan(tris(0) * 1.5);
    m.dispose();
  });

  it('discards stale results from a chunk dirtied in flight', () => {
    const g = makeGrid();
    const { t, sent, reply } = manualTransport();
    const m = new TerrainMeshManager({ grid: g, transport: t });
    g.markDirty(0);
    m.update();
    g.markDirty(0);
    m.update();
    expect(sent).toHaveLength(1);
    reply(0);
    m.update();
    expect(m.meshCount).toBe(0);
    expect(sent).toHaveLength(2);
    reply(1);
    m.update();
    expect(m.meshCount).toBe(1);
    m.dispose();
  });

  it('frees geometries on dispose and ignores late results', () => {
    const g = makeGrid();
    const { t, sent, reply } = manualTransport();
    const m = new TerrainMeshManager({ grid: g, transport: t });
    g.markDirty(0);
    m.update();
    reply(0);
    m.update();
    const geo = m.getMesh(0)!.geometry;
    let disposed = 0;
    geo.addEventListener('dispose', () => disposed++);
    g.markDirty(0);
    m.update();
    m.dispose();
    reply(1);
    expect(disposed).toBe(1);
    expect(m.meshCount).toBe(0);
    m.update();
    expect(sent).toHaveLength(2);
  });
});

describe('transports', () => {
  it('pool round-robins and sync in-process delivers immediately', () => {
    const got: number[] = [];
    const a = createInProcessTransport({ sync: true });
    const b = createInProcessTransport({ sync: true });
    const pool = createPoolTransport([a, b]);
    pool.onMessage((r) => got.push(r.id));
    const input = makeInput();
    pool.post({ id: 1, chunkKey: 0, input }, []);
    pool.post({ id: 2, chunkKey: 0, input }, []);
    expect(got).toEqual([1, 2]);
    pool.terminate();
    a.post({ id: 3, chunkKey: 0, input }, []);
    expect(got).toEqual([1, 2]);
    expect(() => createPoolTransport([])).toThrow(RangeError);
  });
});

function makeInput(): MeshRequest['input'] {
  return {
    samples: new Float32Array(27).fill(1),
    cells: [1, 1, 1],
    halo: 0,
    cellSize: 1,
    origin: [0, 0, 0],
  };
}
