import { describe, expect, it } from 'vitest';
import { SdfGrid } from '@snails/core';
import { addSkirts, isChunkTrivial, samplesUniformSign, selectLodStep } from './chunk-lod.js';
import { extractChunkInput, meshChunk } from './marching-cubes.js';

describe('samplesUniformSign', () => {
  it('detects uniform and mixed sign', () => {
    expect(samplesUniformSign([])).toBe(true);
    expect(samplesUniformSign([1, 2, 0.5])).toBe(true);
    expect(samplesUniformSign([-1, -2])).toBe(true);
    expect(samplesUniformSign([-1, 0.1])).toBe(false);
  });
});

describe('isChunkTrivial', () => {
  const grid = (): SdfGrid => new SdfGrid(16, 16, 16, 1, 1, 8);
  it('is true for all-air chunks and false when a solid sample is present', () => {
    const g = grid();
    expect(isChunkTrivial(g, 0, 0, 0)).toBe(true);
    g.set(3, 3, 3, -1);
    expect(isChunkTrivial(g, 0, 0, 0)).toBe(false);
    expect(isChunkTrivial(g, 1, 1, 1)).toBe(true);
  });
  it('sees the +1 border sample owned by the neighbour chunk', () => {
    const g = grid();
    g.set(8, 3, 3, -1); // first sample of chunk 1, last border sample of chunk 0
    expect(isChunkTrivial(g, 0, 0, 0)).toBe(false);
  });
  it('treats out-of-grid samples as air, so fully solid edge chunks are not trivial', () => {
    const g = new SdfGrid(8, 8, 8, 1, -1, 8);
    expect(isChunkTrivial(g, 0, 0, 0)).toBe(false);
  });
  it('agrees with the mesher: trivial chunks mesh to nothing', () => {
    const g = grid();
    g.set(12, 12, 12, -1);
    for (const [x, y, z] of [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ] as const) {
      const empty = meshChunk(extractChunkInput(g, x, y, z)).indices.length === 0;
      expect(isChunkTrivial(g, x, y, z)).toBe(empty);
    }
  });
});

describe('selectLodStep', () => {
  it('uses fine detail near, coarse far, with hysteresis', () => {
    expect(selectLodStep(10, 40)).toBe(1);
    expect(selectLodStep(60, 40)).toBe(2);
    expect(selectLodStep(42, 40, 1)).toBe(1);
    expect(selectLodStep(42, 40, 2)).toBe(2);
    expect(selectLodStep(30, 40, 2)).toBe(1);
  });
  it('is disabled for non-positive or infinite distance', () => {
    expect(selectLodStep(1e6, 0)).toBe(1);
    expect(selectLodStep(1e6, Infinity)).toBe(1);
  });
});

function fill(g: SdfGrid, f: (x: number, y: number, z: number) => number): SdfGrid {
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) g.data[g.index(x, y, z)] = f(x, y, z);
  return g;
}

describe('coarse LOD mesh', () => {
  const sphere = fill(
    new SdfGrid(16, 16, 16, 1, 1, 16),
    (x, y, z) => Math.hypot(x - 8, y - 8, z - 8) - 5.3,
  );
  it('has far fewer triangles than full detail', () => {
    const fine = meshChunk(extractChunkInput(sphere, 0, 0, 0, 1));
    const coarse = meshChunk(extractChunkInput(sphere, 0, 0, 0, 2));
    expect(coarse.indices.length).toBeGreaterThan(0);
    expect(coarse.indices.length).toBeLessThan(fine.indices.length * 0.5);
  });
  it('adds skirts only along open edges on chunk faces', () => {
    const input = extractChunkInput(sphere, 0, 0, 0, 1);
    const closed = meshChunk(input);
    expect(addSkirts(closed, input, 1).indices.length).toBe(closed.indices.length);
    const slab = fill(new SdfGrid(16, 16, 16, 1, 1, 16), (_x, y) => y - 7.5);
    const sin = extractChunkInput(slab, 0, 0, 0, 1);
    const plane = meshChunk(sin);
    const skirted = addSkirts(plane, sin, 1);
    expect(skirted.indices.length).toBeGreaterThan(plane.indices.length);
    expect(skirted.positions.length).toBeGreaterThan(plane.positions.length);
  });
});
