/** Post-processing for mesher output: spatial vertex welding and degenerate-triangle removal. */
import type { ChunkMesh } from './marching-cubes.js';

/**
 * Merges vertices closer than `epsilon` (grid-quantised) and drops triangles that become
 * degenerate (repeated index). Unused vertices are removed. Returns the input unchanged when
 * nothing merged and nothing was dropped.
 */
export function weldMesh(mesh: ChunkMesh, epsilon: number): ChunkMesh {
  const { positions: p, normals: n, indices: idx } = mesh;
  const count = p.length / 3;
  const inv = 1 / Math.max(epsilon, 1e-9);
  const byCell = new Map<string, number>();
  const remap = new Int32Array(count);
  const keep: number[] = [];
  for (let v = 0; v < count; v++) {
    const q = [0, 1, 2].map((a) => Math.round((p[v * 3 + a] ?? 0) * inv));
    const key = q.join(',');
    let id = byCell.get(key);
    if (id === undefined) {
      id = keep.length;
      byCell.set(key, id);
      keep.push(v);
    }
    remap[v] = id;
  }
  const out: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t] ?? 0] ?? 0;
    const b = remap[idx[t + 1] ?? 0] ?? 0;
    const c = remap[idx[t + 2] ?? 0] ?? 0;
    if (a === b || b === c || a === c) continue;
    out.push(a, b, c);
  }
  if (keep.length === count && out.length === idx.length) return mesh;
  return compact(p, n, keep, out);
}

function compact(p: Float32Array, n: Float32Array, keep: number[], tris: number[]): ChunkMesh {
  const used = new Int32Array(keep.length).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) {
    const old = tris[i] ?? 0;
    let id = used[old] ?? -1;
    if (id < 0) {
      id = positions.length / 3;
      used[old] = id;
      const src = (keep[old] ?? 0) * 3;
      positions.push(p[src] ?? 0, p[src + 1] ?? 0, p[src + 2] ?? 0);
      normals.push(n[src] ?? 0, n[src + 1] ?? 0, n[src + 2] ?? 0);
    }
    indices[i] = id;
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices };
}
