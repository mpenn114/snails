import { describe, expect, it } from 'vitest';
import { DEFAULT_TERRAIN_CONFIG, generateTerrain, Rng, SdfGrid } from '@snails/core';
import {
  extractChunkInput,
  meshChunk,
  type ChunkMesh,
  type ChunkMeshInput,
} from './marching-cubes.js';

type V3 = [number, number, number];

function sphereInput(origin: V3, cells: V3, center: V3, r: number): ChunkMeshInput {
  const halo = 1;
  const [sx, sy, sz] = cells.map((c) => c + 1 + 2 * halo) as V3;
  const samples = new Float32Array(sx * sy * sz);
  let n = 0;
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++)
      for (let i = 0; i < sx; i++) {
        const p = [origin[0] + i - halo, origin[1] + j - halo, origin[2] + k - halo];
        samples[n++] = Math.hypot(p[0]! - center[0], p[1]! - center[1], p[2]! - center[2]) - r;
      }
  return { samples, cells, halo, cellSize: 1, origin };
}

function vert(m: ChunkMesh, i: number): V3 {
  return [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
}

describe('meshChunk', () => {
  const center: V3 = [8.3, 8.1, 7.9];
  const m = meshChunk(sphereInput([0, 0, 0], [16, 16, 16], center, 5));

  it('places vertices on the sphere with outward normals', () => {
    expect(m.indices.length).toBeGreaterThan(0);
    for (let v = 0; v < m.positions.length / 3; v++) {
      const p = vert(m, v);
      const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
      const len = Math.hypot(d[0]!, d[1]!, d[2]!);
      expect(Math.abs(len - 5)).toBeLessThan(0.1);
      const dot =
        (d[0]! * m.normals[v * 3]! +
          d[1]! * m.normals[v * 3 + 1]! +
          d[2]! * m.normals[v * 3 + 2]!) /
        len;
      expect(dot).toBeGreaterThan(0.95);
    }
  });

  it('is closed and wound counter-clockwise from outside', () => {
    const edges = new Set<string>();
    let volume = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
      for (const [x, y] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        expect(edges.has(`${x}>${y}`)).toBe(false);
        edges.add(`${x}>${y}`);
      }
      const [A, B, C] = [vert(m, a), vert(m, b), vert(m, c)];
      volume +=
        (A[0] * (B[1] * C[2] - B[2] * C[1]) -
          A[1] * (B[0] * C[2] - B[2] * C[0]) +
          A[2] * (B[0] * C[1] - B[1] * C[0])) /
        6;
    }
    for (const k of edges) {
      const [x, y] = k.split('>');
      expect(edges.has(`${y}>${x}`)).toBe(true);
    }
    expect(volume).toBeGreaterThan(0);
    expect(Math.abs(volume / ((4 / 3) * Math.PI * 125) - 1)).toBeLessThan(0.05);
  });

  it('produces nothing for empty or full chunks', () => {
    const air = meshChunk(sphereInput([0, 0, 0], [8, 8, 8], [100, 100, 100], 1));
    const solid = meshChunk(sphereInput([0, 0, 0], [8, 8, 8], [4, 4, 4], 100));
    for (const e of [air, solid]) {
      expect(e.positions.length).toBe(0);
      expect(e.indices.length).toBe(0);
    }
  });

  it('matches vertices on the border shared by adjacent chunks', () => {
    const c: V3 = [9, 8, 8];
    const left = meshChunk(sphereInput([0, 0, 0], [8, 16, 16], c, 6));
    const right = meshChunk(sphereInput([8, 0, 0], [8, 16, 16], c, 6));
    const onPlane = (mesh: ChunkMesh): string[] => {
      const out: string[] = [];
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        const p = vert(mesh, v);
        const nrm = [0, 1, 2].map((n) => mesh.normals[v * 3 + n]!.toFixed(4));
        if (Math.abs(p[0] - 8) < 1e-6) out.push([...p.map((x) => x.toFixed(4)), ...nrm].join(','));
      }
      return out.sort();
    };
    const l = onPlane(left);
    expect(l.length).toBeGreaterThan(0);
    expect(onPlane(right)).toEqual(l);
  });
});

describe('extractChunkInput', () => {
  it('meshes a sphere carved into a real SdfGrid', () => {
    const grid = new SdfGrid(20, 20, 20, 0.5, -1);
    grid.carveSphere({ x: 5, y: 5, z: 5 }, 3);
    const inputs = [0, 1].flatMap((x) =>
      [0, 1].flatMap((y) => [0, 1].map((z) => extractChunkInput(grid, x, y, z))),
    );
    expect(inputs[0]!.cells).toEqual([16, 16, 16]);
    expect(inputs[7]!.cells).toEqual([4, 4, 4]);
    const total = inputs.reduce((s, i) => s + meshChunk(i).indices.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(() => extractChunkInput(grid, 5, 0, 0)).toThrow(RangeError);
  });
});

describe('meshChunk normals on steep saturated walls', () => {
  it.each([2, 4])('every normal is a unit vector at LOD step %i', (step) => {
    const { grid } = generateTerrain(
      { ...DEFAULT_TERRAIN_CONFIG, style: 'archipelago' },
      new Rng(7),
    );
    let bad = 0;
    for (let cz = 0; cz < grid.chunksZ; cz++) {
      for (let cx = 0; cx < grid.chunksX; cx++) {
        const m = meshChunk(extractChunkInput(grid, cx, 0, cz, step));
        for (let i = 0; i < m.normals.length; i += 3) {
          const len = Math.hypot(m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0);
          if (!(len > 0.5)) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });
});
