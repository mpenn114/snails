import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../state/types.js';
import { SdfGrid } from './sdf-grid.js';
import {
  findGround,
  isSphereColliding,
  rayCast,
  sphereSweep,
  type SdfQuery,
} from './collision.js';

/** Test adapter: trilinear sampling and central-difference normals over a grid. */
function adapt(g: SdfGrid): SdfQuery {
  const at = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz) return 1;
    return g.data[g.index(x, y, z)] ?? 1;
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const sampleLinear = (p: Vec3): number => {
    const fx = p.x / g.cellSize;
    const fy = p.y / g.cellSize;
    const fz = p.z / g.cellSize;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const row = (y: number, z: number): number =>
      lerp(at(x0, y, z), at(x0 + 1, y, z), fx - x0);
    const pl = (z: number): number => lerp(row(y0, z), row(y0 + 1, z), fy - y0);
    return lerp(pl(z0), pl(z0 + 1), fz - z0);
  };
  const normal = (p: Vec3): Vec3 => {
    const e = g.cellSize * 0.5;
    const gx = sampleLinear({ ...p, x: p.x + e }) - sampleLinear({ ...p, x: p.x - e });
    const gy = sampleLinear({ ...p, y: p.y + e }) - sampleLinear({ ...p, y: p.y - e });
    const gz = sampleLinear({ ...p, z: p.z + e }) - sampleLinear({ ...p, z: p.z - e });
    const l = Math.hypot(gx, gy, gz) || 1;
    return { x: gx / l, y: gy / l, z: gz / l };
  };
  return { cellSize: g.cellSize, sampleLinear, normal };
}

function planeGrid(h: number): SdfGrid {
  const g = new SdfGrid(20, 20, 20, 1);
  for (let z = 0; z < 20; z++)
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) g.data[g.index(x, y, z)] = y - h;
  return g;
}

describe('collision', () => {
  const grid = adapt(planeGrid(5.5));
  it('ray down hits plane with +Y normal', () => {
    const hit = rayCast(grid, { x: 10, y: 15, z: 10 }, { x: 0, y: -1, z: 0 }, 50);
    expect(hit).not.toBeNull();
    expect(Math.abs((hit?.point.y ?? 0) - 5.5)).toBeLessThan(1);
    expect(hit?.normal.y).toBeGreaterThan(0.99);
  });
  it('parallel ray misses', () => {
    expect(rayCast(grid, { x: 2, y: 15, z: 10 }, { x: 1, y: 0, z: 0 }, 10)).toBeNull();
  });
  it('start inside solid hits at distance 0', () => {
    expect(rayCast(grid, { x: 10, y: 2, z: 10 }, { x: 0, y: 1, z: 0 }, 10)?.distance).toBe(0);
  });
  it('sphere sweep reports t in range', () => {
    const hit = sphereSweep(grid, { x: 10, y: 15, z: 10 }, { x: 10, y: 0, z: 10 }, 1);
    expect(hit?.t).toBeGreaterThan(0);
    expect(hit?.t).toBeLessThan(1);
    expect(Math.abs((hit?.point.y ?? 0) - 6.5)).toBeLessThan(1);
    expect(sphereSweep(grid, { x: 5, y: 15, z: 10 }, { x: 5, y: 10, z: 10 }, 1)).toBeNull();
  });
  it('findGround and isSphereColliding', () => {
    expect(findGround(grid, { x: 10, y: 10, z: 10 }, 20)?.normal.y).toBeGreaterThan(0.99);
    expect(findGround(grid, { x: 10, y: 10, z: 10 }, 2)).toBeNull();
    expect(isSphereColliding(grid, { x: 10, y: 6, z: 10 }, 1)).toBe(true);
    expect(isSphereColliding(grid, { x: 10, y: 10, z: 10 }, 1)).toBe(false);
  });
  it('ray into carved crater hits lower', () => {
    const g = planeGrid(10);
    g.carveSphere({ x: 10, y: 10, z: 10 }, 4);
    const hit = rayCast(adapt(g), { x: 10, y: 18, z: 10 }, { x: 0, y: -1, z: 0 }, 30);
    expect(hit?.point.y).toBeLessThan(7.5);
  });
});
