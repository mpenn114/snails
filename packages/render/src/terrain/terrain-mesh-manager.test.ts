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
    });
    m.setFocus(new THREE.Vector3(15, 2, 0));
    m.markAllDirty();
    m.update();
    expect(sent).toEqual([1, 3]);
    expect(seen[0]).toEqual([expect.any(ArrayBuffer)]);
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
