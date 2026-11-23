import { describe, expect, it } from 'vitest';
import { weldMesh } from './mesh-weld.js';

const mesh = (pos: number[], idx: number[]) => ({
  positions: Float32Array.from(pos),
  normals: Float32Array.from(pos.map((_, i) => (i % 3 === 1 ? 1 : 0))),
  indices: Uint32Array.from(idx),
});

describe('weldMesh', () => {
  it('merges coincident vertices and drops triangles that collapse', () => {
    // v4 duplicates v1 and v5 duplicates v0, so triangle (4,5,1) collapses.
    const m = mesh(
      [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0],
      [0, 1, 2, 1, 3, 2, 4, 5, 1],
    );
    const w = weldMesh(m, 1e-3);
    expect(w.positions.length / 3).toBe(4);
    expect(w.indices.length).toBe(6);
    expect([...w.indices].every((i) => i < 4)).toBe(true);
  });
  it('drops degenerate triangles with repeated indices and unused vertices', () => {
    const w = weldMesh(mesh([0, 0, 0, 1, 0, 0, 0, 0, 1, 5, 5, 5], [0, 1, 2, 0, 0, 1]), 1e-3);
    expect(w.indices.length).toBe(3);
    expect(w.positions.length).toBe(9);
  });
  it('returns the same object when nothing changes', () => {
    const m = mesh([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]);
    expect(weldMesh(m, 1e-3)).toBe(m);
  });
  it('removes everything when all triangles collapse', () => {
    const w = weldMesh(mesh([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2]), 1e-3);
    expect(w.indices.length).toBe(0);
  });
});
