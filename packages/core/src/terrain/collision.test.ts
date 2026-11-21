import { describe, expect, it } from 'vitest';
import { SdfGrid } from './sdf-grid.js';
import { findGround, isSphereColliding, rayCast, sphereSweep } from './collision.js';

function planeGrid(h: number): SdfGrid {
  const g = new SdfGrid(20, 20, 20, 1);
  for (let z = 0; z < 20; z++)
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) g.data[g.index(x, y, z)] = y - h;
  return g;
}

describe('collision', () => {
  const grid = planeGrid(5.5);
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
    const hit = rayCast(g, { x: 10, y: 18, z: 10 }, { x: 0, y: -1, z: 0 }, 30);
    expect(hit?.point.y).toBeLessThan(7.5);
  });
});
