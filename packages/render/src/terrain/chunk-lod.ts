/** Pure chunk helpers: trivial-chunk detection, LOD selection and LOD seam skirts. */
import type { SdfGrid } from '@snails/core';
import type { ChunkMesh, ChunkMeshInput } from './marching-cubes.js';

/** True when every value has the same sign (negative = solid); an empty list counts as uniform. */
export function samplesUniformSign(values: ArrayLike<number>): boolean {
  if (values.length === 0) return true;
  const solid = (values[0] ?? 1) < 0;
  for (let i = 1; i < values.length; i++) if ((values[i] ?? 1) < 0 !== solid) return false;
  return true;
}

/**
 * True when chunk (cx,cy,cz) cannot produce any surface: all samples the mesher triangulates
 * (the chunk's cells plus the +1 border sample, out-of-grid = air) share one sign.
 * Scans the grid directly with early exit; no allocation.
 */
export function isChunkTrivial(grid: SdfGrid, cx: number, cy: number, cz: number): boolean {
  const id = grid.chunkIdAt(cx, cy, cz);
  if (id < 0) return true;
  const { min, max } = grid.chunkBounds(id);
  const first = grid.get(min.x, min.y, min.z) < 0;
  for (let z = min.z; z <= max.z; z++)
    for (let y = min.y; y <= max.y; y++)
      for (let x = min.x; x <= max.x; x++) if (grid.get(x, y, z) < 0 !== first) return false;
  return true;
}

/** Sampling step (1 = full detail, 2 = every 2nd cell) for a chunk. */
export type LodStep = 1 | 2;

/**
 * Chooses the LOD step. `lodDistance` is the distance (metres) beyond which chunks use step 2
 * (non-finite or <= 0 disables LOD). `current` adds 10% hysteresis to avoid flip-flopping.
 */
export function selectLodStep(distance: number, lodDistance: number, current?: LodStep): LodStep {
  if (!(lodDistance > 0) || !Number.isFinite(lodDistance)) return 1;
  const limit = current === 2 ? lodDistance * 0.9 : lodDistance * 1.1;
  return distance > limit ? 2 : 1;
}

/**
 * Appends skirts: for every open edge lying on a chunk face, quads extruded into the solid
 * (against the vertex normal) by `depth`, hiding cracks between LOD levels.
 */
export function addSkirts(mesh: ChunkMesh, input: ChunkMeshInput, depth: number): ChunkMesh {
  const { positions: p, normals: n, indices: idx } = mesh;
  const key = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edgeUse = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const k = key(idx[t + e] ?? 0, idx[t + ((e + 1) % 3)] ?? 0);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  const lo = input.origin;
  const hi = input.cells.map((c, i) => (lo[i] ?? 0) + c * input.cellSize);
  const eps = input.cellSize * 1e-3;
  const onFace = (a: number, b: number): boolean =>
    [0, 1, 2].some((ax) => {
      const va = p[a * 3 + ax] ?? 0;
      const vb = p[b * 3 + ax] ?? 0;
      const near = (v: number, f: number): boolean => Math.abs(v - f) < eps;
      return (
        (near(va, lo[ax] ?? 0) && near(vb, lo[ax] ?? 0)) ||
        (near(va, hi[ax] ?? 0) && near(vb, hi[ax] ?? 0))
      );
    });
  const pos = Array.from(p);
  const nrm = Array.from(n);
  const out = Array.from(idx);
  const dup = (v: number): number => {
    const id = pos.length / 3;
    for (let a = 0; a < 3; a++) {
      pos.push((p[v * 3 + a] ?? 0) - (n[v * 3 + a] ?? 0) * depth);
      nrm.push(n[v * 3 + a] ?? 0);
    }
    return id;
  };
  const seen = new Set<string>();
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e] ?? 0;
      const b = idx[t + ((e + 1) % 3)] ?? 0;
      const k = key(a, b);
      if (edgeUse.get(k) !== 1 || seen.has(k) || !onFace(a, b)) continue;
      seen.add(k);
      const a2 = dup(a);
      const b2 = dup(b);
      out.push(a, b, b2, a, b2, a2, a, b2, b, a, a2, b2);
    }
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    indices: Uint32Array.from(out),
  };
}
